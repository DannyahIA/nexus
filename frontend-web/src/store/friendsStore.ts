import { create } from 'zustand'

export interface Friend {
  userId: string
  username: string
  discriminator: string
  displayName: string
  email: string
  avatarUrl?: string
  bio?: string
  status: 'online' | 'offline' | 'idle' | 'dnd'
  addedAt: number
  dmChannelId?: string
}

export interface FriendRequest {
  id: string
  fromUserId: string
  fromUsername: string
  toUserId: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: number
}

export interface DMChannel {
  id: string
  type: 'dm' | 'group_dm'
  name?: string // Para group DMs
  participants: {
    userId: string
    username: string
    avatarUrl?: string
  }[]
  lastMessageAt?: number
  lastMessage?: string
}

interface FriendsState {
  friends: Friend[]
  friendRequests: FriendRequest[]
  dmChannels: DMChannel[]
  activeDMId: string | null
  
  setFriends: (friends: Friend[]) => void
  addFriend: (friend: Friend) => void
  removeFriend: (userId: string) => void
  updateFriendStatus: (userId: string, status: Friend['status']) => void
  
  setFriendRequests: (requests: FriendRequest[]) => void
  addFriendRequest: (request: FriendRequest) => void
  removeFriendRequest: (requestId: string) => void
  
  setDMChannels: (channels: DMChannel[]) => void
  addDMChannel: (channel: DMChannel) => void
  updateDMChannel: (channelId: string, updates: Partial<DMChannel>) => void
  removeDMChannel: (channelId: string) => void
  
  setActiveDM: (channelId: string | null) => void
}

export const useFriendsStore = create<FriendsState>((set) => ({
  friends: [],
  friendRequests: [],
  dmChannels: [],
  activeDMId: null,
  
  setFriends: (friends) => set({ friends }),
  
  addFriend: (friend) =>
    set((state) => ({ friends: [...state.friends, friend] })),
  
  removeFriend: (userId) =>
    set((state) => ({
      friends: state.friends.filter((f) => f.userId !== userId),
    })),
  
  updateFriendStatus: (userId, status) =>
    set((state) => ({
      friends: state.friends.map((f) =>
        f.userId === userId ? { ...f, status } : f
      ),
    })),
  
  setFriendRequests: (requests) => set({ friendRequests: requests }),
  
  addFriendRequest: (request) =>
    set((state) => ({
      friendRequests: [...state.friendRequests, request],
    })),
  
  removeFriendRequest: (requestId) =>
    set((state) => ({
      friendRequests: state.friendRequests.filter((r) => r.id !== requestId),
    })),
  
  setDMChannels: (channels) => set({ dmChannels: channels }),
  
  addDMChannel: (channel) =>
    set((state) => ({ dmChannels: [...state.dmChannels, channel] })),
  
  updateDMChannel: (channelId, updates) =>
    set((state) => ({
      dmChannels: state.dmChannels.map((c) =>
        c.id === channelId ? { ...c, ...updates } : c
      ),
    })),
  
  removeDMChannel: (channelId) =>
    set((state) => ({
      dmChannels: state.dmChannels.filter((c) => c.id !== channelId),
    })),
  
  setActiveDM: (channelId) => set({ activeDMId: channelId }),
}))
