package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"
)

// EnvironmentConfig holds all environment configuration
type EnvironmentConfig struct {
	// Environment
	Environment string

	// Cassandra
	CassandraHosts    []string
	CassandraPort     int
	CassandraKeyspace string

	// NATS
	NatsURL string

	// WebSocket
	WSPort         string
	WSReadDeadline time.Duration
	WSWriteDeadline time.Duration

	// API
	APIPort string

	// JWT
	JWTSecret string
	JWTExpiry time.Duration

	// TURN
	TurnURL      string
	TurnUsername string
	TurnPassword string

	// CORS
	CORSAllowedOrigins []string

	// Logging
	LogLevel string
}

// ValidationResult holds validation results
type ValidationResult struct {
	IsValid  bool
	Errors   []string
	Warnings []string
}

// ValidateEnvironmentConfig validates all required environment variables
func ValidateEnvironmentConfig() ValidationResult {
	errors := []string{}
	warnings := []string{}

	// Environment
	env := os.Getenv("ENV")
	if env == "" {
		warnings = append(warnings, "ENV not set, defaulting to 'development'")
	}

	// Cassandra
	cassHosts := os.Getenv("CASS_HOSTS")
	if cassHosts == "" {
		errors = append(errors, "CASS_HOSTS is required. Set it to your Cassandra host(s) (e.g., '127.0.0.1')")
	}

	cassPort := os.Getenv("CASS_PORT")
	if cassPort == "" {
		warnings = append(warnings, "CASS_PORT not set, will use default (9042)")
	} else {
		if port, err := strconv.Atoi(cassPort); err != nil || port < 1 || port > 65535 {
			errors = append(errors, fmt.Sprintf("CASS_PORT must be a valid port number (1-65535), got: %s", cassPort))
		}
	}

	cassKeyspace := os.Getenv("CASS_KEYSPACE")
	if cassKeyspace == "" {
		warnings = append(warnings, "CASS_KEYSPACE not set, defaulting to 'nexus'")
	}

	// NATS
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		warnings = append(warnings, "NATS_URL not set, defaulting to 'nats://127.0.0.1:4222'")
	} else {
		if _, err := url.Parse(natsURL); err != nil {
			errors = append(errors, fmt.Sprintf("NATS_URL is not a valid URL: %s", natsURL))
		}
		if !strings.HasPrefix(natsURL, "nats://") {
			errors = append(errors, "NATS_URL must start with 'nats://'")
		}
	}

	// JWT
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		errors = append(errors, "JWT_SECRET is required. Set a secure secret key for JWT signing")
	} else if len(jwtSecret) < 32 {
		warnings = append(warnings, "JWT_SECRET is short. Consider using a longer secret (32+ characters) for better security")
	}
	if env == "production" && (jwtSecret == "your-secret-key-here" || jwtSecret == "your-secret-key-change-this") {
		errors = append(errors, "JWT_SECRET must be changed from default value in production")
	}

	jwtExpiry := os.Getenv("JWT_EXPIRY")
	if jwtExpiry == "" {
		warnings = append(warnings, "JWT_EXPIRY not set, defaulting to '24h'")
	} else {
		if _, err := time.ParseDuration(jwtExpiry); err != nil {
			errors = append(errors, fmt.Sprintf("JWT_EXPIRY is not a valid duration (e.g., '24h', '1h30m'): %s", jwtExpiry))
		}
	}

	// TURN Server
	turnURL := os.Getenv("TURN_URL")
	if turnURL == "" {
		warnings = append(warnings, "TURN_URL not configured. WebRTC may fail behind NAT/firewalls. Set to your TURN server (e.g., 'turn:turn.example.com:3478')")
	} else {
		if !strings.HasPrefix(turnURL, "turn:") && !strings.HasPrefix(turnURL, "turns:") {
			errors = append(errors, "TURN_URL must start with 'turn:' or 'turns:'")
		}
	}

	turnUser := os.Getenv("TURN_USER")
	if turnURL != "" && turnUser == "" {
		warnings = append(warnings, "TURN_USER not set but TURN_URL is configured. TURN server may not work")
	}

	turnPass := os.Getenv("TURN_PASS")
	if turnURL != "" && turnPass == "" {
		warnings = append(warnings, "TURN_PASS not set but TURN_URL is configured. TURN server may not work")
	}

	// CORS
	if env == "production" {
		corsOrigins := os.Getenv("CORS_ALLOWED_ORIGINS")
		if corsOrigins == "" {
			warnings = append(warnings, "CORS_ALLOWED_ORIGINS not set in production. Using default origins. Set to comma-separated list of allowed origins")
		}
	}

	// Ports
	wsPort := os.Getenv("WS_PORT")
	if wsPort == "" {
		warnings = append(warnings, "WS_PORT not set, defaulting to '8080'")
	} else {
		if port, err := strconv.Atoi(wsPort); err != nil || port < 1 || port > 65535 {
			errors = append(errors, fmt.Sprintf("WS_PORT must be a valid port number (1-65535), got: %s", wsPort))
		}
	}

	apiPort := os.Getenv("API_PORT")
	if apiPort == "" {
		warnings = append(warnings, "API_PORT not set, defaulting to '8000'")
	} else {
		if port, err := strconv.Atoi(apiPort); err != nil || port < 1 || port > 65535 {
			errors = append(errors, fmt.Sprintf("API_PORT must be a valid port number (1-65535), got: %s", apiPort))
		}
	}

	// Log level
	logLevel := os.Getenv("LOG_LEVEL")
	if logLevel == "" {
		warnings = append(warnings, "LOG_LEVEL not set, defaulting to 'info'")
	} else {
		validLevels := []string{"debug", "info", "warn", "error", "fatal"}
		isValid := false
		for _, level := range validLevels {
			if strings.ToLower(logLevel) == level {
				isValid = true
				break
			}
		}
		if !isValid {
			errors = append(errors, fmt.Sprintf("LOG_LEVEL must be one of: %s, got: %s", strings.Join(validLevels, ", "), logLevel))
		}
	}

	return ValidationResult{
		IsValid:  len(errors) == 0,
		Errors:   errors,
		Warnings: warnings,
	}
}

