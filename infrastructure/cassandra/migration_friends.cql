-- Migration: Friends and DM system
-- Run this to add friends and DM functionality

USE nexus;

-- Friend requests table
CREATE TABLE IF NOT EXISTS friend_requests (
  from_user_id uuid,
  to_user_id uuid,
  status text, -- 'pending', 'accepted', 'rejected'
  created_at timestamp,
  updated_at timestamp,
  PRIMARY KEY (from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_request_to ON friend_requests(to_user_id);
CREATE INDEX IF NOT EXISTS idx_friend_request_status ON friend_requests(status);

-- Friends table
CREATE TABLE IF NOT EXISTS friends (
  user_id uuid,
  friend_id uuid,
  nickname text,
  dm_channel_id uuid,
  added_at timestamp,
  PRIMARY KEY (user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_reverse ON friends(friend_id);

-- Update channels table to support server_id
ALTER TABLE channels ADD server_id uuid;
CREATE INDEX IF NOT EXISTS idx_channel_server ON channels(server_id);

-- Channel members table (for DMs and group DMs)
CREATE TABLE IF NOT EXISTS channel_members (
  channel_id uuid,
  user_id uuid,
  role text, -- 'owner', 'member'
  joined_at timestamp,
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_member_user ON channel_members(user_id);
