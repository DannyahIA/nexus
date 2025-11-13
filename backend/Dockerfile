# Multi-stage build para todas as aplicações do backend
# Stage 1: Builder - compilação de todas as aplicações
FROM golang:1.22-alpine AS builder

# Instalar dependências necessárias para build
RUN apk add --no-cache git ca-certificates tzdata

# Definir diretório de trabalho
WORKDIR /app

# Copiar go.mod e go.sum primeiro para cache de dependências
COPY go.mod go.sum ./

# Download de dependências (cached se os arquivos mod não mudaram)
RUN go mod download && go mod verify

# Copiar todo o código fonte
COPY . .

# Compilar todas as aplicações com otimizações
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a -installsuffix cgo \
    -o api ./cmd/api/main.go

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a -installsuffix cgo \
    -o ws ./cmd/ws/main.go

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a -installsuffix cgo \
    -o media ./cmd/media/main.go

# Stage 2: Runtime API - imagem mínima para API
FROM gcr.io/distroless/static:nonroot AS api

COPY --from=builder /app/api /api
USER nonroot:nonroot
EXPOSE 8000
ENTRYPOINT ["/api"]

# Stage 3: Runtime WebSocket - imagem mínima para WebSocket
FROM gcr.io/distroless/static:nonroot AS websocket

COPY --from=builder /app/ws /ws
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/ws"]

# Stage 4: Runtime Media - imagem mínima para Media
FROM gcr.io/distroless/static:nonroot AS media

COPY --from=builder /app/media /media
USER nonroot:nonroot
EXPOSE 8081
ENTRYPOINT ["/media"]
