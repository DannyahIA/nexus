package cache

import (
	"sync"
	"time"

	"github.com/gofrs/uuid"
)

// MemoryCache é um cache simples em memória com TTL
type MemoryCache struct {
	mu   sync.RWMutex
	data map[string]cacheEntry
	ttl  time.Duration
}

type cacheEntry struct {
	value     interface{}
	expiresAt time.Time
}

// NewMemoryCache cria um novo cache em memória
func NewMemoryCache(ttl time.Duration) *MemoryCache {
	cache := &MemoryCache{
		data: make(map[string]cacheEntry),
		ttl:  ttl,
	}

	// Limpar expired entries periodicamente
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()

		for range ticker.C {
			cache.cleanup()
		}
	}()

	return cache
}

// Set insere um valor no cache
func (c *MemoryCache) Set(key string, value interface{}) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.data[key] = cacheEntry{
		value:     value,
		expiresAt: time.Now().Add(c.ttl),
	}
}

// Get retorna um valor do cache
func (c *MemoryCache) Get(key string) (interface{}, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, exists := c.data[key]
	if !exists {
		return nil, false
	}

	if time.Now().After(entry.expiresAt) {
		return nil, false
	}

	return entry.value, true
}

// Delete remove um valor do cache
func (c *MemoryCache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	delete(c.data, key)
}

// cleanup remove entries expiradas
func (c *MemoryCache) cleanup() {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	for key, entry := range c.data {
		if now.After(entry.expiresAt) {
			delete(c.data, key)
		}
	}
}

// UserPresenceCache armazena presença de usuários em memória
type UserPresenceCache struct {
	mu       sync.RWMutex
	presence map[uuid.UUID]string // userID -> status
}

// NewUserPresenceCache cria um novo cache de presença
func NewUserPresenceCache() *UserPresenceCache {
	return &UserPresenceCache{
		presence: make(map[uuid.UUID]string),
	}
}

// SetPresence define o status de um usuário
func (upc *UserPresenceCache) SetPresence(userID uuid.UUID, status string) {
	upc.mu.Lock()
	defer upc.mu.Unlock()
	upc.presence[userID] = status
}

// GetPresence retorna o status de um usuário
func (upc *UserPresenceCache) GetPresence(userID uuid.UUID) (string, bool) {
	upc.mu.RLock()
	defer upc.mu.RUnlock()

	status, exists := upc.presence[userID]
	return status, exists
}

// GetAllPresence retorna todos os usuários online
func (upc *UserPresenceCache) GetAllPresence() map[uuid.UUID]string {
	upc.mu.RLock()
	defer upc.mu.RUnlock()

	// Retornar uma cópia
	result := make(map[uuid.UUID]string)
	for k, v := range upc.presence {
		result[k] = v
	}
	return result
}

// RemovePresence remove um usuário do cache de presença
func (upc *UserPresenceCache) RemovePresence(userID uuid.UUID) {
	upc.mu.Lock()
	defer upc.mu.Unlock()
	delete(upc.presence, userID)
}
