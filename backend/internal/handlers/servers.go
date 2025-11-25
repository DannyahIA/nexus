package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gofrs/uuid"
	"github.com/nexus/backend/internal/database"
	"github.com/nexus/backend/internal/models"
	"go.uber.org/zap"
)

type ServerHandler struct {
	logger *zap.Logger
	db     *database.CassandraDB
}

func NewServerHandler(logger *zap.Logger, db *database.CassandraDB) *ServerHandler {
	return &ServerHandler{
		logger: logger,
		db:     db,
	}
}

type CreateServerRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
}

type ServerResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	OwnerID     string `json:"ownerId"`
	IconURL     string `json:"iconUrl,omitempty"`
	CreatedAt   int64  `json:"createdAt"`
}

type ServerMemberResponse struct {
	ServerID string `json:"serverId"`
	UserID   string `json:"userId"`
	Role     string `json:"role"`
	JoinedAt int64  `json:"joinedAt"`
}

// GetServers retorna todos os servidores do usuário
func (sh *ServerHandler) GetServers(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value("claims").(*models.Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Buscar servidores do usuário
	servers, err := sh.db.GetUserServers(claims.UserID)
	if err != nil {
		sh.logger.Error("failed to get servers", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	response := make([]ServerResponse, 0)
	for _, server := range servers {
		response = append(response, ServerResponse{
			ID:          server["server_id"].(string),
			Name:        server["name"].(string),
			Description: server["description"].(string),
			OwnerID:     server["owner_id"].(string),
			IconURL:     server["icon_url"].(string),
			CreatedAt:   server["created_at"].(int64),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// CreateServer cria um novo servidor
func (sh *ServerHandler) CreateServer(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value("claims").(*models.Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req CreateServerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, "server name is required", http.StatusBadRequest)
		return
	}

	serverID := uuid.Must(uuid.NewV4()).String()
	inviteCode := uuid.Must(uuid.NewV4()).String()[:8] // Generate 8-char invite code

	// Criar servidor
	err := sh.db.CreateServer(serverID, req.Name, req.Description, claims.UserID, req.Icon, inviteCode)
	if err != nil {
		sh.logger.Error("failed to create server", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Adicionar owner como membro
	err = sh.db.AddServerMember(serverID, claims.UserID, "owner")
	if err != nil {
		sh.logger.Error("failed to add server owner", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Criar canal geral padrão
	channelID := uuid.Must(uuid.NewV4()).String()
	err = sh.db.CreateServerChannel(channelID, serverID, "geral", "Canal geral do servidor", "text", claims.UserID)
	if err != nil {
		sh.logger.Error("failed to create default channel", zap.Error(err))
	}

	response := ServerResponse{
		ID:          serverID,
		Name:        req.Name,
		Description: req.Description,
		OwnerID:     claims.UserID,
		IconURL:     req.Icon,
		CreatedAt:   0, // TODO: Add timestamp
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// GetServerChannels retorna os canais de um servidor
func (sh *ServerHandler) GetServerChannels(w http.ResponseWriter, r *http.Request) {
	// Extrair server ID da URL: /api/servers/{id}/channels
	path := r.URL.Path
	parts := strings.Split(path, "/")

	if len(parts) < 4 || parts[3] == "" {
		http.Error(w, "server id required", http.StatusBadRequest)
		return
	}

	serverID := parts[3]

	channels, err := sh.db.GetServerChannels(serverID)
	if err != nil {
		sh.logger.Error("failed to get server channels", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(channels)
}

// UpdateServer atualiza um servidor
func (sh *ServerHandler) UpdateServer(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value("claims").(*models.Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req CreateServerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, "server name is required", http.StatusBadRequest)
		return
	}

	// Extrair server ID da URL (/api/servers/{id})
	path := r.URL.Path
	parts := strings.Split(path, "/")

	// Path: /api/servers/{id} -> parts: ["", "api", "servers", "{id}"]
	if len(parts) < 4 || parts[3] == "" {
		http.Error(w, "server id required", http.StatusBadRequest)
		return
	}

	serverID := parts[3]

	// Atualizar servidor
	err := sh.db.UpdateServer(serverID, req.Name, req.Description)
	if err != nil {
		sh.logger.Error("failed to update server", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Retornar servidor atualizado
	response := ServerResponse{
		ID:          serverID,
		Name:        req.Name,
		Description: req.Description,
		OwnerID:     claims.UserID,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// DeleteServer deleta um servidor
func (sh *ServerHandler) DeleteServer(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value("claims").(*models.Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Extrair server ID da URL (/api/servers/{id})
	path := r.URL.Path
	parts := strings.Split(path, "/")

	// Path: /api/servers/{id} -> parts: ["", "api", "servers", "{id}"]
	if len(parts) < 4 || parts[3] == "" {
		http.Error(w, "server id required", http.StatusBadRequest)
		return
	}

	serverID := parts[3]

	// Verificar se o usuário é o dono do servidor
	server, err := sh.db.GetGroupByID(serverID)
	if err != nil {
		sh.logger.Error("failed to get server", zap.Error(err))
		http.Error(w, "server not found", http.StatusNotFound)
		return
	}

	ownerID, ok := server["owner_id"].(string)
	if !ok || ownerID != claims.UserID {
		http.Error(w, "forbidden: only server owner can delete the server", http.StatusForbidden)
		return
	}

	// TODO: Deletar todos os canais do servidor
	// TODO: Deletar todas as mensagens dos canais
	// TODO: Deletar todos os membros do servidor

	// Deletar servidor
	err = sh.db.DeleteServer(serverID)
	if err != nil {
		sh.logger.Error("failed to delete server", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	sh.logger.Info("server deleted", zap.String("id", serverID), zap.String("userId", claims.UserID))

	w.WriteHeader(http.StatusNoContent)
}

// JoinServerByInvite permite que um usuário entre em um servidor usando um código de convite
func (sh *ServerHandler) JoinServerByInvite(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value("claims").(*models.Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Extrair invite code da URL: /api/servers/join/{code}
	path := r.URL.Path
	parts := strings.Split(path, "/")

	if len(parts) < 5 || parts[4] == "" {
		http.Error(w, "invite code required", http.StatusBadRequest)
		return
	}

	inviteCode := parts[4]

	// TODO: Implement GetServerByInviteCode in database
	// For now, return not implemented
	sh.logger.Info("join server by invite", 
		zap.String("inviteCode", inviteCode),
		zap.String("userId", claims.UserID))

	http.Error(w, "not implemented", http.StatusNotImplemented)
}
