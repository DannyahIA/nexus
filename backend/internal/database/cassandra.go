package database

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/gocql/gocql"
)

type CassandraDB struct {
	cluster *gocql.ClusterConfig
	session *gocql.Session
}

// NewCassandraDB cria uma nova conexão com Cassandra
func NewCassandraDB(hosts []string, keyspace string) (*CassandraDB, error) {
	cluster := gocql.NewCluster(hosts...)
	cluster.Keyspace = keyspace
	cluster.Consistency = gocql.LocalQuorum // Melhor para multi-DC
	
	// Configurações de timeout e retry
	cluster.Timeout = 10 * time.Second
	cluster.ConnectTimeout = 5 * time.Second
	cluster.RetryPolicy = &gocql.SimpleRetryPolicy{NumRetries: 3}
	
	// Configuração de connection pool
	cluster.NumConns = 2 // Conexões por host
	cluster.PoolConfig.HostSelectionPolicy = gocql.TokenAwareHostPolicy(gocql.RoundRobinHostPolicy())

	session, err := cluster.CreateSession()
	if err != nil {
		return nil, fmt.Errorf("failed to create cassandra session: %w", err)
	}

	return &CassandraDB{
		cluster: cluster,
		session: session,
	}, nil
}

// Close fecha a conexão com Cassandra
func (db *CassandraDB) Close() error {
	if db.session != nil {
		db.session.Close()
	}
	return nil
}

// InitializeKeyspace inicializa o keyspace e tabelas
func (db *CassandraDB) InitializeKeyspace() error {
	// Criar keyspace primeiro (sem usar USE)
	createKeyspaceQuery := `CREATE KEYSPACE IF NOT EXISTS nexus WITH replication = {'class':'SimpleStrategy','replication_factor':1}`
	if err := db.session.Query(createKeyspaceQuery).Exec(); err != nil {
		log.Printf("Warning: Failed to create keyspace: %v", err)
	}
	
	queries := []string{
		`CREATE TABLE IF NOT EXISTS messages_by_channel (
			channel_id uuid,
			bucket int,
			ts timestamp,
			msg_id timeuuid,
			author_id uuid,
			content text,
			edited_at timestamp,
			PRIMARY KEY ((channel_id, bucket), ts, msg_id)
		) WITH CLUSTERING ORDER BY (ts DESC)`,
		`CREATE TABLE IF NOT EXISTS tasks_by_channel (
			channel_id uuid,
			task_id uuid,
			title text,
			status text,
			assignee uuid,
			position int,
			created_at timestamp,
			updated_at timestamp,
			PRIMARY KEY (channel_id, position, task_id)
		)`,
		`CREATE TABLE IF NOT EXISTS user_presence (
			user_id uuid PRIMARY KEY,
			status text,
			last_seen timestamp
		)`,
		`CREATE TABLE IF NOT EXISTS users_by_username_discriminator (
			username text,
			discriminator text,
			user_id uuid,
			email text,
			PRIMARY KEY (username, discriminator)
		)`,
		`CREATE TABLE IF NOT EXISTS nexus.users (
			user_id uuid PRIMARY KEY,
			email text,
			username text,
			discriminator text,
			display_name text,
			password_hash text,
			avatar_url text,
			bio text,
			created_at timestamp,
			updated_at timestamp
		)`,
		`CREATE INDEX IF NOT EXISTS idx_user_email ON nexus.users(email)`,
		`CREATE INDEX IF NOT EXISTS idx_user_username ON nexus.users(username)`,
		`CREATE TABLE IF NOT EXISTS channels (
			channel_id uuid PRIMARY KEY,
			name text,
			type text,
			owner_id uuid,
			description text,
			created_at timestamp,
			updated_at timestamp
		)`,
		`CREATE TABLE IF NOT EXISTS voice_sessions (
			session_id uuid PRIMARY KEY,
			channel_id uuid,
			user_id uuid,
			started_at timestamp,
			ended_at timestamp
		)`,
	}

	for _, query := range queries {
		if err := db.session.Query(query).Exec(); err != nil {
			log.Printf("Warning: Query failed: %s\nError: %v", query, err)
		}
	}
	
	// Tentar criar índice de discriminator (pode falhar se a coluna não existir ainda)
	discriminatorIndexQuery := `CREATE INDEX IF NOT EXISTS idx_user_discriminator ON nexus.users(discriminator)`
	if err := db.session.Query(discriminatorIndexQuery).Exec(); err != nil {
		log.Printf("Info: Discriminator index not created (column may not exist yet): %v", err)
	}

	return nil
}

