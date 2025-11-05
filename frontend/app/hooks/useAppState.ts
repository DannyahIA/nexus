import { useEffect, useRef } from 'react';
import { useShallow } from 'legend-state';
import { appState$ } from '../store/appState';

// Hook para usar estado global
export const useAppState = () => {
  return useShallow(() => ({
    auth: appState$.auth.get(),
    messages: appState$.messages.get(),
    tasks: appState$.tasks.get(),
    channels: appState$.channels.get(),
    presence: appState$.presence.get(),
    wsConnected: appState$.wsConnected.get(),
  }));
};

// Hook para autenticação
export const useAuth = () => {
  return useShallow(() => appState$.auth.get());
};

// Hook para mensagens de um canal
export const useChannelMessages = (channelID: string) => {
  return useShallow(() => appState$.messages[channelID].get() || []);
};

// Hook para tarefas de um canal
export const useChannelTasks = (channelID: string) => {
  return useShallow(() => appState$.tasks[channelID].get() || []);
};

// Hook para presença de usuários
export const useUserPresence = () => {
  return useShallow(() => appState$.presence.get());
};

// Hook para conexão WebSocket
export const useWebSocketConnection = () => {
  return useShallow(() => ({
    connected: appState$.wsConnected.get(),
    error: appState$.wsError.get(),
  }));
};

// Hook para efeito com cleanup
export const useAsync = (
  asyncFunction: () => Promise<any>,
  immediate = true
) => {
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (immediate) {
      asyncFunction();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [asyncFunction, immediate]);

  return isMountedRef;
};
