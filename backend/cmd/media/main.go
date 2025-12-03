package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	"github.com/pion/webrtc/v3"
	"go.uber.org/zap"
)

// SFUServer implementa um Selective Forwarding Unit usando Pion WebRTC
type SFUServer struct {
	mu      sync.RWMutex
	peers   map[string]*SFUPeer
	rooms   map[string]*SFURoom
	logger  *zap.Logger
	api     *webrtc.API
}

// SFUPeer representa um participante conectado ao SFU
type SFUPeer struct {
	ID         string
	RoomID     string
	Connection *webrtc.PeerConnection
	WSConn     *websocket.Conn
	Tracks     map[string]*webrtc.TrackLocalStaticRTP
	mu         sync.RWMutex
	logger     *zap.Logger
}

// SFURoom representa uma sala de conferência
type SFURoom struct {
	ID      string
	Peers   map[string]*SFUPeer
	mu      sync.RWMutex
	logger  *zap.Logger
}

// SignalingMessage representa uma mensagem de sinalização WebRTC
type SignalingMessage struct {
	Type     string      `json:"type"`
	PeerID   string      `json:"peerId"`
	RoomID   string      `json:"roomId"`
	Data     interface{} `json:"data,omitempty"`
	Offer    *string     `json:"offer,omitempty"`
	Answer   *string     `json:"answer,omitempty"`
	Candidate *string    `json:"candidate,omitempty"`
}

// WebSocket upgrader
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in development
	},
}

// NewSFUServer cria uma nova instância do servidor SFU
func NewSFUServer(logger *zap.Logger) *SFUServer {
	// Configurar MediaEngine para suportar codecs
	mediaEngine := &webrtc.MediaEngine{}
	
	// Configurar codecs de vídeo
	if err := mediaEngine.RegisterCodec(webrtc.RTPCodecParameters{
		RTPCodecCapability: webrtc.RTPCodecCapability{
			MimeType:     webrtc.MimeTypeVP8,
			ClockRate:    90000,
			Channels:     0,
			SDPFmtpLine:  "",
		},
		PayloadType: 96,
	}, webrtc.RTPCodecTypeVideo); err != nil {
		logger.Error("failed to register VP8 codec", zap.Error(err))
	}

	if err := mediaEngine.RegisterCodec(webrtc.RTPCodecParameters{
		RTPCodecCapability: webrtc.RTPCodecCapability{
			MimeType:     webrtc.MimeTypeH264,
			ClockRate:    90000,
			Channels:     0,
			SDPFmtpLine:  "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f",
		},
		PayloadType: 102,
	}, webrtc.RTPCodecTypeVideo); err != nil {
		logger.Error("failed to register H264 codec", zap.Error(err))
	}

	// Configurar codecs de áudio
	if err := mediaEngine.RegisterCodec(webrtc.RTPCodecParameters{
		RTPCodecCapability: webrtc.RTPCodecCapability{
			MimeType:     webrtc.MimeTypeOpus,
			ClockRate:    48000,
			Channels:     2,
			SDPFmtpLine:  "minptime=10;useinbandfec=1",
		},
		PayloadType: 111,
	}, webrtc.RTPCodecTypeAudio); err != nil {
		logger.Error("failed to register Opus codec", zap.Error(err))
	}

	// Configurar SettingEngine
	settingEngine := webrtc.SettingEngine{}
	
	// Configurar ICE
	settingEngine.SetEphemeralUDPPortRange(50000, 60000)
	settingEngine.SetNAT1To1IPs([]string{}, webrtc.ICECandidateTypeHost)
	
	// Criar API WebRTC
	api := webrtc.NewAPI(webrtc.WithMediaEngine(mediaEngine), webrtc.WithSettingEngine(settingEngine))

	return &SFUServer{
		peers:  make(map[string]*SFUPeer),
		rooms:  make(map[string]*SFURoom),
		logger: logger,
		api:    api,
	}
}

