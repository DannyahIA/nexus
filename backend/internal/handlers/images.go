package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/nexus/backend/internal/database"
	"github.com/nexus/backend/internal/models"
	"github.com/nexus/backend/internal/services"
	"go.uber.org/zap"
)

// ImageHandler gerencia operações de upload de imagens
type ImageHandler struct {
	logger       *zap.Logger
	db           *database.CassandraDB
	imageService *services.ImageService
	uploadDir    string
}

// NewImageHandler cria um novo handler de imagens
func NewImageHandler(logger *zap.Logger, db *database.CassandraDB, uploadDir string) *ImageHandler {
	maxFileSize := int64(5 * 1024 * 1024) // 5MB
	imageService := services.NewImageService(logger, uploadDir, maxFileSize)

	return &ImageHandler{
		logger:       logger,
		db:           db,
		imageService: imageService,
		uploadDir:    uploadDir,
	}
}

// ImageUploadResponse representa a resposta de upload de imagem
type ImageUploadResponse struct {
	URL string `json:"url"`
}

// UploadUserAvatar faz upload do avatar do usuário
func (ih *ImageHandler) UploadUserAvatar(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extrair claims do contexto (adicionado pelo AuthMiddleware)
	claims, ok := r.Context().Value("claims").(*models.Claims)
	if !ok {
		ih.logger.Error("failed to get claims from context")
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse multipart form (5MB limit)
	maxFileSize := int64(5 * 1024 * 1024)
	err := r.ParseMultipartForm(maxFileSize)
	if err != nil {
		ih.logger.Error("failed to parse multipart form", zap.Error(err))
		http.Error(w, "file too large or invalid form data", http.StatusBadRequest)
		return
	}

	// Obter arquivo do form
	file, header, err := r.FormFile("avatar")
	if err != nil {
		ih.logger.Error("failed to get file from form", zap.Error(err))
		http.Error(w, "avatar file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Validar imagem usando o serviço
	err = ih.imageService.ValidateImage(file, header)
	if err != nil {
		ih.logger.Warn("image validation failed", zap.Error(err))
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Configuração para avatar de usuário
	config := services.ImageConfig{
		MaxWidth:       256,
		MaxHeight:      256,
		ThumbnailSize:  64,
		Quality:        85,
		GenerateThumbs: true,
	}

	// Processar imagem (resize, compress, save)
	filename, err := ih.imageService.ProcessImage(file, claims.UserID, "user", config)
	if err != nil {
		ih.logger.Error("failed to process image", zap.Error(err))
		http.Error(w, "failed to process image", http.StatusInternalServerError)
		return
	}

	// Gerar URL da imagem
	imageURL := fmt.Sprintf("/api/images/%s", filename)

	// Atualizar banco de dados
	err = ih.db.UpdateUserAvatar(claims.UserID, imageURL)
	if err != nil {
		ih.logger.Error("failed to update user avatar in database", zap.Error(err))
		// Tentar remover arquivo salvo
		ih.imageService.DeleteImage(filename)
		http.Error(w, "failed to update user avatar", http.StatusInternalServerError)
		return
	}

	ih.logger.Info("user avatar uploaded successfully",
		zap.String("userID", claims.UserID),
		zap.String("filename", filename))

	// Retornar resposta
	response := ImageUploadResponse{
		URL: imageURL,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// ServeImage serve uma imagem armazenada
func (ih *ImageHandler) ServeImage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extrair nome do arquivo da URL
	// URL format: /api/images/{filename}
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		http.Error(w, "invalid image path", http.StatusBadRequest)
		return
	}

	filename := pathParts[len(pathParts)-1]

	// Sanitizar nome do arquivo para prevenir path traversal
	filename = filepath.Base(filename)

	// Construir caminho completo
	filePath := filepath.Join(ih.uploadDir, filename)

	// Verificar se arquivo existe
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		http.Error(w, "image not found", http.StatusNotFound)
		return
	}

	// Definir headers de cache
	w.Header().Set("Cache-Control", "public, max-age=31536000") // 1 ano
	w.Header().Set("Content-Type", ih.getContentTypeFromFilename(filename))

	// Servir arquivo
	http.ServeFile(w, r, filePath)
}

// getContentTypeFromFilename retorna o content type baseado na extensão do arquivo
func (ih *ImageHandler) getContentTypeFromFilename(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	default:
		return "application/octet-stream"
	}
}
