package main

import (
	"fmt"
	"log"
	"math/rand"
	"time"

	"github.com/gocql/gocql"
)

func main() {
	// Conectar ao Cassandra
	cluster := gocql.NewCluster("cassandra")
	cluster.Keyspace = "nexus"
	cluster.Consistency = gocql.Quorum
	
	session, err := cluster.CreateSession()
	if err != nil {
		log.Fatal("Failed to connect to Cassandra:", err)
	}
	defer session.Close()

	log.Println("Connected to Cassandra")

	// Buscar todos os usuários com discriminator null
	query := `SELECT user_id, username FROM nexus.users WHERE discriminator = null ALLOW FILTERING`
	iter := session.Query(query).Iter()

	var userID, username string
	usedDiscriminators := make(map[string]map[string]bool) // username -> discriminator -> exists
	rand.Seed(time.Now().UnixNano())

	count := 0
	for iter.Scan(&userID, &username) {
		// Gerar discriminador único para este username
		discriminator := generateUniqueDiscriminator(username, usedDiscriminators, session)
		
		// Atualizar usuário
		updateQuery := `UPDATE nexus.users SET discriminator = ? WHERE user_id = ?`
		if err := session.Query(updateQuery, discriminator, userID).Exec(); err != nil {
			log.Printf("Failed to update user %s: %v", userID, err)
			continue
		}

		// Marcar como usado
		if usedDiscriminators[username] == nil {
			usedDiscriminators[username] = make(map[string]bool)
		}
		usedDiscriminators[username][discriminator] = true

		log.Printf("Updated user %s (%s) with discriminator %s", username, userID, discriminator)
		count++
	}

	if err := iter.Close(); err != nil {
		log.Fatal("Error iterating users:", err)
	}

	log.Printf("Migration complete! Updated %d users", count)
}

func generateUniqueDiscriminator(username string, used map[string]map[string]bool, session *gocql.Session) string {
	for i := 0; i < 100; i++ {
		discriminator := fmt.Sprintf("%04d", rand.Intn(9999)+1)

		// Verificar se já foi usado nesta sessão
		if used[username] != nil && used[username][discriminator] {
			continue
		}

		// Verificar se existe no banco
		var count int
		query := `SELECT COUNT(*) FROM nexus.users WHERE username = ? AND discriminator = ? ALLOW FILTERING`
		if err := session.Query(query, username, discriminator).Scan(&count); err != nil {
			log.Printf("Error checking discriminator: %v", err)
			continue
		}

		if count == 0 {
			return discriminator
		}
	}

	// Fallback: usar timestamp
	return fmt.Sprintf("%04d", time.Now().Unix()%10000)
}