// InsertMessage insere uma mensagem no Cassandra
func (db *CassandraDB) InsertMessage(channelID string, bucket int, tsStr string, msgID string, authorID string, content string) error {
	query := `INSERT INTO nexus.messages_by_channel (channel_id, bucket, ts, msg_id, author_id, content) 
	          VALUES (?, ?, ?, ?, ?, ?)`

	return db.session.Query(query, channelID, bucket, tsStr, msgID, authorID, content).Exec()
}

// GetMessages retorna as mensagens de um canal
func (db *CassandraDB) GetMessages(channelID string, bucket int, limit int) ([]map[string]interface{}, error) {
	query := `SELECT ts, msg_id, author_id, content, edited_at FROM nexus.messages_by_channel 
	          WHERE channel_id = ? AND bucket = ? LIMIT ?`

	iter := db.session.Query(query, channelID, bucket, limit).Iter()
	defer iter.Close()

	var results []map[string]interface{}
	row := make(map[string]interface{})

	for iter.MapScan(row) {
		results = append(results, row)
		row = make(map[string]interface{})
	}

	if err := iter.Close(); err != nil {
		return nil, err
	}
	return results, nil
}

// InsertTask insere uma tarefa no Cassandra
func (db *CassandraDB) InsertTask(channelID string, taskID string, title string, status string, assigneeID *string, position int) error {
	query := `INSERT INTO nexus.tasks_by_channel (channel_id, task_id, title, status, assignee, position, created_at, updated_at) 
	          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`

	now := time.Now()
	return db.session.Query(query, channelID, taskID, title, status, assigneeID, position, now, now).Exec()
}

// GetTasks retorna as tarefas de um canal
func (db *CassandraDB) GetTasks(channelID string) ([]map[string]interface{}, error) {
	query := `SELECT task_id, title, status, assignee, position FROM nexus.tasks_by_channel 
	          WHERE channel_id = ?`

	iter := db.session.Query(query, channelID).Iter()
	defer iter.Close()

	var results []map[string]interface{}
	row := make(map[string]interface{})

	for iter.MapScan(row) {
		results = append(results, row)
		row = make(map[string]interface{})
	}

	if err := iter.Close(); err != nil {
		return nil, err
	}
	return results, nil
}

// UpdateUserPresence atualiza a presença de um usuário
func (db *CassandraDB) UpdateUserPresence(userID string, status string) error {
	query := `INSERT INTO nexus.user_presence (user_id, status, last_seen) VALUES (?, ?, ?)`
	return db.session.Query(query, userID, status, time.Now()).Exec()
}

// GetUserPresence retorna a presença de um usuário
func (db *CassandraDB) GetUserPresence(userID string) (map[string]interface{}, error) {
	query := `SELECT status, last_seen FROM nexus.user_presence WHERE user_id = ?`
	row := make(map[string]interface{})
	err := db.session.Query(query, userID).MapScan(row)
	return row, err
}

// Health verifica a saúde da conexão com Cassandra
func (db *CassandraDB) Health(ctx context.Context) error {
	return db.session.Query("SELECT now() FROM system.local").Exec()
}

// CreateUser insere um novo usuário no Cassandra
func (db *CassandraDB) CreateUser(userID, email, username, passwordHash string) error {
	query := `INSERT INTO nexus.users (user_id, email, username, password_hash, created_at, updated_at) 
	          VALUES (?, ?, ?, ?, ?, ?)`
	now := time.Now()
	return db.session.Query(query, userID, email, username, passwordHash, now, now).Exec()
}

