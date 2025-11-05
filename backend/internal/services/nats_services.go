package services

import (
	"context"
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
	"go.uber.org/zap"
)

// MessageService gerencia mensagens
type MessageService struct {
	nc     *nats.Conn
	logger *zap.Logger
}

// NewMessageService cria um novo serviço de mensagens
func NewMessageService(nc *nats.Conn, logger *zap.Logger) *MessageService {
	return &MessageService{
		nc:     nc,
		logger: logger,
	}
}

// PublishMessage publica uma mensagem no NATS
func (ms *MessageService) PublishMessage(ctx context.Context, channelID string, messageData []byte) error {
	subject := fmt.Sprintf("messages.%s", channelID)

	if err := ms.nc.Publish(subject, messageData); err != nil {
		ms.logger.Error("failed to publish message", zap.Error(err))
		return err
	}

	ms.logger.Info("message published", zap.String("subject", subject))
	return nil
}

// SubscribeMessages se inscreve em mensagens de um canal
func (ms *MessageService) SubscribeMessages(channelID string, handler func(msg *nats.Msg) error) (*nats.Subscription, error) {
	subject := fmt.Sprintf("messages.%s", channelID)

	sub, err := ms.nc.Subscribe(subject, func(msg *nats.Msg) {
		if err := handler(msg); err != nil {
			ms.logger.Error("error handling message", zap.Error(err))
		}
	})

	if err != nil {
		ms.logger.Error("failed to subscribe to messages", zap.Error(err))
		return nil, err
	}

	return sub, nil
}

// PresenceService gerencia presença de usuários
type PresenceService struct {
	nc     *nats.Conn
	logger *zap.Logger
}

// NewPresenceService cria um novo serviço de presença
func NewPresenceService(nc *nats.Conn, logger *zap.Logger) *PresenceService {
	return &PresenceService{
		nc:     nc,
		logger: logger,
	}
}

// PublishPresence publica uma mudança de presença
func (ps *PresenceService) PublishPresence(ctx context.Context, userID string, status string) error {
	subject := fmt.Sprintf("presence.%s", userID)
	data := []byte(status)

	if err := ps.nc.Publish(subject, data); err != nil {
		ps.logger.Error("failed to publish presence", zap.Error(err))
		return err
	}

	ps.logger.Info("presence published", zap.String("userID", userID), zap.String("status", status))
	return nil
}

// TaskService gerencia tarefas
type TaskService struct {
	nc     *nats.Conn
	logger *zap.Logger
}

// NewTaskService cria um novo serviço de tarefas
func NewTaskService(nc *nats.Conn, logger *zap.Logger) *TaskService {
	return &TaskService{
		nc:     nc,
		logger: logger,
	}
}

// PublishTaskUpdate publica uma atualização de tarefa
func (ts *TaskService) PublishTaskUpdate(ctx context.Context, channelID string, taskData []byte) error {
	subject := fmt.Sprintf("tasks.%s", channelID)

	if err := ts.nc.Publish(subject, taskData); err != nil {
		ts.logger.Error("failed to publish task update", zap.Error(err))
		return err
	}

	ts.logger.Info("task update published", zap.String("subject", subject))
	return nil
}

// SubscribeTasks se inscreve em atualizações de tarefas
func (ts *TaskService) SubscribeTasks(channelID string, handler func(msg *nats.Msg) error) (*nats.Subscription, error) {
	subject := fmt.Sprintf("tasks.%s", channelID)

	sub, err := ts.nc.Subscribe(subject, func(msg *nats.Msg) {
		if err := handler(msg); err != nil {
			ts.logger.Error("error handling task update", zap.Error(err))
		}
	})

	if err != nil {
		ts.logger.Error("failed to subscribe to tasks", zap.Error(err))
		return nil, err
	}

	return sub, nil
}

// VoiceService gerencia sessões de voz/vídeo
type VoiceService struct {
	nc     *nats.Conn
	logger *zap.Logger
}

// NewVoiceService cria um novo serviço de voz
func NewVoiceService(nc *nats.Conn, logger *zap.Logger) *VoiceService {
	return &VoiceService{
		nc:     nc,
		logger: logger,
	}
}

// PublishVoiceEvent publica um evento de voz
func (vs *VoiceService) PublishVoiceEvent(ctx context.Context, channelID string, eventData []byte) error {
	subject := fmt.Sprintf("voice.%s", channelID)

	if err := vs.nc.Publish(subject, eventData); err != nil {
		vs.logger.Error("failed to publish voice event", zap.Error(err))
		return err
	}

	vs.logger.Info("voice event published", zap.String("subject", subject))
	return nil
}

// HealthCheck verifica se o NATS está conectado
func HealthCheckNATS(nc *nats.Conn, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	// Publicar e aguardar resposta
	response := make(chan error, 1)
	sub, err := nc.Subscribe("_INBOX", func(msg *nats.Msg) {
		response <- nil
	})
	if err != nil {
		return err
	}
	defer sub.Unsubscribe()

	if err := nc.PublishRequest("_NATS.REQ", sub.Subject, []byte("")); err != nil {
		return err
	}

	select {
	case <-ctx.Done():
		return ctx.Err()
	case err := <-response:
		return err
	}
}
