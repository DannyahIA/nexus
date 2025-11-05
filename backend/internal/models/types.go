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
	ID        uuid.UUID
	Name      string
	Type      string // "text", "voice", "video"
	OwnerID   uuid.UUID
	CreatedAt time.Time
	UpdatedAt time.Time
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
