import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFriendsStore } from '../store/friendsStore'
import { useAuthStore } from '../store/authStore'
import { Users, Inbox, MessageSquare, MoreVertical, X, Check } from 'lucide-react'
import { api } from '../services/api'

type Tab = 'online' | 'all' | 'pending' | 'blocked' | 'add'

export default function HomeScreen() {
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
      alert(`Friend request sent to ${searchQuery}!`)
      setSearchQuery('')
    } catch (error: any) {
      console.error('Failed to send friend request:', error)
      const errorMsg = error.response?.data || error.message || 'Error sending request'
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
    <div className="flex-1 flex flex-col bg-dark-900">
      <div className="h-12 px-4 flex items-center border-b border-dark-700 shadow-md">
        <Users className="w-5 h-5 mr-3 text-dark-400" />
        <h1 className="font-semibold text-white">Friends</h1>

        <div className="w-px h-6 bg-dark-700 mx-4" />

        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('online')}
            className={`px-2 py-1 rounded text-sm font-medium ${activeTab === 'online'
              ? 'bg-dark-700 text-white'
              : 'text-dark-400 hover:text-white hover:bg-dark-800'
              }`}
          >
            Online
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-2 py-1 rounded text-sm font-medium ${activeTab === 'all'
              ? 'bg-dark-700 text-white'
              : 'text-dark-400 hover:text-white hover:bg-dark-800'
              }`}
          >
            All
          </button>
          {pendingRequests && pendingRequests.length > 0 && (<button
            onClick={() => setActiveTab('pending')}
            className={`px-2 py-1 rounded text-sm font-medium ${activeTab === 'pending'
              ? 'bg-dark-700 text-white'
              : 'text-dark-400 hover:text-white hover:bg-dark-800'
              }`}
          >
            Pending
            {pendingRequests.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-red-600 text-white text-xs rounded-full">
                {pendingRequests.length}
              </span>
            )}
          </button>)}
          <button
            onClick={() => setActiveTab('add')}
            className={`px-2 py-1 rounded text-sm font-medium ${activeTab === 'add'
              ? 'bg-green-600 text-white'
              : 'text-green-500 hover:text-green-400'
              }`}
          >
            Add Friend
          </button>
        </div>
      </div>

      <div className="flex-1 flex">
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'online' && (
            <div className="p-6">
              <h2 className="text-xs font-semibold text-dark-400 uppercase mb-4">
                Online — {onlineFriends.length}
              </h2>
              {onlineFriends.length === 0 ? (
                <div className="text-center py-12 text-dark-400">
                  <p>There's no friends online at the moment</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {onlineFriends.map((friend) => (
                    <div
                      key={friend.userId}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-dark-800 group"
                    >
                      <div className="relative">
                        <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
                          {friend.username.charAt(0).toUpperCase()}
                        </div>
                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-dark-900 ${friend.status === 'online' ? 'bg-green-500' :
                          friend.status === 'idle' ? 'bg-yellow-500' : 'bg-gray-500'
                          }`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-white">{friend.username}</p>
                        <p className="text-sm text-dark-400">{friend.status}</p>
                      </div>
                      <button
                        onClick={() => friend.dmChannelId && handleDMClick(friend.dmChannelId)}
                        className="p-2 rounded-full bg-dark-700 hover:bg-dark-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Enviar Mensagem"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button className="p-2 rounded-full bg-dark-700 hover:bg-dark-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'all' && (
            <div className="p-6">
              <h2 className="text-xs font-semibold text-dark-400 uppercase mb-4">
                All Friends — {friends.length}
              </h2>
              {friends.length === 0 ? (
                <div className="text-center py-12 text-dark-400">
                  <p>You don't have any friends yet</p>
                  <p className="text-sm mt-2">How about adding someone?</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {friends.map((friend) => (
                    <div
                      key={friend.userId}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-dark-800 group"
                    >
                      <div className="relative">
                        <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
                          {friend.username.charAt(0).toUpperCase()}
                        </div>
                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-dark-900 ${friend.status === 'online' ? 'bg-green-500' :
                          friend.status === 'idle' ? 'bg-yellow-500' :
                            friend.status === 'dnd' ? 'bg-red-500' : 'bg-gray-500'
                          }`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-white">{friend.username}</p>
                        <p className="text-sm text-dark-400">{friend.email}</p>
                      </div>
                      <button
                        onClick={() => friend.dmChannelId && handleDMClick(friend.dmChannelId)}
                        className="p-2 rounded-full bg-dark-700 hover:bg-dark-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button className="p-2 rounded-full bg-dark-700 hover:bg-dark-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'pending' && (
            <div className="p-6">
              <h2 className="text-xs font-semibold text-dark-400 uppercase mb-4">
                Pending Requests — {pendingRequests.length}
              </h2>
              {pendingRequests.length === 0 ? (
                <div className="text-center py-12 text-dark-400">
                  <Inbox className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>No pending requests</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingRequests.map((request) => (
                    <div
                      key={request.fromUserId}
                      className="flex items-center gap-3 p-3 rounded-lg bg-dark-800 border border-dark-700"
                    >
                      <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
                        {request.fromUsername?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-white">{request.fromUsername || 'Unknown'}</p>
                        <p className="text-sm text-dark-400">Friend request received</p>
                      </div>
                      <button
                        onClick={() => handleAcceptRequest(request.fromUserId)}
                        className="p-2 rounded-full bg-green-600 hover:bg-green-700"
                        title="Accept"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRejectRequest(request.fromUserId)}
                        className="p-2 rounded-full bg-red-600 hover:bg-red-700"
                        title="Deny"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'add' && (
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-2">Add Friend</h2>
              <p className="text-dark-400 mb-6">
                You can add friends using their username.
              </p>
              <div className="bg-dark-800 p-4 rounded-lg">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Digite o nome de usuário"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSendFriendRequest()
                      }
                    }}
                    className="flex-1 px-4 py-3 bg-dark-900 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-600"
                  />
                  <button
                    onClick={handleSendFriendRequest}
                    disabled={!searchQuery.trim() || sendingRequest}
                    className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
                  >
                    {sendingRequest ? 'Sending...' : 'Send Request'}
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
