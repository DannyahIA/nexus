package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt"
	"go.uber.org/zap"
)

// AuthHandler gerencia autenticação
type AuthHandler struct {
	logger *zap.Logger
	secret string
}

// NewAuthHandler cria um novo handler de autenticação
func NewAuthHandler(logger *zap.Logger, secret string) *AuthHandler {
	return &AuthHandler{
		logger: logger,
		secret: secret,
	}
}

// Claims representa os claims do JWT
type Claims struct {
	UserID   string `json:"user_id"`
	Email    string `json:"email"`
	Username string `json:"username"`
	jwt.StandardClaims
}

// GenerateToken gera um token JWT
func (ah *AuthHandler) GenerateToken(userID string, email string, username string) (string, error) {
	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID:   userID,
		Email:    email,
		Username: username,
		StandardClaims: jwt.StandardClaims{
			ExpiresAt: expirationTime.Unix(),
			IssuedAt:  time.Now().Unix(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(ah.secret))

	if err != nil {
		ah.logger.Error("failed to generate token", zap.Error(err))
		return "", err
	}

	return tokenString, nil
}

// VerifyToken valida um token JWT
func (ah *AuthHandler) VerifyToken(tokenString string) (*Claims, error) {
	claims := &Claims{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return []byte(ah.secret), nil
	})

	if err != nil {
		ah.logger.Error("failed to parse token", zap.Error(err))
		return nil, err
	}

	if !token.Valid {
		ah.logger.Error("invalid token")
		return nil, err
	}

	return claims, nil
}

// AuthMiddleware é um middleware para autenticação
func (ah *AuthHandler) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "missing authorization header", http.StatusUnauthorized)
			return
		}

		claims, err := ah.VerifyToken(authHeader)
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
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
	return &HealthHandler{
		logger: logger,
	}
}

// Health retorna o status da API
func (hh *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
		"time":   time.Now().Unix(),
	})
}

// LoginResponse representa a resposta de login
type LoginResponse struct {
	Token    string `json:"token"`
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
}

// LoginRequest representa a requisição de login
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Login autentica um usuário
func (ah *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// TODO: Validar email/password contra banco de dados
	// Por enquanto, apenas gerar token

	userID := "user-123" // TODO: obter do DB
	token, err := ah.GenerateToken(userID, req.Email, "username")
	if err != nil {
		http.Error(w, "failed to generate token", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(LoginResponse{
		Token:    token,
		UserID:   userID,
		Email:    req.Email,
		Username: "username",
	})
}
