package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gofrs/uuid"
	"github.com/nexus/backend/internal/database"
	"go.uber.org/zap"
)

// toStringID converte um valor (que pode ser gocql.UUID ou string) para string
func toStringID(v interface{}) string {
	switch val := v.(type) {
	case string:
		return val
	default:
		return fmt.Sprintf("%v", val)
	}
}

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
	FromUserID   string `json:"fromUserId"`
	ToUserID     string `json:"toUserId"`
	Username     string `json:"username"`
	FromUsername string `json:"fromUsername"` // Alias para compatibilidade com frontend
	Avatar       string `json:"avatar,omitempty"`
	Status       string `json:"status"`
	CreatedAt    int64  `json:"createdAt"`
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

	targetUserID := toStringID(targetUser["user_id"])

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
		fromUserID := toStringID(row["from_user_id"])
		
		// Buscar informações do usuário remetente
		user, _ := fh.db.GetUserByID(fromUserID)
		username := "Unknown"
		if user != nil {
			username = user["username"].(string)
		}

		req := FriendRequestResponse{
			FromUserID:   fromUserID,
			ToUserID:     toStringID(row["to_user_id"]),
			Username:     username,
			FromUsername: username, // Adicionar para compatibilidade com frontend
			Status:       row["status"].(string),
			CreatedAt:    row["created_at"].(time.Time).UnixMilli(),
		}

		requests = append(requests, req)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(requests)
}

