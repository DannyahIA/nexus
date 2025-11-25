package handlers

import (
	"encoding/json"
	"net/http"

	"go.uber.org/zap"
)

type HealthHandler struct {
	logger *zap.Logger
}

func NewHealthHandler(logger *zap.Logger) *HealthHandler {
	return &HealthHandler{
		logger: logger,
	}
}

type HealthResponse struct {
	Status string `json:"status"`
}

func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	response := HealthResponse{
		Status: "ok",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
