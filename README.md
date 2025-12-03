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
- 📋 **Kanban Boards** - Complete task management system with priorities
- 👥 **Real-Time Presence** - See who’s online/offline
- 🔐 **Secure Authentication** - JWT with input validation and discriminators
- ⚡ **Performance** - Optimized queries, connection pooling, rate limiting
- 🌍 **Distributed** - Cassandra with multi-DC replication
- 📱 **Mobile-First** - React Native ready architecture
- 🔄 **Real-Time Sync** - NATS JetStream for event streaming
- 🛡️ **Enterprise Ready** - Kubernetes, monitoring, security headers
- 🚀 **Production Ready** - Multi-stage Docker builds, health checks, auto-scaling

## 🆕 Recent Major Improvements

### 🎥 **WebRTC SFU Implementation** ✅ **NEW**
- **Selective Forwarding Unit**: Scalable video conferencing server using Pion WebRTC
- **Room-based Architecture**: Multiple concurrent rooms with automatic cleanup
- **Real-time Signaling**: WebSocket-based offer/answer/ICE candidate exchange
- **Multi-codec Support**: VP8, H264 (video), Opus (audio) with automatic negotiation
- **Production Ready**: Docker containerized with UDP port mapping
- **Auto-recovery**: Connection failure detection and automatic reconnection

### 🔒 **Security Enhancements** ✅
- **Rate Limiting**: 100 req/s with configurable limits
- **Input Validation**: Email, username, password strength validation
- **Security Headers**: XSS, CSRF, clickjacking protection
- **Panic Recovery**: Graceful error handling with logging
- **Input Sanitization**: Protection against injection attacks

### 📊 **Database Optimization** ✅
- **Connection Pooling**: Optimized Cassandra connections with timeouts
- **Query Optimization**: Eliminated ALLOW FILTERING queries
- **Index Strategy**: New users_by_username_discriminator table
- **Migration Scripts**: Automated database migration tools

### 🐳 **Infrastructure Modernization** ✅
- **Multi-stage Docker Builds**: 70% smaller images with compression
- **Kubernetes Ready**: Complete K8s manifests with auto-scaling
- **Production Configuration**: Optimized docker-compose for production
- **Monitoring Stack**: Prometheus + Grafana with alerting
- **Network Security**: Policies and RBAC configuration

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
   │            Go Microservices (1.23)                 │
   ├────────────────┬──────────────┬────────────────────┤
   │  REST API      │  WebSocket   │    WebRTC SFU      │
   │  (Port 8000)   │  Server      │    Media Server    │
   │                │  (Port 8080) │    (Port 8083)     │
   └────────────────────────────────────────────────────┘
        ↕                  ↕                ↕
   ┌─────────────────────────────────────────────────┐
   │ NATS JetStream │   Cassandra  │     Redis       │
   │ (Event Bus)    │   (Primary)  │   (Cache)       │
   └─────────────────────────────────────────────────┘
                                    ↕
        ┌──────────────────────────────────────┐
        │          TURN Server                 │
        │       (NAT Traversal)                │
        │        Port 3478                     │
        └──────────────────────────────────────┘
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
- **Production Deployment**: Kubernetes with Helm charts
- **Databases**: Cassandra 4.1, Redis 7
- **Message Broker**: NATS JetStream
- **TURN Server**: coturn (for WebRTC)
- **Monitoring**: Prometheus + Grafana
- **Orchestration**: Kubernetes with auto-scaling and health checks
- **Security**: Network policies, RBAC, SSL/TLS termination

## 🎥 WebRTC SFU Architecture

### SFU Server Implementation
Our **Selective Forwarding Unit (SFU)** provides scalable video conferencing capabilities:

```
┌─────────────────────────────────────────────────────────┐
│                  SFU Media Server                       │
│                 (Go + Pion WebRTC)                      │
├─────────────────────────────────────────────────────────┤
│  📡 WebSocket Signaling  │  🎬 Media Processing        │
│  • offer/answer         │  • RTP packet forwarding    │
│  • ICE candidates       │  • VP8/H264/Opus codecs     │
│  • Room management      │  • Bandwidth adaptation     │
└─────────────────────────────────────────────────────────┘
               ↕ WebSocket (Port 8083)
┌─────────────────────────────────────────────────────────┐
│                   Client Peers                          │
│  👤 User A ←→ 👤 User B ←→ 👤 User C ←→ 👤 User D       │
│       ↑              ↑              ↑              ↑    │
│   Camera/Mic     Camera/Mic     Camera/Mic     Camera/Mic│
└─────────────────────────────────────────────────────────┘
```

