package main

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

	// Validar token JWT
	claims := &jwt.StandardClaims{}
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

	// Extrair userID do token
	userID, err := uuid.FromString(claims.Subject)
	if err != nil {
		ws.logger.Error("invalid user ID in token", zap.Error(err))
		http.Error(w, "Unauthorized: invalid user ID", http.StatusUnauthorized)
		return
	}

	// Upgrade para WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		ws.logger.Error("websocket upgrade error", zap.Error(err))
		return
	}

	// Obter username (pode vir do query param ou do banco de dados)
	username := r.URL.Query().Get("username")
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

	client.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	client.conn.SetPongHandler(func(string) error {
		client.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
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
