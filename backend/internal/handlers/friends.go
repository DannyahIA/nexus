package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gocql/gocql"
	"github.com/gofrs/uuid"
	"github.com/nexus/backend/internal/database"
	"github.com/nexus/backend/internal/models"
	"go.uber.org/zap"
)

// FriendHandler gerencia operações de amizade
type FriendHandler struct {
	logger *zap.Logger
	db     *database.CassandraDB
}

// NewFriendHandler cria um novo handler de amizades
func NewFriendHandler(logger *zap.Logger, db *database.CassandraDB) *FriendHandler {
	return &FriendHandler{
		logger: logger,
		db:     db,
	}
}

// SendFriendRequestRequest representa a requisição de envio de solicitação
type SendFriendRequestRequest struct {
	Username string `json:"username"` // pode ser "dannyah" ou "dannyah#1234"
}

// FriendRequestResponse representa uma solicitação de amizade
type FriendRequestResponse struct {
	FromUserID string `json:"fromUserId"`
	ToUserID   string `json:"toUserId"`
	Username   string `json:"username"`
	Avatar     string `json:"avatar,omitempty"`
	Status     string `json:"status"`
	CreatedAt  int64  `json:"createdAt"`
}

// FriendResponse representa um amigo
type FriendResponse struct {
	UserID        string `json:"userId"`
	Username      string `json:"username"`      // username sem discriminador
	Discriminator string `json:"discriminator"` // discriminador #1234
	DisplayName   string `json:"displayName"`   // nome de exibição
	Nickname      string `json:"nickname,omitempty"`
	Avatar        string `json:"avatar,omitempty"`
	Bio           string `json:"bio,omitempty"`
	Status        string `json:"status"` // online, offline, idle, dnd
	DMChannelID   string `json:"dmChannelId"`
	AddedAt       int64  `json:"addedAt"`
}

