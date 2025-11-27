import { create } from 'zustand'

interface VoiceUser {
  id: string
  username: string
  displayName?: string
  avatar?: string
  isMuted?: boolean
  isDeafened?: boolean
  isSpeaking?: boolean
}

interface VoiceUsersState {
  // Map de channelId -> array de usuários
  usersByChannel: Record<string, VoiceUser[]>
  
  // Adicionar usuário a um canal
  addUser: (channelId: string, user: VoiceUser) => void
  
  // Remover usuário de um canal
  removeUser: (channelId: string, userId: string) => void
  
  // Atualizar status de um usuário
  updateUserStatus: (channelId: string, userId: string, status: Partial<VoiceUser>) => void
  
  // Limpar todos os usuários de um canal
  clearChannel: (channelId: string) => void
  
  // Obter usuários de um canal
  getUsersInChannel: (channelId: string) => VoiceUser[]
}

export const useVoiceUsersStore = create<VoiceUsersState>((set, get) => ({
  usersByChannel: {},
  
  addUser: (channelId, user) =>
    set((state) => {
      const existingUsers = state.usersByChannel[channelId] || []
      // Evitar duplicatas
      if (existingUsers.some(u => u.id === user.id)) {
        return state
      }
      return {
        usersByChannel: {
          ...state.usersByChannel,
          [channelId]: [...existingUsers, user],
        },
      }
    }),
  
  removeUser: (channelId, userId) =>
    set((state) => ({
      usersByChannel: {
        ...state.usersByChannel,
        [channelId]: (state.usersByChannel[channelId] || []).filter(
          (u) => u.id !== userId
        ),
      },
    })),
  
  updateUserStatus: (channelId, userId, status) =>
    set((state) => ({
      usersByChannel: {
        ...state.usersByChannel,
        [channelId]: (state.usersByChannel[channelId] || []).map((u) =>
          u.id === userId ? { ...u, ...status } : u
        ),
      },
    })),
  
  clearChannel: (channelId) =>
    set((state) => ({
      usersByChannel: {
        ...state.usersByChannel,
        [channelId]: [],
      },
    })),
  
  getUsersInChannel: (channelId) => {
    return get().usersByChannel[channelId] || []
  },
}))
