import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useFriendsStore } from '../store/friendsStore'
import { useAuthStore } from '../store/authStore'
import { Users, Inbox, MessageSquare, MoreVertical, X, Check } from 'lucide-react'
import { api } from '../services/api'

type Tab = 'online' | 'all' | 'pending' | 'blocked' | 'add'

export default function HomeScreen() {
  const { t } = useTranslation('friends')
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('online')
  const [searchQuery, setSearchQuery] = useState('')
  const [sendingRequest, setSendingRequest] = useState(false)

  const friends = useFriendsStore((state) => state.friends)
  const friendRequests = useFriendsStore((state) => state.friendRequests)
  const user = useAuthStore((state) => state.user)

  const pendingRequests = friendRequests.filter((r) => r.status === 'pending' && r.toUserId === user?.id)
  const onlineFriends = friends.filter((f) => f.status === 'online' || f.status === 'idle')

  const handleDMClick = (channelId: string) => {
    navigate(`/dm/${channelId}`)
  }

  const handleSendFriendRequest = async () => {
    if (!searchQuery.trim() || sendingRequest) return

    setSendingRequest(true)
    try {
      await api.sendFriendRequest(searchQuery.trim())
      alert(t('addFriend.requestSent', { username: searchQuery }))
      setSearchQuery('')
    } catch (error: any) {
      console.error('Failed to send friend request:', error)
      const errorMsg = error.response?.data || error.message || t('addFriend.error')
      alert(errorMsg)
    } finally {
      setSendingRequest(false)
    }
  }

  const handleAcceptRequest = async (fromUserId: string) => {
    try {
      await api.acceptFriendRequest(fromUserId)
    } catch (error) {
      console.error('Failed to accept friend request:', error)
    }
  }

  const handleRejectRequest = async (fromUserId: string) => {
    try {
      await api.rejectFriendRequest(fromUserId)
    } catch (error) {
      console.error('Failed to reject friend request:', error)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-transparent h-full overflow-hidden">
      <div className="h-12 px-6 flex items-center border-b border-white/5 shadow-sm bg-black/10 backdrop-blur-md">
        <div className="flex items-center gap-3 mr-6">
          <Users className="w-5 h-5 text-purple-400" />
          <h1 className="font-bold text-white tracking-wide">{t('title')}</h1>
        </div>

        <div className="w-px h-5 bg-white/10 mx-4" />

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('online')}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'online'
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
          >
            {t('tabs.online')}
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'all'
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
          >
            {t('tabs.all')}
          </button>
          {pendingRequests && pendingRequests.length > 0 && (<button
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${activeTab === 'pending'
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
          >
            {t('tabs.pending')}
            {pendingRequests.length > 0 && (
              <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full font-bold shadow-lg shadow-red-500/20">
                {pendingRequests.length}
              </span>
            )}
          </button>)}
          <button
            onClick={() => setActiveTab('add')}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'add'
              ? 'bg-green-500/20 text-green-400 shadow-sm shadow-green-500/10'
              : 'text-green-500 hover:text-green-400 hover:bg-green-500/10'
              }`}
          >
            {t('tabs.addFriend')}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {activeTab === 'online' && (
            <div className="max-w-4xl mx-auto">
              <h2 className="text-xs font-bold text-white/40 uppercase mb-4 tracking-wider">
                {t('sections.onlineTitle', { count: onlineFriends.length })}
              </h2>
              {onlineFriends.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-white/20">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <Users className="w-8 h-8 opacity-50" />
                  </div>
                  <p className="font-medium">{t('empty.noOnlineFriends')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {onlineFriends.map((friend) => (
                    <div
                      key={friend.userId}
                      className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all duration-200 group backdrop-blur-sm"
                    >
                      <div className="relative">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                          {friend.username.charAt(0).toUpperCase()}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[3px] border-[#1a1a1a] ${friend.status === 'online' ? 'bg-green-500' :
                          friend.status === 'idle' ? 'bg-yellow-500' : 'bg-gray-500'
                          }`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-white group-hover:text-purple-300 transition-colors">{friend.username}</p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 font-medium uppercase tracking-wide">
                            {t(`status.${friend.status}`)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => friend.dmChannelId && handleDMClick(friend.dmChannelId)}
                          className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all transform hover:scale-110 shadow-lg"
                          title={t('actions.sendMessage')}
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        <button className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all transform hover:scale-110 shadow-lg">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'all' && (
            <div className="max-w-4xl mx-auto">
              <h2 className="text-xs font-bold text-white/40 uppercase mb-4 tracking-wider">
                {t('sections.allFriendsTitle', { count: friends.length })}
              </h2>
              {friends.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-white/20">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <Users className="w-8 h-8 opacity-50" />
                  </div>
                  <p className="font-medium">{t('empty.noFriends')}</p>
                  <p className="text-sm mt-2 opacity-60">{t('empty.noFriendsSubtext')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {friends.map((friend) => (
                    <div
                      key={friend.userId}
                      className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all duration-200 group backdrop-blur-sm"
                    >
                      <div className="relative">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                          {friend.username.charAt(0).toUpperCase()}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[3px] border-[#1a1a1a] ${friend.status === 'online' ? 'bg-green-500' :
                          friend.status === 'idle' ? 'bg-yellow-500' :
                            friend.status === 'dnd' ? 'bg-red-500' : 'bg-gray-500'
                          }`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-white group-hover:text-purple-300 transition-colors">{friend.username}</p>
                        <p className="text-xs text-white/40 font-medium">{friend.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => friend.dmChannelId && handleDMClick(friend.dmChannelId)}
                          className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all transform hover:scale-110 shadow-lg"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        <button className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all transform hover:scale-110 shadow-lg">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'pending' && (
            <div className="max-w-4xl mx-auto">
              <h2 className="text-xs font-bold text-white/40 uppercase mb-4 tracking-wider">
                {t('sections.pendingRequestsTitle', { count: pendingRequests.length })}
              </h2>
              {pendingRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-white/20">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <Inbox className="w-8 h-8 opacity-50" />
                  </div>
                  <p className="font-medium">{t('empty.noPendingRequests')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingRequests.map((request) => (
                    <div
                      key={request.fromUserId}
                      className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/5 backdrop-blur-sm hover:bg-white/10 transition-all"
                    >
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                        {request.fromUsername?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-white">{request.fromUsername || 'Unknown'}</p>
                        <p className="text-xs text-white/40 font-medium">{t('friendRequest.received')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAcceptRequest(request.fromUserId)}
                          className="p-2.5 rounded-full bg-green-500/20 hover:bg-green-500/30 text-green-400 hover:text-green-300 transition-all transform hover:scale-110 shadow-lg"
                          title={t('actions.accept')}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRejectRequest(request.fromUserId)}
                          className="p-2.5 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 transition-all transform hover:scale-110 shadow-lg"
                          title={t('actions.deny')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'add' && (
            <div className="max-w-2xl mx-auto mt-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">{t('addFriend.title')}</h2>
                <p className="text-white/50">
                  {t('addFriend.description')}
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 p-1.5 rounded-2xl backdrop-blur-xl shadow-2xl">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={t('addFriend.placeholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSendFriendRequest()
                      }
                    }}
                    className="flex-1 px-6 py-4 bg-transparent text-white placeholder-white/30 focus:outline-none"
                  />
                  <button
                    onClick={handleSendFriendRequest}
                    disabled={!searchQuery.trim() || sendingRequest}
                    className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-white/10 disabled:to-white/10 disabled:text-white/30 rounded-xl font-bold shadow-lg shadow-purple-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {sendingRequest ? t('addFriend.sending') : t('addFriend.sendRequest')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