// GetEnvironmentConfig loads and validates environment configuration
func GetEnvironmentConfig() (*EnvironmentConfig, error) {
	validation := ValidateEnvironmentConfig()

	if !validation.IsValid {
		errorMsg := "Environment configuration is invalid:\n"
		for _, err := range validation.Errors {
			errorMsg += fmt.Sprintf("  ❌ %s\n", err)
		}
		errorMsg += "\nPlease check your .env file and ensure all required variables are set.\n"
		errorMsg += "See .env.example for reference."
		return nil, fmt.Errorf(errorMsg)
	}

	// Parse configuration
	config := &EnvironmentConfig{
		Environment: getEnvOrDefault("ENV", "development"),

		// Cassandra
		CassandraHosts:    strings.Split(os.Getenv("CASS_HOSTS"), ","),
		CassandraPort:     getEnvAsInt("CASS_PORT", 9042),
		CassandraKeyspace: getEnvOrDefault("CASS_KEYSPACE", "nexus"),

		// NATS
		NatsURL: getEnvOrDefault("NATS_URL", "nats://127.0.0.1:4222"),

		// WebSocket
		WSPort:          getEnvOrDefault("WS_PORT", "8080"),
		WSReadDeadline:  getEnvAsDuration("WS_READ_DEADLINE", 15*time.Second),
		WSWriteDeadline: getEnvAsDuration("WS_WRITE_DEADLINE", 15*time.Second),

		// API
		APIPort: getEnvOrDefault("API_PORT", "8000"),

		// JWT
		JWTSecret: os.Getenv("JWT_SECRET"),
		JWTExpiry: getEnvAsDuration("JWT_EXPIRY", 24*time.Hour),

		// TURN
		TurnURL:      os.Getenv("TURN_URL"),
		TurnUsername: os.Getenv("TURN_USER"),
		TurnPassword: os.Getenv("TURN_PASS"),

		// CORS
		CORSAllowedOrigins: parseCORSOrigins(),

		// Logging
		LogLevel: getEnvOrDefault("LOG_LEVEL", "info"),
	}

	return config, nil
}