// GetUserByEmail retorna um usuário pelo email (usando índice secundário)
func (db *CassandraDB) GetUserByEmail(email string) (map[string]interface{}, error) {
	query := `SELECT user_id, email, username, discriminator, display_name, password_hash, avatar_url, bio, created_at FROM nexus.users WHERE email = ? ALLOW FILTERING`
	
	var userID gocql.UUID
	var userEmail, username, discriminator, displayName, passwordHash, avatarURL, bio string
	var createdAt time.Time
	
	err := db.session.Query(query, email).Scan(&userID, &userEmail, &username, &discriminator, &displayName, &passwordHash, &avatarURL, &bio, &createdAt)
	if err != nil {
		return nil, err
	}
	
	row := map[string]interface{}{
		"user_id":       userID.String(),
		"email":         userEmail,
		"username":      username,
		"discriminator": discriminator,
		"display_name":  displayName,
		"password_hash": passwordHash,
		"avatar_url":    avatarURL,
		"bio":           bio,
		"created_at":    createdAt,
	}
	
	return row, nil
}

// GetUserByUsername retorna um usuário pelo username (usando índice secundário)
func (db *CassandraDB) GetUserByUsername(username string) (map[string]interface{}, error) {
	query := `SELECT user_id, email, username, discriminator, display_name, password_hash, avatar_url, bio, created_at FROM nexus.users WHERE username = ? ALLOW FILTERING`
	
	var userID gocql.UUID
	var userEmail, uname, discriminator, displayName, passwordHash, avatarURL, bio string
	var createdAt time.Time
	
	err := db.session.Query(query, username).Scan(&userID, &userEmail, &uname, &discriminator, &displayName, &passwordHash, &avatarURL, &bio, &createdAt)
	if err != nil {
		return nil, err
	}
	
	row := map[string]interface{}{
		"user_id":       userID.String(),
		"email":         userEmail,
		"username":      uname,
		"discriminator": discriminator,
		"display_name":  displayName,
		"password_hash": passwordHash,
		"avatar_url":    avatarURL,
		"bio":           bio,
		"created_at":    createdAt,
	}
	
	return row, nil
}

// GetUserByUsernameAndDiscriminator retorna um usuário específico pelo username e discriminador
func (db *CassandraDB) GetUserByUsernameAndDiscriminator(username, discriminator string) (map[string]interface{}, error) {
	query := `SELECT user_id, email, username, discriminator, display_name, password_hash, avatar_url, bio, created_at FROM nexus.users WHERE username = ? AND discriminator = ? ALLOW FILTERING`
	
	var userID gocql.UUID
	var userEmail, uname, disc, displayName, passwordHash, avatarURL, bio string
	var createdAt time.Time
	
	err := db.session.Query(query, username, discriminator).Scan(&userID, &userEmail, &uname, &disc, &displayName, &passwordHash, &avatarURL, &bio, &createdAt)
	if err != nil {
		return nil, err
	}
	
	row := map[string]interface{}{
		"user_id":       userID.String(),
		"email":         userEmail,
		"username":      uname,
		"discriminator": disc,
		"display_name":  displayName,
		"password_hash": passwordHash,
		"avatar_url":    avatarURL,
		"bio":           bio,
		"created_at":    createdAt,
	}
	
	return row, nil
}

// GetUserByID retorna um usuário pelo ID
func (db *CassandraDB) GetUserByID(userID string) (map[string]interface{}, error) {
	query := `SELECT user_id, email, username, discriminator, display_name, avatar_url, bio, created_at FROM nexus.users WHERE user_id = ?`
	
	userUUID, err := gocql.ParseUUID(userID)
	if err != nil {
		return nil, err
	}
	
	var uid gocql.UUID
	var userEmail, username, discriminator, displayName, avatarURL, bio string
	var createdAt time.Time
	
	err = db.session.Query(query, userUUID).Scan(&uid, &userEmail, &username, &discriminator, &displayName, &avatarURL, &bio, &createdAt)
	if err != nil {
		return nil, err
	}
	
	row := map[string]interface{}{
		"user_id":       uid.String(),
		"email":         userEmail,
		"username":      username,
		"discriminator": discriminator,
		"display_name":  displayName,
		"avatar_url":    avatarURL,
		"bio":           bio,
		"created_at":    createdAt,
	}
	
	return row, nil
}

