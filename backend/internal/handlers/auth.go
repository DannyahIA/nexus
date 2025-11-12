package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gofrs/uuid"
	"github.com/golang-jwt/jwt"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"

	"github.com/nexus/backend/internal/database"
)

// AuthHandler gerencia autenticação
type AuthHandler struct {
	logger *zap.Logger
	secret string
	db     *database.CassandraDB
}

// NewAuthHandler cria um novo handler de autenticação
func NewAuthHandler(logger *zap.Logger, secret string, db *database.CassandraDB) *AuthHandler {
	return &AuthHandler{
		logger: logger,
		secret: secret,
		db:     db,
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

		// Remove "Bearer " prefix se existir
		tokenString := authHeader
		if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
			tokenString = authHeader[7:]
		}

		claims, err := ah.VerifyToken(tokenString)
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		// Adicionar claims ao contexto
		ctx := context.WithValue(r.Context(), "claims", claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// LoginRequest representa a requisição de login
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginResponse representa a resposta de login
type LoginResponse struct {
	Token string      `json:"token"`
	User  interface{} `json:"user"`
}

// RegisterRequest representa a requisição de registro
type RegisterRequest struct {
	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// Login autentica um usuário
func (ah *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Buscar usuário no banco de dados (pode ser por email ou username)
	user, err := ah.db.GetUserByUsername(req.Username)
	if err != nil {
		// Tentar por email
		user, err = ah.db.GetUserByEmail(req.Username)
		if err != nil {
			ah.logger.Error("user not found", zap.String("username", req.Username), zap.Error(err))
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			return
		}
	}

	// Verificar senha
	passwordHash, ok := user["password_hash"].(string)
	if !ok {
		ah.logger.Error("password_hash not found in user")
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		ah.logger.Error("invalid password", zap.Error(err))
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	// Extrair dados do usuário
	userID, _ := user["user_id"].(uuid.UUID)
	email, _ := user["email"].(string)
	username, _ := user["username"].(string)
	avatarURL, _ := user["avatar_url"].(string)

	token, err := ah.GenerateToken(userID.String(), email, username)
	if err != nil {
		http.Error(w, "failed to generate token", http.StatusInternalServerError)
		return
	}

	response := LoginResponse{
		Token: token,
		User: map[string]interface{}{
			"id":       userID.String(),
			"email":    email,
			"username": username,
			"avatar":   avatarURL,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Register registra um novo usuário
func (ah *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Validar campos
	if req.Email == "" || req.Username == "" || req.Password == "" {
		http.Error(w, "email, username and password are required", http.StatusBadRequest)
		return
	}

	if len(req.Username) < 3 {
		http.Error(w, "username must be at least 3 characters", http.StatusBadRequest)
		return
	}

	if len(req.Password) < 6 {
		http.Error(w, "password must be at least 6 characters", http.StatusBadRequest)
		return
	}

	// Verificar se usuário já existe (por email)
	if _, err := ah.db.GetUserByEmail(req.Email); err == nil {
		http.Error(w, "email already registered", http.StatusConflict)
		return
	}

	// Verificar se usuário já existe (por username)
	if _, err := ah.db.GetUserByUsername(req.Username); err == nil {
		http.Error(w, "username already taken", http.StatusConflict)
		return
	}

	// Hash da senha
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		ah.logger.Error("failed to hash password", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Gerar UUID para o usuário
	userID := uuid.Must(uuid.NewV4())

	// Salvar usuário no banco de dados
	if err := ah.db.CreateUser(userID.String(), req.Email, req.Username, string(passwordHash)); err != nil {
		ah.logger.Error("failed to create user", zap.Error(err))
		http.Error(w, "failed to create user", http.StatusInternalServerError)
		return
	}

	// Gerar token
	token, err := ah.GenerateToken(userID.String(), req.Email, req.Username)
	if err != nil {
		http.Error(w, "failed to generate token", http.StatusInternalServerError)
		return
	}

	response := LoginResponse{
		Token: token,
		User: map[string]interface{}{
			"id":       userID.String(),
			"email":    req.Email,
			"username": req.Username,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
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
