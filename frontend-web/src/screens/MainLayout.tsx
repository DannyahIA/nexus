import { useEffect } from 'react'
import { Outlet, useParams, useNavigate } from 'react-router-dom'
import ServerSidebar from '../components/ServerSidebar'
import ChannelList from '../components/ChannelList'
import { useServerStore } from '../store/serverStore'
import { useFriendsStore } from '../store/friendsStore'
import { useAuthStore } from '../store/authStore'
import { api } from '../services/api'
import { wsService } from '../services/websocket'
import { useVoiceUsers } from '../hooks/useVoiceUsers'
import AppBackground from '../components/AppBackground'
import TasksScreen from './TasksScreen'

export default function MainLayout() {
  const { serverId, channelId } = useParams()
  const navigate = useNavigate()

  // Hook para gerenciar usuários em canais de voz
  useVoiceUsers()

  const servers = useServerStore((state) => state.servers)
  const setServers = useServerStore((state) => state.setServers)
  const serverChannels = useServerStore((state) => state.serverChannels)
  const setServerChannels = useServerStore((state) => state.setServerChannels)
  const setActiveServer = useServerStore((state) => state.setActiveServer)

  const dmChannels = useFriendsStore((state) => state.dmChannels)
  const setDMChannels = useFriendsStore((state) => state.setDMChannels)
  const setFriends = useFriendsStore((state) => state.setFriends)
  const setFriendRequests = useFriendsStore((state) => state.setFriendRequests)

  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  useEffect(() => {
    // Verificar autenticação
    if (!user) {
      navigate('/login')
      return
    }

    // Conectar WebSocket
    wsService.connect()

    // Carregar dados iniciais
    loadInitialData()

    return () => {
      wsService.disconnect()
    }
  }, [user, navigate])

  useEffect(() => {
    if (serverId) {
      setActiveServer(serverId)
      loadServerChannels(serverId)
    } else {
      setActiveServer(null)
    }
  }, [serverId, setActiveServer])

  const loadInitialData = async () => {
    try {
      // Carregar servidores
      const serversRes = await api.getServers()
      setServers(serversRes.data || [])

      // Carregar amigos
      const friendsRes = await api.getFriends()
      setFriends(friendsRes.data || [])

      // Carregar solicitações de amizade
      const requestsRes = await api.getFriendRequests()
      setFriendRequests(requestsRes.data || [])

      // Carregar DMs
      const dmsRes = await api.getDMs()
      setDMChannels(dmsRes.data || [])
    } catch (error: any) {
      console.error('Failed to load initial data:', error)
      if (error.response?.status === 401) {
        logout()
        navigate('/login')
      }
    }
  }

  const loadServerChannels = async (serverId: string) => {
    try {
      const response = await api.getServerChannels(serverId)
      // Transformar channel_id em id para compatibilidade
      const channels = (response.data || []).map((channel: any) => ({
        ...channel,
        id: channel.channel_id,
        isPrivate: false, // Assumir público por enquanto
        ownerId: channel.owner_id
      }))
      setServerChannels(serverId, channels)
    } catch (error) {
      console.error('Failed to load server channels:', error)
    }
  }

  const currentServer = servers.find((s) => s.id === serverId)
  const currentChannels = serverId ? serverChannels[serverId] || [] : []
  const currentChannel = currentChannels.find(c => c.id === channelId)

  // Map DM channels to match ChannelList expected type
  const mappedDMChannels = dmChannels.map(dm => ({
    ...dm,
    name: dm.name || dm.participants[0]?.username || 'Direct Message',
    isPrivate: true
  }))

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-black text-white">
      <AppBackground />

      {/* Content Wrapper - z-10 to sit above background */}
      <div className="relative z-10 flex w-full h-full">
        {/* Server Sidebar */}
        <div className="h-full z-20">
          <ServerSidebar />
        </div>

        {/* Channel List */}
        <div className="h-full z-10">
          {serverId ? (
            <ChannelList
              serverId={serverId}
              server={currentServer}
              serverName={currentServer?.name}
              channels={currentChannels}
              activeChannelId={channelId}
            />
          ) : (
            <ChannelList
              serverId={null}
              channels={mappedDMChannels}
              activeChannelId={channelId}
            />
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-dark-900 relative">
          {/* Background Pattern */}
          <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
            <div className="absolute top-[-50%] left-[-20%] w-[80%] h-[80%] rounded-full bg-purple-900/10 blur-[120px] animate-pulse-slow"></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-900/10 blur-[100px] animate-pulse-slow delay-1000"></div>
          </div>

          <div className="relative z-10 flex-1 flex flex-col h-full">
            {currentChannel?.type === 'task' ? (
              <TasksScreen channelId={channelId} isEmbedded={true} />
            ) : (
              <Outlet />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
