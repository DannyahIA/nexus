package database

import (
	"fmt"
	"math/rand"
	"time"

	"github.com/gocql/gocql"
)

// GenerateDiscriminator gera um discriminador único de 4 dígitos para um username
func (db *CassandraDB) GenerateDiscriminator(username string) (string, error) {
	// Tentar até 100 vezes encontrar um discriminador único
	rand.Seed(time.Now().UnixNano())

	for i := 0; i < 100; i++ {
		// Gerar número aleatório de 0001 a 9999
		discriminator := fmt.Sprintf("%04d", rand.Intn(9999)+1)

		// Verificar se já existe
		exists, err := db.DiscriminatorExists(username, discriminator)
		if err != nil {
			return "", err
		}

		if !exists {
			return discriminator, nil
		}
	}

	return "", fmt.Errorf("failed to generate unique discriminator for username: %s", username)
}

// DiscriminatorExists verifica se um username#discriminator já existe
func (db *CassandraDB) DiscriminatorExists(username, discriminator string) (bool, error) {
	// Use nova tabela otimizada sem ALLOW FILTERING
	query := `SELECT user_id FROM nexus.users_by_username_discriminator WHERE username = ? AND discriminator = ?`

	var userID string
	err := db.session.Query(query, username, discriminator).Scan(&userID)
	if err != nil {
		if err.Error() == "not found" {
			return false, nil
		}
		return false, err
	}

	return true, nil // Se encontrou o user_id, o discriminator existe
}

// CreateUserWithDiscriminator cria um usuário com discriminador único
func (db *CassandraDB) CreateUserWithDiscriminator(userID, email, username, displayName, passwordHash string) (string, error) {
	// 1. Verificar unicidade do email usando LWT (Lightweight Transaction)
	// Isso garante que não teremos dois usuários com o mesmo email
	emailQuery := `INSERT INTO nexus.users_by_email (email, user_id) VALUES (?, ?) IF NOT EXISTS`

	var applied bool
	var existingEmail, existingUserID string

	// Tentar reservar o email
	applied, err := db.session.Query(emailQuery, email, userID).ScanCAS(&existingEmail, &existingUserID)
	if err != nil {
		return "", fmt.Errorf("failed to check email uniqueness: %w", err)
	}

	if !applied {
		return "", fmt.Errorf("email already registered")
	}

	// 2. Gerar discriminador único
	discriminator, err := db.GenerateDiscriminator(username)
	if err != nil {
		// Rollback do email se falhar (tentativa de melhor esforço)
		_ = db.session.Query(`DELETE FROM nexus.users_by_email WHERE email = ?`, email).Exec()
		return "", err
	}

	// Se display_name não foi fornecido, usar username
	if displayName == "" {
		displayName = username
	}

	// 3. Criar usuário nas outras tabelas usando Batch
	batch := db.session.NewBatch(gocql.LoggedBatch)
	now := time.Now()

	// Inserir na tabela principal
	batch.Query(`INSERT INTO nexus.users (user_id, email, username, discriminator, display_name, password_hash, created_at, updated_at) 
	             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		userID, email, username, discriminator, displayName, passwordHash, now, now)

	// Inserir na tabela de índice
	batch.Query(`INSERT INTO nexus.users_by_username_discriminator (username, discriminator, user_id, email) 
	             VALUES (?, ?, ?, ?)`,
		username, discriminator, userID, email)

	err = db.session.ExecuteBatch(batch)
	if err != nil {
		// Rollback do email se falhar
		_ = db.session.Query(`DELETE FROM nexus.users_by_email WHERE email = ?`, email).Exec()
		return "", err
	}

	return discriminator, nil
}

// UpdateUserProfile atualiza o display_name e bio do usuário
func (db *CassandraDB) UpdateUserProfile(userID, displayName, bio string) error {
	query := `UPDATE nexus.users SET display_name = ?, bio = ?, updated_at = ? WHERE user_id = ?`
	return db.session.Query(query, displayName, bio, time.Now(), userID).Exec()
}
