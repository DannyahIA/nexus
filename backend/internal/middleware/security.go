package middleware

import (
	"net/http"
	"time"

	"go.uber.org/zap"
	"golang.org/x/time/rate"
)

// SecurityConfig holds security middleware configuration
type SecurityConfig struct {
	RateLimit    *rate.Limiter
	Logger       *zap.Logger
	MaxBodySize  int64
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
}

// NewSecurityConfig creates a new security configuration
func NewSecurityConfig(logger *zap.Logger) *SecurityConfig {
	return &SecurityConfig{
		RateLimit:    rate.NewLimiter(rate.Every(time.Second), 100), // 100 requests per second
		Logger:       logger,
		MaxBodySize:  1024 * 1024, // 1MB
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}
}

// RateLimitMiddleware implements rate limiting
func (sc *SecurityConfig) RateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !sc.RateLimit.Allow() {
			sc.Logger.Warn("Rate limit exceeded", 
				zap.String("ip", r.RemoteAddr),
				zap.String("path", r.URL.Path))
			http.Error(w, "Rate limit exceeded", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// PanicRecoveryMiddleware recovers from panics
func (sc *SecurityConfig) PanicRecoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				sc.Logger.Error("Panic recovered", 
					zap.Any("error", err),
					zap.String("path", r.URL.Path),
					zap.String("method", r.Method))
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// SecurityHeadersMiddleware adds security headers
func (sc *SecurityConfig) SecurityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		next.ServeHTTP(w, r)
	})
}

// RequestLoggingMiddleware logs all requests
func (sc *SecurityConfig) RequestLoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		
		// Wrap ResponseWriter to capture status code
		lw := &loggingResponseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		
		next.ServeHTTP(lw, r)
		
		duration := time.Since(start)
		sc.Logger.Info("Request completed",
			zap.String("method", r.Method),
			zap.String("path", r.URL.Path),
			zap.Int("status", lw.statusCode),
			zap.Duration("duration", duration),
			zap.String("ip", r.RemoteAddr),
			zap.String("user_agent", r.UserAgent()))
	})
}

type loggingResponseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (lrw *loggingResponseWriter) WriteHeader(code int) {
	lrw.statusCode = code
	lrw.ResponseWriter.WriteHeader(code)
}
