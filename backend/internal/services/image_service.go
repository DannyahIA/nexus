package services

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/nfnt/resize"
	"go.uber.org/zap"
)

// ImageService gerencia processamento de imagens
type ImageService struct {
	logger      *zap.Logger
	uploadDir   string
	maxFileSize int64
}

// ImageConfig define configurações para processamento de imagem
type ImageConfig struct {
	MaxWidth       uint
	MaxHeight      uint
	ThumbnailSize  uint
	Quality        int
	GenerateThumbs bool
}

// NewImageService cria um novo serviço de imagens
func NewImageService(logger *zap.Logger, uploadDir string, maxFileSize int64) *ImageService {
	// Criar diretório de upload se não existir
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		logger.Error("failed to create upload directory", zap.Error(err))
	}

	// Criar subdiretório para thumbnails
	thumbDir := filepath.Join(uploadDir, "thumbnails")
	if err := os.MkdirAll(thumbDir, 0755); err != nil {
		logger.Error("failed to create thumbnails directory", zap.Error(err))
	}

	return &ImageService{
		logger:      logger,
		uploadDir:   uploadDir,
		maxFileSize: maxFileSize,
	}
}

// ValidateImage valida o arquivo de imagem
func (is *ImageService) ValidateImage(file multipart.File, header *multipart.FileHeader) error {
	// Validar tamanho
	if header.Size > is.maxFileSize {
		return fmt.Errorf("file too large: %d bytes (max: %d bytes)", header.Size, is.maxFileSize)
	}

	// Validar tipo de conteúdo
	contentType := header.Header.Get("Content-Type")
	if !isValidImageType(contentType) {
		return fmt.Errorf("invalid file type: %s (accepted: JPEG, PNG, GIF, WebP)", contentType)
	}

	// Validar que é realmente uma imagem decodificando
	_, err := file.Seek(0, 0) // Reset para o início
	if err != nil {
		return fmt.Errorf("failed to seek file: %w", err)
	}

	_, format, err := image.DecodeConfig(file)
	if err != nil {
		return fmt.Errorf("invalid image file: %w", err)
	}

	// Verificar formato suportado
	validFormats := []string{"jpeg", "png", "gif", "webp"}
	isValid := false
	for _, validFormat := range validFormats {
		if format == validFormat {
			isValid = true
			break
		}
	}

	if !isValid {
		return fmt.Errorf("unsupported image format: %s", format)
	}

	// Reset para o início novamente para processamento posterior
	_, err = file.Seek(0, 0)
	if err != nil {
		return fmt.Errorf("failed to seek file: %w", err)
	}

	return nil
}

// ProcessImage processa e salva uma imagem
func (is *ImageService) ProcessImage(file multipart.File, entityID, imageType string, config ImageConfig) (string, error) {
	// Decodificar imagem
	_, err := file.Seek(0, 0)
	if err != nil {
		return "", fmt.Errorf("failed to seek file: %w", err)
	}

	img, format, err := image.Decode(file)
	if err != nil {
		return "", fmt.Errorf("failed to decode image: %w", err)
	}

	is.logger.Info("decoded image",
		zap.String("format", format),
		zap.Int("width", img.Bounds().Dx()),
		zap.Int("height", img.Bounds().Dy()))

	// Redimensionar se necessário
	resized := is.resizeImage(img, config.MaxWidth, config.MaxHeight)

	// Gerar nome de arquivo único
	filename, err := is.generateUniqueFilename(entityID, imageType, format)
	if err != nil {
		return "", fmt.Errorf("failed to generate filename: %w", err)
	}

	// Salvar imagem processada
	filepath := filepath.Join(is.uploadDir, filename)
	err = is.saveImage(resized, filepath, format, config.Quality)
	if err != nil {
		return "", fmt.Errorf("failed to save image: %w", err)
	}

	is.logger.Info("image saved successfully",
		zap.String("filename", filename),
		zap.String("path", filepath))

	// Gerar thumbnail se configurado
	if config.GenerateThumbs {
		thumbFilename, err := is.GenerateThumbnail(filename, config.ThumbnailSize)
		if err != nil {
			is.logger.Warn("failed to generate thumbnail", zap.Error(err))
			// Não falhar o upload se thumbnail falhar
		} else {
			is.logger.Info("thumbnail generated", zap.String("filename", thumbFilename))
		}
	}

	return filename, nil
}

// resizeImage redimensiona uma imagem mantendo aspect ratio
func (is *ImageService) resizeImage(img image.Image, maxWidth, maxHeight uint) image.Image {
	bounds := img.Bounds()
	width := uint(bounds.Dx())
	height := uint(bounds.Dy())

	// Se a imagem já está dentro dos limites, retornar original
	if width <= maxWidth && height <= maxHeight {
		is.logger.Info("image within size limits, no resize needed",
			zap.Uint("width", width),
			zap.Uint("height", height))
		return img
	}

	// Calcular novo tamanho mantendo aspect ratio
	var newWidth, newHeight uint
	aspectRatio := float64(width) / float64(height)

	if width > height {
		newWidth = maxWidth
		newHeight = uint(float64(maxWidth) / aspectRatio)
		if newHeight > maxHeight {
			newHeight = maxHeight
			newWidth = uint(float64(maxHeight) * aspectRatio)
		}
	} else {
		newHeight = maxHeight
		newWidth = uint(float64(maxHeight) * aspectRatio)
		if newWidth > maxWidth {
			newWidth = maxWidth
			newHeight = uint(float64(maxWidth) / aspectRatio)
		}
	}

	is.logger.Info("resizing image",
		zap.Uint("originalWidth", width),
		zap.Uint("originalHeight", height),
		zap.Uint("newWidth", newWidth),
		zap.Uint("newHeight", newHeight))

	// Usar Lanczos3 para melhor qualidade
	return resize.Resize(newWidth, newHeight, img, resize.Lanczos3)
}

