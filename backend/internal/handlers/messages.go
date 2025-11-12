package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gofrs/uuid"
	"go.uber.org/zap"
)

// MessageHandler gerencia operações de mensagens
type MessageHandler struct {
	logger *zap.Logger
}

// NewMessageHandler cria um novo handler de mensagens
func NewMessageHandler(logger *zap.Logger) *MessageHandler {
	return &MessageHandler{
		logger: logger,
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

	// TODO: Buscar mensagens do banco de dados com paginação
	// Por enquanto, retorna mensagens de exemplo
	now := time.Now()
	messages := []MessageResponse{
		{
			ID:        uuid.Must(uuid.NewV4()).String(),
			ChannelID: channelID,
			UserID:    "user1",
			Username:  "Alice",
			Content:   "Olá pessoal! 👋",
			Timestamp: now.Add(-10 * time.Minute).UnixMilli(),
		},
		{
			ID:        uuid.Must(uuid.NewV4()).String(),
			ChannelID: channelID,
			UserID:    "user2",
			Username:  "Bob",
			Content:   "Oi Alice! Como vai?",
			Timestamp: now.Add(-8 * time.Minute).UnixMilli(),
		},
		{
			ID:        uuid.Must(uuid.NewV4()).String(),
			ChannelID: channelID,
			UserID:    "user1",
			Username:  "Alice",
			Content:   "Tudo ótimo! Vamos começar o projeto?",
			Timestamp: now.Add(-5 * time.Minute).UnixMilli(),
		},
		{
			ID:        uuid.Must(uuid.NewV4()).String(),
			ChannelID: channelID,
			UserID:    "user3",
			Username:  "Charlie",
			Content:   "Bora! Já preparei o ambiente 🚀",
			Timestamp: now.Add(-2 * time.Minute).UnixMilli(),
		},
	}

	// Limitar mensagens
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

	// TODO: Obter usuário do contexto (JWT claims)
	// TODO: Salvar mensagem no banco de dados
	// TODO: Publicar no NATS para broadcasting via WebSocket

	message := MessageResponse{
		ID:        uuid.Must(uuid.NewV4()).String(),
		ChannelID: channelID,
		UserID:    "current-user-id",
		Username:  "Current User",
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

	var req MessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// TODO: Verificar se o usuário é o autor
	// TODO: Atualizar no banco de dados
	// TODO: Publicar atualização via NATS

	editedAt := time.Now().UnixMilli()
	message := MessageResponse{
		ID:        messageID,
		ChannelID: "channel-id",
		UserID:    "user-id",
		Username:  "Username",
		Content:   req.Content,
		Timestamp: time.Now().Add(-10 * time.Minute).UnixMilli(),
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

	// TODO: Verificar se o usuário é o autor ou admin
	// TODO: Deletar do banco de dados
	// TODO: Publicar deleção via NATS

	mh.logger.Info("message deleted", zap.String("id", messageID))

	w.WriteHeader(http.StatusNoContent)
}
