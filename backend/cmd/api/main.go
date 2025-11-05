package main

import (
	"context"
	"fmt"
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

	authHandler := handlers.NewAuthHandler(logger, jwtSecret)
	healthHandler := handlers.NewHealthHandler(logger)

	// Setup rotas HTTP
	http.HandleFunc("/health", healthHandler.Health)
	http.HandleFunc("/login", authHandler.Login)

	// Middleware de autenticação para rotas protegidas
	http.Handle("/api/", authHandler.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"message": "protected route"}`)
	})))

	// Iniciar servidor HTTP
	port := os.Getenv("API_PORT")
	if port == "" {
		port = "8000"
	}

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      http.DefaultServeMux,
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
