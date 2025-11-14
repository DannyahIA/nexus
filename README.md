# 🚀 Nexus - Discord + Linear Fusion Platform

[![Go](https://img.shields.io/badge/Go-1.22-blue)](https://golang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2-blue)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-blue)](https://vitejs.dev/)
[![WebRTC](https://img.shields.io/badge/WebRTC-Pion-blue)](https://github.com/pion/webrtc)
[![Docker](https://img.shields.io/badge/Docker-latest-blue)](https://www.docker.com/)
[![Cassandra](https://img.shields.io/badge/Cassandra-4.1-blue)](https://cassandra.apache.org/)
[![NATS](https://img.shields.io/badge/NATS-JetStream-blue)](https://nats.io/)
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
│              Frontend Clients                            │
│   Web (React+Vite) | Desktop (Electron) | Mobile (RN)    │
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
   │  (Port 8000)   │  Server      │    Media Server    │
   │                │  (Port 8080) │    (Port 7880)     │
   └────────────────────────────────────────────────────┘
        ↕                  ↕                ↕
   ┌─────────────────────────────────────────────────┐
   │ NATS JetStream │   Cassandra  │     Redis       │
   │ (Event Bus)    │   (Primary)  │   (Cache)       │
   └─────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ and pnpm
- **Go** 1.22+
- **Docker** & Docker Compose

### Installation

```bash
# Clone the repository
git clone https://github.com/DannyahIA/nexus.git
cd nexus

# Start infrastructure (Cassandra, NATS, Redis, TURN)
docker-compose up -d

# Backend Setup
cd backend
cp .env.example .env
go mod download
go run cmd/api/main.go

# In another terminal - WebSocket Server
cd backend
go run cmd/ws/main.go

# In another terminal - Web Frontend
cd frontend-web
pnpm install
pnpm dev

# Optional: Desktop App
cd frontend-desktop
npm install
npm start
```

### Access the Application

- **Web App**: http://localhost:5173
- **API**: http://localhost:8000
- **WebSocket**: ws://localhost:8080
- **Desktop**: Launch Electron app

## 📁 Project Structure

```
nexus/
├── backend/                    # Go Backend Services
│   ├── cmd/
│   │   ├── api/               # REST API Server (Port 8000)
│   │   ├── ws/                # WebSocket Server (Port 8080)
│   │   └── media/             # WebRTC SFU Media Server (Port 7880)
│   ├── internal/
│   │   ├── cache/             # In-memory cache (memory.go)
│   │   ├── database/          # Cassandra client & queries
│   │   │   ├── cassandra.go
│   │   │   └── groups_friends.go
│   │   ├── handlers/          # HTTP/WebSocket handlers
│   │   │   ├── auth.go        # Authentication & JWT
│   │   │   ├── channels.go    # Channel management
│   │   │   ├── friends.go     # Friends system
│   │   │   ├── groups.go      # Groups/DMs
│   │   │   ├── messages.go    # Messaging logic
│   │   │   ├── servers.go     # Server management
│   │   │   └── tasks.go       # Task/Kanban system
│   │   ├── models/            # Data structures
│   │   │   └── types.go
│   │   └── services/          # Business logic
│   │       └── nats_services.go
│   ├── go.mod
│   ├── go.sum
│   └── Dockerfile
│
├── frontend-web/               # React Web App
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   │   ├── ChannelContextMenu.tsx
│   │   │   ├── ChannelList.tsx
│   │   │   ├── CreateChannelModal.tsx
│   │   │   ├── CreateServerModal.tsx
│   │   │   ├── MessageContextMenu.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── ServerContextMenu.tsx
│   │   │   ├── ServerSidebar.tsx
│   │   │   ├── TestMessage.tsx
│   │   │   └── VirtualizedMessageList.tsx
│   │   ├── hooks/             # Custom React hooks
│   │   │   ├── useInfiniteMessages.ts
│   │   │   └── useVirtualizedMessages.ts
│   │   ├── screens/           # Main views
│   │   │   ├── ChatScreen.tsx
│   │   │   ├── HomeScreen.tsx
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── MainLayout.tsx
│   │   │   ├── RegisterScreen.tsx
│   │   │   └── TasksScreen.tsx
│   │   ├── services/          # API & WebSocket clients
│   │   │   ├── api.ts
│   │   │   └── websocket.ts
│   │   ├── store/             # State management (Zustand)
│   │   │   ├── authStore.ts
│   │   │   ├── chatStore.ts
│   │   │   ├── friendsStore.ts
│   │   │   ├── serverStore.ts
│   │   │   └── taskStore.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── frontend-desktop/           # Electron Desktop App
│   ├── main.js                # Electron main process
│   ├── preload.js             # Preload scripts
│   ├── package.json
│   └── README.md
│
├── infrastructure/             # Infrastructure as Code
│   ├── cassandra/
│   │   ├── init.cql           # Initial schema
│   │   └── migration.cql      # Schema migrations
│   └── turn/
│       └── turnserver.conf    # TURN server config
│
├── docker-compose.yml          # Development environment
├── Makefile                    # Build automation
└── README.md
```

## 🔧 Tech Stack

### Backend
- **Language**: Go 1.22
- **Web Framework**: net/http (standard library)
- **Protocols**: WebSocket, HTTP/REST
- **Message Queue**: NATS JetStream
- **Database**: Apache Cassandra 4.1
- **Cache**: Redis + In-memory cache
- **WebRTC**: Pion SFU (in progress)
- **Logging**: Standard log package
- **Authentication**: JWT with bcrypt

### Frontend (Web)
- **Framework**: React 18.2
- **Build Tool**: Vite 5.0
- **Language**: TypeScript 5.3
- **Styling**: TailwindCSS
- **State Management**: Zustand
- **HTTP Client**: Axios
- **Virtualization**: react-window
- **WebSocket**: Native WebSocket API

### Frontend (Desktop)
- **Framework**: Electron
- **Renderer**: React (shared with web)

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Databases**: Cassandra 4.1, Redis
- **Message Broker**: NATS JetStream
- **TURN Server**: coturn (for WebRTC)
- **Orchestration**: Docker Compose (Kubernetes ready)

## 📚 Documentation

- [API Reference](./docs/API.md) - REST and WebSocket endpoints *(coming soon)*
- [Architecture](./docs/ARCHITECTURE.md) - Design patterns and decisions *(coming soon)*
- [Contributing](./docs/CONTRIBUTING.md) - How to contribute *(coming soon)*
- [Docker Guide](./DOCKER-GUIDE.md) - Docker setup and troubleshooting
- [Implementation Guide](./IMPLEMENTATION-GROUPS-FRIENDS.md) - Groups & Friends implementation
- [Roadmap](./ROADMAP-FEATURES.md) - Feature planning and progress

## 🗄️ Database Schema

### Cassandra Tables (CQL)

```sql
-- Users
CREATE TABLE users (
    user_id uuid PRIMARY KEY,
    username text,
    email text,
    password_hash text,
    created_at timestamp
);

-- Servers (Groups)
CREATE TABLE servers (
    server_id uuid PRIMARY KEY,
    name text,
    owner_id uuid,
    created_at timestamp
);

-- Channels
CREATE TABLE channels (
    channel_id uuid PRIMARY KEY,
    server_id uuid,
    name text,
    type text,
    created_at timestamp
);

-- Messages (Time-series partitioning)
CREATE TABLE messages_by_channel (
    channel_id uuid,
    bucket text,
    message_id uuid,
    author_id uuid,
    content text,
    created_at timestamp,
    updated_at timestamp,
    PRIMARY KEY ((channel_id, bucket), created_at, message_id)
) WITH CLUSTERING ORDER BY (created_at DESC, message_id DESC);

-- Tasks (Kanban)
CREATE TABLE tasks (
    task_id uuid PRIMARY KEY,
    channel_id uuid,
    title text,
    description text,
    status text,
    assignee_id uuid,
    created_at timestamp
);

-- User Presence
CREATE TABLE user_presence (
    user_id uuid PRIMARY KEY,
    status text,
    last_seen timestamp
);
```

See [`infrastructure/cassandra/init.cql`](./infrastructure/cassandra/init.cql) for the complete schema.

## 🔐 Authentication

### Register

```http
POST /register
Content-Type: application/json

{
  "username": "john_doe",
  "email": "user@example.com",
  "password": "secure_password"
}

Response: 201 Created
{
  "message": "User registered successfully",
  "user_id": "uuid-here"
}
```

### Login

```http
POST /login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password"
}

Response: 200 OK
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user_id": "uuid-here",
  "username": "john_doe"
}
```

Use the `token` in the `Authorization: Bearer <token>` header for authenticated requests.

## 🌐 WebSocket API

### Connection

```typescript
// Connect to WebSocket server
const ws = new WebSocket('ws://localhost:8080/ws?user_id=USER_ID');

ws.onopen = () => {
  console.log('Connected to WebSocket');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

### Message Types

#### Send Message
```json
{
  "type": "message",
  "channel_id": "uuid-here",
  "content": "Hello world!",
  "user_id": "uuid-here"
}
```

#### Receive Message
```json
{
  "type": "message",
  "message_id": "uuid-here",
  "channel_id": "uuid-here",
  "author_id": "uuid-here",
  "username": "john_doe",
  "content": "Hello world!",
  "created_at": "2025-11-14T10:30:00Z"
}
```

#### Update Presence
```json
{
  "type": "presence",
  "user_id": "uuid-here",
  "status": "online"
}
```

#### Task Update (Coming Soon)
```json
{
  "type": "task_update",
  "task_id": "uuid-here",
  "status": "in_progress"
}
```

## 📊 Performance Goals

### Frontend (Web)
- ✅ **60 fps scrolling** - Smooth message list virtualization
- ✅ **Fast initial load** - Vite optimized build
- ✅ **Efficient rendering** - React memoization and optimization
- 🚧 **Lazy loading** - Code splitting and dynamic imports
- 🚧 **Service Worker** - Offline support and caching

### Backend
- ✅ **Low latency** - Direct WebSocket connections
- ✅ **Efficient queries** - Cassandra time-series partitioning
- ✅ **Connection pooling** - Optimized database connections
- 🚧 **Horizontal scaling** - Stateless services
- 🚧 **Load balancing** - Multiple service instances

### Database
- ✅ **Time-series optimization** - Bucketed message storage
- ✅ **Efficient pagination** - Cursor-based queries
- 🚧 **Multi-datacenter** - Cassandra replication
- 🚧 **Read replicas** - Load distribution

## 🚢 Deployment

### Development (Docker Compose)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Rebuild services
docker-compose up -d --build
```

### Production

```bash
# Build optimized binaries
cd backend
CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/api ./cmd/api
CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/ws ./cmd/ws

# Build frontend
cd frontend-web
pnpm build

# Deploy with Docker
docker build -t nexus-api ./backend
docker build -t nexus-web ./frontend-web
```

### Kubernetes (Coming Soon)

```bash
kubectl apply -f k8s/
kubectl port-forward svc/nexus-api 8000:8000
```

## 📈 Monitoring & Debugging

### Logs
```bash
# Backend API logs
docker logs nexus-api-1

# WebSocket server logs
docker logs nexus-ws-1

# Cassandra logs
docker logs nexus-cassandra-1

# NATS logs
docker logs nexus-nats-1
```

### Health Checks
```bash
# API health
curl http://localhost:8000/health

# WebSocket health
curl http://localhost:8080/health
```

### Database Access
```bash
# Access Cassandra CQL shell
docker exec -it nexus-cassandra-1 cqlsh

# Query messages
USE nexus;
SELECT * FROM messages_by_channel LIMIT 10;
```

### Development Tools
- **Network Diagnostics**: `./diagnose-network.sh`
- **Setup Network**: `./setup-network.sh`
- **Switch Mode**: `./switch-mode.sh`
- **Verify Setup**: `python verify.py`

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

```bash
# 1. Fork the repository

# 2. Create a feature branch
git checkout -b feature/awesome-feature

# 3. Make your changes and commit
git add .
git commit -m 'feat: add awesome feature'

# 4. Push to your fork
git push origin feature/awesome-feature

# 5. Open a Pull Request
```

### Commit Convention
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding tests
- `chore:` Maintenance tasks

## 📄 License

MIT © 2025 Nexus

## 🙏 Acknowledgments

- **Discord** - UI/UX inspiration for chat interface
- **Linear** - Task management and keyboard shortcuts inspiration
- **Pion** - WebRTC implementation in Go
- **Apache Cassandra** - Distributed database architecture
- **NATS** - High-performance messaging system
- **React** & **Vite** - Modern frontend tooling

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
