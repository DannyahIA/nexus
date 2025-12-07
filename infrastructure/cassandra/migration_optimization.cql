-- Migração para criar tabela de índice otimizada
-- Execute este script no Cassandra após deploy

-- 1. Criar nova tabela de índice para evitar ALLOW FILTERING
CREATE TABLE IF NOT EXISTS nexus.users_by_username_discriminator (
    username text,
    discriminator text,
    user_id uuid,
    email text,
    PRIMARY KEY (username, discriminator)
);

-- 2. Popular a nova tabela com dados existentes
-- (Este comando deve ser executado via script Go, não CQL diretamente)
-- INSERT INTO nexus.users_by_username_discriminator (username, discriminator, user_id, email) 
-- SELECT username, discriminator, user_id, email FROM nexus.users;

-- 3. Criar índice secundário como backup (opcional)
-- CREATE INDEX IF NOT EXISTS ON nexus.users (discriminator);

-- 4. Otimizações de performance
-- Configurar compaction strategy para tabelas com muitas escritas
ALTER TABLE nexus.messages_by_channel WITH compaction = {
    'class': 'TimeWindowCompactionStrategy',
    'compaction_window_unit': 'DAYS',
    'compaction_window_size': 1
};

ALTER TABLE nexus.tasks_by_channel WITH compaction = {
    'class': 'SizeTieredCompactionStrategy',
    'max_threshold': 32,
    'min_threshold': 4
};

-- 5. Configurar TTL para dados temporários (opcional)
-- ALTER TABLE nexus.user_presence WITH default_time_to_live = 86400; -- 24 horas
