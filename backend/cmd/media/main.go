package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"
	"github.com/pion/webrtc/v3"
	"go.uber.org/zap"
)

// SFUServer é um Selective Forwarding Unit (SFU) para WebRTC
type SFUServer struct {
	peers  map[string]*webrtc.PeerConnection
	logger *zap.Logger
}

// NewSFUServer cria um novo servidor SFU
func NewSFUServer(logger *zap.Logger) *SFUServer {
	return &SFUServer{
		peers:  make(map[string]*webrtc.PeerConnection),
		logger: logger,
	}
}

// AddPeer adiciona um novo peer
func (sfu *SFUServer) AddPeer(peerID string, pc *webrtc.PeerConnection) {
	sfu.peers[peerID] = pc
	sfu.logger.Info("peer added", zap.String("peerID", peerID))
}

// RemovePeer remove um peer
func (sfu *SFUServer) RemovePeer(peerID string) {
	if pc, ok := sfu.peers[peerID]; ok {
		pc.Close()
		delete(sfu.peers, peerID)
		sfu.logger.Info("peer removed", zap.String("peerID", peerID))
	}
}

// BroadcastTrack encaminha uma track de mídia para todos os peers
func (sfu *SFUServer) BroadcastTrack(sourcePeerID string, track *webrtc.TrackRemote) error {
	for peerID := range sfu.peers {
		if peerID == sourcePeerID {
			continue // Não enviar de volta ao source
		}
		// TODO: Implementar forwarding de track real
		// Isso requer criar um WebRTC track local e enviar o RTP
		sfu.logger.Debug("would forward track", zap.String("from", sourcePeerID), zap.String("to", peerID))
	}
	return nil
}

// Health verifica a saúde do servidor
func (sfu *SFUServer) Health() map[string]interface{} {
	return map[string]interface{}{
		"status": "ok",
		"peers":  len(sfu.peers),
	}
}

func main() {
	// Carregar variáveis de ambiente
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: .env file not found")
	}

	// Setup logger
	logger, err := zap.NewProduction()
	if err != nil {
		log.Fatalf("failed to create logger: %v", err)
	}
	defer logger.Sync()

	// Criar servidor SFU
	sfuServer := NewSFUServer(logger)

	logger.Info("Media/SFU server started")
	logger.Info("Note: Configure WebRTC TURN server and ICE candidates in production")

	// Graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	<-sigChan
	logger.Info("Shutdown signal received")

	// Cleanup
	for peerID := range sfuServer.peers {
		sfuServer.RemovePeer(peerID)
	}

	logger.Info("Media/SFU server stopped")
}
