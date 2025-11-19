package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gofrs/uuid"
	"github.com/nexus/backend/internal/database"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

// Claims representa os claims do JWT
type Claims struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	jwt.RegisteredClaims
}

// AuthHandler gerencia autenticação
type AuthHandler struct {
	logger    *zap.Logger
	jwtSecret string
	db        *database.CassandraDB
}

// NewAuthHandler cria um novo handler de autenticação
func NewAuthHandler(logger *zap.Logger, jwtSecret string, db *database.CassandraDB) *AuthHandler {
	return &AuthHandler{
		logger:    logger,
		jwtSecret: jwtSecret,
		db:        db,
	}
}

// RegisterRequest representa a requisição de registro
type RegisterRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginRequest representa a requisição de login
type LoginRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AuthResponse representa a resposta de autenticação
type AuthResponse struct {
	Token    string `json:"token"`
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
}

// Register registra um novo usuário
func (ah *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Validações
	if req.Username == "" || req.Email == "" || req.Password == "" {
		http.Error(w, "username, email and password are required", http.StatusBadRequest)
		return
	}

	// Hash da senha
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		ah.logger.Error("failed to hash password", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Criar usuário
	userID := uuid.Must(uuid.NewV4()).String()

	err = ah.db.CreateUser(userID, req.Email, req.Username, string(hashedPassword))
	if err != nil {
		ah.logger.Error("failed to create user", zap.Error(err))
		http.Error(w, "failed to create user", http.StatusInternalServerError)
		return
	}

	// Criar presença inicial
	_ = ah.db.UpdateUserPresence(userID, "offline")

	ah.logger.Info("user registered", zap.String("userId", userID), zap.String("username", req.Username))

	// Gerar token
	token, err := ah.generateToken(userID, req.Username, req.Email)
	if err != nil {
		ah.logger.Error("failed to generate token", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(AuthResponse{
		Token:    token,
		UserID:   userID,
		Username: req.Username,
		Email:    req.Email,
	})
}

// Login autentica um usuário
func (ah *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Buscar usuário por username ou email
	var user map[string]interface{}
	var err error

	if req.Username != "" {
		user, err = ah.db.GetUserByUsername(req.Username)
	} else if req.Email != "" {
		user, err = ah.db.GetUserByEmail(req.Email)
	} else {
		http.Error(w, "username or email required", http.StatusBadRequest)
		return
	}

	if err != nil {
		ah.logger.Error("user not found", zap.Error(err))
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	// Verificar senha
	passwordHash := user["password_hash"].(string)
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		ah.logger.Error("invalid password", zap.Error(err))
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	// Converter user_id de gocql.UUID para string
	var userID string
	switch v := user["user_id"].(type) {
	case string:
		userID = v
	default:
		userID = fmt.Sprintf("%v", v)
	}
	
	username := user["username"].(string)
	email := user["email"].(string)

	// Atualizar presença
	_ = ah.db.UpdateUserPresence(userID, "online")

	// Gerar token
	token, err := ah.generateToken(userID, username, email)
	if err != nil {
		ah.logger.Error("failed to generate token", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	ah.logger.Info("user logged in", zap.String("userId", userID), zap.String("username", username))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		Token:    token,
		UserID:   userID,
		Username: username,
		Email:    email,
	})
}

// generateToken gera um JWT token
func (ah *AuthHandler) generateToken(userID, username, email string) (string, error) {
	claims := Claims{
		UserID:   userID,
		Username: username,
		Email:    email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(ah.jwtSecret))
}

// AuthMiddleware valida o JWT token
func (ah *AuthHandler) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "authorization header required", http.StatusUnauthorized)
			return
		}

		// Extrair token do header "Bearer <token>"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "invalid authorization header format", http.StatusUnauthorized)
			return
		}

		tokenString := parts[1]

		// Parse e validar token
		token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
			return []byte(ah.jwtSecret), nil
		})

		if err != nil || !token.Valid {
			ah.logger.Error("invalid token", zap.Error(err))
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		claims, ok := token.Claims.(*Claims)
		if !ok {
			http.Error(w, "invalid token claims", http.StatusUnauthorized)
			return
		}

		// Adicionar claims ao contexto
		ctx := context.WithValue(r.Context(), "claims", claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// HealthHandler gerencia health checks
type HealthHandler struct {
	logger *zap.Logger
}

// NewHealthHandler cria um novo handler de health
func NewHealthHandler(logger *zap.Logger) *HealthHandler {
	return &HealthHandler{logger: logger}
}

// Health retorna o status de saúde da API
func (hh *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "ok",
		"time":   time.Now().Format(time.RFC3339),
	})
}
