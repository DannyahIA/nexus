package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gofrs/uuid"
	"github.com/nexus/backend/internal/database"
	"go.uber.org/zap"
)

// GroupHandler gerencia operações de grupos
type GroupHandler struct {
	logger *zap.Logger
	db     *database.CassandraDB
}

// NewGroupHandler cria um novo handler de grupos
func NewGroupHandler(logger *zap.Logger, db *database.CassandraDB) *GroupHandler {
	return &GroupHandler{
		logger: logger,
		db:     db,
	}
}

// CreateGroupRequest representa a requisição de criação de grupo
type CreateGroupRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	IsPublic    bool   `json:"isPublic"`
}

// GroupResponse representa um grupo
type GroupResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	OwnerID     string `json:"ownerId"`
	IconURL     string `json:"iconUrl,omitempty"`
	IsPublic    bool   `json:"isPublic"`
	InviteCode  string `json:"inviteCode,omitempty"`
	CreatedAt   int64  `json:"createdAt"`
	MemberCount int    `json:"memberCount,omitempty"`
	Role        string `json:"role,omitempty"` // Role do usuário atual
}

// CreateGroup cria um novo grupo
func (gh *GroupHandler) CreateGroup(w http.ResponseWriter, r *http.Request) {
	var req CreateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, "group name is required", http.StatusBadRequest)
		return
	}

	// Obter usuário do contexto (JWT claims)
	claims, ok := r.Context().Value("claims").(*Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Gerar IDs
	groupID := uuid.Must(uuid.NewV4())
	inviteCode := generateInviteCode()

	// Criar grupo no banco
	now := time.Now()
	err := gh.db.CreateGroup(
		groupID.String(),
		req.Name,
		req.Description,
		claims.UserID,
		"", // iconURL
		req.IsPublic,
		inviteCode,
		now,
		now,
	)
	if err != nil {
		gh.logger.Error("failed to create group", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Adicionar criador como owner do grupo
	err = gh.db.AddGroupMember(groupID.String(), claims.UserID, "owner", "", now)
	if err != nil {
		gh.logger.Error("failed to add group owner", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Criar canal geral padrão
	generalChannelID := uuid.Must(uuid.NewV4())
	err = gh.db.CreateChannel(
		generalChannelID.String(),
		"geral",
		"text",
		claims.UserID,
		"Canal geral do grupo",
	)
	if err != nil {
		gh.logger.Error("failed to create general channel", zap.Error(err))
	}

	// Associar canal ao grupo
	err = gh.db.SetChannelGroup(generalChannelID.String(), groupID.String())
	if err != nil {
		gh.logger.Error("failed to associate channel with group", zap.Error(err))
	}

	response := GroupResponse{
		ID:          groupID.String(),
		Name:        req.Name,
		Description: req.Description,
		OwnerID:     claims.UserID,
		IsPublic:    req.IsPublic,
		InviteCode:  inviteCode,
		CreatedAt:   now.UnixMilli(),
		Role:        "owner",
	}

	gh.logger.Info("group created",
		zap.String("id", groupID.String()),
		zap.String("name", req.Name),
		zap.String("ownerId", claims.UserID),
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// GetGroups retorna grupos do usuário
func (gh *GroupHandler) GetGroups(w http.ResponseWriter, r *http.Request) {
	// Obter usuário do contexto
	claims, ok := r.Context().Value("claims").(*Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Buscar grupos do usuário
	rows, err := gh.db.GetUserGroups(claims.UserID)
	if err != nil {
		gh.logger.Error("failed to get user groups", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	groups := make([]GroupResponse, 0)
	for _, row := range rows {
		group := GroupResponse{
			ID:          row["group_id"].(string),
			Name:        row["name"].(string),
			Description: row["description"].(string),
			OwnerID:     row["owner_id"].(string),
			IsPublic:    row["is_public"].(bool),
			CreatedAt:   row["created_at"].(time.Time).UnixMilli(),
			Role:        row["role"].(string),
		}

		if iconURL, ok := row["icon_url"].(string); ok {
			group.IconURL = iconURL
		}

		groups = append(groups, group)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(groups)
}

// GetGroupChannels retorna canais de um grupo
func (gh *GroupHandler) GetGroupChannels(w http.ResponseWriter, r *http.Request) {
	groupID := r.URL.Query().Get("groupId")
	if groupID == "" {
		http.Error(w, "group id required", http.StatusBadRequest)
		return
	}

	// Obter usuário do contexto
	claims, ok := r.Context().Value("claims").(*Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Verificar se usuário é membro do grupo
	isMember, err := gh.db.IsGroupMember(groupID, claims.UserID)
	if err != nil || !isMember {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	// Buscar canais do grupo
	rows, err := gh.db.GetGroupChannels(groupID)
	if err != nil {
		gh.logger.Error("failed to get group channels", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	channels := make([]map[string]interface{}, 0)
	for _, row := range rows {
		channels = append(channels, row)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(channels)
}

// JoinGroup adiciona usuário a um grupo via código de convite
func (gh *GroupHandler) JoinGroup(w http.ResponseWriter, r *http.Request) {
	inviteCode := r.URL.Query().Get("code")
	if inviteCode == "" {
		http.Error(w, "invite code required", http.StatusBadRequest)
		return
	}

	// Obter usuário do contexto
	claims, ok := r.Context().Value("claims").(*Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Buscar grupo pelo código de convite
	group, err := gh.db.GetGroupByInviteCode(inviteCode)
	if err != nil {
		http.Error(w, "invalid invite code", http.StatusNotFound)
		return
	}

	groupID := group["group_id"].(string)

	// Verificar se já é membro
	isMember, _ := gh.db.IsGroupMember(groupID, claims.UserID)
	if isMember {
		http.Error(w, "already a member", http.StatusBadRequest)
		return
	}

	// Adicionar como membro
	err = gh.db.AddGroupMember(groupID, claims.UserID, "member", "", time.Now())
	if err != nil {
		gh.logger.Error("failed to add group member", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	gh.logger.Info("user joined group",
		zap.String("groupId", groupID),
		zap.String("userId", claims.UserID),
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"groupId": groupID,
		"message": "joined successfully",
	})
}

// generateInviteCode gera um código de convite aleatório
func generateInviteCode() string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	code := make([]byte, 8)
	for i := range code {
		code[i] = chars[time.Now().UnixNano()%int64(len(chars))]
		time.Sleep(1 * time.Nanosecond)
	}
	return string(code)
}
