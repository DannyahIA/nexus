package database

import (
	"time"

	"github.com/gocql/gocql"
)

// ==================== GRUPOS ====================

// CreateGroup cria um novo grupo
func (db *CassandraDB) CreateGroup(groupID, name, description, ownerID, iconURL string, isPublic bool, inviteCode string, createdAt, updatedAt time.Time) error {
	query := `INSERT INTO nexus.groups (group_id, name, description, owner_id, icon_url, is_public, invite_code, created_at, updated_at)
	          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	
	groupUUID, _ := gocql.ParseUUID(groupID)
	ownerUUID, _ := gocql.ParseUUID(ownerID)
	
	return db.session.Query(query, groupUUID, name, description, ownerUUID, iconURL, isPublic, inviteCode, createdAt, updatedAt).Exec()
}

// AddGroupMember adiciona um membro a um grupo
func (db *CassandraDB) AddGroupMember(groupID, userID, role, nickname string, joinedAt time.Time) error {
	query := `INSERT INTO nexus.group_members (group_id, user_id, role, nickname, joined_at)
	          VALUES (?, ?, ?, ?, ?)`
	
	groupUUID, _ := gocql.ParseUUID(groupID)
	userUUID, _ := gocql.ParseUUID(userID)
	
	return db.session.Query(query, groupUUID, userUUID, role, nickname, joinedAt).Exec()
}

// GetUserGroups retorna grupos de um usuário
func (db *CassandraDB) GetUserGroups(userID string) ([]map[string]interface{}, error) {
	query := `SELECT g.group_id, g.name, g.description, g.owner_id, g.icon_url, g.is_public, g.created_at, gm.role
	          FROM nexus.groups g
	          INNER JOIN nexus.group_members gm ON g.group_id = gm.group_id
	          WHERE gm.user_id = ? ALLOW FILTERING`
	
	userUUID, _ := gocql.ParseUUID(userID)
	iter := db.session.Query(query, userUUID).Iter()
	defer iter.Close()

	var results []map[string]interface{}
	var groupID, ownerID gocql.UUID
	var name, description, iconURL, role string
	var isPublic bool
	var createdAt time.Time

	for iter.Scan(&groupID, &name, &description, &ownerID, &iconURL, &isPublic, &createdAt, &role) {
		row := map[string]interface{}{
			"group_id":    groupID.String(),
			"name":        name,
			"description": description,
			"owner_id":    ownerID.String(),
			"icon_url":    iconURL,
			"is_public":   isPublic,
			"created_at":  createdAt,
			"role":        role,
		}
		results = append(results, row)
	}

	return results, iter.Close()
}

// IsGroupMember verifica se usuário é membro do grupo
func (db *CassandraDB) IsGroupMember(groupID, userID string) (bool, error) {
	query := `SELECT user_id FROM nexus.group_members WHERE group_id = ? AND user_id = ?`
	
	groupUUID, _ := gocql.ParseUUID(groupID)
	userUUID, _ := gocql.ParseUUID(userID)
	
	var foundUserID gocql.UUID
	err := db.session.Query(query, groupUUID, userUUID).Scan(&foundUserID)
	if err == gocql.ErrNotFound {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// GetGroupByInviteCode busca grupo pelo código de convite
func (db *CassandraDB) GetGroupByInviteCode(inviteCode string) (map[string]interface{}, error) {
	query := `SELECT group_id, name, description, owner_id, icon_url, created_at
	          FROM nexus.groups WHERE invite_code = ? ALLOW FILTERING`
	
	var groupID, ownerID gocql.UUID
	var name, description, iconURL string
	var createdAt time.Time

	err := db.session.Query(query, inviteCode).Scan(&groupID, &name, &description, &ownerID, &iconURL, &createdAt)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"group_id":    groupID.String(),
		"name":        name,
		"description": description,
		"owner_id":    ownerID.String(),
		"icon_url":    iconURL,
		"created_at":  createdAt,
	}, nil
}

// GetGroupByID busca grupo pelo ID
func (db *CassandraDB) GetGroupByID(groupID string) (map[string]interface{}, error) {
	query := `SELECT group_id, name, description, owner_id, icon_url, created_at
	          FROM nexus.groups WHERE group_id = ?`
	
	groupUUID, _ := gocql.ParseUUID(groupID)
	
	var foundGroupID, ownerID gocql.UUID
	var name, description, iconURL string
	var createdAt time.Time

	err := db.session.Query(query, groupUUID).Scan(&foundGroupID, &name, &description, &ownerID, &iconURL, &createdAt)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"group_id":    foundGroupID.String(),
		"name":        name,
		"description": description,
		"owner_id":    ownerID.String(),
		"icon_url":    iconURL,
		"created_at":  createdAt,
	}, nil
}

// GetGroupMemberRole retorna o role de um membro no grupo
func (db *CassandraDB) GetGroupMemberRole(groupID, userID string) (string, error) {
	query := `SELECT role FROM nexus.group_members WHERE group_id = ? AND user_id = ?`
	
	groupUUID, _ := gocql.ParseUUID(groupID)
	userUUID, _ := gocql.ParseUUID(userID)
	
	var role string
	err := db.session.Query(query, groupUUID, userUUID).Scan(&role)
	if err != nil {
		return "", err
	}
	return role, nil
}

// SetChannelGroup associa um canal a um grupo
func (db *CassandraDB) SetChannelGroup(channelID, groupID string) error {
	query := `UPDATE nexus.channels SET group_id = ? WHERE channel_id = ?`
	
	channelUUID, _ := gocql.ParseUUID(channelID)
	groupUUID, _ := gocql.ParseUUID(groupID)
	
	return db.session.Query(query, groupUUID, channelUUID).Exec()
}

// GetGroupChannels retorna canais de um grupo
func (db *CassandraDB) GetGroupChannels(groupID string) ([]map[string]interface{}, error) {
	query := `SELECT channel_id, name, type, description, owner_id, is_private, created_at
	          FROM nexus.channels WHERE group_id = ? ALLOW FILTERING`
	
	groupUUID, _ := gocql.ParseUUID(groupID)
	iter := db.session.Query(query, groupUUID).Iter()
	defer iter.Close()

	var results []map[string]interface{}
	var channelID, ownerID gocql.UUID
	var name, channelType, description string
	var isPrivate bool
	var createdAt time.Time

	for iter.Scan(&channelID, &name, &channelType, &description, &ownerID, &isPrivate, &createdAt) {
		row := map[string]interface{}{
			"channel_id":  channelID.String(),
			"name":        name,
			"type":        channelType,
			"description": description,
			"owner_id":    ownerID.String(),
			"is_private":  isPrivate,
			"created_at":  createdAt,
		}
		results = append(results, row)
	}

	return results, iter.Close()
}

// DeleteServer deleta um servidor (grupo)
func (db *CassandraDB) DeleteServer(serverID string) error {
	query := `DELETE FROM nexus.groups WHERE group_id = ?`
	
	serverUUID, err := gocql.ParseUUID(serverID)
	if err != nil {
		return err
	}
	
	return db.session.Query(query, serverUUID).Exec()
}

// ==================== AMIGOS ====================

// CreateFriendRequest cria uma solicitação de amizade
func (db *CassandraDB) CreateFriendRequest(fromUserID, toUserID, status string, createdAt time.Time) error {
	query := `INSERT INTO nexus.friend_requests (from_user_id, to_user_id, status, created_at, updated_at)
	          VALUES (?, ?, ?, ?, ?)`
	
	fromUUID, _ := gocql.ParseUUID(fromUserID)
	toUUID, _ := gocql.ParseUUID(toUserID)
	
	return db.session.Query(query, fromUUID, toUUID, status, createdAt, createdAt).Exec()
}

// FriendRequestExists verifica se já existe solicitação entre usuários
func (db *CassandraDB) FriendRequestExists(fromUserID, toUserID string) (bool, error) {
	query := `SELECT from_user_id FROM nexus.friend_requests WHERE from_user_id = ? AND to_user_id = ?`
	
	fromUUID, _ := gocql.ParseUUID(fromUserID)
	toUUID, _ := gocql.ParseUUID(toUserID)
	
	var foundUserID gocql.UUID
	err := db.session.Query(query, fromUUID, toUUID).Scan(&foundUserID)
	if err == gocql.ErrNotFound {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// GetPendingFriendRequests retorna solicitações pendentes recebidas
func (db *CassandraDB) GetPendingFriendRequests(userID string) ([]map[string]interface{}, error) {
	query := `SELECT from_user_id, to_user_id, status, created_at
	          FROM nexus.friend_requests WHERE to_user_id = ? AND status = 'pending' ALLOW FILTERING`
	
	userUUID, _ := gocql.ParseUUID(userID)
	iter := db.session.Query(query, userUUID).Iter()
	defer iter.Close()

	var results []map[string]interface{}
	var fromUserID, toUserID gocql.UUID
	var status string
	var createdAt time.Time

	for iter.Scan(&fromUserID, &toUserID, &status, &createdAt) {
		row := map[string]interface{}{
			"from_user_id": fromUserID.String(),
			"to_user_id":   toUserID.String(),
			"status":       status,
			"created_at":   createdAt,
		}
		results = append(results, row)
	}

	return results, iter.Close()
}

// UpdateFriendRequestStatus atualiza status de solicitação
func (db *CassandraDB) UpdateFriendRequestStatus(fromUserID, toUserID, status string) error {
	query := `UPDATE nexus.friend_requests SET status = ?, updated_at = ? WHERE from_user_id = ? AND to_user_id = ?`
	
	fromUUID, _ := gocql.ParseUUID(fromUserID)
	toUUID, _ := gocql.ParseUUID(toUserID)
	
	return db.session.Query(query, status, time.Now(), fromUUID, toUUID).Exec()
}

// AddFriend adiciona amizade
func (db *CassandraDB) AddFriend(userID, friendID, nickname, dmChannelID string, addedAt time.Time) error {
	query := `INSERT INTO nexus.friends (user_id, friend_id, nickname, dm_channel_id, added_at)
	          VALUES (?, ?, ?, ?, ?)`
	
	userUUID, _ := gocql.ParseUUID(userID)
	friendUUID, _ := gocql.ParseUUID(friendID)
	dmChannelUUID, _ := gocql.ParseUUID(dmChannelID)
	
	return db.session.Query(query, userUUID, friendUUID, nickname, dmChannelUUID, addedAt).Exec()
}

// GetFriends retorna lista de amigos
func (db *CassandraDB) GetFriends(userID string) ([]map[string]interface{}, error) {
	query := `SELECT friend_id, nickname, dm_channel_id, added_at FROM nexus.friends WHERE user_id = ?`
	
	userUUID, _ := gocql.ParseUUID(userID)
	iter := db.session.Query(query, userUUID).Iter()
	defer iter.Close()

	var results []map[string]interface{}
	var friendID, dmChannelID gocql.UUID
	var nickname string
	var addedAt time.Time

	for iter.Scan(&friendID, &nickname, &dmChannelID, &addedAt) {
		row := map[string]interface{}{
			"friend_id":     friendID.String(),
			"nickname":      nickname,
			"dm_channel_id": dmChannelID.String(),
			"added_at":      addedAt,
		}
		results = append(results, row)
	}

	return results, iter.Close()
}

// RemoveFriend remove amizade
func (db *CassandraDB) RemoveFriend(userID, friendID string) error {
	query := `DELETE FROM nexus.friends WHERE user_id = ? AND friend_id = ?`
	
	userUUID, _ := gocql.ParseUUID(userID)
	friendUUID, _ := gocql.ParseUUID(friendID)
	
	return db.session.Query(query, userUUID, friendUUID).Exec()
}

// ==================== DMs ====================

// CreateDMChannel cria um canal de DM
func (db *CassandraDB) CreateDMChannel(channelID, user1ID, user2ID string) error {
	// Criar canal
	channelUUID, _ := gocql.ParseUUID(channelID)
	user1UUID, _ := gocql.ParseUUID(user1ID)
	
	query1 := `INSERT INTO nexus.channels (channel_id, name, type, owner_id, is_private, created_at, updated_at)
	           VALUES (?, ?, ?, ?, ?, ?, ?)`
	
	now := time.Now()
	err := db.session.Query(query1, channelUUID, "DM", "dm", user1UUID, true, now, now).Exec()
	if err != nil {
		return err
	}

	// Adicionar ambos os usuários ao canal
	query2 := `INSERT INTO nexus.channel_members (channel_id, user_id, role, joined_at)
	           VALUES (?, ?, ?, ?)`
	
	user2UUID, _ := gocql.ParseUUID(user2ID)
	
	err = db.session.Query(query2, channelUUID, user1UUID, "member", now).Exec()
	if err != nil {
		return err
	}
	
	return db.session.Query(query2, channelUUID, user2UUID, "member", now).Exec()
}

// GetUserDMChannels retorna canais de DM do usuário
func (db *CassandraDB) GetUserDMChannels(userID string) ([]map[string]interface{}, error) {
	query := `SELECT c.channel_id, c.name, c.type, c.created_at
	          FROM nexus.channels c
	          INNER JOIN nexus.channel_members cm ON c.channel_id = cm.channel_id
	          WHERE cm.user_id = ? AND c.type = 'dm' ALLOW FILTERING`
	
	userUUID, _ := gocql.ParseUUID(userID)
	iter := db.session.Query(query, userUUID).Iter()
	defer iter.Close()

	var results []map[string]interface{}
	var channelID gocql.UUID
	var name, channelType string
	var createdAt time.Time

	for iter.Scan(&channelID, &name, &channelType, &createdAt) {
		row := map[string]interface{}{
			"channel_id": channelID.String(),
			"name":       name,
			"type":       channelType,
			"created_at": createdAt,
		}
		results = append(results, row)
	}

	return results, iter.Close()
}

// ==================== SERVIDORES ====================

// CreateServer cria um novo servidor
func (db *CassandraDB) CreateServer(serverID, name, description, ownerID, iconURL string) error {
	query := `INSERT INTO nexus.groups (group_id, name, description, owner_id, icon_url, type, created_at, updated_at)
	          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	
	serverUUID, _ := gocql.ParseUUID(serverID)
	ownerUUID, _ := gocql.ParseUUID(ownerID)
	now := time.Now()
	
	return db.session.Query(query, serverUUID, name, description, ownerUUID, iconURL, "server", now, now).Exec()
}

