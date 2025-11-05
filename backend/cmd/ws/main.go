package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofrs/uuid"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	"github.com/nats-io/nats.go"
	"go.uber.org/zap"

	"github.com/nexus/backend/internal/cache"
)

// WebSocketConn representa uma conexão WebSocket ativa
type WebSocketConn struct {
	userID string
	conn   *websocket.Conn
	send   chan []byte
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
			ws.logger.Info("client connected", zap.String("userID", client.userID))
			// Parse userID string to UUID
			if uid, err := uuid.FromString(client.userID); err == nil {
				ws.presenceCache.SetPresence(uid, "online")
			}

		case client := <-ws.unregister:
			if _, ok := ws.clients[client]; ok {
				delete(ws.clients, client)
				close(client.send)
				ws.logger.Info("client disconnected", zap.String("userID", client.userID))
				// Parse userID string to UUID
				if uid, err := uuid.FromString(client.userID); err == nil {
					ws.presenceCache.RemovePresence(uid)
				}
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
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		ws.logger.Error("websocket upgrade error", zap.Error(err))
		return
	}

	// TODO: Extrair userID do token JWT
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		userID = "anonymous"
	}

	client := &WebSocketConn{
		userID: userID,
		conn:   conn,
		send:   make(chan []byte, 256),
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
		_, message, err := client.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				ws.logger.Error("websocket error", zap.Error(err))
			}
			break
		}

		// Publicar mensagem no NATS
		if err := ws.nc.Publish("websocket.messages", message); err != nil {
			ws.logger.Error("failed to publish to NATS", zap.Error(err))
		}

		// Broadcast para todos os clientes
		ws.broadcast <- message
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
