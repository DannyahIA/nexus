# 🚀 Nexus - Discord + Linear Fusion Platform

[![Go](https://img.shields.io/badge/Go-1.22-blue)](https://golang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-latest-blue)](https://vitejs.dev/)
[![WebRTC](https://img.shields.io/badge/WebRTC-latest-blue)](https://webrtc.org/)

[![Docker](https://img.shields.io/badge/Docker-latest-blue)](https://www.docker.com/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-latest-blue)](https://kubernetes.io/)

[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)](https://www.postgresql.org/)
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
┌──────────────────────────────────────────────────────────┐
│                    Frontend (React-Native)               │
│    (iOS/Android, TypeScript, Reanimated, FlashList)      │
└──────────────────────────────────────────────────────────┘
                           ↕
        ┌──────────────────────────────────────┐
        │     API Gateway & Load Balancer      │
        └──────────────────────────────────────┘
                           ↕
   ┌────────────────────────────────────────────────────┐
   │            Go Microservices (1.22)                 │
   ├────────────────┬──────────────┬────────────────────┤
   │  REST API      │  WebSocket   │    WebRTC/SFU      │
   │  (8000)        │  Server      │    Media (7880)    │
   │                │  (8080)      │                    │
   └────────────────────────────────────────────────────┘
        ↕                  ↕                ↕
   ┌─────────────────────────────────────────────────┐
   │ NATS JetStream │   Cassandra  │   PostgreSQL    │
   │ (Event Bus)    │   (Primary)  │   (Billing)     │
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

## �️ Roadmap

### ✅ Implemented Features

#### Core Infrastructure
- [x] Go microservices architecture with REST API
- [x] WebSocket server for real-time communication
- [x] Cassandra database integration with time-series partitioning
- [x] NATS JetStream for event streaming
- [x] Redis caching layer
- [x] Docker containerization with docker-compose
- [x] Health check endpoints
- [x] Structured logging with Zap

#### Authentication & Users
- [x] JWT authentication with refresh tokens
- [x] User registration and login
- [x] Password hashing with bcrypt
- [x] User profile management
- [x] User presence tracking (online/offline)

#### Messaging
- [x] Real-time messaging via WebSocket
- [x] Message persistence in Cassandra
- [x] Message history with pagination
- [x] Message editing and deletion
- [x] Message grouping by user and time
- [x] Date separators in chat
- [x] Message context menu (edit, delete, reply)
- [x] Infinite scroll with load more

#### Servers & Channels
- [x] Server (group) creation and management
- [x] Text channels
- [x] Channel creation, editing, and deletion
- [x] Server ownership and permissions
- [x] Multiple channels per server
- [x] Channel context menu

#### UI/UX
- [x] Discord-inspired UI design
- [x] Responsive layout for desktop and mobile
- [x] Dark theme
- [x] Message hover actions (with Shift key)
- [x] Avatar placeholders with initials
- [x] Loading states and spinners
- [x] Error handling and user feedback

#### Frontend
- [x] Web frontend with React + Vite
- [x] Desktop app with Electron
- [x] TypeScript throughout
- [x] State management with Zustand
- [x] API client with Axios
- [x] WebSocket client integration

### 🚧 In Progress

#### Voice & Video
- [ ] Voice channels
- [ ] Voice calling (1-on-1)
- [ ] Group voice calls
- [ ] Video calling (1-on-1)
- [ ] Group video calls
- [ ] Screen sharing
- [ ] WebRTC SFU implementation with Pion
- [ ] TURN server integration (coturn)
- [ ] Audio/video quality controls
- [ ] Push-to-talk
- [ ] Voice activity detection
- [ ] Noise suppression
- [ ] Echo cancellation

#### Task Management (Kanban)
- [ ] Task board visualization
- [ ] Drag-and-drop task reordering
- [ ] Task creation, editing, deletion
- [ ] Task status (todo, in progress, done)
- [ ] Task assignments
- [ ] Task dependencies
  - [ ] Blocking tasks
  - [ ] Blocked by relationships
  - [ ] Parent-child task hierarchy
  - [ ] Task chains
- [ ] Task priorities
- [ ] Task labels/tags
- [ ] Task due dates
- [ ] Task comments
- [ ] Task mentions in chat
- [ ] Link tasks to messages
- [ ] Task notifications
- [ ] Task search and filters
- [ ] Task templates
- [ ] Sprint/milestone planning

#### Friends & Direct Messages
- [ ] Friend request system
- [ ] Friend list management
- [ ] Accept/decline friend requests
- [ ] Block/unblock users
- [ ] Direct message channels (DMs)
- [ ] Group DMs
- [ ] Friend online status
- [ ] Friend activity status

#### Rich Messaging Features
- [ ] Message replies/threads
- [ ] Message reactions/emojis
- [ ] File attachments
  - [ ] Image upload and preview
  - [ ] Video upload and preview
  - [ ] Document sharing
  - [ ] File size limits
  - [ ] Thumbnail generation
- [ ] Link previews
- [ ] Code blocks with syntax highlighting
- [ ] Markdown support
- [ ] @mentions (users)
- [ ] #channel mentions
- [ ] @here and @everyone mentions
- [ ] Message pinning
- [ ] Message search
- [ ] Message forwarding
- [ ] Typing indicators

#### Notifications
- [ ] Push notifications (mobile)
- [ ] Desktop notifications
- [ ] In-app notification center
- [ ] Notification preferences per server
- [ ] Notification muting
- [ ] Unread message badges
- [ ] Notification sounds
- [ ] Do Not Disturb mode

#### Server Roles & Permissions
- [ ] Role creation and management
- [ ] Role hierarchy
- [ ] Permission system
  - [ ] Channel-specific permissions
  - [ ] Server-wide permissions
  - [ ] Role-based access control
- [ ] Default roles (Admin, Moderator, Member)
- [ ] Custom role colors
- [ ] Role mentions
- [ ] Permission presets
- [ ] Audit log for permissions

#### Server Management
- [ ] Server settings
- [ ] Server invites
  - [ ] Invite code generation
  - [ ] Invite expiration
  - [ ] Invite link sharing
  - [ ] Invite usage tracking
- [ ] Server discovery
- [ ] Server categories
- [ ] Server banners/icons
- [ ] Server member management
- [ ] Server bans and kicks
- [ ] Server moderation tools
- [ ] Server templates

#### Advanced Features
- [ ] Voice channel text chat
- [ ] Announcement channels
- [ ] Forum channels
- [ ] Stage channels (voice events)
- [ ] Server boost system
- [ ] Custom emojis
- [ ] Stickers
- [ ] Bot support and API
- [ ] Webhooks
- [ ] Integration with third-party services
- [ ] OAuth2 for third-party apps

#### Performance & Optimization
- [ ] Message virtualization for long chats
- [ ] Lazy loading of images
- [ ] Service worker for offline support
- [ ] Database query optimization
- [ ] CDN for static assets
- [ ] Horizontal scaling support
- [ ] Load balancing
- [ ] Rate limiting

#### Mobile Enhancements
- [ ] Native mobile UI components
- [ ] Gesture controls
- [ ] Haptic feedback
- [ ] Background audio for voice
- [ ] Picture-in-Picture for video
- [ ] Mobile notifications
- [ ] Deep linking

#### Analytics & Monitoring
- [ ] User analytics
- [ ] Server statistics
- [ ] Message metrics
- [ ] Performance monitoring
- [ ] Error tracking
- [ ] Prometheus metrics
- [ ] Grafana dashboards
- [ ] Distributed tracing with Jaeger

#### Security
- [ ] End-to-end encryption (optional)
- [ ] Two-factor authentication (2FA)
- [ ] Account recovery
- [ ] Password strength requirements
- [ ] Session management
- [ ] IP whitelisting
- [ ] Rate limiting per user
- [ ] CAPTCHA for registration
- [ ] Security audit logs

#### Developer Experience
- [ ] API documentation with Swagger
- [ ] GraphQL API
- [ ] SDK for third-party developers
- [ ] CLI tools
- [ ] Development mode with hot reload
- [ ] Testing suite (unit, integration, e2e)
- [ ] CI/CD pipeline
- [ ] Automated deployment

### 📅 Future Considerations

- [ ] i18n (internationalization)
- [ ] Accessibility (ARIA, screen readers)
- [ ] Themes and customization
- [ ] Plugin system
- [ ] AI-powered features
  - [ ] Message summarization
  - [ ] Smart task suggestions
  - [ ] Auto-moderation
- [ ] Calendar integration
- [ ] Email notifications
- [ ] Mobile apps for iOS and Android
- [ ] Progressive Web App (PWA)
- [ ] Self-hosted option

---

## �📞 Support

- 📧 Email: contato@eclipsiasoftware.com
- 🐙 GitHub Issues: [Issues](https://github.com/DannyahIA/nexus/issues)

---

**Made with ❤️ by [Dannyah](https://github.com/DannyahIA)**

Last updated: November 14, 2025