// CreateChannel insere um novo canal no Cassandra
func (db *CassandraDB) CreateChannel(channelID, name, channelType, ownerID, description string) error {
	query := `INSERT INTO nexus.channels (channel_id, name, type, owner_id, description, created_at, updated_at) 
	          VALUES (?, ?, ?, ?, ?, ?, ?)`
	now := time.Now()
	return db.session.Query(query, channelID, name, channelType, ownerID, description, now, now).Exec()
}

// GetAllChannels retorna todos os canais
func (db *CassandraDB) GetAllChannels() ([]map[string]interface{}, error) {
	query := `SELECT channel_id, name, type, owner_id, description, created_at, updated_at FROM nexus.channels`

	iter := db.session.Query(query).Iter()
	defer iter.Close()

	var results []map[string]interface{}

	var channelID, ownerID gocql.UUID
	var name, channelType, description string
	var createdAt, updatedAt time.Time

	for iter.Scan(&channelID, &name, &channelType, &ownerID, &description, &createdAt, &updatedAt) {
		row := map[string]interface{}{
			"channel_id":  channelID.String(),
			"name":        name,
			"type":        channelType,
			"owner_id":    ownerID.String(),
			"description": description,
			"created_at":  createdAt,
			"updated_at":  updatedAt,
		}
		results = append(results, row)
	}

	if err := iter.Close(); err != nil {
		return nil, err
	}
	return results, nil
}

// GetChannelByID retorna um canal específico
func (db *CassandraDB) GetChannelByID(channelID string) (map[string]interface{}, error) {
	query := `SELECT channel_id, name, type, owner_id, description, server_id, created_at, updated_at FROM nexus.channels WHERE channel_id = ?`

	var chID, ownerID, serverID gocql.UUID
	var name, channelType, description string
	var createdAt, updatedAt time.Time

	err := db.session.Query(query, channelID).Scan(&chID, &name, &channelType, &ownerID, &description, &serverID, &createdAt, &updatedAt)
	if err != nil {
		return nil, err
	}

	row := map[string]interface{}{
		"channel_id":  chID.String(),
		"name":        name,
		"type":        channelType,
		"owner_id":    ownerID.String(),
		"description": description,
		"server_id":   serverID.String(),
		"created_at":  createdAt,
		"updated_at":  updatedAt,
	}

	return row, nil
}

// DeleteChannel deleta um canal
func (db *CassandraDB) DeleteChannel(channelID string) error {
	query := `DELETE FROM nexus.channels WHERE channel_id = ?`
	return db.session.Query(query, channelID).Exec()
}

// SaveMessage salva uma mensagem no Cassandra
func (db *CassandraDB) SaveMessage(channelID, messageID, authorID, content string) error {
	// Bucket baseado no mês para particionar dados (YYYYMM)
	bucket := time.Now().Year()*100 + int(time.Now().Month())

	query := `INSERT INTO nexus.messages_by_channel (channel_id, bucket, ts, msg_id, author_id, content) 
	          VALUES (?, ?, ?, ?, ?, ?)`

	// Converter string UUID para gocql.UUID
	channelUUID, err := gocql.ParseUUID(channelID)
	if err != nil {
		log.Printf("ERROR: Failed to parse channelID: %s, error: %v", channelID, err)
		return err
	}

	authorUUID, err := gocql.ParseUUID(authorID)
	if err != nil {
		log.Printf("ERROR: Failed to parse authorID: %s, error: %v", authorID, err)
		return err
	}

	log.Printf("DEBUG SaveMessage: channelID=%s, authorID=%s, authorUUID=%s", channelID, authorID, authorUUID.String())

	// Gerar TimeUUID para a mensagem
	msgTimeUUID := gocql.TimeUUID()

	return db.session.Query(query, channelUUID, bucket, time.Now(), msgTimeUUID, authorUUID, content).Exec()
}

