# Nexus - Full Stack Setup Guide

## 📋 Visão Geral

Este é um guia completo de setup para o projeto **Nexus** - uma plataforma de fusão Discord + Linear com recursos de comunicação em tempo real.

## 🚀 Quick Start

### Pré-requisitos

- Node.js 18+
- Go 1.22+
- Docker & Docker Compose
- Git

### 1. Clonar o Repositório

```bash
git clone <repository-url>
cd nexus
```

### 2. Setup Backend

```bash
cd backend

# Instalar dependências
go mod download
go mod tidy

# Copiar variáveis de ambiente
cp .env.example .env

# Build dos serviços
CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/nexus-api ./cmd/api
CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/nexus-ws ./cmd/ws
CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/nexus-media ./cmd/media
```

### 3. Setup Frontend

```bash
cd frontend

# Instalar dependências
pnpm install

# Preparar para build nativo
npx expo prebuild

# Rodando no iOS
npx expo run:ios

# Rodando no Android
npx expo run:android
```

### 4. Setup Infraestrutura

```bash
# Na raiz do projeto
docker-compose up -d

# Inicializar Cassandra (esperar ~1 minuto)
docker exec nexus-cassandra cqlsh -f /docker-entrypoint-initdb.d/init.cql
```

## 📦 Serviços Backend

### API Server (`:8000`)
```bash
cd backend
./bin/nexus-api
```
- Autenticação JWT
- REST API
- Health checks

### WebSocket Server (`:8080`)
```bash
cd backend
./bin/nexus-ws
```
- Conexões WebSocket
- Mensagens em tempo real
- Presença de usuários

### Media Server (`:7880` UDP)
```bash
cd backend
./bin/nexus-media
```
- WebRTC SFU (Selective Forwarding Unit)
- Voice & Video streaming
- Screen sharing

## 🗄️ Database

### Cassandra (`:9042`)
- 3 replicas (configurável)
- Tabelas pre-criadas
- Inicialização automática

### PostgreSQL (`:5432`) - Opcional
- Billing
- User profiles
- Admin data

### Redis (`:6379`)
- Caching
- Session storage

## 🔐 Autenticação

### Flow de Login

```
Cliente -> [POST /login] -> API Server
                           ↓ (valida credenciais)
                           ↓ (gera JWT)
Cliente <- [JWT Token] <- API Server
```

### JWT Claims

```json
{
  "user_id": "uuid",
  "email": "user@example.com",
  "username": "username",
  "exp": 1234567890
}
```

## 🌐 WebSocket API

### Conectar

```javascript
const ws = new WebSocket('ws://localhost:8080/ws?user_id=<USER_ID>');

ws.onopen = () => {
  console.log('Connected');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle message
};
```

### Tipos de Mensagens

```typescript
// Mensagem de chat
{
  type: 'message',
  channelID: 'uuid',
  authorID: 'uuid',
  content: 'Hello',
  timestamp: 1234567890
}

// Atualização de tarefa
{
  type: 'task_update',
  channelID: 'uuid',
  taskID: 'uuid',
  status: 'in_progress'
}

// Mudança de presença
{
  type: 'presence',
  userID: 'uuid',
  status: 'online'
}
```

## 📁 Estrutura de Pastas

```
nexus/
├── backend/
│   ├── cmd/
│   │   ├── api/       # REST API
│   │   ├── ws/        # WebSocket
│   │   └── media/     # WebRTC
│   ├── internal/
│   │   ├── database/  # Cassandra
│   │   ├── services/  # NATS
│   │   ├── handlers/  # HTTP handlers
│   │   ├── models/    # Data types
│   │   └── cache/     # Caching
│   ├── pb/            # Protocol Buffers
│   └── go.mod
│
├── frontend/
│   ├── app/
│   │   ├── screens/   # Telas principais
│   │   ├── components/# Componentes reutilizáveis
│   │   ├── hooks/     # Custom hooks
│   │   ├── services/  # API client
│   │   └── store/     # Legend-State
│   ├── app.json
│   └── package.json
│
├── infrastructure/
│   ├── cassandra/     # CQL scripts
│   ├── nats/          # Config
│   ├── turn/          # TURN server config
│   └── docker-compose.yml
│
└── docs/
    ├── API.md
    ├── SETUP.md
    └── DEPLOYMENT.md
```

## 🧪 Testing

### Backend

```bash
cd backend
go test ./...
```

### Frontend

```bash
cd frontend
pnpm test
```

## 🚢 Deployment

### Docker

```bash
# Build images
docker build -t nexus-api ./backend -f backend/Dockerfile
docker build -t nexus-ws ./backend -f backend/Dockerfile.ws
docker build -t nexus-mobile ./frontend -f frontend/Dockerfile

# Run com docker-compose
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes

```bash
kubectl apply -f k8s/
```

## 📊 Monitoramento

- Logs: `docker logs <container-name>`
- Métricas: Prometheus (configurar)
- Traces: Jaeger (configurar)

## 🐛 Troubleshooting

### Cassandra não conecta

```bash
# Verificar saúde
docker exec nexus-cassandra nodetool status

# Ver logs
docker logs nexus-cassandra
```

### WebSocket conexão recusada

- Verificar se servidor WebSocket está rodando
- Verificar firewall/portas
- Verificar CORS

### NATS não conecta

```bash
# Testar conexão
docker exec nexus-nats nats --server="nats://nexus-nats:4222" server info
```

## 📝 Environment Variables

Copiar `.env.example` para `.env` e configurar:

```env
# API
API_PORT=8000

# WebSocket
WS_PORT=8080

# Database
CASS_HOSTS=127.0.0.1
CASS_PORT=9042
CASS_KEYSPACE=nexus

# NATS
NATS_URL=nats://127.0.0.1:4222

# Media
SFU_UDP_PORT=7880
SFU_TCP_PORT=7881

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRY=24h

# TURN
TURN_URL=turn:turn.nexus.local:3478
TURN_USER=nexus
TURN_PASS=secret

# Logging
LOG_LEVEL=debug
```

## 📚 Documentação Adicional

- [API Documentation](./docs/API.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Contributing Guide](./docs/CONTRIBUTING.md)

## 📄 License

MIT

---

**Última atualização**: 5 de Novembro de 2025
