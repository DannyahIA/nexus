-- Adicionar novos campos à tabela users
-- Execute este script no cqlsh para atualizar o schema

USE nexus;

-- Adicionar coluna discriminator
ALTER TABLE users ADD discriminator text;

-- Adicionar coluna display_name
ALTER TABLE users ADD display_name text;

-- Adicionar coluna bio
ALTER TABLE users ADD bio text;

-- Criar índice para discriminator
CREATE INDEX IF NOT EXISTS idx_user_discriminator ON users(discriminator);

-- Nota: Para usuários existentes, você precisará gerar discriminadores únicos
-- Exemplo de como atualizar usuários existentes (execute manualmente):
-- UPDATE users SET discriminator = '0001', display_name = username WHERE user_id = <uuid>;
