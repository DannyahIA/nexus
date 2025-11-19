# Changelog

All notable changes to the Nexus project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added - 2025-11-18 (Part 2)

#### WebRTC Backend Implementation
- **WebSocket Signaling**: Complete WebRTC signaling support in Go WebSocket server
- **Voice Events**: 
  - `voice:join` - User joins voice channel
  - `voice:leave` - User leaves voice channel
  - `voice:offer` - WebRTC offer forwarding
  - `voice:answer` - WebRTC answer forwarding
  - `voice:ice-candidate` - ICE candidate exchange
  - `voice:mute-status` - Mute status broadcast
  - `voice:video-status` - Video status broadcast
- **User Routing**: Direct message routing to specific users
- **Channel Broadcasting**: Broadcast to all users in a voice channel
- **Logging**: Detailed logging for debugging WebRTC connections

### Added - 2025-11-18 (Part 1)

#### Server Invite System
- **Invite Code Generation**: Automatic 8-character invite codes for servers
- **Invite Modal**: Beautiful modal to display and copy invite links
- **Join Server**: Users can join servers using invite codes
- **Invite Button**: Added "Convidar" button in chat header for easy access
- **Invite in Context Menu**: Right-click server → "Convidar Pessoas"
- **Join Button in Sidebar**: Blue "Entrar em Servidor" button in server sidebar
- **Backend Support**: 
  - `POST /api/servers/join/{code}` endpoint
  - `invite_code` field in servers table
  - Automatic code generation on server creation
  - Validation to prevent duplicate joins

#### WebRTC Voice/Video Foundation
- **WebRTC Service**: Complete WebRTC service implementation (`webrtc.ts`)
- **Peer Connections**: P2P connection management with ICE candidates
- **Signaling**: WebSocket-based signaling for offer/answer exchange
- **Media Streams**: 
  - Local stream capture (audio/video)
  - Remote stream handling
  - Multiple peer support
- **Controls**:
  - Mute/unmute microphone
  - Enable/disable video
  - Screen sharing support
- **STUN Integration**: Google STUN servers configured
- **Event System**: Custom event emitter for stream updates

#### Friends & DMs Improvements
- **Automatic DM Creation**: DM channels created automatically when accepting friend requests
- **Friend List UI**: Complete friend list with online/offline status
- **DM Header**: Discord-style header with avatar and status indicator
- **Friend Requests**: Pending requests tab with accept/reject buttons
- **Add Friend**: Dedicated tab to send friend requests by username

### Fixed - 2025-11-18

#### Messaging
- **Duplicate Messages**: Fixed bug where messages appeared twice in chat
  - Removed local message addition after sending
  - Messages now only added via WebSocket broadcast
  - Prevents race condition between API response and WebSocket event

#### Database
- **Invite Code Column**: Added missing `invite_code` column to Cassandra `groups` table
- **Invite Code Index**: Created index for fast invite code lookups

#### Backend
- **Invite Code Generation**: Improved randomness using UUID-based generation
- **Server Creation**: Fixed invite code not being returned in API response
- **Logging**: Added debug logs for server creation and invite code generation

### Changed - 2025-11-18

#### UI/UX
- **Chat Header**: Added invite button for server channels
- **Server Sidebar**: Added join server button with UserPlus icon
- **Modal Design**: Improved invite modal with copy-to-clipboard feedback
- **Friend Screen**: Enhanced layout with tabs and better organization

#### Code Quality
- **Type Safety**: Improved TypeScript types for WebRTC
- **Error Handling**: Better error messages for invite system
- **Code Organization**: Separated WebRTC logic into dedicated service

## [0.2.0] - 2025-11-14

### Added

#### Core Features
- Real-time messaging via WebSocket
- Message persistence in Cassandra
- Message editing and deletion
- Message context menu (edit, delete, reply)
- Infinite scroll with pagination
- Date separators in chat
- Message grouping by user and time

#### Server Management
- Server creation and management
- Multiple channels per server
- Channel creation, editing, deletion
- Server ownership and permissions
- Channel context menu

#### Authentication
- JWT authentication with refresh tokens
- User registration and login
- Password hashing with bcrypt
- User profile management

#### UI Components
- Discord-inspired UI design
- Dark theme
- Responsive layout
- Avatar placeholders with initials
- Loading states and spinners
- Message hover actions

### Technical
- Go microservices architecture
- Cassandra time-series partitioning
- NATS JetStream integration
- Redis caching layer
- Docker containerization
- Health check endpoints

## [0.1.0] - 2025-11-01

### Added
- Initial project setup
- Basic REST API with Go
- WebSocket server
- Cassandra database integration
- React frontend with Vite
- Electron desktop app
- Docker Compose setup
- Basic authentication

---

## Legend

- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security improvements

---

**Project**: Nexus
**Repository**: https://github.com/DannyahIA/nexus  
**Maintainer**: Dannyah (contato@eclipsiasoftware.com)
