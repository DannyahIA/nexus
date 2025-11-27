import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../services/api'

interface User {
  id: string
  username: string
  discriminator: string
  displayName: string
  email: string
  avatar?: string
  bio?: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string) => Promise<void>
  logout: () => void
  setUser: (user: User, token: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        try {
          const response = await api.login(email, password)
          const data = response.data

          // Backend retorna: { token, user: { id, username, email, ... } }
          const userData = data.user || data
          set({
            user: {
              id: userData.id || data.user_id,
              username: userData.username,
              discriminator: userData.discriminator || '0000',
              displayName: userData.displayName || userData.display_name || userData.username,
              email: userData.email,
              avatar: userData.avatar || userData.avatarUrl,
              bio: userData.bio,
            },
            token: data.token,
            isAuthenticated: true,
          })
        } catch (error) {
          console.error('Login error:', error)
          throw error
        }
      },

      register: async (email: string, username: string, password: string) => {
        try {
          const response = await api.register(username, email, password)
          const data = response.data

          // Backend retorna: { token, user: { id, username, email, ... } }
          const userData = data.user || data
          set({
            user: {
              id: userData.id || data.user_id,
              username: userData.username,
              discriminator: userData.discriminator || '0000',
              displayName: userData.displayName || userData.display_name || userData.username,
              email: userData.email,
              avatar: userData.avatar || userData.avatarUrl,
              bio: userData.bio,
            },
            token: data.token,
            isAuthenticated: true,
          })
        } catch (error) {
          console.error('Register error:', error)
          throw error
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        })
      },

      setUser: (user: User, token: string) => {
        set({
          user,
          token,
          isAuthenticated: true,
        })
      },
    }),
    {
      name: 'nexus-auth',
    }
  )
)
