import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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
  login: (username: string, password: string) =>
    apiClient.post('/api/auth/login', { username, password }),
  
  register: (username: string, email: string, password: string) =>
    apiClient.post('/api/auth/register', { username, email, password }),

  // Channels
  getChannels: () => apiClient.get('/api/channels'),
  
  getChannel: (channelId: string) =>
    apiClient.get(`/api/channels?id=${channelId}`),
  
  createChannel: (data: { name: string; description?: string; type: string }) =>
    apiClient.post('/api/channels', data),

  deleteChannel: (channelId: string) =>
    apiClient.delete(`/api/channels?id=${channelId}`),

  // Messages
  getMessages: (channelId: string, limit = 50) =>
    apiClient.get(`/api/messages?channelId=${channelId}&limit=${limit}`),
  
  sendMessage: (channelId: string, content: string) =>
    apiClient.post(`/api/messages?channelId=${channelId}`, { content }),

  updateMessage: (messageId: string, content: string) =>
    apiClient.patch(`/api/messages?id=${messageId}`, { content }),

  deleteMessage: (messageId: string) =>
    apiClient.delete(`/api/messages?id=${messageId}`),

  // Tasks
  getTasks: (channelId: string) =>
    apiClient.get(`/api/tasks?channelId=${channelId}`),
  
  createTask: (channelId: string, data: any) =>
    apiClient.post(`/api/tasks?channelId=${channelId}`, data),
  
  updateTask: (taskId: string, data: any) =>
    apiClient.patch(`/api/tasks?id=${taskId}`, data),
  
  deleteTask: (taskId: string) =>
    apiClient.delete(`/api/tasks?id=${taskId}`),

  // Users
  getUser: (userId: string) =>
    apiClient.get(`/api/users/${userId}`),
  
  updateUser: (userId: string, data: any) =>
    apiClient.patch(`/api/users/${userId}`, data),
}