// LogEnvironmentConfigStatus logs the configuration status
func LogEnvironmentConfigStatus(logger *zap.Logger) {
	validation := ValidateEnvironmentConfig()
	env := getEnvOrDefault("ENV", "development")

	logger.Info("🔧 Environment Configuration Status",
		zap.String("separator", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"))
	logger.Info("Configuration details",
		zap.String("environment", env),
		zap.String("cassandraHosts", os.Getenv("CASS_HOSTS")),
		zap.String("cassandraKeyspace", getEnvOrDefault("CASS_KEYSPACE", "nexus")),
		zap.String("natsURL", getEnvOrDefault("NATS_URL", "nats://127.0.0.1:4222")),
		zap.String("wsPort", getEnvOrDefault("WS_PORT", "8080")),
		zap.String("apiPort", getEnvOrDefault("API_PORT", "8000")),
		zap.Bool("jwtSecretSet", os.Getenv("JWT_SECRET") != ""),
		zap.String("turnURL", maskIfEmpty(os.Getenv("TURN_URL"), "⚠️ Not configured")),
		zap.Bool("turnCredentialsSet", os.Getenv("TURN_USER") != "" && os.Getenv("TURN_PASS") != ""),
		zap.String("logLevel", getEnvOrDefault("LOG_LEVEL", "info")))

	if env == "production" {
		corsOrigins := os.Getenv("CORS_ALLOWED_ORIGINS")
		if corsOrigins != "" {
			logger.Info("CORS configuration",
				zap.String("allowedOrigins", corsOrigins))
		} else {
			logger.Warn("CORS configuration",
				zap.String("status", "Using default origins"))
		}
	}

	logger.Info("Validation status",
		zap.String("separator", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"))

	if validation.IsValid {
		logger.Info("✅ Configuration is valid")
	} else {
		logger.Error("❌ Configuration is invalid")
		for _, err := range validation.Errors {
			logger.Error(fmt.Sprintf("  - %s", err))
		}
	}

	if len(validation.Warnings) > 0 {
		logger.Warn("⚠️ Configuration warnings:")
		for _, warning := range validation.Warnings {
			logger.Warn(fmt.Sprintf("  - %s", warning))
		}
	}
}

// InitializeEnvironment validates and logs environment configuration
func InitializeEnvironment(logger *zap.Logger) (*EnvironmentConfig, error) {
	config, err := GetEnvironmentConfig()
	if err != nil {
		logger.Error("Failed to load environment configuration", zap.Error(err))
		return nil, err
	}

	LogEnvironmentConfigStatus(logger)
	return config, nil
}

// Helper functions

func getEnvOrDefault(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

func getEnvAsInt(key string, defaultValue int) int {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.Atoi(valueStr)
	if err != nil {
		return defaultValue
	}
	return value
}

func getEnvAsDuration(key string, defaultValue time.Duration) time.Duration {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := time.ParseDuration(valueStr)
	if err != nil {
		return defaultValue
	}
	return value
}

func parseCORSOrigins() []string {
	originsEnv := os.Getenv("CORS_ALLOWED_ORIGINS")
	if originsEnv == "" {
		return []string{}
	}
	origins := strings.Split(originsEnv, ",")
	// Trim whitespace
	for i, origin := range origins {
		origins[i] = strings.TrimSpace(origin)
	}
	return origins
}

func maskIfEmpty(value, mask string) string {
	if value == "" {
		return mask
	}
	return "✓ Configured"
}
