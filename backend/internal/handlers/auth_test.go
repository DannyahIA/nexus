package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nexus/backend/internal/handlers"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"go.uber.org/zap"
)

// MockDB simulates database operations
type MockDB struct {
	mock.Mock
}

func (m *MockDB) GetUserByEmail(email string) (map[string]interface{}, error) {
	args := m.Called(email)
	return args.Get(0).(map[string]interface{}), args.Error(1)
}

func (m *MockDB) CreateUserWithDiscriminator(userID, email, username, displayName, passwordHash string) (string, error) {
	args := m.Called(userID, email, username, displayName, passwordHash)
	return args.String(0), args.Error(1)
}

func TestAuthHandler_Login(t *testing.T) {
	tests := []struct {
		name           string
		requestBody    interface{}
		expectedStatus int
		setupMock      func(*MockDB)
	}{
		{
			name: "successful login",
			requestBody: map[string]string{
				"email":    "test@example.com",
				"password": "password123",
			},
			expectedStatus: http.StatusOK,
			setupMock: func(mockDB *MockDB) {
				mockDB.On("GetUserByEmail", "test@example.com").Return(
					map[string]interface{}{
						"user_id":       "123e4567-e89b-12d3-a456-426614174000",
						"username":      "testuser",
						"discriminator": "1234",
						"display_name":  "Test User",
						"password_hash": "$2a$10$rN7VcMn9Y8V7z8X9Y8V7z8X9Y8V7z8X9Y8V7z8X9Y8V7z8X9Y8V7z8", // bcrypt hash of "password123"
						"email":         "test@example.com",
					}, nil)
			},
		},
		{
			name: "invalid credentials",
			requestBody: map[string]string{
				"email":    "test@example.com", 
				"password": "wrongpassword",
			},
			expectedStatus: http.StatusUnauthorized,
			setupMock: func(mockDB *MockDB) {
				mockDB.On("GetUserByEmail", "test@example.com").Return(
					map[string]interface{}{
						"password_hash": "$2a$10$rN7VcMn9Y8V7z8X9Y8V7z8X9Y8V7z8X9Y8V7z8X9Y8V7z8X9Y8V7z8",
					}, nil)
			},
		},
		{
			name:           "missing email",
			requestBody:    map[string]string{"password": "password123"},
			expectedStatus: http.StatusBadRequest,
			setupMock:      func(mockDB *MockDB) {},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			mockDB := &MockDB{}
			tt.setupMock(mockDB)
			
			logger := zap.NewNop()
			authHandler := handlers.NewAuthHandler(logger, "test-secret", mockDB)

			// Create request
			jsonBody, _ := json.Marshal(tt.requestBody)
			req := httptest.NewRequest(http.MethodPost, "/login", bytes.NewBuffer(jsonBody))
			req.Header.Set("Content-Type", "application/json")
			
			// Create response recorder
			rr := httptest.NewRecorder()

			// Execute
			authHandler.Login(rr, req)

			// Assert
			assert.Equal(t, tt.expectedStatus, rr.Code)
			mockDB.AssertExpectations(t)
		})
	}
}

func TestAuthHandler_Register(t *testing.T) {
	tests := []struct {
		name           string
		requestBody    interface{}
		expectedStatus int
		setupMock      func(*MockDB)
	}{
		{
			name: "successful registration",
			requestBody: map[string]string{
				"email":    "new@example.com",
				"username": "newuser",
				"password": "SecurePass123!",
			},
			expectedStatus: http.StatusCreated,
			setupMock: func(mockDB *MockDB) {
				mockDB.On("CreateUserWithDiscriminator", mock.AnythingOfType("string"), 
					"new@example.com", "newuser", "newuser", mock.AnythingOfType("string")).Return("1234", nil)
			},
		},
		{
			name: "missing fields",
			requestBody: map[string]string{
				"email": "new@example.com",
			},
			expectedStatus: http.StatusBadRequest,
			setupMock:      func(mockDB *MockDB) {},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			mockDB := &MockDB{}
			tt.setupMock(mockDB)
			
			logger := zap.NewNop()
			authHandler := handlers.NewAuthHandler(logger, "test-secret", mockDB)

			// Create request
			jsonBody, _ := json.Marshal(tt.requestBody)
			req := httptest.NewRequest(http.MethodPost, "/register", bytes.NewBuffer(jsonBody))
			req.Header.Set("Content-Type", "application/json")
			
			// Create response recorder
			rr := httptest.NewRecorder()

			// Execute
			authHandler.Register(rr, req)

			// Assert
			assert.Equal(t, tt.expectedStatus, rr.Code)
			mockDB.AssertExpectations(t)
		})
	}
}