// NewSFURoom cria uma nova sala
func NewSFURoom(id string, logger *zap.Logger) *SFURoom {
	return &SFURoom{
		ID:     id,
		Peers:  make(map[string]*SFUPeer),
		logger: logger,
	}
}

// BroadcastTrack encaminha uma track para todos os peers da sala
func (room *SFURoom) BroadcastTrack(sourcePeerID string, track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
	room.mu.RLock()
	defer room.mu.RUnlock()

	for peerID, peer := range room.Peers {
		if peerID == sourcePeerID {
			continue // Não reenviar para o source
		}
		
		go func(targetPeer *SFUPeer) {
			if err := targetPeer.ForwardTrack(track, receiver); err != nil {
				room.logger.Error("failed to forward track",
					zap.String("sourcePeer", sourcePeerID),
					zap.String("targetPeer", targetPeer.ID),
					zap.Error(err))
			}
		}(peer)
	}
}

// AddPeer adiciona um peer à sala
func (room *SFURoom) AddPeer(peer *SFUPeer) {
	room.mu.Lock()
	defer room.mu.Unlock()
	
	room.Peers[peer.ID] = peer
	room.logger.Info("peer added to room",
		zap.String("roomId", room.ID),
		zap.String("peerId", peer.ID),
		zap.Int("totalPeers", len(room.Peers)))
}

// RemovePeer remove um peer da sala
func (room *SFURoom) RemovePeer(peerID string) {
	room.mu.Lock()
	defer room.mu.Unlock()
	
	if peer, exists := room.Peers[peerID]; exists {
		peer.Close()
		delete(room.Peers, peerID)
		room.logger.Info("peer removed from room",
			zap.String("roomId", room.ID),
			zap.String("peerId", peerID),
			zap.Int("remainingPeers", len(room.Peers)))
	}
}

// Close fecha a peer connection e limpa recursos
func (peer *SFUPeer) Close() {
	peer.mu.Lock()
	defer peer.mu.Unlock()
	
	if peer.Connection != nil {
		peer.Connection.Close()
	}
	
	if peer.WSConn != nil {
		peer.WSConn.Close()
	}
	
	peer.logger.Info("peer closed", zap.String("peerId", peer.ID))
}

// ForwardTrack adiciona uma track remota à peer connection local
func (peer *SFUPeer) ForwardTrack(remoteTrack *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) error {
	peer.mu.Lock()
	defer peer.mu.Unlock()

	// Criar track local para o peer
	localTrack, err := webrtc.NewTrackLocalStaticRTP(
		remoteTrack.Codec().RTPCodecCapability,
		remoteTrack.ID(),
		remoteTrack.StreamID(),
	)
	if err != nil {
		return fmt.Errorf("failed to create local track: %w", err)
	}

	// Adicionar track ao peer connection
	rtpSender, err := peer.Connection.AddTrack(localTrack)
	if err != nil {
		return fmt.Errorf("failed to add track: %w", err)
	}

	// Processar RTCP packets
	go func() {
		rtcpBuf := make([]byte, 1500)
		for {
			if _, _, rtcpErr := rtpSender.Read(rtcpBuf); rtcpErr != nil {
				return
			}
		}
	}()

	// Armazenar track para gerenciamento
	trackKey := fmt.Sprintf("%s_%s", remoteTrack.ID(), remoteTrack.StreamID())
	peer.Tracks[trackKey] = localTrack

	// Forward RTP packets
	go func() {
		defer func() {
			peer.mu.Lock()
			delete(peer.Tracks, trackKey)
			peer.mu.Unlock()
		}()

		for {
			rtpPacket, _, err := remoteTrack.ReadRTP()
			if err != nil {
				peer.logger.Error("failed to read RTP packet", zap.Error(err))
				return
			}

			if err := localTrack.WriteRTP(rtpPacket); err != nil {
				peer.logger.Error("failed to write RTP packet", zap.Error(err))
				return
			}
		}
	}()

	return nil
}

