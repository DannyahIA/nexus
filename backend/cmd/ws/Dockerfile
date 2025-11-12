# Stage 1: Build
FROM golang:1.22-alpine AS builder

# Instalar dependências necessárias
RUN apk add --no-cache git ca-certificates

# Definir diretório de trabalho
WORKDIR /app

# Copiar go.mod e go.sum primeiro (cache de dependências)
COPY go.mod go.sum ./
RUN go mod download

# Copiar todo o código fonte
COPY . .

# Compilar a aplicação WebSocket
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o ws ./cmd/ws/main.go

# Stage 2: Runtime
FROM alpine:latest

# Instalar certificados CA para HTTPS
RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copiar o binário compilado do stage anterior
COPY --from=builder /app/ws .

# Copiar o arquivo .env (opcional)
COPY --from=builder /app/.env* ./ 

# Expor a porta do WebSocket
EXPOSE 8080

# Comando para executar a aplicação
CMD ["./ws"]