// saveImage salva uma imagem no disco com compressão
func (is *ImageService) saveImage(img image.Image, filepath, format string, quality int) error {
	outFile, err := os.Create(filepath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer outFile.Close()

	switch format {
	case "jpeg", "jpg":
		err = jpeg.Encode(outFile, img, &jpeg.Options{Quality: quality})
	case "png":
		encoder := png.Encoder{CompressionLevel: png.BestCompression}
		err = encoder.Encode(outFile, img)
	case "gif":
		err = gif.Encode(outFile, img, nil)
	default:
		// Para webp e outros, usar JPEG como fallback
		err = jpeg.Encode(outFile, img, &jpeg.Options{Quality: quality})
	}

	if err != nil {
		return fmt.Errorf("failed to encode image: %w", err)
	}

	return nil
}

// generateUniqueFilename gera um nome de arquivo único
func (is *ImageService) generateUniqueFilename(entityID, imageType, format string) (string, error) {
	// Gerar ID único usando crypto/rand
	randomBytes := make([]byte, 8)
	_, err := rand.Read(randomBytes)
	if err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}
	randomID := hex.EncodeToString(randomBytes)

	// Timestamp
	timestamp := time.Now().Unix()

	// Extensão
	ext := getExtensionFromFormat(format)

	// Formato: {type}_{entityID}_{timestamp}_{randomID}.{ext}
	filename := fmt.Sprintf("%s_%s_%d_%s%s", imageType, entityID, timestamp, randomID, ext)

	return filename, nil
}

// GenerateThumbnail gera uma thumbnail de uma imagem existente
func (is *ImageService) GenerateThumbnail(originalFilename string, size uint) (string, error) {
	// Abrir imagem original
	originalPath := filepath.Join(is.uploadDir, originalFilename)
	file, err := os.Open(originalPath)
	if err != nil {
		return "", fmt.Errorf("failed to open original image: %w", err)
	}
	defer file.Close()

	// Decodificar
	img, format, err := image.Decode(file)
	if err != nil {
		return "", fmt.Errorf("failed to decode image: %w", err)
	}

	// Redimensionar para thumbnail (quadrado)
	thumbnail := resize.Thumbnail(size, size, img, resize.Lanczos3)

	// Gerar nome do thumbnail
	ext := filepath.Ext(originalFilename)
	nameWithoutExt := strings.TrimSuffix(originalFilename, ext)
	thumbFilename := fmt.Sprintf("%s_thumb%s", nameWithoutExt, ext)
	thumbPath := filepath.Join(is.uploadDir, "thumbnails", thumbFilename)

	// Salvar thumbnail
	err = is.saveImage(thumbnail, thumbPath, format, 85)
	if err != nil {
		return "", fmt.Errorf("failed to save thumbnail: %w", err)
	}

	return thumbFilename, nil
}

// DeleteImage remove uma imagem e seus thumbnails
func (is *ImageService) DeleteImage(filename string) error {
	// Remover imagem principal
	mainPath := filepath.Join(is.uploadDir, filename)
	if err := os.Remove(mainPath); err != nil && !os.IsNotExist(err) {
		is.logger.Error("failed to delete main image", zap.Error(err))
		return fmt.Errorf("failed to delete image: %w", err)
	}

	// Remover thumbnail se existir
	ext := filepath.Ext(filename)
	nameWithoutExt := strings.TrimSuffix(filename, ext)
	thumbFilename := fmt.Sprintf("%s_thumb%s", nameWithoutExt, ext)
	thumbPath := filepath.Join(is.uploadDir, "thumbnails", thumbFilename)

	if err := os.Remove(thumbPath); err != nil && !os.IsNotExist(err) {
		is.logger.Warn("failed to delete thumbnail", zap.Error(err))
		// Não falhar se thumbnail não existir
	}

	is.logger.Info("image deleted successfully", zap.String("filename", filename))
	return nil
}

// Helper functions

func isValidImageType(contentType string) bool {
	validTypes := []string{
		"image/jpeg",
		"image/jpg",
		"image/png",
		"image/gif",
		"image/webp",
	}

	for _, validType := range validTypes {
		if contentType == validType {
			return true
		}
	}

	return false
}

func getExtensionFromFormat(format string) string {
	switch format {
	case "jpeg", "jpg":
		return ".jpg"
	case "png":
		return ".png"
	case "gif":
		return ".gif"
	case "webp":
		return ".webp"
	default:
		return ".jpg"
	}
}
