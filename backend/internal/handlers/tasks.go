package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gofrs/uuid"
	"go.uber.org/zap"
)

// TaskHandler gerencia operações de tarefas (Kanban)
type TaskHandler struct {
	logger *zap.Logger
}

// NewTaskHandler cria um novo handler de tarefas
func NewTaskHandler(logger *zap.Logger) *TaskHandler {
	return &TaskHandler{
		logger: logger,
	}
}

// TaskRequest representa a requisição de criação/atualização de tarefa
type TaskRequest struct {
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Status      string  `json:"status"`   // "todo", "in-progress", "done"
	Priority    string  `json:"priority"` // "low", "medium", "high"
	AssigneeID  *string `json:"assignee"`
}

// TaskResponse representa uma tarefa
type TaskResponse struct {
	ID          string  `json:"id"`
	ChannelID   string  `json:"channelId"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Status      string  `json:"status"`
	Priority    string  `json:"priority"`
	Assignee    *string `json:"assignee,omitempty"`
	CreatedAt   int64   `json:"createdAt"`
	UpdatedAt   int64   `json:"updatedAt"`
}

// GetTasks retorna todas as tarefas de um canal
func (th *TaskHandler) GetTasks(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channelId")
	if channelID == "" {
		http.Error(w, "channel id required", http.StatusBadRequest)
		return
	}

	// TODO: Buscar tarefas do banco de dados
	// Por enquanto, retorna tarefas de exemplo
	now := time.Now()
	tasks := []TaskResponse{
		{
			ID:          uuid.Must(uuid.NewV4()).String(),
			ChannelID:   channelID,
			Title:       "Implementar autenticação",
			Description: "Adicionar JWT e registro de usuários",
			Status:      "done",
			Priority:    "high",
			CreatedAt:   now.Add(-48 * time.Hour).UnixMilli(),
			UpdatedAt:   now.Add(-24 * time.Hour).UnixMilli(),
		},
		{
			ID:          uuid.Must(uuid.NewV4()).String(),
			ChannelID:   channelID,
			Title:       "Criar API de mensagens",
			Description: "Endpoints para CRUD de mensagens",
			Status:      "in-progress",
			Priority:    "high",
			CreatedAt:   now.Add(-24 * time.Hour).UnixMilli(),
			UpdatedAt:   now.Add(-2 * time.Hour).UnixMilli(),
		},
		{
			ID:          uuid.Must(uuid.NewV4()).String(),
			ChannelID:   channelID,
			Title:       "Configurar CI/CD",
			Description: "GitHub Actions para deploy automático",
			Status:      "todo",
			Priority:    "medium",
			CreatedAt:   now.Add(-12 * time.Hour).UnixMilli(),
			UpdatedAt:   now.Add(-12 * time.Hour).UnixMilli(),
		},
		{
			ID:          uuid.Must(uuid.NewV4()).String(),
			ChannelID:   channelID,
			Title:       "Testes unitários",
			Description: "Adicionar testes para todos os handlers",
			Status:      "todo",
			Priority:    "medium",
			CreatedAt:   now.Add(-6 * time.Hour).UnixMilli(),
			UpdatedAt:   now.Add(-6 * time.Hour).UnixMilli(),
		},
		{
			ID:          uuid.Must(uuid.NewV4()).String(),
			ChannelID:   channelID,
			Title:       "Documentação API",
			Description: "Criar documentação Swagger/OpenAPI",
			Status:      "todo",
			Priority:    "low",
			CreatedAt:   now.Add(-3 * time.Hour).UnixMilli(),
			UpdatedAt:   now.Add(-3 * time.Hour).UnixMilli(),
		},
	}

	th.logger.Info("tasks fetched",
		zap.String("channelId", channelID),
		zap.Int("count", len(tasks)),
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tasks)
}

// CreateTask cria uma nova tarefa
func (th *TaskHandler) CreateTask(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channelId")
	if channelID == "" {
		http.Error(w, "channel id required", http.StatusBadRequest)
		return
	}

	var req TaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Title == "" {
		http.Error(w, "task title is required", http.StatusBadRequest)
		return
	}

	if req.Status == "" {
		req.Status = "todo"
	}

	if req.Priority == "" {
		req.Priority = "medium"
	}

	// TODO: Salvar no banco de dados
	now := time.Now().UnixMilli()
	task := TaskResponse{
		ID:          uuid.Must(uuid.NewV4()).String(),
		ChannelID:   channelID,
		Title:       req.Title,
		Description: req.Description,
		Status:      req.Status,
		Priority:    req.Priority,
		Assignee:    req.AssigneeID,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	th.logger.Info("task created",
		zap.String("id", task.ID),
		zap.String("channelId", channelID),
		zap.String("title", task.Title),
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(task)
}

// UpdateTask atualiza uma tarefa existente
func (th *TaskHandler) UpdateTask(w http.ResponseWriter, r *http.Request) {
	taskID := r.URL.Query().Get("id")
	if taskID == "" {
		http.Error(w, "task id required", http.StatusBadRequest)
		return
	}

	var req TaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// TODO: Buscar tarefa existente e atualizar no banco de dados
	// TODO: Publicar atualização via NATS

	task := TaskResponse{
		ID:          taskID,
		ChannelID:   "channel-id",
		Title:       req.Title,
		Description: req.Description,
		Status:      req.Status,
		Priority:    req.Priority,
		Assignee:    req.AssigneeID,
		CreatedAt:   time.Now().Add(-24 * time.Hour).UnixMilli(),
		UpdatedAt:   time.Now().UnixMilli(),
	}

	th.logger.Info("task updated", zap.String("id", taskID))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(task)
}

// DeleteTask deleta uma tarefa
func (th *TaskHandler) DeleteTask(w http.ResponseWriter, r *http.Request) {
	taskID := r.URL.Query().Get("id")
	if taskID == "" {
		http.Error(w, "task id required", http.StatusBadRequest)
		return
	}

	// TODO: Verificar permissões e deletar do banco de dados
	// TODO: Publicar deleção via NATS

	th.logger.Info("task deleted", zap.String("id", taskID))

	w.WriteHeader(http.StatusNoContent)
}
