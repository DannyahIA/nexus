# Stage 1: Build
FROM golang:1.23-alpine AS builder

# Instalar dependências necessárias
RUN apk add --no-cache git ca-certificates tzdata

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos do módulo Go
COPY go.mod ./
COPY go.sum* ./

# Download das dependências
RUN go mod download

# Copiar todo o código fonte
COPY . .

# Atualizar dependências e adicionar as novas necessárias
RUN go get github.com/pion/rtcp@latest
RUN go mod tidy

# Compilar a aplicação Media/SFU com otimizações
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a -installsuffix cgo \
    -o media ./cmd/media/main.go

# Stage 2: Runtime - imagem mínima
FROM gcr.io/distroless/static:nonroot

# Copiar certificados para HTTPS/WSS se necessário
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copiar o binário compilado
COPY --from=builder /app/media /media

# Expor a porta do SFU
EXPOSE 8083

# Executar a aplicação
ENTRYPOINT ["/media"]
