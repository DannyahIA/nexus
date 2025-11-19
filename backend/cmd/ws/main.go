package main

// WebRTC Signaling Support - v2.0

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gofrs/uuid"
	"github.com/golang-jwt/jwt"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	"github.com/nats-io/nats.go"
	"go.uber.org/zap"

	"github.com/nexus/backend/internal/cache"
)

// WebSocketMessage representa uma mensagem WebSocket
type WebSocketMessage struct {
	Type      string          `json:"type"` // "message", "presence", "typing", "ping"
	ChannelID string          `json:"channelId,omitempty"`
	UserID    string          `json:"userId,omitempty"`
	Data      json.RawMessage `json:"data,omitempty"`
	Timestamp time.Time       `json:"timestamp"`
}

// MessageData representa os dados de uma mensagem de chat
type MessageData struct {
	ID        string    `json:"id"`
	Content   string    `json:"content"`
	AuthorID  string    `json:"authorId"`
	Username  string    `json:"username"`
	AvatarURL string    `json:"avatarUrl,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

// PresenceData representa dados de presença
type PresenceData struct {
	Status   string    `json:"status"` // "online", "offline", "idle", "dnd"
	LastSeen time.Time `json:"lastSeen"`
}

// TypingData representa dados de digitação
type TypingData struct {
	IsTyping bool   `json:"isTyping"`
	Username string `json:"username"`
}

// WebSocketConn representa uma conexão WebSocket ativa
type WebSocketConn struct {
	userID   uuid.UUID
	username string
	conn     *websocket.Conn
	send     chan []byte
	channels map[string]bool // canais aos quais o usuário está inscrito
}

// WebSocketServer gerencia conexões WebSocket
type WebSocketServer struct {
	clients       map[*WebSocketConn]bool
	register      chan *WebSocketConn
	unregister    chan *WebSocketConn
	broadcast     chan []byte
	nc            *nats.Conn
	presenceCache *cache.UserPresenceCache
	logger        *zap.Logger
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// TODO: Implementar validação de origin em produção
		return true
	},
}

// NewWebSocketServer cria um novo servidor WebSocket
func NewWebSocketServer(nc *nats.Conn, logger *zap.Logger) *WebSocketServer {
	return &WebSocketServer{
		clients:       make(map[*WebSocketConn]bool),
		register:      make(chan *WebSocketConn),
		unregister:    make(chan *WebSocketConn),
		broadcast:     make(chan []byte, 256),
		nc:            nc,
		presenceCache: cache.NewUserPresenceCache(),
		logger:        logger,
	}
}

// Run inicia o loop do servidor
func (ws *WebSocketServer) Run() {
	for {
		select {
		case client := <-ws.register:
			ws.clients[client] = true
			ws.logger.Info("client connected",
				zap.String("userID", client.userID.String()),
				zap.String("username", client.username))
			ws.presenceCache.SetPresence(client.userID, "online")

		case client := <-ws.unregister:
			if _, ok := ws.clients[client]; ok {
				delete(ws.clients, client)
				close(client.send)
				ws.logger.Info("client disconnected",
					zap.String("userID", client.userID.String()),
					zap.String("username", client.username))
				ws.presenceCache.RemovePresence(client.userID)
			}

		case message := <-ws.broadcast:
			for client := range ws.clients {
				select {
				case client.send <- message:
				default:
					// Buffer cheio, remover cliente
					go func(c *WebSocketConn) { ws.unregister <- c }(client)
				}
			}
		}
	}
}

// HandleWS gerencia uma conexão WebSocket
func (ws *WebSocketServer) HandleWS(w http.ResponseWriter, r *http.Request) {
	// Extrair e validar token JWT
	token := r.URL.Query().Get("token")
	if token == "" {
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}

	if token == "" {
		http.Error(w, "Unauthorized: missing token", http.StatusUnauthorized)
		return
	}

	// Validar token JWT com Claims customizado
	type Claims struct {
		UserID   string `json:"user_id"`
		Email    string `json:"email"`
		Username string `json:"username"`
		jwt.StandardClaims
	}

	claims := &Claims{}
	parsedToken, err := jwt.ParseWithClaims(token, claims, func(token *jwt.Token) (interface{}, error) {
		jwtSecret := os.Getenv("JWT_SECRET")
		if jwtSecret == "" {
			jwtSecret = "your-secret-key-change-this"
		}
		return []byte(jwtSecret), nil
	})

	if err != nil || !parsedToken.Valid {
		ws.logger.Error("invalid token", zap.Error(err))
		http.Error(w, "Unauthorized: invalid token", http.StatusUnauthorized)
		return
	}

	// Extrair userID do token (agora do campo UserID customizado)
	if claims.UserID == "" {
		ws.logger.Error("invalid user ID in token: empty UserID")
		http.Error(w, "Unauthorized: invalid user ID", http.StatusUnauthorized)
		return
	}

	userID, err := uuid.FromString(claims.UserID)
	if err != nil {
		ws.logger.Error("invalid user ID in token", zap.String("userID", claims.UserID), zap.Error(err))
		http.Error(w, "Unauthorized: invalid user ID", http.StatusUnauthorized)
		return
	}

	// Upgrade para WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		ws.logger.Error("websocket upgrade error", zap.Error(err))
		return
	}

	// Usar username do token
	username := claims.Username
	if username == "" {
		username = "User-" + userID.String()[:8]
	}

	client := &WebSocketConn{
		userID:   userID,
		username: username,
		conn:     conn,
		send:     make(chan []byte, 256),
		channels: make(map[string]bool),
	}

	ws.register <- client

	// Goroutine para ler mensagens
	go ws.readPump(client)
	// Goroutine para escrever mensagens
	go ws.writePump(client)
}

// readPump lê mensagens do cliente
func (ws *WebSocketServer) readPump(client *WebSocketConn) {
	defer func() {
		ws.unregister <- client
		client.conn.Close()
	}()

	// Aumentar timeout para 5 minutos
	client.conn.SetReadDeadline(time.Now().Add(5 * time.Minute))
	client.conn.SetPongHandler(func(string) error {
		client.conn.SetReadDeadline(time.Now().Add(5 * time.Minute))
		return nil
	})

	for {
		_, messageBytes, err := client.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				ws.logger.Error("websocket error", zap.Error(err))
			}
			break
		}

		// Parse mensagem WebSocket
		var wsMsg WebSocketMessage
		if err := json.Unmarshal(messageBytes, &wsMsg); err != nil {
			ws.logger.Error("failed to parse message", zap.Error(err))
			continue
		}

		// Adicionar informações do cliente
		wsMsg.UserID = client.userID.String()
		wsMsg.Timestamp = time.Now()

		// Processar baseado no tipo
		ws.handleMessage(client, &wsMsg)
	}
}

// handleMessage processa diferentes tipos de mensagens
func (ws *WebSocketServer) handleMessage(client *WebSocketConn, msg *WebSocketMessage) {
	switch msg.Type {
	case "message":
		// Mensagem de chat
		ws.handleChatMessage(client, msg)
	case "typing":
		// Indicador de digitação
		ws.handleTypingMessage(client, msg)
	case "presence":
		// Atualização de presença
		ws.handlePresenceMessage(client, msg)
	case "subscribe":
		// Inscrever em canal
		if msg.ChannelID != "" {
			client.channels[msg.ChannelID] = true
			ws.logger.Info("client subscribed to channel",
				zap.String("userID", client.userID.String()),
				zap.String("channelID", msg.ChannelID))
		}
	case "unsubscribe":
		// Desinscrever de canal
		if msg.ChannelID != "" {
			delete(client.channels, msg.ChannelID)
			ws.logger.Info("client unsubscribed from channel",
				zap.String("userID", client.userID.String()),
				zap.String("channelID", msg.ChannelID))
		}
	case "ping":
		// Heartbeat - apenas responder com pong
		ws.logger.Debug("received ping", zap.String("userID", client.userID.String()))
	
	// WebRTC Signaling
	case "voice:join":
		ws.handleVoiceJoin(client, msg)
	case "voice:leave":
		ws.handleVoiceLeave(client, msg)
	case "voice:offer":
		ws.handleVoiceOffer(client, msg)
	case "voice:answer":
		ws.handleVoiceAnswer(client, msg)
	case "voice:ice-candidate":
		ws.handleVoiceIceCandidate(client, msg)
	case "voice:mute-status":
		ws.handleVoiceMuteStatus(client, msg)
	case "voice:video-status":
		ws.handleVoiceVideoStatus(client, msg)
	
	default:
		ws.logger.Warn("unknown message type", zap.String("type", msg.Type))
	}
}

// handleChatMessage processa mensagens de chat
func (ws *WebSocketServer) handleChatMessage(client *WebSocketConn, msg *WebSocketMessage) {
	// Publicar no NATS para persistência
	natsSubject := "chat.messages." + msg.ChannelID
	msgBytes, _ := json.Marshal(msg)
	if err := ws.nc.Publish(natsSubject, msgBytes); err != nil {
		ws.logger.Error("failed to publish to NATS", zap.Error(err))
	}

	// Broadcast para clientes inscritos no canal
	ws.broadcastToChannel(msg.ChannelID, msgBytes)
}

// handleTypingMessage processa indicadores de digitação
func (ws *WebSocketServer) handleTypingMessage(client *WebSocketConn, msg *WebSocketMessage) {
	msgBytes, _ := json.Marshal(msg)
	ws.broadcastToChannel(msg.ChannelID, msgBytes)
}

// handlePresenceMessage processa atualizações de presença
func (ws *WebSocketServer) handlePresenceMessage(client *WebSocketConn, msg *WebSocketMessage) {
	var presenceData PresenceData
	if err := json.Unmarshal(msg.Data, &presenceData); err != nil {
		ws.logger.Error("failed to parse presence data", zap.Error(err))
		return
	}

	ws.presenceCache.SetPresence(client.userID, presenceData.Status)

	// Broadcast para todos os clientes
	msgBytes, _ := json.Marshal(msg)
	ws.broadcast <- msgBytes
}

// broadcastToChannel envia mensagem para todos os clientes de um canal
func (ws *WebSocketServer) broadcastToChannel(channelID string, message []byte) {
	for client := range ws.clients {
		if client.channels[channelID] {
			select {
			case client.send <- message:
			default:
				// Buffer cheio, desconectar cliente
				go func(c *WebSocketConn) { ws.unregister <- c }(client)
			}
		}
	}
}

// sendToUser envia mensagem para um usuário específico
func (ws *WebSocketServer) sendToUser(userID string, message []byte) {
	targetUUID, err := uuid.FromString(userID)
	if err != nil {
		ws.logger.Error("invalid target user ID", zap.String("userID", userID), zap.Error(err))
		return
	}

	for client := range ws.clients {
		if client.userID == targetUUID {
			select {
			case client.send <- message:
			default:
				ws.logger.Warn("failed to send to user, buffer full", zap.String("userID", userID))
			}
			return
		}
	}
	ws.logger.Warn("user not found", zap.String("userID", userID))
}

// ============================================
// WebRTC Signaling Handlers
// ============================================

// handleVoiceJoin processa entrada em canal de voz
func (ws *WebSocketServer) handleVoiceJoin(client *WebSocketConn, msg *WebSocketMessage) {
	ws.logger.Info("user joining voice channel",
		zap.String("userID", client.userID.String()),
		zap.String("username", client.username),
		zap.String("channelID", msg.ChannelID))

	// Inscrever automaticamente no canal para receber notificações
	if msg.ChannelID != "" {
		client.channels[msg.ChannelID] = true
	}

	// Primeiro, enviar lista de usuários já conectados para o novo usuário
	existingUsers := []map[string]interface{}{}
	for c := range ws.clients {
		if c.channels[msg.ChannelID] && c.userID != client.userID {
			existingUsers = append(existingUsers, map[string]interface{}{
				"userId":   c.userID.String(),
				"username": c.username,
			})
		}
	}

	if len(existingUsers) > 0 {
		existingUsersMsg := map[string]interface{}{
			"type":  "voice:existing-users",
			"users": existingUsers,
		}
		existingUsersBytes, _ := json.Marshal(existingUsersMsg)
		select {
		case client.send <- existingUsersBytes:
			ws.logger.Info("sent existing users list",
				zap.Int("count", len(existingUsers)),
				zap.String("to", client.userID.String()))
		default:
			ws.logger.Warn("failed to send existing users list")
		}
	}

	// Notificar outros usuários no canal que alguém entrou
	notification := map[string]interface{}{
		"type":      "voice:user-joined",
		"userId":    client.userID.String(),
		"username":  client.username,
		"channelId": msg.ChannelID,
	}
	notificationBytes, _ := json.Marshal(notification)
	
	// Broadcast para todos no canal (exceto o próprio usuário)
	count := 0
	totalInChannel := 0
	for c := range ws.clients {
		if c.channels[msg.ChannelID] {
			totalInChannel++
			if c.userID != client.userID {
				ws.logger.Info("attempting to notify user",
					zap.String("targetUserID", c.userID.String()),
					zap.String("targetUsername", c.username))
				select {
				case c.send <- notificationBytes:
					count++
					ws.logger.Info("successfully notified user",
						zap.String("targetUserID", c.userID.String()))
				default:
					ws.logger.Warn("failed to notify user, buffer full", 
						zap.String("userID", c.userID.String()))
				}
			}
		}
	}
	
	ws.logger.Info("notified users in voice channel", 
		zap.Int("notified", count),
		zap.Int("totalInChannel", totalInChannel),
		zap.String("channelID", msg.ChannelID))
}

// handleVoiceLeave processa saída de canal de voz
func (ws *WebSocketServer) handleVoiceLeave(client *WebSocketConn, msg *WebSocketMessage) {
	ws.logger.Info("user leaving voice channel",
		zap.String("userID", client.userID.String()),
		zap.String("channelID", msg.ChannelID))

	// Notificar outros usuários que alguém saiu
	notification := map[string]interface{}{
		"type":      "voice:user-left",
		"userId":    client.userID.String(),
		"channelId": msg.ChannelID,
	}
	notificationBytes, _ := json.Marshal(notification)
	ws.broadcastToChannel(msg.ChannelID, notificationBytes)
}

// handleVoiceOffer processa offer WebRTC
func (ws *WebSocketServer) handleVoiceOffer(client *WebSocketConn, msg *WebSocketMessage) {
	// Parse mensagem para obter targetUserId e offer
	var offerData map[string]interface{}
	if err := json.Unmarshal(msg.Data, &offerData); err != nil {
		ws.logger.Error("failed to parse offer data", zap.Error(err))
		return
	}

	targetUserID, ok := offerData["targetUserId"].(string)
	if !ok {
		ws.logger.Error("missing targetUserId in offer")
		return
	}

	ws.logger.Info("forwarding voice offer",
		zap.String("from", client.userID.String()),
		zap.String("to", targetUserID))

	// Encaminhar offer para o usuário alvo
	forwardMsg := map[string]interface{}{
		"type":   "voice:offer",
		"userId": client.userID.String(),
		"offer":  offerData["offer"],
	}
	forwardBytes, _ := json.Marshal(forwardMsg)
	ws.sendToUser(targetUserID, forwardBytes)
}

// handleVoiceAnswer processa answer WebRTC
func (ws *WebSocketServer) handleVoiceAnswer(client *WebSocketConn, msg *WebSocketMessage) {
	// Parse mensagem para obter targetUserId e answer
	var answerData map[string]interface{}
	if err := json.Unmarshal(msg.Data, &answerData); err != nil {
		ws.logger.Error("failed to parse answer data", zap.Error(err))
		return
	}

	targetUserID, ok := answerData["targetUserId"].(string)
	if !ok {
		ws.logger.Error("missing targetUserId in answer")
		return
	}

	ws.logger.Info("forwarding voice answer",
		zap.String("from", client.userID.String()),
		zap.String("to", targetUserID))

	// Encaminhar answer para o usuário alvo
	forwardMsg := map[string]interface{}{
		"type":   "voice:answer",
		"userId": client.userID.String(),
		"answer": answerData["answer"],
	}
	forwardBytes, _ := json.Marshal(forwardMsg)
	ws.sendToUser(targetUserID, forwardBytes)
}

// handleVoiceIceCandidate processa ICE candidates
func (ws *WebSocketServer) handleVoiceIceCandidate(client *WebSocketConn, msg *WebSocketMessage) {
	// Parse mensagem para obter targetUserId e candidate
	var candidateData map[string]interface{}
	if err := json.Unmarshal(msg.Data, &candidateData); err != nil {
		ws.logger.Error("failed to parse ice candidate data", zap.Error(err))
		return
	}

	targetUserID, ok := candidateData["targetUserId"].(string)
	if !ok {
		ws.logger.Error("missing targetUserId in ice candidate")
		return
	}

	ws.logger.Debug("forwarding ice candidate",
		zap.String("from", client.userID.String()),
		zap.String("to", targetUserID))

	// Encaminhar ICE candidate para o usuário alvo
	forwardMsg := map[string]interface{}{
		"type":      "voice:ice-candidate",
		"userId":    client.userID.String(),
		"candidate": candidateData["candidate"],
	}
	forwardBytes, _ := json.Marshal(forwardMsg)
	ws.sendToUser(targetUserID, forwardBytes)
}

// handleVoiceMuteStatus processa mudanças de status de mute
func (ws *WebSocketServer) handleVoiceMuteStatus(client *WebSocketConn, msg *WebSocketMessage) {
	var muteData map[string]interface{}
	if err := json.Unmarshal(msg.Data, &muteData); err != nil {
		ws.logger.Error("failed to parse mute data", zap.Error(err))
		return
	}

	ws.logger.Info("mute status changed",
		zap.String("userID", client.userID.String()),
		zap.Bool("isMuted", muteData["isMuted"].(bool)),
		zap.String("channelID", msg.ChannelID))

	// Broadcast para todos no canal
	notification := map[string]interface{}{
		"type":      "voice:mute-status",
		"userId":    client.userID.String(),
		"isMuted":   muteData["isMuted"],
		"channelId": msg.ChannelID,
	}
	notificationBytes, _ := json.Marshal(notification)
	ws.broadcastToChannel(msg.ChannelID, notificationBytes)
}

// handleVoiceVideoStatus processa mudanças de status de vídeo
func (ws *WebSocketServer) handleVoiceVideoStatus(client *WebSocketConn, msg *WebSocketMessage) {
	var videoData map[string]interface{}
	if err := json.Unmarshal(msg.Data, &videoData); err != nil {
		ws.logger.Error("failed to parse video data", zap.Error(err))
		return
	}

	ws.logger.Info("video status changed",
		zap.String("userID", client.userID.String()),
		zap.Bool("isVideoEnabled", videoData["isVideoEnabled"].(bool)),
		zap.String("channelID", msg.ChannelID))

	// Broadcast para todos no canal
	notification := map[string]interface{}{
		"type":           "voice:video-status",
		"userId":         client.userID.String(),
		"isVideoEnabled": videoData["isVideoEnabled"],
		"channelId":      msg.ChannelID,
	}
	notificationBytes, _ := json.Marshal(notification)
	ws.broadcastToChannel(msg.ChannelID, notificationBytes)
}

// writePump escreve mensagens para o cliente
func (ws *WebSocketServer) writePump(client *WebSocketConn) {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		client.conn.Close()
	}()

	for {
		select {
		case message, ok := <-client.send:
			client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				client.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := client.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := client.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
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

	// Conectar ao NATS
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = "nats://127.0.0.1:4222"
	}

	nc, err := nats.Connect(natsURL)
	if err != nil {
		logger.Fatal("failed to connect to NATS", zap.Error(err))
	}
	defer nc.Close()

	logger.Info("Connected to NATS", zap.String("url", natsURL))

	// Criar servidor WebSocket
	wsServer := NewWebSocketServer(nc, logger)

	// Rotas HTTP
	http.HandleFunc("/ws", wsServer.HandleWS)

	// Iniciar loop do servidor
	go wsServer.Run()

	// Iniciar servidor HTTP
	port := os.Getenv("WS_PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      http.DefaultServeMux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	logger.Info("WebSocket server starting", zap.String("port", port))

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("server error", zap.Error(err))
		}
	}()

	// Graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	<-sigChan
	logger.Info("Shutdown signal received")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("server shutdown error", zap.Error(err))
	}

	logger.Info("WebSocket server stopped")
}
// Force rebuild Wed Nov 19 08:40:37 AM -03 2025
