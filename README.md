# 🚀 Nexus - Discord + Linear Fusion Platform

[![Go](https://img.shields.io/badge/Go-1.22-blue)](https://golang.org/)
[![React Native](https://img.shields.io/badge/React%20Native-0.74-blue)](https://reactnative.dev/)
[![Cassandra](https://img.shields.io/badge/Cassandra-4.1-blue)](https://cassandra.apache.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**Nexus** é uma plataforma de comunicação em tempo real que combina o melhor do Discord (chat, voz, vídeo) com o melhor do Linear (gerenciamento de tarefas, Kanban). Construído com tecnologias modernas e performáticas.

## ✨ Características

- 💬 **Chat em Tempo Real** - Mensagens instantâneas com WebSocket
- 🎙️ **Voice & Video** - Comunicação de áudio/vídeo via WebRTC + SFU
- 📋 **Kanban Boards** - Gerenciamento de tarefas com drag-and-drop
- 👥 **Presença em Tempo Real** - Ver quem está online/offline
- 🔐 **Autenticação Segura** - JWT com refresh tokens
- ⚡ **Performance** - 60 fps UI, <1ms JS, <2ms UI thread
- 🌍 **Distribuído** - Cassandra com replicação multi-DC
- 📱 **Mobile-First** - React-Native para iOS/Android
- 🔄 **Sync em Tempo Real** - NATS JetStream para eventos
- 🛡️ **Enterprise Ready** - Logging, monitoring, health checks

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React-Native)               │
│  (iOS/Android, TypeScript, Reanimated, FlashList)      │
└──────────────────────────────────────────────────────────┘
                           ↕
        ┌──────────────────────────────────────┐
        │     API Gateway & Load Balancer      │
        └──────────────────────────────────────┘
                           ↕
   ┌────────────────────────────────────────────────────┐
   │            Go Microservices (1.22)                 │
   ├────────────────┬──────────────┬──────────────────┤
   │  REST API      │  WebSocket   │  WebRTC/SFU      │
   │  (8000)        │  Server      │  Media (7880)    │
   │                │  (8080)      │                  │
   └────────────────────────────────────────────────────┘
        ↕                ↕                ↕
   ┌─────────────────────────────────────────────────┐
   │  NATS JetStream │ Cassandra │ PostgreSQL         │
   │  (Event Bus)    │ (Primary) │ (Billing)          │
   └─────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Pré-requisitos
- Node.js 18+
- Go 1.22+
- Docker & Docker Compose

### Instalação Rápida

```bash
# Clonar repositório
git clone https://github.com/seu-user/nexus.git
cd nexus

# Setup infraestrutura (Cassandra, NATS, Redis, PostgreSQL)
docker-compose up -d

# Backend
cd backend
cp .env.example .env
go mod download
CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/nexus-api ./cmd/api
./bin/nexus-api

# Em outro terminal, Frontend
cd frontend
pnpm install
npx expo prebuild
npx expo run:ios  # ou run:android
```

Para mais detalhes, veja [SETUP.md](./SETUP.md)

## 📁 Estrutura do Projeto

```
nexus/
├── backend/                    # Serviços Go
│   ├── cmd/
│   │   ├── api/               # REST API Server
│   │   ├── ws/                # WebSocket Server
│   │   └── media/             # WebRTC SFU
│   ├── internal/
│   │   ├── database/          # Cassandra client
│   │   ├── services/          # NATS services
│   │   ├── handlers/          # HTTP handlers
│   │   ├── models/            # Data types
│   │   └── cache/             # In-memory cache
│   ├── pb/                    # Protocol Buffers
│   ├── go.mod
│   └── Dockerfile
│
├── frontend/                   # React-Native App
│   ├── app/
│   │   ├── screens/           # Telas principais
│   │   ├── components/        # Componentes UI
│   │   ├── hooks/             # Custom hooks
│   │   ├── services/          # API client
│   │   └── store/             # State management
│   ├── app.json
│   ├── package.json
│   └── Dockerfile
│
├── infrastructure/             # DevOps
│   ├── cassandra/
│   ├── nats/
│   ├── turn/
│   └── docker-compose.yml
│
├── docs/                       # Documentação
│   ├── API.md
│   ├── ARCHITECTURE.md
│   └── CONTRIBUTING.md
│
└── PROJECT_SPEC.md            # Especificação técnica
```

## 🔧 Stack Técnico

### Backend
- **Linguagem**: Go 1.22
- **Protocolos**: gRPC, WebSocket, HTTP/REST
- **Message Queue**: NATS JetStream
- **Database**: Apache Cassandra 4.1
- **WebRTC**: Pion SFU
- **Logging**: Uber Zap

### Frontend
- **Framework**: React-Native 0.74
- **Linguagem**: TypeScript
- **Engine**: Hermes
- **Animações**: Reanimated 3
- **Listas**: FlashList
- **State**: Legend-State + MMKV
- **HTTP**: Axios

### Infraestrutura
- **Container**: Docker & Docker Compose
- **Orquestração**: Kubernetes (ready)
- **Banco de Dados**: Cassandra, PostgreSQL, Redis
- **TURN**: coturn

## 📚 Documentação

- [API Reference](./docs/API.md) - Endpoints REST e WebSocket
- [Architecture](./docs/ARCHITECTURE.md) - Design patterns e decisões
- [Setup Guide](./SETUP.md) - Instalação e configuração
- [Contributing](./docs/CONTRIBUTING.md) - Como contribuir

## 🗄️ Database Schema

### Cassandra Tables

```sql
-- Mensagens (particionada por channel + bucket)
messages_by_channel (channel_id, bucket, ts, msg_id)

-- Tarefas (Kanban)
tasks_by_channel (channel_id, position, task_id)

-- Presença de usuários
user_presence (user_id)

-- Usuários
users (user_id)

-- Canais
channels (channel_id)

-- Sessões de voz
voice_sessions (session_id)
```

## 🔐 Autenticação

```
POST /login
{
  "email": "user@example.com",
  "password": "secret"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user_id": "uuid",
  "username": "john_doe"
}
```

## 🌐 WebSocket API

```typescript
// Conectar
const ws = new WebSocket('ws://localhost:8080/ws?user_id=USER_ID');

// Tipos de mensagens
{
  "type": "message",
  "channelID": "uuid",
  "content": "Hello world"
}

{
  "type": "task_update",
  "taskID": "uuid",
  "status": "in_progress"
}

{
  "type": "presence",
  "status": "online"
}
```

## 📊 Performance

- ✅ **60 fps UI** - <1ms JavaScript, <2ms UI thread
- ✅ **Zero-copy** - Go buffer management
- ✅ **Aggressive caching** - Legend-State + MMKV
- ✅ **Ultra-flat structures** - Sem deep nesting
- ✅ **Reusable components** - Otimizadas com memoization

## 🚢 Deployment

### Docker

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes

```bash
kubectl apply -f k8s/
kubectl port-forward svc/nexus-api 8000:8000
```

## 📈 Monitoring

- **Logs**: `docker logs <container>`
- **Metrics**: Prometheus (em desenvolvimento)
- **Traces**: Jaeger (em desenvolvimento)
- **Health**: `/health` endpoint

## 🤝 Contribuindo

Veja [CONTRIBUTING.md](./docs/CONTRIBUTING.md) para guidelines.

```bash
# 1. Fork o repo
# 2. Create feature branch
git checkout -b feature/awesome-feature

# 3. Commit changes
git commit -am 'Add awesome feature'

# 4. Push to branch
git push origin feature/awesome-feature

# 5. Create Pull Request
```

## 📄 License

MIT © 2025 Nexus

## 🙏 Agradecimentos

- Discord API - inspiração em design
- Linear App - inspiração em UX
- Pion - WebRTC SDK
- Cassandra - database distribuído

## 📞 Suporte

- 📧 Email: support@nexus.app
- 🐙 GitHub Issues: [Issues](https://github.com/seu-user/nexus/issues)
- 💬 Discord: [Community](https://discord.gg/nexus)

---

**Feito com ❤️ por [Seu Nome]**

Última atualização: 5 de Novembro de 2025
