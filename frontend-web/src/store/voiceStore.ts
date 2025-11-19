import { create } from 'zustand'
import { ConnectionQuality } from '../services/connectionMonitor'

interface VoiceState {
  // Estado de conexão
  isConnected: boolean
  currentChannelId: string | null
  currentChannelName: string | null
  
  // Controles
  isMuted: boolean
  isVideoEnabled: boolean
  isScreenSharing: boolean
  
  // Usuários no canal
  voiceUsers: VoiceUser[]
  
  // Connection quality tracking
  connectionQualities: Map<string, ConnectionQuality>
  
  // Actions
  setConnected: (channelId: string, channelName: string) => void
  setDisconnected: () => void
  setMuted: (muted: boolean) => void
  setVideoEnabled: (enabled: boolean) => void
  setScreenSharing: (sharing: boolean) => void
  addVoiceUser: (user: VoiceUser) => void
  removeVoiceUser: (userId: string) => void
  updateVoiceUser: (userId: string, updates: Partial<VoiceUser>) => void
  setConnectionQuality: (userId: string, quality: ConnectionQuality) => void
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
  isMuted: false,
  isVideoEnabled: false,
  isScreenSharing: false,
  voiceUsers: [],
  connectionQualities: new Map(),
  
  setConnected: (channelId, channelName) =>
    set({
      isConnected: true,
      currentChannelId: channelId,
      currentChannelName: channelName,
    }),
  
  setDisconnected: () =>
    set({
      isConnected: false,
      currentChannelId: null,
      currentChannelName: null,
      isMuted: false,
      isVideoEnabled: false,
      isScreenSharing: false,
      voiceUsers: [],
      connectionQualities: new Map(),
    }),
  
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
      return {
        voiceUsers: state.voiceUsers.filter((u) => u.userId !== userId),
        connectionQualities: newQualities,
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
}))
