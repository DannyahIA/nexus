-- Cassandra initialization script
-- Run this after cluster is ready

CREATE KEYSPACE IF NOT EXISTS nexus 
WITH replication = {
  'class': 'SimpleStrategy',
  'replication_factor': 1
};

USE nexus;

-- Messages table
CREATE TABLE IF NOT EXISTS messages_by_channel (
  channel_id uuid,
  bucket int,
  ts timestamp,
  msg_id timeuuid,
  author_id uuid,
  content text,
  edited_at timestamp,
  PRIMARY KEY ((channel_id, bucket), ts, msg_id)
) WITH CLUSTERING ORDER BY (ts DESC);

CREATE INDEX IF NOT EXISTS idx_msg_author ON messages_by_channel(author_id);

-- Tasks table  
CREATE TABLE IF NOT EXISTS tasks_by_channel (
  channel_id uuid,
  task_id uuid,
  title text,
  status text,
  assignee uuid,
  position int,
  created_at timestamp,
  updated_at timestamp,
  PRIMARY KEY (channel_id, position, task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_status ON tasks_by_channel(status);
CREATE INDEX IF NOT EXISTS idx_task_assignee ON tasks_by_channel(assignee);

-- Presence table
CREATE TABLE IF NOT EXISTS user_presence (
  user_id uuid PRIMARY KEY,
  status text,
  last_seen timestamp
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  user_id uuid PRIMARY KEY,
  email text,
  username text,
  password_hash text,
  avatar_url text,
  created_at timestamp,
  updated_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_user_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_username ON users(username);

-- Materialized views para buscar usuários
CREATE MATERIALIZED VIEW IF NOT EXISTS users_by_email AS
  SELECT user_id, email, username, password_hash, avatar_url, created_at
  FROM users
  WHERE email IS NOT NULL AND user_id IS NOT NULL
  PRIMARY KEY (email, user_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS users_by_username AS
  SELECT user_id, email, username, password_hash, avatar_url, created_at
  FROM users
  WHERE username IS NOT NULL AND user_id IS NOT NULL
  PRIMARY KEY (username, user_id);

-- Channels table
CREATE TABLE IF NOT EXISTS channels (
  channel_id uuid PRIMARY KEY,
  name text,
  type text,
  owner_id uuid,
  description text,
  created_at timestamp,
  updated_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_channel_owner ON channels(owner_id);

-- Voice sessions table
CREATE TABLE IF NOT EXISTS voice_sessions (
  session_id uuid PRIMARY KEY,
  channel_id uuid,
  user_id uuid,
  started_at timestamp,
  ended_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_voice_channel ON voice_sessions(channel_id);
CREATE INDEX IF NOT EXISTS idx_voice_user ON voice_sessions(user_id);
