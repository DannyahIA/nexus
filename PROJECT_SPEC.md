# 🚀 NEXUS - Especificação Completa do Projeto

## 📋 Visão Geral
**Nexus** é uma plataforma de fusão Discord + Linear com comunicação em tempo real, gerenciamento de tarefas e colaboração integrada.

---

## 🏗️ Stack Técnico

### Backend
- **Linguagem**: Go 1.22
- **Protocolos**: gRPC, WebSockets, NATS JetStream
- **Server Web**: Gorilla WebSocket
- **Serialização**: Protocol Buffers (protobuf)

### Frontend
- **Framework**: React-Native 0.74
- **Linguagem**: TypeScript
- **Engine JS**: Hermes
- **Animações**: Reanimated 3
- **Listas**: FlashList
- **Estado**: Legend-State + MMKV
- **WebRTC**: react-native-webrtc

### Database
- **Primária**: Apache Cassandra (replicação em 3 DCs)
- **Opcional**: PostgreSQL (billing)

### Mídia em Tempo Real
- **WebRTC**: Pion SFU (v3.2.24)
- **TURN**: coturn
- **Porta UDP**: 7880

---

## 📦 Dependências Fixadas

### Go
```
github.com/gorilla/websocket v1.5.1
github.com/nats-io/nats.go v1.31.0
github.com/pion/webrtc/v3 v3.2.24
google.golang.org/protobuf v1.31.0
```

### React-Native
```
"react-native": "0.74.1"
"react-native-reanimated": "3.8.0"
"@shopify/flash-list": "1.6.4"
"legend-state": "2.1.14"
"react-native-webrtc": "111.0.3"
```

---

## 🗄️ Schema Cassandra

### Keyspace
```sql
CREATE KEYSPACE nexus WITH replication = {'class':'NetworkTopologyStrategy','dc1':3};
```

### Tables
1. **messages_by_channel** - Mensagens em tempo real
2. **tasks_by_channel** - Kanban/tarefas
3. **user_presence** - Status de usuários online

### Tables PostgreSQL (Opcional)
- **billing** - Planos e pagamentos

---

## 📁 Estrutura de Pastas (Planejada)

```
nexus/
├── backend/
│   ├── cmd/
│   │   ├── api/          # Serviço principal
│   │   ├── ws/           # WebSocket server
│   │   └── media/        # Media/SFU server
│   ├── internal/
│   │   ├── handlers/     # HTTP/gRPC handlers
│   │   ├── services/     # Lógica de negócio
│   │   ├── models/       # Structs
│   │   ├── database/     # Cassandra/PostgreSQL
│   │   └── cache/        # Redis/em-memória
│   ├── pb/               # Protocol Buffers
│   ├── go.mod
│   ├── go.sum
│   └── Dockerfile
│
├── frontend/
│   ├── app/
│   │   ├── screens/      # Telas principais
│   │   ├── components/   # Componentes reutilizáveis
│   │   ├── hooks/        # Custom hooks
│   │   ├── store/        # Legend-State
│   │   └── services/     # API clients
│   ├── app.json          # Config Expo
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── infrastructure/
│   ├── cassandra/        # Docker Compose + init scripts
│   ├── nats/             # NATS config
│   ├── turn/             # coturn config
│   └── docker-compose.yml
│
├── docs/
│   ├── API.md            # Documentação API
│   ├── SETUP.md          # Setup local
│   └── DEPLOYMENT.md     # Deploy em produção
│
├── .env.example
├── PROJECT_SPEC.md       # Este arquivo
└── README.md
```

---

## 🎯 Objetivos Principais

### Fase 1: Core Backend
- [ ] Setup Go project + modules
- [ ] Cassandra client + migrations
- [ ] gRPC service definitions
- [ ] WebSocket server
- [ ] Autenticação JWT

### Fase 2: Real-time Features
- [ ] NATS JetStream integration
- [ ] Message streaming
- [ ] Presence tracking
- [ ] Task synchronization

### Fase 3: Media Layer
- [ ] Pion WebRTC SFU
- [ ] Voice channels
- [ ] Video conference
- [ ] Screen sharing

### Fase 4: Frontend
- [ ] Scaffolding React-Native
- [ ] Navigation
- [ ] Message list (FlashList)
- [ ] Task boards (Kanban)
- [ ] Voice/video UI

### Fase 5: Deployment
- [ ] Docker images
- [ ] Kubernetes manifests
- [ ] CI/CD pipeline
- [ ] Monitoring/Logging

---

## ⚡ Restrições de Performance

- **60 fps UI**: < 1ms JS, < 2ms UI thread
- **Zero-copy**: Go buffers
- **JSI**: React-Native performance
- **Cache agressivo**: Legend-State + MMKV
- **Estruturas ultra-flat**: sem nesting profundo

---

## 🌐 Variáveis de Ambiente (.env)

```env
# Cassandra
CASS_HOSTS=127.0.0.1
CASS_PORT=9042
CASS_KEYSPACE=nexus

# NATS
NATS_URL=nats://127.0.0.1:4222

# WebSocket
WS_PORT=8080
WS_READ_DEADLINE=15s
WS_WRITE_DEADLINE=15s

# Media/SFU
SFU_UDP_PORT=7880
SFU_TCP_PORT=7881

# TURN
TURN_URL=turn:turn.nexus.local:3478
TURN_USER=nexus
TURN_PASS=secret

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRY=24h

# PostgreSQL (opcional)
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=nexus_billing
PG_USER=nexus
PG_PASSWORD=secret
```

---

## 🔧 Comandos Build & Run

### Backend Go
```bash
go mod tidy
CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/nexus-api ./cmd/api
CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/nexus-ws ./cmd/ws
CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/nexus-media ./cmd/media
```

### Frontend React-Native
```bash
pnpm install
npx expo prebuild
npx expo run:ios
npx expo run:android
```

### Docker
```bash
docker-compose up -d
```

---

## 📊 Checklist de Implementação

- [ ] Projeto Go inicializado
- [ ] Projeto React-Native inicializado
- [ ] Docker Compose com Cassandra, NATS, coturn
- [ ] Modelos de dados (protobuf)
- [ ] Serviços de banco de dados
- [ ] Autenticação e autorização
- [ ] WebSocket handler
- [ ] Message service
- [ ] Task management service
- [ ] Voice/video service (Pion)
- [ ] Frontend: navegação
- [ ] Frontend: chat UI
- [ ] Frontend: tarefas UI
- [ ] Frontend: voice/video UI
- [ ] Testes unitários
- [ ] Integração CI/CD
- [ ] Documentação completa

---

**Última atualização**: 5 de Novembro de 2025
**Status**: 🟡 Em desenvolvimento