// SendSignalingMessage envia mensagem via WebSocket
func (peer *SFUPeer) SendSignalingMessage(msg SignalingMessage) error {
	peer.mu.Lock()
	defer peer.mu.Unlock()
	
	if peer.WSConn == nil {
		return fmt.Errorf("websocket connection is nil")
	}
	
	return peer.WSConn.WriteJSON(msg)
}

// JoinRoom adiciona um peer a uma sala
func (sfu *SFUServer) JoinRoom(peerID, roomID string, wsConn *websocket.Conn) error {
	sfu.mu.Lock()
	defer sfu.mu.Unlock()

	// Criar sala se não existir
	room, exists := sfu.rooms[roomID]
	if !exists {
		room = NewSFURoom(roomID, sfu.logger)
		sfu.rooms[roomID] = room
		sfu.logger.Info("room created", zap.String("roomId", roomID))
	}

	// Configurar peer connection
	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
		},
	}

	peerConnection, err := sfu.api.NewPeerConnection(config)
	if err != nil {
		return fmt.Errorf("failed to create peer connection: %w", err)
	}

	// Criar peer
	peer := &SFUPeer{
		ID:         peerID,
		RoomID:     roomID,
		Connection: peerConnection,
		WSConn:     wsConn,
		Tracks:     make(map[string]*webrtc.TrackLocalStaticRTP),
		logger:     sfu.logger,
	}

	// Configurar handlers
	peerConnection.OnTrack(func(remoteTrack *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		sfu.logger.Info("received track",
			zap.String("peerId", peerID),
			zap.String("trackId", remoteTrack.ID()),
			zap.String("kind", remoteTrack.Kind().String()))

		// Broadcast track para outros peers na sala
		room.BroadcastTrack(peerID, remoteTrack, receiver)
	})

	peerConnection.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate == nil {
			return
		}

		candidateJSON := candidate.ToJSON()
		candidateStr, _ := json.Marshal(candidateJSON)
		
		msg := SignalingMessage{
			Type:      "ice-candidate",
			PeerID:    peerID,
			Candidate: stringPtr(string(candidateStr)),
		}
		
		peer.SendSignalingMessage(msg)
	})

	peerConnection.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		sfu.logger.Info("peer connection state changed",
			zap.String("peerId", peerID),
			zap.String("state", state.String()))
		
		if state == webrtc.PeerConnectionStateFailed ||
			state == webrtc.PeerConnectionStateDisconnected ||
			state == webrtc.PeerConnectionStateClosed {
			sfu.LeaveRoom(peerID, roomID)
		}
	})

	// Adicionar peer às estruturas
	sfu.peers[peerID] = peer
	room.AddPeer(peer)

	return nil
}

// LeaveRoom remove um peer de uma sala
func (sfu *SFUServer) LeaveRoom(peerID, roomID string) {
	sfu.mu.Lock()
	defer sfu.mu.Unlock()

	room, exists := sfu.rooms[roomID]
	if !exists {
		return
	}

	room.RemovePeer(peerID)
	delete(sfu.peers, peerID)

	// Remover sala se vazia
	if len(room.Peers) == 0 {
		delete(sfu.rooms, roomID)
		sfu.logger.Info("room deleted", zap.String("roomId", roomID))
	}
}

