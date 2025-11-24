import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../services/api'

interface User {
  id: string
  username: string
  email: string
  avatar?: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
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

      login: async (username: string, password: string) => {
        try {
          const response = await api.login(username, password)
          const data = response.data

          // Backend retorna: { token, user_id, username, email }
          set({
            user: {
              id: data.user_id,
              username: data.username,
              email: data.email,
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

          // Backend retorna: { token, user_id, username, email }
          set({
            user: {
              id: data.user_id,
              username: data.username,
              email: data.email,
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
