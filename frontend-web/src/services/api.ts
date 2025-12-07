import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Debug: mostrar qual URL está sendo usada
console.log('🔗 API_BASE_URL:', API_BASE_URL)
console.log('🔗 VITE_API_URL env:', import.meta.env.VITE_API_URL)

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    console.log('🌐 API Request:', config.method?.toUpperCase(), config.url, 'Full URL:', `${config.baseURL || ''}${config.url || ''}`)
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// API methods
export const api = {
  // Auth
  login: (email: string, password: string) =>
    apiClient.post('/api/auth/login', { email, password }),

  register: (username: string, email: string, password: string) =>
    apiClient.post('/api/auth/register', { username, email, password }),

  // Channels
  getChannels: () => apiClient.get('/api/channels'),

  getChannel: (channelId: string) =>
    apiClient.get(`/api/channels?id=${channelId}`),

  createChannel: (data: { name: string; description?: string; type: string }) =>
    apiClient.post('/api/channels', data),

  updateChannel: (channelId: string, data: { name: string; description?: string; type: string }) =>
    apiClient.patch(`/api/channels?id=${channelId}`, data),

  deleteChannel: (channelId: string) =>
    apiClient.delete(`/api/channels?id=${channelId}`),

  // Messages
  getMessages: (channelId: string, params?: { limit?: number; before?: number }) => {
    const queryParams = new URLSearchParams({ channelId })
    if (params?.limit) queryParams.set('limit', params.limit.toString())
    if (params?.before) queryParams.set('before', params.before.toString())
    return apiClient.get(`/api/messages?${queryParams.toString()}`)
  },

  sendMessage: (channelId: string, content: string) =>
    apiClient.post(`/api/messages?channelId=${channelId}`, { content }),

  updateMessage: (channelId: string, messageId: string, content: string) =>
    apiClient.patch(`/api/messages?channelId=${channelId}&id=${messageId}`, { content }),

  deleteMessage: (channelId: string, messageId: string) =>
    apiClient.delete(`/api/messages?channelId=${channelId}&id=${messageId}`),

  // Tasks
  getTasks: (channelId: string) =>
    apiClient.get(`/api/tasks?channelId=${channelId}`),

  createTask: (channelId: string, data: any) =>
    apiClient.post(`/api/tasks?channelId=${channelId}`, data),

  updateTask: (taskId: string, channelId: string, data: any) =>
    apiClient.patch(`/api/tasks?id=${taskId}&channelId=${channelId}`, data),

  deleteTask: (taskId: string, channelId: string, position: number) =>
    apiClient.delete(`/api/tasks?id=${taskId}&channelId=${channelId}&position=${position}`),

  // Columns
  getColumns: (channelId: string) =>
    apiClient.get(`/api/tasks/columns?channelId=${channelId}`),

  createColumn: (channelId: string, name: string) =>
    apiClient.post(`/api/tasks/columns?channelId=${channelId}`, { name }),

  updateColumn: (channelId: string, columnId: string, position: number, name: string) =>
    apiClient.patch(`/api/tasks/columns?channelId=${channelId}&id=${columnId}&position=${position}`, { name }),

  deleteColumn: (channelId: string, columnId: string, position: number) =>
    apiClient.delete(`/api/tasks/columns?channelId=${channelId}&id=${columnId}&position=${position}`),

  // Users
  getUser: (userId: string) =>
    apiClient.get(`/api/users/${userId}`),

  updateUser: (userId: string, data: any) =>
    apiClient.patch(`/api/users/${userId}`, data),

  // Friends
  getFriends: () =>
    apiClient.get('/api/friends'),

  getFriendRequests: () =>
    apiClient.get('/api/friends/requests'),

  sendFriendRequest: (username: string) =>
    apiClient.post('/api/friends', { username }),

  acceptFriendRequest: (fromUserId: string) =>
    apiClient.post(`/api/friends/accept/?fromUserId=${fromUserId}`),

  rejectFriendRequest: (fromUserId: string) =>
    apiClient.post(`/api/friends/reject/?fromUserId=${fromUserId}`),

  removeFriend: (userId: string) =>
    apiClient.delete(`/api/friends/${userId}`),

  // DMs
  getDMs: () =>
    apiClient.get('/api/dms'),

  createDM: (userId: string) =>
    apiClient.post('/api/dms/create', { userId }),

  createGroupDM: (userIds: string[], name?: string) =>
    apiClient.post('/api/dms/create', { userIds, name }),

  // Servers
  getServers: () =>
    apiClient.get('/api/servers'),

  getServer: (serverId: string) =>
    apiClient.get(`/api/servers/${serverId}`),

  createServer: (data: { name: string; description?: string; iconUrl?: string }) =>
    apiClient.post('/api/servers', data),

  updateServer: (serverId: string, data: { name: string; description?: string; iconUrl?: string }) =>
    apiClient.patch(`/api/servers/${serverId}`, data),

  deleteServer: (serverId: string) =>
    apiClient.delete(`/api/servers/${serverId}`),

  joinServer: (inviteCode: string) =>
    apiClient.post(`/api/servers/join/${inviteCode}`),

  getServerChannels: (serverId: string) =>
    apiClient.get(`/api/servers/${serverId}/channels`),

  createServerChannel: (serverId: string, data: { name: string; type: string; description?: string }) =>
    apiClient.post(`/api/servers/${serverId}/channels`, data),

  getServerMembers: (serverId: string) =>
    apiClient.get(`/api/servers/${serverId}/members`),
}
