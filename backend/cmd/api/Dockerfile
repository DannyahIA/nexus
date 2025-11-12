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

# Compilar a aplicação API
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o api ./cmd/api/main.go

# Stage 2: Runtime
FROM alpine:latest

# Instalar certificados CA para HTTPS
RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copiar o binário compilado do stage anterior
COPY --from=builder /app/api .

# Copiar o arquivo .env (opcional, pode ser substituído por env vars no docker-compose)
COPY --from=builder /app/.env* ./ 

# Expor a porta da API
EXPOSE 8000

# Comando para executar a aplicação
CMD ["./api"]
