import { create } from 'zustand'

export interface Message {
  id: string
  channelId: string
  userId: string
  username: string
  content: string
  timestamp: number
  avatar?: string
}

export interface Channel {
  id: string
  name: string
  description?: string
  type: 'text' | 'voice' | 'video'
  members: string[]
}

interface ChatState {
  channels: Channel[]
  messages: Record<string, Message[]>
  activeChannelId: string | null
  
  setChannels: (channels: Channel[]) => void
  setActiveChannel: (channelId: string) => void
  addMessage: (message: Message) => void
  setMessages: (channelId: string, messages: Message[]) => void
}

export const useChatStore = create<ChatState>((set) => ({
  channels: [],
  messages: {},
  activeChannelId: null,

  setChannels: (channels) => set({ channels }),
  
  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),
  
  addMessage: (message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [message.channelId]: [
          ...(state.messages[message.channelId] || []),
          message,
        ],
      },
    })),
  
  setMessages: (channelId, messages) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: messages,
      },
    })),
}))
