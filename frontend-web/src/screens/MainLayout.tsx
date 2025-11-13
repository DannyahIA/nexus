import { useEffect } from 'react'
import { Outlet, useParams, useNavigate } from 'react-router-dom'
import ServerSidebar from '../components/ServerSidebar'
import ChannelList from '../components/ChannelList'
import { useServerStore } from '../store/serverStore'
import { useFriendsStore } from '../store/friendsStore'
import { useAuthStore } from '../store/authStore'
import { api } from '../services/api'
import { wsService } from '../services/websocket'

export default function MainLayout() {
  const { serverId } = useParams()
  const navigate = useNavigate()
  
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

  return (
    <div className="flex h-screen bg-dark-900 text-white">
      {/* Server Sidebar */}
      <ServerSidebar />

      {/* Channel List */}
      {serverId ? (
        <ChannelList
          serverId={serverId}
          serverName={currentServer?.name}
          channels={currentChannels}
        />
      ) : (
        // Mostrar lista de DMs quando não estiver em um servidor
        <div className="w-60 bg-dark-800 flex flex-col">
          <div className="h-12 px-4 flex items-center border-b border-dark-700 shadow-md">
            <h2 className="font-semibold text-white">Direct Messages</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {dmChannels.map((dm) => (
              <button
                key={dm.id}
                onClick={() => navigate(`/dm/${dm.id}`)}
                className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-dark-700 text-left mb-1"
              >
                <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                  {dm.type === 'dm'
                    ? dm.participants[0]?.username.charAt(0).toUpperCase()
                    : 'G'}
                </div>
                <span className="truncate text-sm">
                  {dm.type === 'dm'
                    ? dm.participants[0]?.username
                    : dm.name || 'Group DM'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content */}
      <Outlet />
    </div>
  )
}
