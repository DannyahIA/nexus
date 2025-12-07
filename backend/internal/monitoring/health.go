package monitoring

import (
	"context"
	"fmt"
	"net/http"
	"runtime"
	"time"

	"go.uber.org/zap"
)

// HealthChecker interface for health check dependencies
type HealthChecker interface {
	HealthCheck(ctx context.Context) error
}

// HealthService manages application health checks
type HealthService struct {
	logger   *zap.Logger
	checkers map[string]HealthChecker
}

// NewHealthService creates a new health service
func NewHealthService(logger *zap.Logger) *HealthService {
	return &HealthService{
		logger:   logger,
		checkers: make(map[string]HealthChecker),
	}
}

// AddChecker adds a health checker
func (hs *HealthService) AddChecker(name string, checker HealthChecker) {
	hs.checkers[name] = checker
}

// HealthResponse represents the health check response
type HealthResponse struct {
	Status      string                       `json:"status"`
	Timestamp   time.Time                    `json:"timestamp"`
	Version     string                       `json:"version"`
	Uptime      string                       `json:"uptime"`
	Environment string                       `json:"environment"`
	Checks      map[string]HealthCheckResult `json:"checks"`
	System      SystemInfo                   `json:"system"`
}

// HealthCheckResult represents individual check result
type HealthCheckResult struct {
	Status    string        `json:"status"`
	Message   string        `json:"message,omitempty"`
	Duration  time.Duration `json:"duration"`
	Timestamp time.Time     `json:"timestamp"`
}

// SystemInfo represents system information
type SystemInfo struct {
	GoVersion     string `json:"go_version"`
	Goroutines    int    `json:"goroutines"`
	MemAllocMB    uint64 `json:"memory_alloc_mb"`
	MemSysMB      uint64 `json:"memory_sys_mb"`
	NumCPU        int    `json:"num_cpu"`
	NumGC         uint32 `json:"num_gc"`
}

var startTime = time.Now()

// CheckHealth performs all health checks
func (hs *HealthService) CheckHealth(ctx context.Context) HealthResponse {
	response := HealthResponse{
		Status:      "healthy",
		Timestamp:   time.Now(),
		Version:     "1.0.0", // Should come from build info
		Uptime:      time.Since(startTime).String(),
		Environment: "development", // Should come from config
		Checks:      make(map[string]HealthCheckResult),
		System:      getSystemInfo(),
	}

	// Run all health checks
	for name, checker := range hs.checkers {
		start := time.Now()
		
		checkCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err := checker.HealthCheck(checkCtx)
		duration := time.Since(start)
		cancel()

		result := HealthCheckResult{
			Duration:  duration,
			Timestamp: time.Now(),
		}

		if err != nil {
			result.Status = "unhealthy"
			result.Message = err.Error()
			response.Status = "unhealthy"
			hs.logger.Warn("Health check failed", 
				zap.String("checker", name),
				zap.Error(err),
				zap.Duration("duration", duration))
		} else {
			result.Status = "healthy"
		}

		response.Checks[name] = result
	}

	return response
}

// getSystemInfo collects system information
func getSystemInfo() SystemInfo {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	return SystemInfo{
		GoVersion:     runtime.Version(),
		Goroutines:    runtime.NumGoroutine(),
		MemAllocMB:    bToMb(m.Alloc),
		MemSysMB:      bToMb(m.Sys),
		NumCPU:        runtime.NumCPU(),
		NumGC:         m.NumGC,
	}
}

func bToMb(b uint64) uint64 {
	return b / 1024 / 1024
}

// HTTPHandler returns an HTTP handler for health checks
func (hs *HealthService) HTTPHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		health := hs.CheckHealth(ctx)

		w.Header().Set("Content-Type", "application/json")
		
		if health.Status == "healthy" {
			w.WriteHeader(http.StatusOK)
		} else {
			w.WriteHeader(http.StatusServiceUnavailable)
		}

		if err := json.NewEncoder(w).Encode(health); err != nil {
			hs.logger.Error("Failed to encode health response", zap.Error(err))
		}
	}
}

// CassandraHealthChecker implements health check for Cassandra
type CassandraHealthChecker struct {
	session interface{} // Replace with actual Cassandra session type
}

func (c *CassandraHealthChecker) HealthCheck(ctx context.Context) error {
	// Implement Cassandra ping/health check
	// Example: simple query to check connectivity
	return nil // placeholder
}

// NATSHealthChecker implements health check for NATS
type NATSHealthChecker struct {
	conn interface{} // Replace with actual NATS connection type
}

func (n *NATSHealthChecker) HealthCheck(ctx context.Context) error {
	// Implement NATS connectivity check
	return nil // placeholder
}
