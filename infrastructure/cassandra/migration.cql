-- ============================================
-- NEXUS - Schema de Grupos, Contatos e DMs
-- ============================================

-- GRUPOS (Servidores)
CREATE TABLE IF NOT EXISTS nexus.groups (
  group_id uuid PRIMARY KEY,
  name text,
  description text,
  owner_id uuid,
  icon_url text,
  is_public boolean,
  invite_code text,
  created_at timestamp,
  updated_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON nexus.groups(invite_code);

-- MEMBROS DE GRUPOS
CREATE TABLE IF NOT EXISTS nexus.group_members (
  group_id uuid,
  user_id uuid,
  role text, -- 'owner', 'admin', 'moderator', 'member'
  nickname text,
  joined_at timestamp,
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user ON nexus.group_members(user_id);

-- ATUALIZAR CANAIS PARA INCLUIR GROUP_ID
ALTER TABLE nexus.channels ADD group_id uuid;
ALTER TABLE nexus.channels ADD is_private boolean;

-- MEMBROS DE CANAIS (para canais privados/DMs)
CREATE TABLE IF NOT EXISTS nexus.channel_members (
  channel_id uuid,
  user_id uuid,
  role text, -- 'owner', 'admin', 'member'
  last_read_at timestamp,
  joined_at timestamp,
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_members_user ON nexus.channel_members(user_id);

-- CONTATOS (Sistema de Amizade)
CREATE TABLE IF NOT EXISTS nexus.friend_requests (
  from_user_id uuid,
  to_user_id uuid,
  status text, -- 'pending', 'accepted', 'rejected', 'blocked'
  created_at timestamp,
  updated_at timestamp,
  PRIMARY KEY (from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON nexus.friend_requests(to_user_id);

CREATE TABLE IF NOT EXISTS nexus.friends (
  user_id uuid,
  friend_id uuid,
  nickname text,
  dm_channel_id uuid,
  added_at timestamp,
  PRIMARY KEY (user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friends_user ON nexus.friends(user_id);

-- DMs - Relação entre usuários e seus canais de DM
CREATE TABLE IF NOT EXISTS nexus.user_dm_channels (
  user_id uuid,
  channel_id uuid,
  other_user_id uuid, -- para DMs 1:1
  last_message_at timestamp,
  PRIMARY KEY (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_user_dm_channels ON nexus.user_dm_channels(user_id);