// SendFriendRequest envia uma solicitação de amizade
func (fh *FriendHandler) SendFriendRequest(w http.ResponseWriter, r *http.Request) {
	var req SendFriendRequestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		http.Error(w, "username is required", http.StatusBadRequest)
		return
	}

	// Obter usuário do contexto
	claims, ok := r.Context().Value("claims").(*models.Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Buscar usuário destino pelo username (com ou sem discriminador)
	// Formato aceito: "dannyah" ou "dannyah#1234"
	var targetUser map[string]interface{}
	var err error
	
	// Verificar se tem discriminador (#)
	if strings.Contains(req.Username, "#") {
		// Formato: username#1234
		parts := strings.Split(req.Username, "#")
		if len(parts) != 2 {
			http.Error(w, "invalid username format. Use: username#1234", http.StatusBadRequest)
			return
		}
		username := parts[0]
		discriminator := parts[1]
		
		fh.logger.Info("searching user with discriminator",
			zap.String("username", username),
			zap.String("discriminator", discriminator))
		
		targetUser, err = fh.db.GetUserByUsernameAndDiscriminator(username, discriminator)
	} else {
		// Apenas username - buscar qualquer usuário com esse username
		fh.logger.Info("searching user without discriminator",
			zap.String("username", req.Username))
		targetUser, err = fh.db.GetUserByUsername(req.Username)
	}
	
	if err != nil {
		fh.logger.Error("user not found", 
			zap.String("username", req.Username),
			zap.Error(err))
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	// Converter user_id para string (pode vir como gocql.UUID ou string)
	var targetUserID string
	switch v := targetUser["user_id"].(type) {
	case string:
		targetUserID = v
	case gocql.UUID:
		targetUserID = v.String()
	default:
		fh.logger.Error("invalid user_id type", zap.Any("type", v))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Não pode adicionar a si mesmo
	if targetUserID == claims.UserID {
		http.Error(w, "cannot add yourself", http.StatusBadRequest)
		return
	}

	// Verificar se já existe solicitação ou amizade
	exists, _ := fh.db.FriendRequestExists(claims.UserID, targetUserID)
	if exists {
		http.Error(w, "friend request already sent", http.StatusBadRequest)
		return
	}

	// Criar solicitação
	now := time.Now()
	err = fh.db.CreateFriendRequest(claims.UserID, targetUserID, "pending", now)
	if err != nil {
		fh.logger.Error("failed to create friend request", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	fh.logger.Info("friend request sent",
		zap.String("from", claims.UserID),
		zap.String("to", targetUserID),
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message":  "friend request sent",
		"toUserId": targetUserID,
	})
}

// GetFriendRequests retorna solicitações de amizade pendentes
func (fh *FriendHandler) GetFriendRequests(w http.ResponseWriter, r *http.Request) {
	// Obter usuário do contexto
	claims, ok := r.Context().Value("claims").(*models.Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Buscar solicitações recebidas
	rows, err := fh.db.GetPendingFriendRequests(claims.UserID)
	if err != nil {
		fh.logger.Error("failed to get friend requests", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	requests := make([]FriendRequestResponse, 0)
	for _, row := range rows {
		// Converter from_user_id (pode ser gocql.UUID ou string)
		var fromUserID string
		switch v := row["from_user_id"].(type) {
		case string:
			fromUserID = v
		case gocql.UUID:
			fromUserID = v.String()
		default:
			fh.logger.Error("invalid from_user_id type", zap.Any("type", v))
			continue
		}

		// Buscar informações do usuário remetente
		user, err := fh.db.GetUserByID(fromUserID)
		username := "Unknown"
		displayName := "Unknown"
		discriminator := ""
		
		if err != nil {
			fh.logger.Error("failed to get user info for friend request", 
				zap.String("fromUserId", fromUserID),
				zap.Error(err))
		} else if user != nil {
			if u, ok := user["username"].(string); ok {
				username = u
			}
			if d, ok := user["display_name"].(string); ok && d != "" {
				displayName = d
			} else {
				displayName = username
			}
			if disc, ok := user["discriminator"].(string); ok {
				discriminator = disc
			}
			
			fh.logger.Info("loaded friend request user info",
				zap.String("username", username),
				zap.String("discriminator", discriminator),
				zap.String("displayName", displayName))
		}

		// Converter to_user_id
		var toUserID string
		switch v := row["to_user_id"].(type) {
		case string:
			toUserID = v
		case gocql.UUID:
			toUserID = v.String()
		default:
			fh.logger.Error("invalid to_user_id type", zap.Any("type", v))
			continue
		}

		req := FriendRequestResponse{
			FromUserID: fromUserID,
			ToUserID:   toUserID,
			Username:   username,
			Status:     row["status"].(string),
			CreatedAt:  row["created_at"].(time.Time).UnixMilli(),
		}

		requests = append(requests, req)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(requests)
}

// AcceptFriendRequest aceita uma solicitação de amizade
func (fh *FriendHandler) AcceptFriendRequest(w http.ResponseWriter, r *http.Request) {
	fromUserID := r.URL.Query().Get("fromUserId")
	if fromUserID == "" {
		http.Error(w, "fromUserId required", http.StatusBadRequest)
		return
	}

	// Obter usuário do contexto
	claims, ok := r.Context().Value("claims").(*models.Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Atualizar status da solicitação
	err := fh.db.UpdateFriendRequestStatus(fromUserID, claims.UserID, "accepted")
	if err != nil {
		fh.logger.Error("failed to accept friend request", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Criar canal de DM entre os dois usuários
	dmChannelID := uuid.Must(uuid.NewV4())
	err = fh.db.CreateDMChannel(dmChannelID.String(), fromUserID, claims.UserID)
	if err != nil {
		fh.logger.Error("failed to create DM channel", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Adicionar ambos como amigos
	now := time.Now()
	err = fh.db.AddFriend(claims.UserID, fromUserID, "", dmChannelID.String(), now)
	if err != nil {
		fh.logger.Error("failed to add friend", zap.Error(err))
	}

	err = fh.db.AddFriend(fromUserID, claims.UserID, "", dmChannelID.String(), now)
	if err != nil {
		fh.logger.Error("failed to add friend (reverse)", zap.Error(err))
	}

	fh.logger.Info("friend request accepted",
		zap.String("from", fromUserID),
		zap.String("to", claims.UserID),
		zap.String("dmChannelId", dmChannelID.String()),
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message":     "friend request accepted",
		"dmChannelId": dmChannelID.String(),
	})
}

// RejectFriendRequest rejeita uma solicitação de amizade
func (fh *FriendHandler) RejectFriendRequest(w http.ResponseWriter, r *http.Request) {
	fromUserID := r.URL.Query().Get("fromUserId")
	if fromUserID == "" {
		http.Error(w, "fromUserId required", http.StatusBadRequest)
		return
	}

	// Obter usuário do contexto
	claims, ok := r.Context().Value("claims").(*models.Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Atualizar status
	err := fh.db.UpdateFriendRequestStatus(fromUserID, claims.UserID, "rejected")
	if err != nil {
		fh.logger.Error("failed to reject friend request", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	fh.logger.Info("friend request rejected",
		zap.String("from", fromUserID),
		zap.String("to", claims.UserID),
	)

	w.WriteHeader(http.StatusNoContent)
}

// GetFriends retorna lista de amigos
func (fh *FriendHandler) GetFriends(w http.ResponseWriter, r *http.Request) {
	// Obter usuário do contexto
	claims, ok := r.Context().Value("claims").(*models.Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// TODO: Implementar sistema de amigos completo
	// Por enquanto retorna lista vazia para não quebrar o frontend
	friends := make([]FriendResponse, 0)

	// Código comentado até implementar tabelas de amigos
	/*
		rows, err := fh.db.GetFriends(claims.UserID)
		if err != nil {
			fh.logger.Error("failed to get friends", zap.Error(err))
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		for _, row := range rows {
			friendID := row["friend_id"].(string)

			// Buscar informações do amigo
			user, _ := fh.db.GetUserByID(friendID)
			username := "Unknown"
			if user != nil {
				username = user["username"].(string)
			}

			// Buscar presença
			presence, _ := fh.db.GetUserPresence(friendID)
			status := "offline"
			if presence != nil {
				status = presence["status"].(string)
			}

			friend := FriendResponse{
				UserID:      friendID,
				Username:    username,
				DMChannelID: row["dm_channel_id"].(string),
				Status:      status,
				AddedAt:     row["added_at"].(time.Time).UnixMilli(),
			}

			if nickname, ok := row["nickname"].(string); ok && nickname != "" {
				friend.Nickname = nickname
			}

			friends = append(friends, friend)
		}
	*/

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(friends)
}

// RemoveFriend remove um amigo
func (fh *FriendHandler) RemoveFriend(w http.ResponseWriter, r *http.Request) {
	friendID := r.URL.Query().Get("friendId")
	if friendID == "" {
		http.Error(w, "friendId required", http.StatusBadRequest)
		return
	}

	// Obter usuário do contexto
	claims, ok := r.Context().Value("claims").(*models.Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Remover amizade (ambos os lados)
	err := fh.db.RemoveFriend(claims.UserID, friendID)
	if err != nil {
		fh.logger.Error("failed to remove friend", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	err = fh.db.RemoveFriend(friendID, claims.UserID)
	if err != nil {
		fh.logger.Error("failed to remove friend (reverse)", zap.Error(err))
	}

	fh.logger.Info("friend removed",
		zap.String("userId", claims.UserID),
		zap.String("friendId", friendID),
	)

	w.WriteHeader(http.StatusNoContent)
}

// GetDMs retorna as conversas diretas do usuário
func (fh *FriendHandler) GetDMs(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value("claims").(*models.Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// TODO: Implement GetUserDMs in database
	response := []interface{}{}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// CreateDM cria uma nova conversa direta
func (fh *FriendHandler) CreateDM(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value("claims").(*models.Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		FriendID string `json:"friendId"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.FriendID == "" {
		http.Error(w, "friend ID is required", http.StatusBadRequest)
		return
	}

	// TODO: Implement CreateDMChannel in database
	channelID := uuid.Must(uuid.NewV4()).String()

	response := map[string]interface{}{
		"id":       channelID,
		"type":     "dm",
		"userId":   claims.UserID,
		"friendId": req.FriendID,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}
