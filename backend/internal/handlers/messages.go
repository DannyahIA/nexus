package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gofrs/uuid"
	"github.com/nexus/backend/internal/database"
	"go.uber.org/zap"
)

// MessageHandler gerencia operações de mensagens
type MessageHandler struct {
	logger *zap.Logger
	db     *database.CassandraDB
}

// NewMessageHandler cria um novo handler de mensagens
func NewMessageHandler(logger *zap.Logger, db *database.CassandraDB) *MessageHandler {
	return &MessageHandler{
		logger: logger,
		db:     db,
	}
}

// MessageRequest representa a requisição de envio de mensagem
type MessageRequest struct {
	Content string `json:"content"`
}

// MessageResponse representa uma mensagem
type MessageResponse struct {
	ID        string `json:"id"`
	ChannelID string `json:"channelId"`
	UserID    string `json:"userId"`
	Username  string `json:"username"`
	Avatar    string `json:"avatar,omitempty"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
	EditedAt  *int64 `json:"editedAt,omitempty"`
}

// GetMessages retorna mensagens de um canal
func (mh *MessageHandler) GetMessages(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channelId")
	if channelID == "" {
		http.Error(w, "channel id required", http.StatusBadRequest)
		return
	}

	// Parâmetros de paginação
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}

	// Buscar mensagens do banco de dados
	rows, err := mh.db.GetMessagesByChannel(channelID, limit, nil)
	if err != nil {
		mh.logger.Error("failed to get messages", zap.Error(err), zap.String("channelId", channelID))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	messages := make([]MessageResponse, 0)
	for _, row := range rows {
		msg := MessageResponse{
			ID:        row["msg_id"].(string),
			ChannelID: row["channel_id"].(string),
			UserID:    row["author_id"].(string),
			Username:  "User", // TODO: Buscar username do banco
			Content:   row["content"].(string),
			Timestamp: row["ts"].(time.Time).UnixMilli(),
		}

		if editedAt, ok := row["edited_at"].(time.Time); ok {
			ts := editedAt.UnixMilli()
			msg.EditedAt = &ts
		}

		messages = append(messages, msg)
	}
	if len(messages) > limit {
		messages = messages[:limit]
	}

	mh.logger.Info("messages fetched",
		zap.String("channelId", channelID),
		zap.Int("count", len(messages)),
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

// SendMessage envia uma nova mensagem
func (mh *MessageHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channelId")
	if channelID == "" {
		http.Error(w, "channel id required", http.StatusBadRequest)
		return
	}

	var req MessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Content == "" {
		http.Error(w, "message content is required", http.StatusBadRequest)
		return
	}

	// Obter usuário do contexto (JWT claims)
	claims, ok := r.Context().Value("claims").(*Claims)
	if !ok || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Gerar ID da mensagem
	messageID := uuid.Must(uuid.NewV4()).String()

	// Salvar mensagem no banco de dados
	err := mh.db.SaveMessage(channelID, messageID, claims.UserID, req.Content)
	if err != nil {
		mh.logger.Error("failed to save message", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	message := MessageResponse{
		ID:        messageID,
		ChannelID: channelID,
		UserID:    claims.UserID,
		Username:  claims.Username,
		Content:   req.Content,
		Timestamp: time.Now().UnixMilli(),
	}

	mh.logger.Info("message sent",
		zap.String("id", message.ID),
		zap.String("channelId", channelID),
		zap.String("userId", message.UserID),
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(message)
}

// UpdateMessage atualiza uma mensagem existente
func (mh *MessageHandler) UpdateMessage(w http.ResponseWriter, r *http.Request) {
	messageID := r.URL.Query().Get("id")
	if messageID == "" {
		http.Error(w, "message id required", http.StatusBadRequest)
		return
	}

	channelID := r.URL.Query().Get("channelId")
	if channelID == "" {
		http.Error(w, "channel id required", http.StatusBadRequest)
		return
	}

	var req MessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// TODO: Verificar se o usuário é o autor

	// Atualizar no banco de dados
	err := mh.db.UpdateMessage(channelID, messageID, req.Content)
	if err != nil {
		mh.logger.Error("failed to update message", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	editedAt := time.Now().UnixMilli()
	message := MessageResponse{
		ID:        messageID,
		ChannelID: channelID,
		UserID:    "user-id",
		Username:  "Username",
		Content:   req.Content,
		Timestamp: time.Now().UnixMilli(),
		EditedAt:  &editedAt,
	}

	mh.logger.Info("message updated", zap.String("id", messageID))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(message)
}

// DeleteMessage deleta uma mensagem
func (mh *MessageHandler) DeleteMessage(w http.ResponseWriter, r *http.Request) {
	messageID := r.URL.Query().Get("id")
	if messageID == "" {
		http.Error(w, "message id required", http.StatusBadRequest)
		return
	}

	channelID := r.URL.Query().Get("channelId")
	if channelID == "" {
		http.Error(w, "channel id required", http.StatusBadRequest)
		return
	}

	// TODO: Verificar se o usuário é o autor ou admin

	// Deletar do banco de dados
	err := mh.db.DeleteMessage(channelID, messageID)
	if err != nil {
		mh.logger.Error("failed to delete message", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	mh.logger.Info("message deleted", zap.String("id", messageID))

	w.WriteHeader(http.StatusNoContent)
}