// AddServerMember adiciona um membro a um servidor
func (db *CassandraDB) AddServerMember(serverID, userID, role string) error {
	query := `INSERT INTO nexus.group_members (group_id, user_id, role, joined_at)
	          VALUES (?, ?, ?, ?)`
	
	serverUUID, _ := gocql.ParseUUID(serverID)
	userUUID, _ := gocql.ParseUUID(userID)
	now := time.Now()
	
	return db.session.Query(query, serverUUID, userUUID, role, now).Exec()
}

// GetUserServers retorna servidores de um usuário
func (db *CassandraDB) GetUserServers(userID string) ([]map[string]interface{}, error) {
	// Primeiro busca as memberships do usuário
	userUUID, _ := gocql.ParseUUID(userID)
	
	membersQuery := `SELECT group_id FROM nexus.group_members WHERE user_id = ?`
	membersIter := db.session.Query(membersQuery, userUUID).Iter()
	defer membersIter.Close()

	var serverIDs []gocql.UUID
	var groupID gocql.UUID
	for membersIter.Scan(&groupID) {
		serverIDs = append(serverIDs, groupID)
	}

	if err := membersIter.Close(); err != nil {
		return nil, err
	}

	var results []map[string]interface{}

	// Para cada servidor, busca os detalhes
	for _, serverID := range serverIDs {
		serverQuery := `SELECT group_id, name, description, owner_id, icon_url, created_at 
		                FROM nexus.groups WHERE group_id = ? AND type = 'server'`
		
		var name, description, iconURL string
		var ownerID gocql.UUID
		var createdAt time.Time
		
		if err := db.session.Query(serverQuery, serverID).Scan(&serverID, &name, &description, &ownerID, &iconURL, &createdAt); err != nil {
			if err == gocql.ErrNotFound {
				continue // Skip se não for um servidor
			}
			return nil, err
		}

		row := map[string]interface{}{
			"server_id":   serverID.String(),
			"name":        name,
			"description": description,
			"owner_id":    ownerID.String(),
			"icon_url":    iconURL,
			"created_at":  createdAt.UnixMilli(),
		}
		results = append(results, row)
	}

	return results, nil
}

