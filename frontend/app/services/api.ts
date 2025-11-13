import axios, { AxiosInstance } from 'axios';
import { appState$ } from '../store/appState';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'ws://localhost:8080';

export class ApiClient {
  private instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
    });

    // Interceptor para adicionar token
    this.instance.interceptors.request.use((config) => {
      const token = appState$.auth.token.get();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Interceptor para erros
    this.instance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expirou ou inválido
          // TODO: Refresh token ou logout
        }
        return Promise.reject(error);
      }
    );
  }

  // Autenticação
  async login(email: string, password: string) {
    const response = await this.instance.post('/api/auth/login', { email, password });
    return response.data;
  }

  async signup(email: string, username: string, password: string) {
    const response = await this.instance.post('/api/auth/register', { email, username, password });
    return response.data;
  }

  // Mensagens
  async getMessages(channelID: string, limit: number = 50) {
    const response = await this.instance.get('/api/messages', {
      params: { channelId: channelID, limit },
    });
    return response.data;
  }

  async sendMessage(channelID: string, content: string) {
    const response = await this.instance.post('/api/messages', {
      content,
    }, {
      params: { channelId: channelID },
    });
    return response.data;
  }

  // Tarefas
  async getTasks(channelID: string) {
    const response = await this.instance.get('/api/tasks', {
      params: { channelId: channelID },
    });
    return response.data;
  }

  async createTask(channelID: string, title: string, status: string = 'todo') {
    const response = await this.instance.post('/api/tasks', {
      title,
      status,
    }, {
      params: { channelId: channelID },
    });
    return response.data;
  }

  async updateTask(channelID: string, taskID: string, updates: any) {
    const response = await this.instance.patch('/api/tasks', updates, {
      params: { channelId: channelID, id: taskID, position: updates.position || 0 },
    });
    return response.data;
  }

  async deleteTask(channelID: string, taskID: string, position: number) {
    const response = await this.instance.delete('/api/tasks', {
      params: { channelId: channelID, id: taskID, position },
    });
    return response.data;
  }

  // Canais
  async getChannels() {
    const response = await this.instance.get('/api/channels');
    return response.data;
  }

  async createChannel(name: string, type: 'text' | 'voice' | 'video' = 'text') {
    const response = await this.instance.post('/api/channels', { name, type });
    return response.data;
  }

  // Presença
  async setPresence(status: string) {
    const response = await this.instance.post('/api/presence', { status });
    return response.data;
  }

  // Health check
  async health() {
    const response = await this.instance.get('/health');
    return response.data;
  }
}

export const apiClient = new ApiClient();

// WebSocket Service
export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;

  connect(userID: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`${WS_URL}/ws?user_id=${userID}`);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          appState$.actions?.setWSConnected?.(true);
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          appState$.actions?.setWSError?.('Connection error');
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          appState$.actions?.setWSConnected?.(false);
          this.attemptReconnect(userID);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private attemptReconnect(userID: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.connect(userID).catch(() => {
          // Retry will happen in onclose
        });
      }, this.reconnectDelay);
    }
  }

  private handleMessage(data: any) {
    // TODO: Processar diferentes tipos de mensagens
    console.log('WebSocket message:', data);
  }

  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WebSocketService();
