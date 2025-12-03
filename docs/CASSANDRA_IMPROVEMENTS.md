# ⚠️ PROBLEMAS IDENTIFICADOS NO CASSANDRA

## 1. QUERIES COM ALLOW FILTERING
**Problema**: Queries usando ALLOW FILTERING podem causar scan completo da tabela
**Arquivos afetados**:
- `/backend/internal/database/cassandra.go`
- `/backend/scripts/migrate_discriminators.go`

### Soluções:
1. Criar tabela secundária para busca por discriminator:
```cql
CREATE TABLE users_by_username_discriminator (
    username text,
    discriminator text,
    user_id uuid,
    PRIMARY KEY (username, discriminator)
);
```

2. Criar índice secundário:
```cql
CREATE INDEX ON users (discriminator);
```

## 2. PARTICIONAMENTO INADEQUADO
**Problema**: Bucket por mês pode criar hotspots
```go
bucket := time.Now().Year()*100 + int(time.Now().Month())
```

### Solução: Usar bucketing por dia + shard:
```go
bucket := fmt.Sprintf("%d_%02d_%02d_%d", 
    now.Year(), now.Month(), now.Day(), 
    hash(channelID) % 10) // 10 shards por dia
```

## 3. TIMEOUT E RETRY POLICY
**Problema**: Sem configuração de timeout e retry

### Solução:
```go
cluster.Timeout = 10 * time.Second
cluster.ConnectTimeout = 5 * time.Second
cluster.RetryPolicy = &gocql.SimpleRetryPolicy{NumRetries: 3}
cluster.Consistency = gocql.LocalQuorum // Melhor para multi-DC
```

## 4. CONNECTION POOLING
**Problema**: Configuração padrão pode ser inadequada

### Solução:
```go
cluster.NumConns = 2 // Conexões por host
cluster.PoolConfig.HostSelectionPolicy = gocql.TokenAwareHostPolicy(gocql.RoundRobinHostPolicy())
```
