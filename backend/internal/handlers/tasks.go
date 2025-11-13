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

// TaskHandler gerencia operações de tarefas (Kanban)
type TaskHandler struct {
	logger *zap.Logger
	db     *database.CassandraDB
}

// NewTaskHandler cria um novo handler de tarefas
func NewTaskHandler(logger *zap.Logger, db *database.CassandraDB) *TaskHandler {
	return &TaskHandler{
		logger: logger,
		db:     db,
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

	// Buscar tarefas do banco de dados
	rows, err := th.db.GetTasksByChannel(channelID)
	if err != nil {
		th.logger.Error("failed to get tasks", zap.Error(err), zap.String("channelId", channelID))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	tasks := make([]TaskResponse, 0)
	for _, row := range rows {
		task := TaskResponse{
			ID:        row["task_id"].(string),
			ChannelID: row["channel_id"].(string),
			Title:     row["title"].(string),
			Status:    row["status"].(string),
			CreatedAt: row["created_at"].(time.Time).UnixMilli(),
			UpdatedAt: row["updated_at"].(time.Time).UnixMilli(),
		}

		if assignee, ok := row["assignee"].(string); ok {
			task.Assignee = &assignee
		}

		tasks = append(tasks, task)
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

	// Gerar UUID para nova tarefa
	taskID := uuid.Must(uuid.NewV4()).String()

	// Calcular próxima posição (última posição + 1)
	existingTasks, err := th.db.GetTasksByChannel(channelID)
	if err != nil {
		th.logger.Error("failed to get tasks for position calculation", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	position := 0
	if len(existingTasks) > 0 {
		// Encontrar a maior posição
		for _, task := range existingTasks {
			if pos, ok := task["position"].(int); ok && pos >= position {
				position = pos + 1
			}
		}
	}

	// Salvar no banco de dados
	assigneeID := ""
	if req.AssigneeID != nil {
		assigneeID = *req.AssigneeID
	}

	if err := th.db.CreateTask(channelID, taskID, req.Title, req.Status, assigneeID, position); err != nil {
		th.logger.Error("failed to create task", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	now := time.Now().UnixMilli()
	task := TaskResponse{
		ID:          taskID,
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

	channelID := r.URL.Query().Get("channelId")
	if channelID == "" {
		http.Error(w, "channel id required", http.StatusBadRequest)
		return
	}

	positionStr := r.URL.Query().Get("position")
	if positionStr == "" {
		http.Error(w, "position required", http.StatusBadRequest)
		return
	}

	position, err := strconv.Atoi(positionStr)
	if err != nil {
		http.Error(w, "invalid position", http.StatusBadRequest)
		return
	}

	var req TaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Atualizar no banco de dados
	if err := th.db.UpdateTask(channelID, taskID, req.Title, req.Status, position); err != nil {
		th.logger.Error("failed to update task", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	task := TaskResponse{
		ID:          taskID,
		ChannelID:   channelID,
		Title:       req.Title,
		Description: req.Description,
		Status:      req.Status,
		Priority:    req.Priority,
		Assignee:    req.AssigneeID,
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

	channelID := r.URL.Query().Get("channelId")
	if channelID == "" {
		http.Error(w, "channel id required", http.StatusBadRequest)
		return
	}

	positionStr := r.URL.Query().Get("position")
	if positionStr == "" {
		http.Error(w, "position required", http.StatusBadRequest)
		return
	}

	position, err := strconv.Atoi(positionStr)
	if err != nil {
		http.Error(w, "invalid position", http.StatusBadRequest)
		return
	}

	// Deletar do banco de dados
	if err := th.db.DeleteTask(channelID, taskID, position); err != nil {
		th.logger.Error("failed to delete task", zap.Error(err))
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	th.logger.Info("task deleted", zap.String("id", taskID))

	w.WriteHeader(http.StatusNoContent)
}
