import { observable } from 'legend-state';
import { MMKV } from 'react-native-mmkv';

// Inicializar armazenamento persistente
export const storage = new MMKV();

// Estado global da aplicação
export const appState$ = observable({
  // Autenticação
  auth: {
    token: storage.getString('auth_token') || '',
    userID: storage.getString('user_id') || '',
    email: storage.getString('user_email') || '',
    username: storage.getString('user_username') || '',
    isAuthenticated: !!storage.getString('auth_token'),
  },

  // Usuários online
  presence: observable<Record<string, string>>({}),

  // Canais
  channels: observable<Array<{
    id: string;
    name: string;
    type: 'text' | 'voice' | 'video';
    ownerID: string;
  }>>([]),

  // Mensagens
  messages: observable<Record<string, Array<{
    id: string;
    channelID: string;
    authorID: string;
    content: string;
    timestamp: number;
  }>>>({} as any),

  // Tarefas
  tasks: observable<Record<string, Array<{
    id: string;
    channelID: string;
    title: string;
    status: 'todo' | 'in_progress' | 'done';
    assigneeID?: string;
    position: number;
  }>>>({} as any),

  // Conexão WebSocket
  wsConnected: false,
  wsError: null as string | null,
});

// Ações
export const actions = {
  // Autenticação
  setAuth: (token: string, userID: string, email: string, username: string) => {
    storage.set('auth_token', token);
    storage.set('user_id', userID);
    storage.set('user_email', email);
    storage.set('user_username', username);

    appState$.auth.set({
      token,
      userID,
      email,
      username,
      isAuthenticated: true,
    });
  },

  logout: () => {
    storage.delete('auth_token');
    storage.delete('user_id');
    storage.delete('user_email');
    storage.delete('user_username');

    appState$.auth.set({
      token: '',
      userID: '',
      email: '',
      username: '',
      isAuthenticated: false,
    });
  },

  // Presença
  setPresence: (userID: string, status: string) => {
    appState$.presence[userID].set(status);
  },

  // Canais
  addChannel: (channel: any) => {
    appState$.channels.push(channel);
  },

  // Mensagens
  addMessage: (channelID: string, message: any) => {
    if (!appState$.messages[channelID].peek()) {
      appState$.messages[channelID].set([]);
    }
    appState$.messages[channelID].push(message);
  },

  // Tarefas
  addTask: (channelID: string, task: any) => {
    if (!appState$.tasks[channelID].peek()) {
      appState$.tasks[channelID].set([]);
    }
    appState$.tasks[channelID].push(task);
  },

  updateTask: (channelID: string, taskID: string, updates: any) => {
    const tasks = appState$.tasks[channelID].peek();
    const index = tasks?.findIndex(t => t.id === taskID);
    if (index !== undefined && index > -1) {
      appState$.tasks[channelID][index].set(updates);
    }
  },

  // Conexão WebSocket
  setWSConnected: (connected: boolean) => {
    appState$.wsConnected.set(connected);
  },

  setWSError: (error: string | null) => {
    appState$.wsError.set(error);
  },
};
