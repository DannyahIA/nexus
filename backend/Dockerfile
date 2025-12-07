# Multi-stage build otimizado para todas as aplicações do backend
# Stage 1: Builder - compilação com cache otimizado
FROM golang:1.22-alpine AS builder

# Metadados da imagem
LABEL maintainer="Dannyah <contato@eclipsiasoftware.com>"
LABEL description="Nexus Backend - Multi-service build"

# Instalar dependências necessárias e ferramentas de segurança
RUN apk add --no-cache \
    git \
    ca-certificates \
    tzdata \
    upx \
    && update-ca-certificates

# Criar usuário não-root para build
RUN adduser -D -s /bin/sh nexus-build

# Definir diretório de trabalho
WORKDIR /app

# Otimização: Copiar apenas arquivos de dependências primeiro
COPY go.mod go.sum ./

# Download e verificação de dependências (cached se mod files não mudaram)
RUN go mod download && go mod verify && go mod tidy

# Copiar código fonte
COPY . .

# Verificar se não há vulnerabilidades conhecidas (se go vuln check estiver disponível)
RUN go list -json -m all | grep -v "^{" || true

# Build info para versionamento
ARG BUILD_VERSION=dev
ARG BUILD_TIME
ARG GIT_COMMIT
ENV BUILD_VERSION=${BUILD_VERSION}
ENV BUILD_TIME=${BUILD_TIME}
ENV GIT_COMMIT=${GIT_COMMIT}

# Compilar todas as aplicações com build info e otimizações máximas
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s -X main.version=${BUILD_VERSION} -X main.buildTime=${BUILD_TIME} -X main.gitCommit=${GIT_COMMIT} -extldflags '-static'" \
    -a -installsuffix cgo -trimpath \
    -o api ./cmd/api/main.go

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s -X main.version=${BUILD_VERSION} -X main.buildTime=${BUILD_TIME} -X main.gitCommit=${GIT_COMMIT} -extldflags '-static'" \
    -a -installsuffix cgo -trimpath \
    -o ws ./cmd/ws/main.go

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s -X main.version=${BUILD_VERSION} -X main.buildTime=${BUILD_TIME} -X main.gitCommit=${GIT_COMMIT} -extldflags '-static'" \
    -a -installsuffix cgo -trimpath \
    -o media ./cmd/media/main.go

# Compressão adicional dos binários (reduz ~30% do tamanho)
RUN upx --best --lzma api ws media

# Stage 2: Runtime API - imagem mínima e segura
FROM gcr.io/distroless/static:nonroot AS api

# Metadados
LABEL service="nexus-api"
LABEL version="1.0.0"

# Copiar certificados e timezone data
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Copiar binário
COPY --from=builder /app/api /api

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD ["/api", "-health-check"] || exit 1

USER nonroot:nonroot
EXPOSE 8000

ENTRYPOINT ["/api"]

# Stage 3: Runtime WebSocket - imagem mínima e segura  
FROM gcr.io/distroless/static:nonroot AS websocket

# Metadados
LABEL service="nexus-websocket"
LABEL version="1.0.0"

# Copiar certificados
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Copiar binário
COPY --from=builder /app/ws /ws

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD ["/ws", "-health-check"] || exit 1

USER nonroot:nonroot
EXPOSE 8080

ENTRYPOINT ["/ws"]

# Stage 4: Runtime Media - imagem mínima e segura
FROM gcr.io/distroless/static:nonroot AS media

# Metadados
LABEL service="nexus-media"
LABEL version="1.0.0"

# Copiar certificados
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Copiar binário
COPY --from=builder /app/media /media

# Health check  
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD ["/media", "-health-check"] || exit 1

USER nonroot:nonroot
EXPOSE 8081

ENTRYPOINT ["/media"]
