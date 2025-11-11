# 🚀 Nexus - Discord + Linear Fusion Platform

[![Go](https://img.shields.io/badge/Go-1.22-blue)](https://golang.org/)
[![React Native](https://img.shields.io/badge/React%20Native-0.74-blue)](https://reactnative.dev/)
[![Cassandra](https://img.shields.io/badge/Cassandra-4.1-blue)](https://cassandra.apache.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**Nexus** is a real-time communication platform that combines the best of Discord (chat, voice, video) with the best of Linear (task management, Kanban). Built with modern, high-performance technologies.

## ✨ Features

- 💬 **Real-Time Chat** - Instant messaging via WebSocket
- 🎙️ **Voice & Video** - Audio/video communication using WebRTC + SFU
- 📋 **Kanban Boards** - Task management with drag-and-drop
- 👥 **Real-Time Presence** - See who’s online/offline
- 🔐 **Secure Authentication** - JWT with refresh tokens
- ⚡ **Performance** - 60 fps UI, <1ms JS, <2ms UI thread
- 🌍 **Distributed** - Cassandra with multi-DC replication
- 📱 **Mobile-First** - React Native for iOS/Android
- 🔄 **Real-Time Sync** - NATS JetStream for event streaming
- 🛡️ **Enterprise Ready** - Logging, monitoring, health checks

## 🏗️ Architecture

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

### Prerequisites
- Node.js 18+
- Go 1.22+
- Docker & Docker Compose

### Quick Installation

```bash
# Clone the repository
git clone https://github.com/your-user/nexus.git
cd nexus

# Set up infrastructure (Cassandra, NATS, Redis, PostgreSQL)
docker-compose up -d

# Backend
cd backend
cp .env.example .env
go mod download
CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/nexus-api ./cmd/api
./bin/nexus-api

# In another terminal, Frontend
cd frontend
pnpm install
npx expo prebuild
npx expo run:ios  # ou run:android
```

For more details, see [SETUP.md](./SETUP.md)

## 📁 Project Structure

```
nexus/
├── backend/                    # Go Services
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
│   │   ├── screens/           # Main screens
│   │   ├── components/        # UI components
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
├── docs/                       # Documentation
│   ├── API.md
│   ├── ARCHITECTURE.md
│   └── CONTRIBUTING.md
│
└── PROJECT_SPEC.md            # Technical specification
```

## 🔧 Tech Stack

### Backend
- **Language**: Go 1.22
- **Protocols**: gRPC, WebSocket, HTTP/REST
- **Message Queue**: NATS JetStream
- **Database**: Apache Cassandra 4.1
- **WebRTC**: Pion SFU
- **Logging**: Uber Zap

### Frontend
- **Framework**: React-Native 0.74
- **Language**: TypeScript
- **Engine**: Hermes
- **Animations**: Reanimated 3
- **Lists**: FlashList
- **State Management**: Legend-State + MMKV
- **HTTP Client**: Axios

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Orchestration**: Kubernetes (ready)
- **Databases**: Cassandra, PostgreSQL, Redis
- **TURN Server**: coturn

## 📚 Documentation

- [API Reference](./docs/API.md) - REST and WebSocket endpoints
- [Architecture](./docs/ARCHITECTURE.md) - Design patterns and decisions
- [Setup Guide](./SETUP.md) - Installation and configuration
- [Contributing](./docs/CONTRIBUTING.md) - How to contribute

## 🗄️ Database Schema

### Cassandra Tables

```sql
-- Messages (partitioned by channel + bucket)
messages_by_channel (channel_id, bucket, ts, msg_id)

-- Tasks (Kanban)
tasks_by_channel (channel_id, position, task_id)

-- User presence
user_presence (user_id)

-- Users
users (user_id)

-- Channels
channels (channel_id)

-- Voice sessions
voice_sessions (session_id)
```

## 🔐 Authentication

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
// Connect
const ws = new WebSocket('ws://localhost:8080/ws?user_id=USER_ID');

// Message types
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
- ✅ **Ultra-flat structures** - No deep nesting
- ✅ **Reusable components** - Optimized with memoization

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
- **Metrics**: Prometheus (in development)
- **Traces**: Jaeger (in development)
- **Health**: `/health` endpoint

## 🤝 Contributing

See [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for guidelines.

```bash
# 1. Fork the repo
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

## 🙏 Acknowledgments

- Discord API - design inspiration
- Linear App - UX inspiration
- Pion - WebRTC SDK
- Cassandra - distributed database

## 📞 Support

- 📧 Email: contato@eclipsiasoftware.com
- 🐙 GitHub Issues: [Issues](https://github.com/DannyahIA/nexus/issues)

---

**Made with ❤️ by [Dannyah](https://github.com/DannyahIA)**

Last updated: November 5, 2025
