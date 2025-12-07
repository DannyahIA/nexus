import { create } from 'zustand'

export interface Server {
  id: string
  name: string
  description?: string
  ownerId: string
  iconUrl?: string
  isPublic: boolean
  inviteCode?: string
  createdAt: number
  memberCount?: number
}

export interface ServerMember {
  serverId: string
  userId: string
  username: string
  role: 'owner' | 'admin' | 'moderator' | 'member'
  joinedAt: number
}

export interface Channel {
  id: string
  serverId?: string
  name: string
  type: 'text' | 'voice' | 'dm' | 'group_dm' | 'announcement' | 'task'
  description?: string
  isPrivate: boolean
  ownerId?: string
  participants?: string[] // Para DMs e Group DMs
  createdAt: number
}

interface ServerState {
  servers: Server[]
  activeServerId: string | null
  serverChannels: Record<string, Channel[]>
  serverMembers: Record<string, ServerMember[]>

  setServers: (servers: Server[]) => void
  addServer: (server: Server) => void
  updateServer: (serverId: string, updates: Partial<Server>) => void
  removeServer: (serverId: string) => void

  setActiveServer: (serverId: string | null) => void

  setServerChannels: (serverId: string, channels: Channel[]) => void
  addChannel: (serverId: string, channel: Channel) => void
  updateChannel: (channelId: string, updates: Partial<Channel>) => void
  removeChannel: (serverId: string, channelId: string) => void

  setServerMembers: (serverId: string, members: ServerMember[]) => void
  addMember: (serverId: string, member: ServerMember) => void
  removeMember: (serverId: string, userId: string) => void
}

export const useServerStore = create<ServerState>((set) => ({
  servers: [],
  activeServerId: null,
  serverChannels: {},
  serverMembers: {},

  setServers: (servers) => set({ servers }),

  addServer: (server) =>
    set((state) => ({ servers: [...state.servers, server] })),

  updateServer: (serverId, updates) =>
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === serverId ? { ...s, ...updates } : s
      ),
    })),

  removeServer: (serverId) =>
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== serverId),
      serverChannels: Object.fromEntries(
        Object.entries(state.serverChannels).filter(([id]) => id !== serverId)
      ),
    })),

  setActiveServer: (serverId) => set({ activeServerId: serverId }),

  setServerChannels: (serverId, channels) =>
    set((state) => ({
      serverChannels: { ...state.serverChannels, [serverId]: channels },
    })),

  addChannel: (serverId, channel) =>
    set((state) => ({
      serverChannels: {
        ...state.serverChannels,
        [serverId]: [...(state.serverChannels[serverId] || []), channel],
      },
    })),

  updateChannel: (channelId, updates) =>
    set((state) => ({
      serverChannels: Object.fromEntries(
        Object.entries(state.serverChannels).map(([serverId, channels]) => [
          serverId,
          channels.map((c) => (c.id === channelId ? { ...c, ...updates } : c)),
        ])
      ),
    })),

  removeChannel: (serverId, channelId) =>
    set((state) => ({
      serverChannels: {
        ...state.serverChannels,
        [serverId]: (state.serverChannels[serverId] || []).filter(
          (c) => c.id !== channelId
        ),
      },
    })),

  setServerMembers: (serverId, members) =>
    set((state) => ({
      serverMembers: { ...state.serverMembers, [serverId]: members },
    })),

  addMember: (serverId, member) =>
    set((state) => ({
      serverMembers: {
        ...state.serverMembers,
        [serverId]: [...(state.serverMembers[serverId] || []), member],
      },
    })),

  removeMember: (serverId, userId) =>
    set((state) => ({
      serverMembers: {
        ...state.serverMembers,
        [serverId]: (state.serverMembers[serverId] || []).filter(
          (m) => m.userId !== userId
        ),
      },
    })),
}))