// GetMessagesByChannel retorna mensagens de um canal com paginação
func (db *CassandraDB) GetMessagesByChannel(channelID string, limit int, beforeTime *time.Time) ([]map[string]interface{}, error) {
	// Bucket do mês atual
	bucket := time.Now().Year()*100 + int(time.Now().Month())

	channelUUID, err := gocql.ParseUUID(channelID)
	if err != nil {
		return nil, err
	}

	var query string
	var iter *gocql.Iter

	if beforeTime != nil {
		// Paginação: buscar mensagens antes de um timestamp
		query = `SELECT channel_id, ts, msg_id, author_id, content, edited_at 
		         FROM nexus.messages_by_channel 
		         WHERE channel_id = ? AND bucket = ? AND ts < ?
		         ORDER BY ts DESC LIMIT ?`
		iter = db.session.Query(query, channelUUID, bucket, *beforeTime, limit).Iter()
	} else {
		// Primeira página: buscar as mensagens mais recentes
		query = `SELECT channel_id, ts, msg_id, author_id, content, edited_at 
		         FROM nexus.messages_by_channel 
		         WHERE channel_id = ? AND bucket = ?
		         ORDER BY ts DESC LIMIT ?`
		iter = db.session.Query(query, channelUUID, bucket, limit).Iter()
	}
	defer iter.Close()

	var results []map[string]interface{}
	var chID, authorID, msgID gocql.UUID
	var ts time.Time
	var content string
	var editedAt *time.Time

	for iter.Scan(&chID, &ts, &msgID, &authorID, &content, &editedAt) {
		row := map[string]interface{}{
			"channel_id": chID.String(),
			"msg_id":     msgID.String(),
			"author_id":  authorID.String(),
			"content":    content,
			"ts":         ts,
		}

		if editedAt != nil {
			row["edited_at"] = *editedAt
		}

		results = append(results, row)
	}

	if err := iter.Close(); err != nil {
		return nil, err
	}

	return results, nil
}

// UpdateMessage atualiza o conteúdo de uma mensagem
func (db *CassandraDB) UpdateMessage(channelID, messageID, newContent string) error {
	bucket := time.Now().Year()*100 + int(time.Now().Month())

	channelUUID, err := gocql.ParseUUID(channelID)
	if err != nil {
		return err
	}

	msgUUID, err := gocql.ParseUUID(messageID)
	if err != nil {
		return err
	}

	// Buscar a mensagem para obter o ts
	selectQuery := `SELECT ts FROM nexus.messages_by_channel 
	                WHERE channel_id = ? AND bucket = ? AND msg_id = ?
	                ALLOW FILTERING`
	
	var ts time.Time
	err = db.session.Query(selectQuery, channelUUID, bucket, msgUUID).Scan(&ts)
	if err != nil {
		return err
	}

	// Atualizar com todas as chaves primárias
	updateQuery := `UPDATE nexus.messages_by_channel 
	                SET content = ?, edited_at = ?
	                WHERE channel_id = ? AND bucket = ? AND ts = ? AND msg_id = ?`

	return db.session.Query(updateQuery, newContent, time.Now(), channelUUID, bucket, ts, msgUUID).Exec()
}

// DeleteMessage deleta uma mensagem
func (db *CassandraDB) DeleteMessage(channelID, messageID string) error {
	// Primeiro, buscar a mensagem para obter o timestamp
	bucket := time.Now().Year()*100 + int(time.Now().Month())

	channelUUID, err := gocql.ParseUUID(channelID)
	if err != nil {
		return err
	}

	msgUUID, err := gocql.ParseUUID(messageID)
	if err != nil {
		return err
	}

	// Buscar a mensagem para obter o ts
	selectQuery := `SELECT ts FROM nexus.messages_by_channel 
	                WHERE channel_id = ? AND bucket = ? AND msg_id = ?
	                ALLOW FILTERING`
	
	var ts time.Time
	err = db.session.Query(selectQuery, channelUUID, bucket, msgUUID).Scan(&ts)
	if err != nil {
		return err
	}

	// Agora deletar com todas as chaves primárias
	deleteQuery := `DELETE FROM nexus.messages_by_channel 
	                WHERE channel_id = ? AND bucket = ? AND ts = ? AND msg_id = ?`

	return db.session.Query(deleteQuery, channelUUID, bucket, ts, msgUUID).Exec()
}

