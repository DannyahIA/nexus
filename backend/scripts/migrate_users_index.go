package main

import (
	"log"
	"time"

	"github.com/gocql/gocql"
)

func main() {
	log.Println("🔄 Starting migration to populate users_by_username_discriminator table...")

	// Conectar ao Cassandra
	cluster := gocql.NewCluster("localhost") // Ajuste conforme necessário
	cluster.Keyspace = "nexus"
	cluster.Consistency = gocql.LocalQuorum
	cluster.Timeout = 10 * time.Second
	cluster.ConnectTimeout = 5 * time.Second

	session, err := cluster.CreateSession()
	if err != nil {
		log.Fatal("Failed to connect to Cassandra:", err)
	}
	defer session.Close()

	log.Println("✅ Connected to Cassandra")

	// Criar a nova tabela se não existir
	createTableQuery := `
		CREATE TABLE IF NOT EXISTS nexus.users_by_username_discriminator (
			username text,
			discriminator text,
			user_id uuid,
			email text,
			PRIMARY KEY (username, discriminator)
		)`

	if err := session.Query(createTableQuery).Exec(); err != nil {
		log.Printf("⚠️ Warning: Failed to create table (may already exist): %v", err)
	} else {
		log.Println("✅ Table users_by_username_discriminator created/verified")
	}

	// Buscar todos os usuários da tabela principal
	query := `SELECT user_id, username, discriminator, email FROM nexus.users`
	iter := session.Query(query).Iter()

	var userID gocql.UUID
	var username, discriminator, email string
	count := 0
	errors := 0

	batch := session.NewBatch(gocql.LoggedBatch)
	batchSize := 0

	for iter.Scan(&userID, &username, &discriminator, &email) {
		// Adicionar ao batch
		batch.Query(`
			INSERT INTO nexus.users_by_username_discriminator (username, discriminator, user_id, email) 
			VALUES (?, ?, ?, ?)`,
			username, discriminator, userID, email)

		batchSize++
		count++

		// Executar batch a cada 100 registros
		if batchSize >= 100 {
			if err := session.ExecuteBatch(batch); err != nil {
				log.Printf("❌ Error executing batch: %v", err)
				errors++
			} else {
				log.Printf("✅ Processed %d users...", count)
			}
			batch = session.NewBatch(gocql.LoggedBatch)
			batchSize = 0
		}
	}

	// Executar último batch se houver registros restantes
	if batchSize > 0 {
		if err := session.ExecuteBatch(batch); err != nil {
			log.Printf("❌ Error executing final batch: %v", err)
			errors++
		}
	}

	if err := iter.Close(); err != nil {
		log.Fatal("❌ Error iterating users:", err)
	}

	log.Printf("🎉 Migration completed!")
	log.Printf("📊 Total users processed: %d", count)
	log.Printf("❌ Errors: %d", errors)

	if errors > 0 {
		log.Printf("⚠️ Migration completed with %d errors. Please check the logs above.", errors)
	} else {
		log.Println("✅ Migration completed successfully with no errors!")
	}

	// Verificar se a migração foi bem-sucedida
	var newTableCount int
	if err := session.Query(`SELECT COUNT(*) FROM nexus.users_by_username_discriminator`).Scan(&newTableCount); err != nil {
		log.Printf("⚠️ Warning: Could not verify new table count: %v", err)
	} else {
		log.Printf("📈 New table contains %d records", newTableCount)
		if newTableCount == count {
			log.Println("✅ Verification passed: Record counts match!")
		} else {
			log.Printf("⚠️ Warning: Record count mismatch. Original: %d, New: %d", count, newTableCount)
		}
	}
}