### Key Features
- **🏠 Room-based Architecture**: Multiple concurrent rooms with isolated peer management
- **🔄 Real-time Forwarding**: Direct RTP packet forwarding without transcoding
- **🎯 Selective Forwarding**: Each client receives only the streams they need
- **📡 WebSocket Signaling**: Real-time negotiation of offers, answers, and ICE candidates
- **🎥 Multi-codec Support**: VP8, H264 for video; Opus for audio
- **⚡ Auto-recovery**: Automatic reconnection on connection failures
- **🐳 Production Ready**: Dockerized with proper port mapping and health checks

### Usage Example

```typescript
// Frontend Integration
import { sfuWebRTCService } from './services/sfuWebrtc'

// Join a room
await sfuWebRTCService.joinRoom('room-123', 'user-456')

// Toggle video/audio
const videoEnabled = await sfuWebRTCService.toggleVideo()
const audioEnabled = await sfuWebRTCService.toggleAudio()

// Listen for remote streams
sfuWebRTCService.on('remote-stream', ({ streamId, stream }) => {
  document.getElementById('remote-video').srcObject = stream
})

// Leave room
sfuWebRTCService.leaveRoom()
```

### Environment Configuration

```bash
# Frontend (.env)
VITE_SFU_WS_URL=ws://localhost:8083/ws

# Docker Compose
services:
  media:
    ports:
      - "8083:8083"                    # WebSocket signaling
      - "55000-55100:50000-50100/udp"  # RTP media ports
```

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

## 🎥 WebRTC Voice & Video

### Features

Nexus includes a robust WebRTC implementation with enterprise-grade stability features:

- **Automatic Reconnection**: Exponential backoff reconnection on connection failures
- **State Synchronization**: Ensures video/audio state consistency across all peers
- **Background Mode**: Maintains connections when browser tab is not in focus
- **TURN Fallback**: Automatically falls back to TURN relay when P2P fails
- **Health Monitoring**: Real-time connection quality monitoring and diagnostics
- **Error Recovery**: Comprehensive error handling with automatic recovery
- **Connection Quality**: Visual indicators for connection quality
- **Diagnostic Tools**: Built-in health checks and diagnostic reporting

### Configuration

WebRTC requires proper configuration for reliable connections:

```bash
# Frontend (.env)
VITE_TURN_URL=turn:your-turn-server.com:3478
VITE_TURN_USERNAME=username
VITE_TURN_PASSWORD=password

# Backend (.env)
TURN_URL=turn:your-turn-server.com:3478
TURN_USER=username
TURN_PASS=password
```

**Note**: TURN server is highly recommended for production. Without it, connections may fail behind NAT/firewalls.

### Troubleshooting WebRTC

#### Camera Not Activating
- Check browser permissions for camera/microphone
- Ensure no other application is using the camera
- Try refreshing the page
- Check browser console for specific error messages

#### Connection Failures
- Verify TURN server is configured and accessible
- Check firewall settings
- Ensure WebSocket connection is stable
- Use the built-in health check to diagnose issues

#### Video State Inconsistencies
- The system automatically synchronizes state across peers
- If issues persist, try leaving and rejoining the channel
- Check the diagnostic report for detailed information

#### Background Mode Issues
- Ensure browser supports Page Visibility API (all modern browsers)
- Check browser settings for background tab throttling
- Some browsers may limit background media on mobile

