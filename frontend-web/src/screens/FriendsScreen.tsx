import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useFriendsStore, Friend, FriendRequest } from '../store/friendsStore'
import { api } from '../services/api'
import { Users, Inbox, X, Check, UserPlus, UserMinus, MessageCircle } from 'lucide-react'
import { formatDate } from '../i18n/dateFormatter'
import AppBackground from '../components/AppBackground'

type Tab = 'online' | 'all' | 'pending' | 'blocked'

export default function FriendsScreen() {
  const { t } = useTranslation('friends')
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('online')
  const [addFriendInput, setAddFriendInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const friends = useFriendsStore((state) => state.friends)
  const friendRequests = useFriendsStore((state) => state.friendRequests)
  const setFriends = useFriendsStore((state) => state.setFriends)
  const setFriendRequests = useFriendsStore((state) => state.setFriendRequests)
  const removeFriend = useFriendsStore((state) => state.removeFriend)
  const removeFriendRequest = useFriendsStore((state) => state.removeFriendRequest)

  useEffect(() => {
    loadFriends()
    loadFriendRequests()
  }, [])

  const loadFriends = async () => {
    try {
      const response = await api.getFriends()
      setFriends(response.data)
    } catch (error) {
      console.error(t('errors.failedToLoad'), error)
    }
  }

  const loadFriendRequests = async () => {
    try {
      const response = await api.getFriendRequests()
      setFriendRequests(response.data)
    } catch (error) {
      console.error(t('errors.failedToLoadRequests'), error)
    }
  }

  const handleAddFriend = async () => {
    if (!addFriendInput.trim()) return

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      await api.sendFriendRequest(addFriendInput.trim())
      setSuccess(t('addFriend.requestSent', { username: addFriendInput }))
      setAddFriendInput('')
    } catch (error: any) {
      setError(error.response?.data || t('addFriend.failedToSend'))
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptRequest = async (request: FriendRequest) => {
    try {
      await api.acceptFriendRequest(request.fromUserId)
      removeFriendRequest(request.id)
      loadFriends()
      setSuccess(t('success.nowFriends', { username: request.fromUsername }))
    } catch (error) {
      console.error(t('errors.failedToAccept'), error)
      setError(t('errors.failedToAccept'))
    }
  }

  const handleRejectRequest = async (request: FriendRequest) => {
    try {
      await api.rejectFriendRequest(request.fromUserId)
      removeFriendRequest(request.id)
    } catch (error) {
      console.error(t('errors.failedToReject'), error)
    }
  }

  const handleRemoveFriend = async (friend: Friend) => {
    if (!confirm(t('confirmations.removeFriend', { username: friend.username }))) return

    try {
      await api.removeFriend(friend.userId)
      removeFriend(friend.userId)
    } catch (error) {
      console.error(t('errors.failedToRemove'), error)
    }
  }

  const handleOpenDM = async (friend: Friend) => {
    try {
      // Se já tem canal de DM, navegar direto
      if (friend.dmChannelId) {
        navigate(`/dm/${friend.dmChannelId}`)
        return
      }

      // Criar novo canal de DM
      const response = await api.createDM(friend.userId)
      const channelId = response.data.channelId

      // Atualizar lista de DMs para incluir o novo canal imediatamente
      try {
        const dmsRes = await api.getDMs()
        if (dmsRes.data) {
          useFriendsStore.getState().setDMChannels(dmsRes.data)
        }
      } catch (err) {
        console.error('Failed to refresh DMs list:', err)
      }

      navigate(`/dm/${channelId}`)
    } catch (error) {
      console.error(t('errors.failedToOpenDM'), error)
    }
  }

  const filteredFriends = friends.filter((friend) => {
    if (activeTab === 'online') return friend.status === 'online'
    if (activeTab === 'all') return true
    return false
  })

  const getStatusColor = (status: Friend['status']) => {
    switch (status) {
      case 'online':
        return 'bg-green-500'
      case 'idle':
        return 'bg-yellow-500'
      case 'dnd':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className="flex flex-col h-screen text-white relative overflow-hidden">
      {/* Background */}
      <AppBackground />

      {/* Header */}
      <div className="h-14 bg-black/20 backdrop-blur-xl border-b border-white/5 flex items-center px-6 relative z-10 shadow-lg">
        <Users className="w-5 h-5 mr-3 text-white/50" />
        <h2 className="font-bold text-lg tracking-tight">{t('title')}</h2>
        <div className="w-px h-6 bg-white/10 mx-6" />

        {/* Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('online')}
            className={`px-4 py-1 rounded-lg transition-all text-sm font-medium ${activeTab === 'online'
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
          >
            {t('tabs.online')}
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-1 rounded-lg transition-all text-sm font-medium ${activeTab === 'all'
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
          >
            {t('tabs.all')}
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-1 rounded-lg transition-all text-sm font-medium flex items-center gap-2 ${activeTab === 'pending'
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
          >
            {t('tabs.pending')}
            {friendRequests.length > 0 && (
              <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full font-bold shadow-lg shadow-red-500/20">
                {friendRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('blocked')}
            className={`px-4 py-1 rounded-lg transition-all text-sm font-medium ${activeTab === 'blocked'
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
          >
            {t('tabs.blocked')}
          </button>
        </div>

        <div className="flex-1" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 relative z-10 custom-scrollbar">
        <div className="max-w-4xl mx-auto">
          {/* Add Friend Section */}
          <div className="mb-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
            <h3 className="font-bold mb-4 flex items-center gap-2 text-lg">
              <UserPlus className="w-5 h-5 text-green-400" />
              {t('addFriend.title')}
            </h3>
            <p className="text-sm text-white/50 mb-4">{t('addFriend.subtitle', 'You can add friends with their username.')}</p>
            <div className="flex gap-3 bg-black/20 p-2 rounded-xl border border-white/5 focus-within:border-green-500/50 focus-within:bg-black/40 transition-all">
              <input
                type="text"
                value={addFriendInput}
                onChange={(e) => setAddFriendInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
                placeholder={t('addFriend.placeholder')}
                className="flex-1 px-3 py-2 bg-transparent text-white focus:outline-none placeholder-white/20"
              />
              <button
                onClick={handleAddFriend}
                disabled={loading || !addFriendInput.trim()}
                className="px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-all font-medium text-sm shadow-lg shadow-green-900/20"
              >
                {loading ? t('addFriend.sending') : t('addFriend.sendRequest')}
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-red-400 flex items-center gap-2"><X className="w-4 h-4" />{error}</p>}
            {success && <p className="mt-3 text-sm text-green-400 flex items-center gap-2"><Check className="w-4 h-4" />{success}</p>}
          </div>

          {/* Pending Requests */}
          {activeTab === 'pending' && (
            <div className="animate-fade-in">
              <h3 className="font-bold text-xs text-white/40 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Inbox className="w-4 h-4" />
                {t('sections.pendingCount', { count: friendRequests.length })}
              </h3>
              {friendRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-white/20 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
                  <Inbox className="w-16 h-16 mb-4 opacity-50" />
                  <p>{t('empty.noPendingRequests')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {friendRequests.map((request) => (
                    <div
                      key={request.id}
                      className="bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-xl p-4 flex items-center justify-between transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg shadow-indigo-500/20 text-lg font-bold">
                          {request.fromUsername.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-white group-hover:text-white/90 transition-colors">{request.fromUsername}</p>
                          <p className="text-xs text-white/40 flex items-center gap-1">
                            {t('addFriend.incomingRequest')} • {formatDate(request.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAcceptRequest(request)}
                          className="p-2.5 bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white rounded-lg transition-all"
                          title={t('actions.accept')}
                        >
                          <Check className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleRejectRequest(request)}
                          className="p-2.5 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-all"
                          title={t('actions.reject')}
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Friends List */}
          {activeTab !== 'pending' && activeTab !== 'blocked' && (
            <div className="animate-fade-in">
              <h3 className="font-bold text-xs text-white/40 uppercase tracking-wider mb-4 border-b border-white/5 pb-2">
                {activeTab === 'online'
                  ? t('sections.onlineCount', { count: filteredFriends.length })
                  : t('sections.allCount', { count: filteredFriends.length })
                }
              </h3>
              {filteredFriends.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-white/20 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
                  <Users className="w-16 h-16 mb-4 opacity-50" />
                  <p className="font-medium">{activeTab === 'online' ? t('empty.noOnlineFriends') : t('empty.noFriends')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredFriends.map((friend) => (
                    <div
                      key={friend.userId}
                      onClick={() => handleOpenDM(friend)}
                      className="group bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 rounded-xl p-3 flex items-center justify-between transition-all cursor-pointer hover:shadow-lg hover:shadow-black/20"
                    >
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="w-10 h-10 bg-dark-700 rounded-full flex items-center justify-center overflow-hidden border border-white/10 group-hover:border-white/20 transition-colors">
                            {friend.avatarUrl ? (
                              <img src={friend.avatarUrl} alt={friend.username} className="w-full h-full object-cover" />
                            ) : (
                              <span className="font-bold text-white/70">{(friend.displayName || friend.username).charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <div
                            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 ${getStatusColor(
                              friend.status
                            )} rounded-full border-[3px] border-[#18181b]`}
                          />
                        </div>
                        <div>
                          <p className="font-bold text-white group-hover:text-primary-200 transition-colors flex items-center gap-2">
                            {friend.displayName || friend.username}
                            {friend.discriminator && <span className="text-white/30 text-xs font-normal opacity-0 group-hover:opacity-100 transition-opacity">#{friend.discriminator}</span>}
                          </p>
                          <p className="text-xs text-white/40 group-hover:text-white/60 transition-colors">
                            {friend.status === 'online' ? 'Online' : friend.status === 'idle' ? 'Away' : friend.status === 'dnd' ? 'Do Not Disturb' : 'Offline'}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                        <div className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title={t('actions.sendMessage')}>
                          <MessageCircle className="w-4 h-4" />
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveFriend(friend)
                          }}
                          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors"
                          title={t('actions.removeFriend')}
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Blocked Users */}
          {activeTab === 'blocked' && (
            <div className="flex flex-col items-center justify-center py-20 text-white/20 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02] animate-fade-in">
              <Users className="w-16 h-16 mb-4 opacity-50" />
              <p>{t('empty.noBlockedUsers')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
