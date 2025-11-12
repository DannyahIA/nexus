package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gofrs/uuid"
	"github.com/nexus/backend/internal/database"
	"go.uber.org/zap"
)

// ChannelHandler gerencia operações de canais
type ChannelHandler struct {
	logger *zap.Logger
	db     *database.CassandraDB
}

// NewChannelHandler cria um novo handler de canais
func NewChannelHandler(logger *zap.Logger, db *database.CassandraDB) *ChannelHandler {
	return &ChannelHandler{
		logger: logger,
		db:     db,
	}
}

// ChannelRequest representa a requisição de criação de canal
type ChannelRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Type        string `json:"type"` // "text", "voice", "video"
}

// ChannelResponse representa um canal
type ChannelResponse struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Type        string   `json:"type"`
	Members     []string `json:"members"`
	CreatedAt   string   `json:"created_at"`
}

// ListChannels retorna todos os canais do usuário
func (ch *ChannelHandler) ListChannels(w http.ResponseWriter, r *http.Request) {
	// Buscar todos os canais do banco de dados
	rows, err := ch.db.GetAllChannels()
	if err != nil {
		ch.logger.Error("failed to get channels", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	channels := make([]ChannelResponse, 0)
	for _, row := range rows {
		channel := ChannelResponse{
			ID:        row["channel_id"].(string),
			Name:      row["name"].(string),
			Type:      row["type"].(string),
			Members:   []string{}, // TODO: Buscar membros da tabela de relacionamento
			CreatedAt: row["created_at"].(time.Time).Format(time.RFC3339),
		}
		
		if desc, ok := row["description"].(string); ok {
			channel.Description = desc
		}

		channels = append(channels, channel)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(channels)
}

// GetChannel retorna um canal específico
func (ch *ChannelHandler) GetChannel(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("id")
	if channelID == "" {
		http.Error(w, "channel id required", http.StatusBadRequest)
		return
	}

	row, err := ch.db.GetChannelByID(channelID)
	if err != nil {
		ch.logger.Error("failed to get channel", zap.Error(err), zap.String("id", channelID))
		http.Error(w, "channel not found", http.StatusNotFound)
		return
	}

	channel := ChannelResponse{
		ID:        row["channel_id"].(string),
		Name:      row["name"].(string),
		Type:      row["type"].(string),
		Members:   []string{},
		CreatedAt: row["created_at"].(time.Time).Format(time.RFC3339),
	}

	if desc, ok := row["description"].(string); ok {
		channel.Description = desc
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(channel)
}

// CreateChannel cria um novo canal
func (ch *ChannelHandler) CreateChannel(w http.ResponseWriter, r *http.Request) {
	var req ChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Validações
	if req.Name == "" {
		http.Error(w, "channel name is required", http.StatusBadRequest)
		return
	}

	if req.Type == "" {
		req.Type = "text"
	}

	// Extrair user_id do contexto (setado pelo middleware de autenticação)
	claims, ok := r.Context().Value("claims").(*Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Gerar UUID para o canal
	channelID := uuid.Must(uuid.NewV4()).String()

	// Salvar no banco de dados
	err := ch.db.CreateChannel(channelID, req.Name, req.Type, claims.UserID, req.Description)
	if err != nil {
		ch.logger.Error("failed to create channel", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	channel := ChannelResponse{
		ID:          channelID,
		Name:        req.Name,
		Description: req.Description,
		Type:        req.Type,
		Members:     []string{claims.UserID},
		CreatedAt:   time.Now().Format(time.RFC3339),
	}

	ch.logger.Info("channel created",
		zap.String("id", channel.ID),
		zap.String("name", channel.Name),
		zap.String("owner", claims.UserID),
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(channel)
}

// DeleteChannel deleta um canal
func (ch *ChannelHandler) DeleteChannel(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("id")
	if channelID == "" {
		http.Error(w, "channel id required", http.StatusBadRequest)
		return
	}

	// TODO: Verificar se o usuário tem permissão para deletar
	err := ch.db.DeleteChannel(channelID)
	if err != nil {
		ch.logger.Error("failed to delete channel", zap.Error(err), zap.String("id", channelID))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	ch.logger.Info("channel deleted", zap.String("id", channelID))
	w.WriteHeader(http.StatusNoContent)
}