// CreateTask cria uma nova task
func (db *CassandraDB) CreateTask(channelID, taskID, title, status, assigneeID string, position int) error {
	query := `INSERT INTO nexus.tasks_by_channel (channel_id, task_id, title, status, assignee, position, created_at, updated_at)
	          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`

	channelUUID, err := gocql.ParseUUID(channelID)
	if err != nil {
		return err
	}

	taskUUID, err := gocql.ParseUUID(taskID)
	if err != nil {
		return err
	}

	var assigneeUUID *gocql.UUID
	if assigneeID != "" {
		parsedUUID, err := gocql.ParseUUID(assigneeID)
		if err != nil {
			return err
		}
		assigneeUUID = &parsedUUID
	}

	now := time.Now()
	return db.session.Query(query, channelUUID, taskUUID, title, status, assigneeUUID, position, now, now).Exec()
}

// GetTasksByChannel retorna todas as tasks de um canal
func (db *CassandraDB) GetTasksByChannel(channelID string) ([]map[string]interface{}, error) {
	query := `SELECT channel_id, task_id, title, status, assignee, position, created_at, updated_at
	          FROM nexus.tasks_by_channel
	          WHERE channel_id = ?
	          ORDER BY position ASC`

	channelUUID, err := gocql.ParseUUID(channelID)
	if err != nil {
		return nil, err
	}

	iter := db.session.Query(query, channelUUID).Iter()
	defer iter.Close()

	var results []map[string]interface{}
	var chID, taskID gocql.UUID
	var assigneeUUID *gocql.UUID
	var title, status string
	var position int
	var createdAt, updatedAt time.Time

	for iter.Scan(&chID, &taskID, &title, &status, &assigneeUUID, &position, &createdAt, &updatedAt) {
		row := map[string]interface{}{
			"channel_id": chID.String(),
			"task_id":    taskID.String(),
			"title":      title,
			"status":     status,
			"position":   position,
			"created_at": createdAt,
			"updated_at": updatedAt,
		}

		if assigneeUUID != nil {
			row["assignee"] = assigneeUUID.String()
		}

		results = append(results, row)
	}

	if err := iter.Close(); err != nil {
		return nil, err
	}

	return results, nil
}

// UpdateTask atualiza uma task
func (db *CassandraDB) UpdateTask(channelID, taskID, title, status string, position int) error {
	query := `UPDATE nexus.tasks_by_channel
	          SET title = ?, status = ?, updated_at = ?
	          WHERE channel_id = ? AND position = ? AND task_id = ?`

	channelUUID, err := gocql.ParseUUID(channelID)
	if err != nil {
		return err
	}

	taskUUID, err := gocql.ParseUUID(taskID)
	if err != nil {
		return err
	}

	return db.session.Query(query, title, status, time.Now(), channelUUID, position, taskUUID).Exec()
}

// DeleteTask deleta uma task
func (db *CassandraDB) DeleteTask(channelID, taskID string, position int) error {
	query := `DELETE FROM nexus.tasks_by_channel
	          WHERE channel_id = ? AND position = ? AND task_id = ?`

	channelUUID, err := gocql.ParseUUID(channelID)
	if err != nil {
		return err
	}

	taskUUID, err := gocql.ParseUUID(taskID)
	if err != nil {
		return err
	}

	return db.session.Query(query, channelUUID, position, taskUUID).Exec()
}

// UpdateUserAvatar atualiza a URL do avatar de um usuário
func (db *CassandraDB) UpdateUserAvatar(userID, avatarURL string) error {
	query := `UPDATE nexus.users SET avatar_url = ?, updated_at = ? WHERE user_id = ?`

	userUUID, err := gocql.ParseUUID(userID)
	if err != nil {
		return err
	}

	return db.session.Query(query, avatarURL, time.Now(), userUUID).Exec()
}
