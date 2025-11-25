package middleware

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"go.uber.org/zap"
)

// CORSConfig holds CORS configuration
type CORSConfig struct {
	AllowedOrigins   []string
	AllowedMethods   []string
	AllowedHeaders   []string
	AllowCredentials bool
	MaxAge           int
	Logger           *zap.Logger
}

// NewCORSConfig creates a new CORS configuration based on environment
func NewCORSConfig(logger *zap.Logger) *CORSConfig {
	env := os.Getenv("ENV")
	if env == "" {
		env = "development"
	}

	config := &CORSConfig{
		AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type", "Authorization", "X-Requested-With"},
		MaxAge:         86400, // 24 hours
		Logger:         logger,
	}

	if env == "production" {
		// Production: restrictive CORS with explicit allowed origins
		originsEnv := os.Getenv("CORS_ALLOWED_ORIGINS")
		if originsEnv != "" {
			config.AllowedOrigins = strings.Split(originsEnv, ",")
			// Trim whitespace from each origin
			for i, origin := range config.AllowedOrigins {
				config.AllowedOrigins[i] = strings.TrimSpace(origin)
			}
		} else {
			// Default production origins if not specified
			config.AllowedOrigins = []string{
				"https://nexus.example.com",
				"https://www.nexus.example.com",
			}
			logger.Warn("CORS_ALLOWED_ORIGINS not set in production, using defaults",
				zap.Strings("origins", config.AllowedOrigins))
		}
		config.AllowCredentials = true
	} else {
		// Development: permissive CORS for ease of testing
		config.AllowedOrigins = []string{"*"}
		config.AllowCredentials = false
		logger.Info("Using permissive CORS for development")
	}

	logger.Info("CORS configuration initialized",
		zap.String("environment", env),
		zap.Strings("allowedOrigins", config.AllowedOrigins),
		zap.Strings("allowedMethods", config.AllowedMethods),
		zap.Bool("allowCredentials", config.AllowCredentials))

	return config
}

// isOriginAllowed checks if an origin is allowed
func (c *CORSConfig) isOriginAllowed(origin string) bool {
	// If wildcard is allowed, accept all origins
	for _, allowed := range c.AllowedOrigins {
		if allowed == "*" {
			return true
		}
		if allowed == origin {
			return true
		}
	}
	return false
}

// SetCORSHeaders sets CORS headers on the response
func (c *CORSConfig) SetCORSHeaders(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")

	// Determine which origin to allow
	if c.isOriginAllowed(origin) {
		if origin != "" && !contains(c.AllowedOrigins, "*") {
			// Specific origin
			w.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			// Wildcard or no origin header
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
	} else {
		// Origin not allowed, log it
		c.Logger.Warn("CORS request from disallowed origin",
			zap.String("origin", origin),
			zap.String("method", r.Method),
			zap.String("path", r.URL.Path))
		// Don't set CORS headers for disallowed origins
		return
	}

	w.Header().Set("Access-Control-Allow-Methods", strings.Join(c.AllowedMethods, ", "))
	w.Header().Set("Access-Control-Allow-Headers", strings.Join(c.AllowedHeaders, ", "))
	
	if c.AllowCredentials {
		w.Header().Set("Access-Control-Allow-Credentials", "true")
	}
	
	if c.MaxAge > 0 {
		w.Header().Set("Access-Control-Max-Age", fmt.Sprintf("%d", c.MaxAge))
	}
}

// Middleware returns a CORS middleware handler
func (c *CORSConfig) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c.SetCORSHeaders(w, r)

		// Handle preflight requests
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// contains checks if a string slice contains a value
func contains(slice []string, value string) bool {
	for _, item := range slice {
		if item == value {
			return true
		}
	}
	return false
}
