import { useEffect } from 'react'
import { wsService } from '../services/websocket'
import { useVoiceUsersStore } from '../store/voiceUsersStore'

export function useVoiceUsers() {
  const addUser = useVoiceUsersStore((state) => state.addUser)
  const removeUser = useVoiceUsersStore((state) => state.removeUser)
  const updateUserStatus = useVoiceUsersStore((state) => state.updateUserStatus)

  useEffect(() => {
    // Handler para usuário entrando em canal de voz
    const handleUserJoined = (data: any) => {
      console.log('👤 User joined voice channel:', data)
      addUser(data.channelId, {
        id: data.user.id,
        username: data.user.username,
        displayName: data.user.displayName,
        avatar: data.user.avatar,
        isMuted: false,
        isDeafened: false,
        isSpeaking: false,
      })
    }

    // Handler para usuário saindo de canal de voz
    const handleUserLeft = (data: any) => {
      console.log('👋 User left voice channel:', data)
      removeUser(data.channelId, data.userId)
    }

    // Handler para status de áudio atualizado
    const handleStatusUpdated = (data: any) => {
      console.log('🔊 Voice status updated:', data)
      updateUserStatus(data.channelId, data.userId, {
        isMuted: data.isMuted,
        isDeafened: data.isDeafened,
      })
    }

    // Handler para indicador de fala
    const handleSpeaking = (data: any) => {
      updateUserStatus(data.channelId, data.userId, {
        isSpeaking: data.isSpeaking,
      })
    }

    // Registrar listeners
    wsService.on('voice:user-joined', handleUserJoined)
    wsService.on('voice:user-left', handleUserLeft)
    wsService.on('voice:status-updated', handleStatusUpdated)
    wsService.on('voice:speaking', handleSpeaking)

    // Cleanup
    return () => {
      wsService.off('voice:user-joined', handleUserJoined)
      wsService.off('voice:user-left', handleUserLeft)
      wsService.off('voice:status-updated', handleStatusUpdated)
      wsService.off('voice:speaking', handleSpeaking)
    }
  }, [addUser, removeUser, updateUserStatus])
}
