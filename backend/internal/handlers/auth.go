package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gofrs/uuid"
	"github.com/golang-jwt/jwt"
	"github.com/nexus/backend/internal/database"
	"github.com/nexus/backend/internal/models"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

// AuthHandler gerencia operações de autenticação
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

// LoginRequest representa uma requisição de login
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// RegisterRequest representa uma requisição de registro
type RegisterRequest struct {
	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// AuthResponse representa uma resposta de autenticação
type AuthResponse struct {
	Token string `json:"token"`
	User  struct {
		ID            string `json:"id"`
		Email         string `json:"email"`
		Username      string `json:"username"`
		Discriminator string `json:"discriminator"`
		DisplayName   string `json:"displayName"`
	} `json:"user"`
}

// Login autentica um usuário
func (ah *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		ah.logger.Error("failed to decode login request", zap.Error(err))
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Validar entrada
	if req.Email == "" || req.Password == "" {
		http.Error(w, "email and password are required", http.StatusBadRequest)
		return
	}

	// Buscar usuário no banco de dados
	user, err := ah.db.GetUserByEmail(req.Email)
	if err != nil {
		ah.logger.Error("user not found", zap.Error(err))
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	// Verificar senha
	passwordHash, ok := user["password_hash"].(string)
	if !ok {
		ah.logger.Error("invalid password hash format")
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password))
	if err != nil {
		ah.logger.Error("invalid password", zap.Error(err))
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	// Extrair dados do usuário (agora vêm como strings do database)
	userID, _ := user["user_id"].(string)
	username, _ := user["username"].(string)
	discriminator, _ := user["discriminator"].(string)
	displayName, _ := user["display_name"].(string)
	
	ah.logger.Info("user logged in", 
		zap.String("email", req.Email),
		zap.String("username", username),
		zap.String("discriminator", discriminator),
		zap.String("userID", userID))
	
	// Gerar token JWT
	claims := &models.Claims{
		UserID:        userID,
		Email:         req.Email,
		Username:      username,
		Discriminator: discriminator,
		DisplayName:   displayName,
		StandardClaims: jwt.StandardClaims{
			ExpiresAt: time.Now().Add(24 * time.Hour).Unix(),
			IssuedAt:  time.Now().Unix(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(ah.jwtSecret))
	if err != nil {
		ah.logger.Error("failed to sign token", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	response := AuthResponse{
		Token: tokenString,
	}
	response.User.ID = claims.UserID
	response.User.Email = claims.Email
	response.User.Username = claims.Username
	response.User.Discriminator = claims.Discriminator
	response.User.DisplayName = claims.DisplayName

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Register registra um novo usuário
func (ah *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		ah.logger.Error("failed to decode register request", zap.Error(err))
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.Username == "" || req.Password == "" {
		http.Error(w, "email, username and password are required", http.StatusBadRequest)
		return
	}

	// Hash da senha
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		ah.logger.Error("failed to hash password", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// TODO: Salvar usuário no banco de dados
	ah.logger.Info("user registered", zap.String("email", req.Email), zap.String("username", req.Username))

	// Gerar UUID válido para o novo usuário
	userID := uuid.Must(uuid.NewV4())
	
	// Salvar usuário no banco de dados com discriminador único
	discriminator, err := ah.db.CreateUserWithDiscriminator(userID.String(), req.Email, req.Username, req.Username, string(hashedPassword))
	if err != nil {
		ah.logger.Error("failed to create user with discriminator", zap.Error(err))
		http.Error(w, "failed to create user", http.StatusInternalServerError)
		return
	}
	
	ah.logger.Info("user created with discriminator", 
		zap.String("username", req.Username), 
		zap.String("discriminator", discriminator))
	
	// Gerar token JWT
	claims := &models.Claims{
		UserID:        userID.String(),
		Email:         req.Email,
		Username:      req.Username,
		Discriminator: discriminator,
		DisplayName:   req.Username,
		StandardClaims: jwt.StandardClaims{
			ExpiresAt: time.Now().Add(24 * time.Hour).Unix(),
			IssuedAt:  time.Now().Unix(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(ah.jwtSecret))
	if err != nil {
		ah.logger.Error("failed to sign token", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	response := AuthResponse{
		Token: tokenString,
	}
	response.User.ID = claims.UserID
	response.User.Email = claims.Email
	response.User.Username = claims.Username
	response.User.Discriminator = claims.Discriminator
	response.User.DisplayName = claims.DisplayName

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)

	// Use hashed password for future implementation
	_ = hashedPassword
}

// AuthMiddleware é um middleware para autenticação JWT
func (ah *AuthHandler) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extrair token do header Authorization
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "missing authorization header", http.StatusUnauthorized)
			return
		}

		// Formato esperado: "Bearer <token>"
		tokenString := ""
		if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
			tokenString = authHeader[7:]
		} else {
			http.Error(w, "invalid authorization header format", http.StatusUnauthorized)
			return
		}

		// Verificar token JWT
		claims := &models.Claims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return []byte(ah.jwtSecret), nil
		})

		if err != nil || !token.Valid {
			ah.logger.Error("invalid token", zap.Error(err))
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		// Adicionar claims ao contexto da requisição
		ctx := context.WithValue(r.Context(), "claims", claims)
		*r = *r.WithContext(ctx)

		// Chamar próximo handler
		next.ServeHTTP(w, r)
	})
}
