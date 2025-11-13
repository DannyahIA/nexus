# Stage 1: Build
FROM golang:1.22-alpine AS builder

# Instalar dependências necessárias
RUN apk add --no-cache git ca-certificates tzdata

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos do módulo Go
COPY go.mod ./
COPY go.sum* ./

# Atualizar dependências e resolver go.sum
RUN go mod download
RUN go mod tidy

# Copiar todo o código fonte
COPY . .

# Verificar novamente as dependências após copiar o código
RUN go mod tidy

# Compilar a aplicação WebSocket com otimizações
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a -installsuffix cgo \
    -o ws ./cmd/ws/main.go

# Stage 2: Runtime - imagem mínima
FROM gcr.io/distroless/static:nonroot

# Copiar o binário compilado
COPY --from=builder /app/ws /ws

# Expor a porta do WebSocket
EXPOSE 8080

# Executar a aplicação
ENTRYPOINT ["/ws"]