// HandleWebSocket gerencia conexões WebSocket para sinalização
func (sfu *SFUServer) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		sfu.logger.Error("websocket upgrade failed", zap.Error(err))
		return
	}
	defer conn.Close()

	var currentPeerID, currentRoomID string
	
	for {
		var msg SignalingMessage
		if err := conn.ReadJSON(&msg); err != nil {
			sfu.logger.Error("failed to read message", zap.Error(err))
			break
		}

		switch msg.Type {
		case "join":
			currentPeerID = msg.PeerID
			currentRoomID = msg.RoomID
			
			if err := sfu.JoinRoom(msg.PeerID, msg.RoomID, conn); err != nil {
				sfu.logger.Error("failed to join room", zap.Error(err))
				continue
			}
			
			// Enviar confirmação
			response := SignalingMessage{
				Type:   "joined",
				PeerID: msg.PeerID,
				RoomID: msg.RoomID,
			}
			conn.WriteJSON(response)

		case "offer":
			if peer, exists := sfu.peers[msg.PeerID]; exists {
				offer := webrtc.SessionDescription{
					Type: webrtc.SDPTypeOffer,
					SDP:  *msg.Offer,
				}
				
				if err := peer.Connection.SetRemoteDescription(offer); err != nil {
					sfu.logger.Error("failed to set remote description", zap.Error(err))
					continue
				}
				
				answer, err := peer.Connection.CreateAnswer(nil)
				if err != nil {
					sfu.logger.Error("failed to create answer", zap.Error(err))
					continue
				}
				
				if err := peer.Connection.SetLocalDescription(answer); err != nil {
					sfu.logger.Error("failed to set local description", zap.Error(err))
					continue
				}
				
				response := SignalingMessage{
					Type:   "answer",
					PeerID: msg.PeerID,
					Answer: &answer.SDP,
				}
				conn.WriteJSON(response)
			}

		case "ice-candidate":
			if peer, exists := sfu.peers[msg.PeerID]; exists {
				var candidate webrtc.ICECandidateInit
				if err := json.Unmarshal([]byte(*msg.Candidate), &candidate); err != nil {
					sfu.logger.Error("failed to unmarshal ICE candidate", zap.Error(err))
					continue
				}
				
				if err := peer.Connection.AddICECandidate(candidate); err != nil {
					sfu.logger.Error("failed to add ICE candidate", zap.Error(err))
				}
			}
		}
	}

	// Cleanup ao desconectar
	if currentPeerID != "" && currentRoomID != "" {
		sfu.LeaveRoom(currentPeerID, currentRoomID)
	}
}

// Health retorna status de saúde do servidor
func (sfu *SFUServer) Health() map[string]interface{} {
	sfu.mu.RLock()
	defer sfu.mu.RUnlock()
	
	roomStats := make(map[string]int)
	for roomID, room := range sfu.rooms {
		room.mu.RLock()
		roomStats[roomID] = len(room.Peers)
		room.mu.RUnlock()
	}
	
	return map[string]interface{}{
		"status":     "ok",
		"totalPeers": len(sfu.peers),
		"totalRooms": len(sfu.rooms),
		"rooms":      roomStats,
		"uptime":     time.Since(startTime).String(),
	}
}

var startTime = time.Now()

// stringPtr retorna um ponteiro para string
func stringPtr(s string) *string {
	return &s
}

func main() {
	// Carrega variáveis de ambiente
	err := godotenv.Load()
	if err != nil {
		log.Printf("Error loading .env file: %v", err)
	}

	// Configura logger
	logger, err := zap.NewDevelopment()
	if err != nil {
		log.Fatalf("Failed to create logger: %v", err)
	}
	defer logger.Sync()

	logger.Info("Starting Nexus WebRTC SFU Server")

	// Cria o servidor SFU
	sfu := NewSFUServer(logger)

	// Configura rotas HTTP
	http.HandleFunc("/ws", sfu.HandleWebSocket)
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(sfu.Health())
	})

	// Configura servidor HTTP
	server := &http.Server{
		Addr:         ":8083",
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Inicia servidor em goroutine
	go func() {
		logger.Info("SFU server listening on :8083")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("server failed to start", zap.Error(err))
		}
	}()

	// Aguarda sinal de interrupção
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	<-sigChan
	logger.Info("Shutting down Nexus WebRTC SFU Server")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("server forced to shutdown", zap.Error(err))
	}

	logger.Info("Server exited")
}


