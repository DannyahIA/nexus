import { create } from 'zustand'
import { ConnectionQuality } from '../services/connectionMonitor'

interface VoiceState {
  // Estado de conexão
  isConnected: boolean
  currentChannelId: string | null
  currentChannelName: string | null
  connectionState: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  
  // Controles
  isMuted: boolean
  isVideoEnabled: boolean
  isScreenSharing: boolean
  
  // Usuários no canal
  voiceUsers: VoiceUser[]
  
  // Connection quality tracking
  connectionQualities: Map<string, ConnectionQuality>
  
  // Reconnection tracking
  reconnectingUsers: Map<string, { attempt: number, maxAttempts: number }>
  
  // Actions
  setConnected: (channelId: string, channelName: string) => void
  setDisconnected: () => void
  setConnectionState: (state: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void
  setMuted: (muted: boolean) => void
  setVideoEnabled: (enabled: boolean) => void
  setScreenSharing: (sharing: boolean) => void
  addVoiceUser: (user: VoiceUser) => void
  removeVoiceUser: (userId: string) => void
  updateVoiceUser: (userId: string, updates: Partial<VoiceUser>) => void
  setConnectionQuality: (userId: string, quality: ConnectionQuality) => void
  setUserReconnecting: (userId: string, attempt: number, maxAttempts: number) => void
  clearUserReconnecting: (userId: string) => void
}

export interface VoiceUser {
  userId: string
  username: string
  isMuted: boolean
  isSpeaking: boolean
  isVideoEnabled: boolean
}

export const useVoiceStore = create<VoiceState>((set) => ({
  isConnected: false,
  currentChannelId: null,
  currentChannelName: null,
  connectionState: 'idle',
  isMuted: false,
  isVideoEnabled: false,
  isScreenSharing: false,
  voiceUsers: [],
  connectionQualities: new Map(),
  reconnectingUsers: new Map(),
  
  setConnected: (channelId, channelName) =>
    set({
      isConnected: true,
      currentChannelId: channelId,
      currentChannelName: channelName,
      connectionState: 'connected',
    }),
  
  setDisconnected: () =>
    set({
      isConnected: false,
      currentChannelId: null,
      currentChannelName: null,
      connectionState: 'disconnected',
      isMuted: false,
      isVideoEnabled: false,
      isScreenSharing: false,
      voiceUsers: [],
      connectionQualities: new Map(),
      reconnectingUsers: new Map(),
    }),
  
  setConnectionState: (state) => set({ connectionState: state }),
  
  setMuted: (muted) => set({ isMuted: muted }),
  
  setVideoEnabled: (enabled) => set({ isVideoEnabled: enabled }),
  
  setScreenSharing: (sharing) => set({ isScreenSharing: sharing }),
  
  addVoiceUser: (user) =>
    set((state) => {
      // Evitar adicionar usuário duplicado
      if (state.voiceUsers.some(u => u.userId === user.userId)) {
        console.log('User already in voice channel, skipping:', user.userId)
        return state
      }
      return {
        voiceUsers: [...state.voiceUsers, user],
      }
    }),
  
  removeVoiceUser: (userId) =>
    set((state) => {
      const newQualities = new Map(state.connectionQualities)
      newQualities.delete(userId)
      const newReconnecting = new Map(state.reconnectingUsers)
      newReconnecting.delete(userId)
      return {
        voiceUsers: state.voiceUsers.filter((u) => u.userId !== userId),
        connectionQualities: newQualities,
        reconnectingUsers: newReconnecting,
      }
    }),
  
  updateVoiceUser: (userId, updates) =>
    set((state) => ({
      voiceUsers: state.voiceUsers.map((u) =>
        u.userId === userId ? { ...u, ...updates } : u
      ),
    })),
  
  setConnectionQuality: (userId, quality) =>
    set((state) => {
      const newQualities = new Map(state.connectionQualities)
      newQualities.set(userId, quality)
      return {
        connectionQualities: newQualities,
      }
    }),
  
  setUserReconnecting: (userId, attempt, maxAttempts) =>
    set((state) => {
      const newReconnecting = new Map(state.reconnectingUsers)
      newReconnecting.set(userId, { attempt, maxAttempts })
      return {
        reconnectingUsers: newReconnecting,
        connectionState: 'reconnecting',
      }
    }),
  
  clearUserReconnecting: (userId) =>
    set((state) => {
      const newReconnecting = new Map(state.reconnectingUsers)
      newReconnecting.delete(userId)
      return {
        reconnectingUsers: newReconnecting,
        connectionState: newReconnecting.size > 0 ? 'reconnecting' : 'connected',
      }
    }),
}))
