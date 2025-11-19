package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gofrs/uuid"
	"github.com/nexus/backend/internal/database"
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
	Username string `json:"username"`
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
	UserID      string `json:"userId"`
	Username    string `json:"username"`
	Nickname    string `json:"nickname,omitempty"`
	Avatar      string `json:"avatar,omitempty"`
	Status      string `json:"status"` // online, offline, idle, dnd
	DMChannelID string `json:"dmChannelId"`
	AddedAt     int64  `json:"addedAt"`
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
	claims, ok := r.Context().Value("claims").(*Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Buscar usuário destino pelo username
	targetUser, err := fh.db.GetUserByUsername(req.Username)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	targetUserID := targetUser["user_id"].(string)

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
		"message": "friend request sent",
		"toUserId": targetUserID,
	})
}

// GetFriendRequests retorna solicitações de amizade pendentes
func (fh *FriendHandler) GetFriendRequests(w http.ResponseWriter, r *http.Request) {
	// Obter usuário do contexto
	claims, ok := r.Context().Value("claims").(*Claims)
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
		fromUserID := row["from_user_id"].(string)
		
		// Buscar informações do usuário remetente
		user, _ := fh.db.GetUserByID(fromUserID)
		username := "Unknown"
		if user != nil {
			username = user["username"].(string)
		}

		req := FriendRequestResponse{
			FromUserID: fromUserID,
			ToUserID:   row["to_user_id"].(string),
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
	claims, ok := r.Context().Value("claims").(*Claims)
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
	claims, ok := r.Context().Value("claims").(*Claims)
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
	claims, ok := r.Context().Value("claims").(*Claims)
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
	claims, ok := r.Context().Value("claims").(*Claims)
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
