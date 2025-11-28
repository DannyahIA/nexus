package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"go.uber.org/zap"

	"github.com/nexus/backend/internal/config"
	"github.com/nexus/backend/internal/database"
	"github.com/nexus/backend/internal/handlers"
	"github.com/nexus/backend/internal/middleware"
)



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

	// Validate and load environment configuration
	envConfig, err := config.InitializeEnvironment(logger)
	if err != nil {
		logger.Fatal("Environment configuration validation failed", zap.Error(err))
	}

	// Conectar ao Cassandra
	db, err := database.NewCassandraDB(envConfig.CassandraHosts, envConfig.CassandraKeyspace)
	if err != nil {
		logger.Fatal("failed to connect to Cassandra", zap.Error(err))
	}
	defer db.Close()

	// Inicializar keyspace e tabelas
	if err := db.InitializeKeyspace(); err != nil {
		logger.Error("failed to initialize keyspace", zap.Error(err))
	}

	logger.Info("Connected to Cassandra", zap.Strings("hosts", envConfig.CassandraHosts))

	// Setup CORS middleware
	corsConfig := middleware.NewCORSConfig(logger)

	// Setup handlers
	authHandler := handlers.NewAuthHandler(logger, envConfig.JWTSecret, db)
	healthHandler := handlers.NewHealthHandler(logger)
	channelHandler := handlers.NewChannelHandler(logger, db)
	messageHandler := handlers.NewMessageHandler(logger, db)
	taskHandler := handlers.NewTaskHandler(logger, db)
	serverHandler := handlers.NewServerHandler(logger, db)
	friendHandler := handlers.NewFriendHandler(logger, db)
	imageHandler := handlers.NewImageHandler(logger, db, "./uploads")

	// Setup rotas HTTP
	mux := http.NewServeMux()

	// Rotas públicas
	mux.HandleFunc("/health", healthHandler.Health)
	mux.HandleFunc("/api/auth/login", authHandler.Login)
	mux.HandleFunc("/api/auth/register", authHandler.Register)

	// Rotas de canais (protegidas)
	mux.Handle("/api/channels", authHandler.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			if r.URL.Query().Get("id") != "" {
				channelHandler.GetChannel(w, r)
			} else {
				channelHandler.ListChannels(w, r)
			}
		case http.MethodPost:
			channelHandler.CreateChannel(w, r)
		case http.MethodPut, http.MethodPatch:
			channelHandler.UpdateChannel(w, r)
		case http.MethodDelete:
			channelHandler.DeleteChannel(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// Rotas de mensagens (protegidas)
	mux.Handle("/api/messages", authHandler.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		channelID := r.URL.Query().Get("channelId")
		messageID := r.URL.Query().Get("id")

		switch r.Method {
		case http.MethodGet:
			messageHandler.GetMessages(w, r)
		case http.MethodPost:
			if channelID == "" {
				http.Error(w, "channelId required", http.StatusBadRequest)
				return
			}
			messageHandler.SendMessage(w, r)
		case http.MethodPatch:
			if messageID == "" {
				http.Error(w, "message id required", http.StatusBadRequest)
				return
			}
			messageHandler.UpdateMessage(w, r)
		case http.MethodDelete:
			if messageID == "" {
				http.Error(w, "message id required", http.StatusBadRequest)
				return
			}
			messageHandler.DeleteMessage(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// Rotas de tarefas (protegidas)
	mux.Handle("/api/tasks", authHandler.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		channelID := r.URL.Query().Get("channelId")
		taskID := r.URL.Query().Get("id")

		switch r.Method {
		case http.MethodGet:
			if channelID == "" {
				http.Error(w, "channelId required", http.StatusBadRequest)
				return
			}
			taskHandler.GetTasks(w, r)
		case http.MethodPost:
			if channelID == "" {
				http.Error(w, "channelId required", http.StatusBadRequest)
				return
			}
			taskHandler.CreateTask(w, r)
		case http.MethodPatch:
			if taskID == "" {
				http.Error(w, "task id required", http.StatusBadRequest)
				return
			}
			taskHandler.UpdateTask(w, r)
		case http.MethodDelete:
			if taskID == "" {
				http.Error(w, "task id required", http.StatusBadRequest)
				return
			}
			taskHandler.DeleteTask(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// Rotas de servidores (protegidas)
	mux.Handle("/api/servers", authHandler.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			serverHandler.GetServers(w, r)
		case http.MethodPost:
			serverHandler.CreateServer(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// Rota para operações específicas de servidor (protegida)
	mux.Handle("/api/servers/", authHandler.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		
		// Verifica se é /api/servers/join/{code}
		if strings.HasPrefix(path, "/api/servers/join/") && r.Method == http.MethodPost {
			serverHandler.JoinServerByInvite(w, r)
		} else if strings.HasSuffix(path, "/channels") && r.Method == http.MethodGet {
			// /api/servers/{id}/channels - GET
			serverHandler.GetServerChannels(w, r)
		} else if strings.HasSuffix(path, "/channels") && r.Method == http.MethodPost {
			// /api/servers/{id}/channels - POST
			serverHandler.CreateServerChannel(w, r)
		} else if r.Method == http.MethodPut || r.Method == http.MethodPatch {
			// Atualização de servidor /api/servers/{id}
			serverHandler.UpdateServer(w, r)
		} else if r.Method == http.MethodDelete {
			// Deletar servidor /api/servers/{id}
			serverHandler.DeleteServer(w, r)
		} else {
			http.Error(w, "not found", http.StatusNotFound)
		}
	})))

	// Rota para solicitações de amizade (protegida) - DEVE VIR ANTES DE /api/friends
	mux.Handle("/api/friends/requests", authHandler.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			friendHandler.GetFriendRequests(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// Rota para aceitar/rejeitar solicitações de amizade
	mux.Handle("/api/friends/accept/", authHandler.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			friendHandler.AcceptFriendRequest(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	mux.Handle("/api/friends/reject/", authHandler.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			friendHandler.RejectFriendRequest(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// Rotas de amigos (protegidas)
	mux.Handle("/api/friends", authHandler.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			friendHandler.GetFriends(w, r)
		case http.MethodPost:
			friendHandler.SendFriendRequest(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// Rota para remover amigo
	mux.Handle("/api/friends/", authHandler.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			friendHandler.RemoveFriend(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// Rota para DMs/Mensagens diretas (protegida)
	mux.Handle("/api/dms", authHandler.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			friendHandler.GetDMs(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// Rota para criar DM
	mux.Handle("/api/dms/create", authHandler.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			friendHandler.CreateDM(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// Rotas de imagens
	// Upload de avatar de usuário (protegida)
	mux.Handle("/api/users/avatar", authHandler.AuthMiddleware(http.HandlerFunc(imageHandler.UploadUserAvatar)))

	// Servir imagens (pública)
	mux.HandleFunc("/api/images/", imageHandler.ServeImage)

	// Iniciar servidor HTTP
	server := &http.Server{
		Addr:         ":" + envConfig.APIPort,
		Handler:      corsConfig.Middleware(mux), // Aplicar CORS middleware global
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	logger.Info("API server starting", zap.String("port", envConfig.APIPort))

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

	logger.Info("API server stopped")
}