// AcceptFriendRequest aceita uma solicitação de amizade
func (fh *FriendHandler) AcceptFriendRequest(w http.ResponseWriter, r *http.Request) {
	// Extrair fromUserId da URL path /api/friends/accept/{fromUserId}
	path := r.URL.Path
	parts := strings.Split(path, "/")
	if len(parts) < 4 {
		http.Error(w, "fromUserId required", http.StatusBadRequest)
		return
	}
	fromUserID := parts[len(parts)-1]
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
	
	fh.logger.Info("attempting to add friend",
		zap.String("userId", claims.UserID),
		zap.String("friendId", fromUserID),
		zap.String("dmChannelId", dmChannelID.String()),
	)
	
	err = fh.db.AddFriend(claims.UserID, fromUserID, "", dmChannelID.String(), now)
	if err != nil {
		fh.logger.Error("failed to add friend", zap.Error(err))
		http.Error(w, "failed to add friend", http.StatusInternalServerError)
		return
	}

	err = fh.db.AddFriend(fromUserID, claims.UserID, "", dmChannelID.String(), now)
	if err != nil {
		fh.logger.Error("failed to add friend (reverse)", zap.Error(err))
		http.Error(w, "failed to add friend", http.StatusInternalServerError)
		return
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
	// Extrair fromUserId da URL path /api/friends/reject/{fromUserId}
	path := r.URL.Path
	parts := strings.Split(path, "/")
	if len(parts) < 4 {
		http.Error(w, "fromUserId required", http.StatusBadRequest)
		return
	}
	fromUserID := parts[len(parts)-1]
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

	rows, err := fh.db.GetFriends(claims.UserID)
	if err != nil {
		fh.logger.Error("failed to get friends", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	friends := make([]FriendResponse, 0)
	for _, row := range rows {
		friendID := toStringID(row["friend_id"])
		
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
			DMChannelID: toStringID(row["dm_channel_id"]),
			Status:      status,
			AddedAt:     row["added_at"].(time.Time).UnixMilli(),
		}

		if nickname, ok := row["nickname"].(string); ok && nickname != "" {
			friend.Nickname = nickname
		}

		friends = append(friends, friend)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(friends)
}

// RemoveFriend remove um amigo
func (fh *FriendHandler) RemoveFriend(w http.ResponseWriter, r *http.Request) {
	// Extrair friendId da URL path /api/friends/{friendId}
	path := r.URL.Path
	parts := strings.Split(path, "/")
	if len(parts) < 4 {
		http.Error(w, "friendId required", http.StatusBadRequest)
		return
	}
	friendID := parts[len(parts)-1]
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

// GetDMs retorna lista de canais de DM do usuário
func (fh *FriendHandler) GetDMs(w http.ResponseWriter, r *http.Request) {
	// Obter usuário do contexto
	claims, ok := r.Context().Value("claims").(*Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Buscar canais de DM
	dmChannels, err := fh.db.GetUserDMChannels(claims.UserID)
	if err != nil {
		fh.logger.Error("failed to get DM channels", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Para cada canal, buscar informações dos participantes
	type DMResponse struct {
		ChannelID    string                   `json:"channelId"`
		Type         string                   `json:"type"`
		Name         string                   `json:"name,omitempty"`
		Participants []map[string]interface{} `json:"participants"`
		CreatedAt    int64                    `json:"createdAt"`
	}

	dms := make([]DMResponse, 0)
	for _, channel := range dmChannels {
		channelID := toStringID(channel["channel_id"])
		
		// Buscar membros do canal
		members, err := fh.db.GetChannelMembers(channelID)
		if err != nil {
			fh.logger.Error("failed to get channel members", zap.Error(err))
			continue
		}

		participants := make([]map[string]interface{}, 0)
		for _, member := range members {
			userID := toStringID(member["user_id"])
			
			// Buscar informações do usuário
			user, err := fh.db.GetUserByID(userID)
			if err != nil {
				continue
			}

			// Buscar presença
			presence, _ := fh.db.GetUserPresence(userID)
			status := "offline"
			if presence != nil {
				status = presence["status"].(string)
			}

			participants = append(participants, map[string]interface{}{
				"userId":   userID,
				"username": user["username"].(string),
				"status":   status,
			})
		}

		dm := DMResponse{
			ChannelID:    channelID,
			Type:         channel["type"].(string),
			Participants: participants,
			CreatedAt:    channel["created_at"].(time.Time).UnixMilli(),
		}

		// Para DMs 1-on-1, usar o nome do outro usuário
		if dm.Type == "dm" && len(participants) == 2 {
			for _, p := range participants {
				if p["userId"].(string) != claims.UserID {
					dm.Name = p["username"].(string)
					break
				}
			}
		}

		dms = append(dms, dm)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dms)
}

// CreateDMRequest representa a requisição de criação de DM
type CreateDMRequest struct {
	UserID  string   `json:"userId"`  // Para DM 1-on-1
	UserIDs []string `json:"userIds"` // Para group DM
	Name    string   `json:"name"`    // Nome do group DM (opcional)
}

// CreateDM cria um canal de DM
func (fh *FriendHandler) CreateDM(w http.ResponseWriter, r *http.Request) {
	var req CreateDMRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Obter usuário do contexto
	claims, ok := r.Context().Value("claims").(*Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// DM 1-on-1
	if req.UserID != "" {
		// Verificar se já existe DM entre os usuários
		existingDM, err := fh.db.FindDMBetweenUsers(claims.UserID, req.UserID)
		if err == nil && existingDM != nil {
			// DM já existe, retornar o existente
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{
				"channelId": toStringID(existingDM["channel_id"]),
				"message":   "DM already exists",
			})
			return
		}

		// Criar novo canal de DM
		dmChannelID := uuid.Must(uuid.NewV4())
		err = fh.db.CreateDMChannel(dmChannelID.String(), claims.UserID, req.UserID)
		if err != nil {
			fh.logger.Error("failed to create DM channel", zap.Error(err))
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		fh.logger.Info("DM channel created",
			zap.String("channelId", dmChannelID.String()),
			zap.String("user1", claims.UserID),
			zap.String("user2", req.UserID),
		)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"channelId": dmChannelID.String(),
			"message":   "DM created successfully",
		})
		return
	}

	// Group DM
	if len(req.UserIDs) > 0 {
		// TODO: Implementar group DM
		http.Error(w, "group DM not implemented yet", http.StatusNotImplemented)
		return
	}

	http.Error(w, "userId or userIds required", http.StatusBadRequest)
}