// CreateServerChannel cria um canal em um servidor
func (db *CassandraDB) CreateServerChannel(channelID, serverID, name, description, channelType, ownerID string) error {
	query := `INSERT INTO nexus.channels (channel_id, name, type, owner_id, description, server_id, created_at, updated_at)
	          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	
	channelUUID, _ := gocql.ParseUUID(channelID)
	serverUUID, _ := gocql.ParseUUID(serverID)
	ownerUUID, _ := gocql.ParseUUID(ownerID)
	now := time.Now()
	
	return db.session.Query(query, channelUUID, name, channelType, ownerUUID, description, serverUUID, now, now).Exec()
}

// GetServerChannels retorna canais de um servidor
func (db *CassandraDB) GetServerChannels(serverID string) ([]map[string]interface{}, error) {
	query := `SELECT channel_id, name, type, owner_id, description, server_id, created_at
	          FROM nexus.channels
	          WHERE server_id = ?
	          ALLOW FILTERING`
	
	serverUUID, _ := gocql.ParseUUID(serverID)
	iter := db.session.Query(query, serverUUID).Iter()
	defer iter.Close()

	var results []map[string]interface{}
	var channelID, ownerID, serverUUID2 gocql.UUID
	var name, channelType, description string
	var createdAt time.Time

	for iter.Scan(&channelID, &name, &channelType, &ownerID, &description, &serverUUID2, &createdAt) {
		row := map[string]interface{}{
			"channel_id":  channelID.String(),
			"name":        name,
			"type":        channelType,
			"owner_id":    ownerID.String(),
			"description": description,
			"server_id":   serverUUID2.String(),
			"created_at":  createdAt,
		}
		results = append(results, row)
	}

	return results, iter.Close()
}

// UpdateServer atualiza informações de um servidor
func (db *CassandraDB) UpdateServer(serverID, name, description string) error {
	query := `UPDATE nexus.groups SET name = ?, description = ? WHERE group_id = ?`
	
	serverUUID, _ := gocql.ParseUUID(serverID)
	
	return db.session.Query(query, name, description, serverUUID).Exec()
}

// UpdateChannel atualiza informações de um canal
func (db *CassandraDB) UpdateChannel(channelID, name, description string) error {
	query := `UPDATE nexus.channels SET name = ?, description = ? WHERE channel_id = ?`
	
	channelUUID, _ := gocql.ParseUUID(channelID)
	
	return db.session.Query(query, name, description, channelUUID).Exec()
}
