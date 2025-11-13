package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"go.uber.org/zap"

	"github.com/nexus/backend/internal/database"
	"github.com/nexus/backend/internal/handlers"
)

// enableCORS adiciona headers CORS à resposta
func enableCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

// corsMiddleware adiciona headers CORS a todas as requisições
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)

		// Handle preflight
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
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

	// Conectar ao Cassandra
	cassandraHosts := []string{os.Getenv("CASS_HOSTS")}
	cassandraKeyspace := os.Getenv("CASS_KEYSPACE")
	if cassandraKeyspace == "" {
		cassandraKeyspace = "nexus"
	}

	db, err := database.NewCassandraDB(cassandraHosts, cassandraKeyspace)
	if err != nil {
		logger.Fatal("failed to connect to Cassandra", zap.Error(err))
	}
	defer db.Close()

	// Inicializar keyspace e tabelas
	if err := db.InitializeKeyspace(); err != nil {
		logger.Error("failed to initialize keyspace", zap.Error(err))
	}

	logger.Info("Connected to Cassandra", zap.Strings("hosts", cassandraHosts))

	// Setup handlers
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "your-secret-key-here"
	}

	authHandler := handlers.NewAuthHandler(logger, jwtSecret, db)
	healthHandler := handlers.NewHealthHandler(logger)
	channelHandler := handlers.NewChannelHandler(logger, db)
	messageHandler := handlers.NewMessageHandler(logger, db)
	taskHandler := handlers.NewTaskHandler(logger, db)

	// Setup rotas HTTP
	mux := http.NewServeMux()

	// Rotas públicas
	mux.HandleFunc("/health", healthHandler.Health)
	mux.HandleFunc("/api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		if r.Method == http.MethodOptions {
			return
		}
		authHandler.Login(w, r)
	})
	mux.HandleFunc("/api/auth/register", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		if r.Method == http.MethodOptions {
			return
		}
		authHandler.Register(w, r)
	})

	// Rotas de canais (protegidas)
	mux.Handle("/api/channels", authHandler.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		if r.Method == http.MethodOptions {
			return
		}

		switch r.Method {
		case http.MethodGet:
			if r.URL.Query().Get("id") != "" {
				channelHandler.GetChannel(w, r)
			} else {
				channelHandler.ListChannels(w, r)
			}
		case http.MethodPost:
			channelHandler.CreateChannel(w, r)
		case http.MethodDelete:
			channelHandler.DeleteChannel(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// Rotas de mensagens (protegidas)
	mux.Handle("/api/messages", authHandler.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		if r.Method == http.MethodOptions {
			return
		}

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
		enableCORS(w)
		if r.Method == http.MethodOptions {
			return
		}

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

	// Iniciar servidor HTTP
	port := os.Getenv("API_PORT")
	if port == "" {
		port = "8000"
	}

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      corsMiddleware(mux), // Aplicar CORS middleware global
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	logger.Info("API server starting", zap.String("port", port))

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
