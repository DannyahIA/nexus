package models

import (
	"time"

	"github.com/gofrs/uuid"
)

// User representa um usuário do sistema
type User struct {
	ID        uuid.UUID
	Email     string
	Username  string
	AvatarURL string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Channel representa um canal de comunicação
type Channel struct {
	ID          uuid.UUID
	GroupID     *uuid.UUID // NULL para DMs
	Name        string
	Type        string // "text", "voice", "video", "dm", "group_dm"
	Description string
	OwnerID     uuid.UUID
	IsPrivate   bool
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// Group representa um servidor/grupo
type Group struct {
	ID          uuid.UUID
	Name        string
	Description string
	OwnerID     uuid.UUID
	IconURL     string
	IsPublic    bool
	InviteCode  string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// GroupMember representa a associação de um usuário a um grupo
type GroupMember struct {
	GroupID   uuid.UUID
	UserID    uuid.UUID
	Role      string // "owner", "admin", "moderator", "member"
	Nickname  string
	JoinedAt  time.Time
}

// ChannelMember representa a associação de um usuário a um canal
type ChannelMember struct {
	ChannelID  uuid.UUID
	UserID     uuid.UUID
	Role       string // "owner", "admin", "member"
	LastReadAt *time.Time
	JoinedAt   time.Time
}

// FriendRequest representa uma solicitação de amizade
type FriendRequest struct {
	FromUserID uuid.UUID
	ToUserID   uuid.UUID
	Status     string // "pending", "accepted", "rejected", "blocked"
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// Friend representa uma amizade estabelecida
type Friend struct {
	UserID      uuid.UUID
	FriendID    uuid.UUID
	Nickname    string
	DMChannelID uuid.UUID
	AddedAt     time.Time
}

// Message representa uma mensagem
type Message struct {
	ID        string // timeuuid
	ChannelID uuid.UUID
	AuthorID  uuid.UUID
	Content   string
	Timestamp time.Time
	EditedAt  *time.Time
}

// Task representa uma tarefa (Kanban)
type Task struct {
	ID         uuid.UUID
	ChannelID  uuid.UUID
	Title      string
	Status     string // "todo", "in_progress", "done"
	AssigneeID *uuid.UUID
	Position   int
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// UserPresence rastreia se um usuário está online
type UserPresence struct {
	UserID   uuid.UUID
	Status   string // "online", "idle", "offline", "dnd"
	LastSeen time.Time
}

// VoiceSession representa uma sessão de voz/vídeo
type VoiceSession struct {
	ID        uuid.UUID
	ChannelID uuid.UUID
	UserID    uuid.UUID
	StartedAt time.Time
	EndedAt   *time.Time
}