For more details, see [WebRTC Troubleshooting Guide](#webrtc-troubleshooting-guide).

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

### Kubernetes (Production Ready)

```bash
# Deploy complete infrastructure
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n nexus

# Access services
kubectl port-forward svc/nexus-api 8000:8000 -n nexus
kubectl port-forward svc/grafana 3000:3000 -n nexus
```

**Features:**
- ✅ Complete Kubernetes manifests in `/k8s/` directory
- ✅ Auto-scaling with HPA (Horizontal Pod Autoscaler)
- ✅ Ingress with SSL/TLS termination
- ✅ Network policies for security
- ✅ Prometheus + Grafana monitoring stack
- ✅ Persistent storage for databases
- ✅ Health checks and rolling updates
- ✅ Production-ready resource limits

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

## 🔧 WebRTC Troubleshooting Guide

### Common Issues and Solutions

#### 1. Camera/Microphone Not Working

**Symptoms:**
- Camera doesn't activate when joining voice channel
- "Permission denied" errors
- Black video tile

**Solutions:**
1. **Check Browser Permissions**
   - Click the lock icon in the address bar
   - Ensure camera and microphone are allowed
   - Reload the page after granting permissions

2. **Check Device Availability**
   - Ensure no other application is using the camera
   - Try closing other browser tabs using media
   - Restart the browser if needed

3. **Verify Device Selection**
   - Check browser settings for default devices
   - Try selecting a different camera/microphone
   - Test devices in browser settings first

#### 2. Connection Failures

**Symptoms:**
- "Connection failed" errors
- Unable to see/hear other users
- Frequent disconnections

**Solutions:**
1. **Verify TURN Configuration**
   ```bash
   # Check frontend .env
   VITE_TURN_URL=turn:your-server.com:3478
   VITE_TURN_USERNAME=username
   VITE_TURN_PASSWORD=password
   ```
   - Ensure TURN server is running and accessible
   - Test TURN server connectivity: `telnet your-server.com 3478`

2. **Check Network/Firewall**
   - Ensure UDP ports are not blocked
   - Check corporate firewall settings
   - Try from a different network to isolate the issue

3. **WebSocket Connection**
   - Verify WebSocket is connected (check browser console)
   - Ensure backend WebSocket server is running
   - Check for CORS issues in network tab

4. **Use Diagnostic Tools**
   - Open browser console and look for WebRTC errors
   - Use the built-in health check feature
   - Export diagnostic report for detailed analysis

#### 3. Video State Inconsistencies

**Symptoms:**
- Video appears enabled but not transmitting
- Other users can't see your video
- Video toggle doesn't work

**Solutions:**
1. **Automatic Synchronization**
   - The system automatically detects and fixes state inconsistencies
   - Wait a few seconds for automatic synchronization

2. **Manual Recovery**
   - Toggle video off and on again
   - Leave and rejoin the voice channel
   - Refresh the page as a last resort

3. **Check Logs**
   - Open browser console
   - Look for "state synchronization" messages
   - Check for sender/receiver errors

#### 4. Background Mode Issues

**Symptoms:**
- Connection drops when switching tabs
- Audio/video stops in background
- Reconnection when returning to tab

**Solutions:**
1. **Browser Support**
   - Ensure you're using a modern browser (Chrome 88+, Firefox 85+, Safari 14+)
   - Update browser to the latest version

2. **Browser Settings**
   - Check for aggressive power saving settings
   - Disable "background tab throttling" if available
   - On mobile, ensure app has background permissions

3. **Expected Behavior**
   - Audio should continue in background
   - Video should continue if enabled
   - No reconnection should occur when returning to tab

#### 5. Poor Connection Quality

**Symptoms:**
- Choppy audio/video
- High latency
- Frequent freezing

**Solutions:**
1. **Check Network Quality**
   - Run a speed test
   - Ensure stable internet connection
   - Close bandwidth-heavy applications

2. **Connection Quality Indicator**
   - Check the connection quality indicator in the UI
   - Green = Good, Yellow = Fair, Red = Poor
   - Poor quality triggers automatic adaptation

3. **TURN vs P2P**
   - P2P connections are faster but may fail behind NAT
   - TURN relay is slower but more reliable
   - System automatically falls back to TURN when needed

#### 6. Reconnection Issues

**Symptoms:**
- Frequent reconnection attempts
- "Reconnecting..." messages
- Unable to reconnect after disconnect

**Solutions:**
1. **Automatic Reconnection**
   - System uses exponential backoff (1s, 2s, 4s delays)
   - Maximum 3 automatic attempts
   - Check browser console for reconnection logs

2. **Manual Reconnection**
   - Leave and rejoin the voice channel
   - Refresh the page
   - Check WebSocket connection status

3. **Persistent Issues**
   - Check backend server logs
   - Verify backend services are running
   - Check database connectivity

### Diagnostic Tools

#### Health Check
Access the health check feature to diagnose connection issues:
1. Open browser developer console
2. Run: `webrtcService.performHealthCheck()`
3. Review the diagnostic information

#### Diagnostic Report
Export a detailed diagnostic report:
1. Open browser developer console
2. Run: `webrtcService.exportDiagnosticReport()`
3. Share the report with support for analysis

#### Connection Statistics
View real-time connection statistics:
1. Check the connection quality indicator in the UI
2. Open browser console for detailed metrics
3. Look for ICE candidate types and connection states

### Browser Compatibility

| Browser | Version | Support | Notes              |
|---------|---------|---------|--------------------|
| Chrome  |   88+   | ✅ Full | Recommended        |
| Firefox |   85+   | ✅ Full | Recommended        |
| Safari  |   14+   | ✅ Full | Some quirks on iOS |
| Edge    |   88+   | ✅ Full | Chromium-based     |
| Opera   |   74+   | ✅ Full | Chromium-based     |

### Getting Help

If you continue to experience issues:

1. **Check Browser Console**
   - Open Developer Tools (F12)
   - Look for errors in Console tab
   - Check Network tab for failed requests

2. **Export Diagnostic Report**
   - Use the diagnostic tools mentioned above
   - Include the report when reporting issues

3. **Report Issues**
   - GitHub Issues: Include diagnostic report and browser info
   - Email Support: contato@eclipsiasoftware.com
   - Include steps to reproduce the issue

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
- [x] Production-ready Docker images with multi-stage builds
- [x] Health check endpoints
- [x] Structured logging with Zap
- [x] **Security Middleware** - Rate limiting, panic recovery, security headers
- [x] **Input Validation** - Email, username, password validation and sanitization
- [x] **Database Optimization** - Connection pooling, timeouts, optimized queries
- [x] **Kubernetes Infrastructure** - Complete K8s manifests for production deployment
- [x] **Monitoring Stack** - Prometheus and Grafana with alerting

#### Authentication & Users
- [x] JWT authentication with refresh tokens
- [x] User registration and login with input validation
- [x] Password hashing with bcrypt
- [x] **Username Discriminator System** - Discord-style username#1234 system
- [x] User profile management (display name, avatar, bio)
- [x] User presence tracking (online/offline)
- [x] **Security Validation** - Strong password policies, email validation, username format validation
- [x] **Input Sanitization** - Protection against XSS and injection attacks

#### Messaging
- [x] Real-time messaging via WebSocket
- [x] Message persistence in Cassandra
- [x] Message history with pagination
- [x] Message editing and deletion
- [x] Message grouping by user and time
- [x] Date separators in chat
- [x] Message context menu (edit, delete, reply)
- [x] Infinite scroll with load more
- [x] Fixed duplicate message display bug
- [x] Optimistic UI updates

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

#### Voice & Video
- [x] WebRTC service implementation
- [x] Peer-to-peer connection setup
- [x] ICE candidate exchange
- [x] Offer/Answer signaling via WebSocket
- [x] Local media stream capture (audio/video)
- [x] Remote stream handling
- [x] Mute/unmute microphone
- [x] Enable/disable video
- [x] Screen sharing support
- [x] STUN server integration
- [x] **Voice Activity Detection (VAD)** - Real-time voice activity monitoring
- [x] **Active Speaker Detection** - Automatic detection of active speakers
- [x] **Voice User Management** - Join/leave voice channels with user tracking
- [x] **WebRTC Stability Improvements**
  - [x] Automatic reconnection with exponential backoff
  - [x] State synchronization across peers
  - [x] Background mode support (Page Visibility API)
  - [x] TURN fallback for NAT traversal
  - [x] Connection health monitoring
  - [x] Comprehensive error handling and recovery
  - [x] Video state consistency management
  - [x] Cleanup on disconnect
  - [x] WebSocket reconnection handling
  - [x] Connection quality indicators
  - [x] Diagnostic reporting and health checks

#### Friends & Direct Messages
- [x] Friend request system
- [x] Friend list management
- [x] Accept/decline friend requests
- [x] Direct message channels (DMs)
- [x] Friend online status
- [x] DM channel creation
- [x] Automatic DM creation on friend accept
- [x] Friend list with online/offline status
- [x] DM header with user avatar and status

#### Server Management
- [x] Server settings
- [x] Server invites
  - [x] Invite code generation (8-character codes)
  - [x] Invite link sharing
  - [x] Join server via invite code
  - [x] Invite modal with copy-to-clipboard
  - [x] Invite button in chat header

#### Task Management (Kanban) - **IMPLEMENTED**
- [x] **Task Board Visualization** - Complete Kanban board with columns
- [x] **Task CRUD Operations** - Create, read, update, delete tasks
- [x] **Task Status Management** - Todo, In Progress, Done columns
- [x] **Task Priorities** - High, Medium, Low priority system
- [x] **Task Assignment** - Assign tasks to users
- [x] **Task Persistence** - Cassandra database storage with positioning
- [x] **Real-time Task Updates** - Live updates across clients
- [x] **Task UI Components** - Full responsive task board interface

### 🚧 In Progress

#### Voice & Video
- [ ] Voice channels UI improvements
- [ ] WebRTC SFU implementation with Pion
- [ ] Audio/video quality controls
- [ ] Push-to-talk
- [ ] Noise suppression
- [ ] Echo cancellation
- [ ] Adaptive bitrate streaming
- [ ] Simulcast support

#### Task Management (Kanban) - **ADVANCED FEATURES**
- [ ] **Drag-and-drop task reordering** - Visual task reordering within columns
- [ ] Task dependencies
  - [ ] Blocking tasks
  - [ ] Blocked by relationships
  - [ ] Parent-child task hierarchy
  - [ ] Task chains
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
- [ ] Block/unblock users
- [ ] Group DMs
- [ ] Friend activity status
- [ ] Friend nicknames

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
- [x] Server invites
  - [ ] Invite expiration
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
- [x] **Database Query Optimization** - Optimized Cassandra queries, removed ALLOW FILTERING
- [x] **Connection Pooling** - Optimized database connection management
- [x] **Horizontal Scaling Support** - Kubernetes HPA and stateless design
- [x] **Rate Limiting** - Implemented across all services
- [x] **Compression** - Docker image compression with UPX
- [x] **Multi-stage Builds** - Optimized Docker images for production
- [ ] Message virtualization for long chats
- [ ] Lazy loading of images
- [ ] Service worker for offline support
- [ ] CDN for static assets

#### Mobile Enhancements
- [ ] Native mobile UI components
- [ ] Gesture controls
- [ ] Haptic feedback
- [ ] Background audio for voice
- [ ] Picture-in-Picture for video
- [ ] Mobile notifications
- [ ] Deep linking

#### Analytics & Monitoring
- [x] **Prometheus Metrics** - Complete metrics collection for all services
- [x] **Grafana Dashboards** - Pre-configured monitoring dashboards
- [x] **Performance Monitoring** - Real-time performance tracking
- [x] **Error Tracking** - Comprehensive error logging and alerting
- [x] **Health Check Monitoring** - Service health monitoring with alerts
- [x] **Resource Monitoring** - CPU, memory, network monitoring
- [ ] User analytics
- [ ] Server statistics
- [ ] Message metrics
- [ ] Distributed tracing with Jaeger

#### Security
- [x] **Password Strength Requirements** - Strong password policies enforced
- [x] **Rate Limiting** - Global and per-user rate limiting implemented
- [x] **Security Headers** - XSS, CSRF, clickjacking protection
- [x] **Input Validation & Sanitization** - Protection against injection attacks
- [x] **JWT Security** - Secure token handling and validation
- [x] **Security Audit Logs** - Request logging and monitoring
- [ ] End-to-end encryption (optional)
- [ ] Two-factor authentication (2FA)
- [ ] Account recovery
- [ ] Session management
- [ ] IP whitelisting
- [ ] CAPTCHA for registration

#### Developer Experience
- [x] **Testing Suite** - Unit tests for authentication and core features
- [x] **Build Automation** - Makefile with common development tasks
- [x] **Environment Configuration** - Comprehensive env validation
- [x] **Development Tools** - Hot reload, logging, debugging
- [ ] API documentation with Swagger
- [ ] GraphQL API
- [ ] SDK for third-party developers
- [ ] CLI tools
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

Last updated: November 18, 2025
