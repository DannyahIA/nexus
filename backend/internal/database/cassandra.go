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
	cluster.Consistency = gocql.Quorum
	cluster.ConnectTimeout = 5e9 // 5 segundos

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
	queries := []string{
		`CREATE KEYSPACE IF NOT EXISTS nexus WITH replication = {'class':'SimpleStrategy','replication_factor':1}`,
		`USE nexus`,
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
		`CREATE TABLE IF NOT EXISTS users (
			user_id uuid PRIMARY KEY,
			email text,
			username text,
			avatar_url text,
			created_at timestamp,
			updated_at timestamp
		)`,
		`CREATE TABLE IF NOT EXISTS channels (
			channel_id uuid PRIMARY KEY,
			name text,
			type text,
			owner_id uuid,
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
