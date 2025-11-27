import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFriendsStore, Friend, FriendRequest } from '../store/friendsStore'
import { api } from '../services/api'
import { UserPlus, MessageCircle, UserMinus, Check, X, Users, Inbox } from 'lucide-react'

type Tab = 'online' | 'all' | 'pending' | 'blocked'

export default function FriendsScreen() {
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
      console.error('Failed to load friends:', error)
    }
  }

  const loadFriendRequests = async () => {
    try {
      const response = await api.getFriendRequests()
      setFriendRequests(response.data)
    } catch (error) {
      console.error('Failed to load friend requests:', error)
    }
  }

  const handleAddFriend = async () => {
    if (!addFriendInput.trim()) return

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      await api.sendFriendRequest(addFriendInput.trim())
      setSuccess(`Friend request sent to ${addFriendInput}`)
      setAddFriendInput('')
    } catch (error: any) {
      setError(error.response?.data || 'Failed to send friend request')
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptRequest = async (request: FriendRequest) => {
    try {
      await api.acceptFriendRequest(request.fromUserId)
      removeFriendRequest(request.id)
      loadFriends()
      setSuccess(`You are now friends with ${request.fromUsername}`)
    } catch (error) {
      console.error('Failed to accept friend request:', error)
      setError('Failed to accept friend request')
    }
  }

  const handleRejectRequest = async (request: FriendRequest) => {
    try {
      await api.rejectFriendRequest(request.fromUserId)
      removeFriendRequest(request.id)
    } catch (error) {
      console.error('Failed to reject friend request:', error)
    }
  }

  const handleRemoveFriend = async (friend: Friend) => {
    if (!confirm(`Remove ${friend.username} from friends?`)) return

    try {
      await api.removeFriend(friend.userId)
      removeFriend(friend.userId)
    } catch (error) {
      console.error('Failed to remove friend:', error)
    }
  }

  const handleOpenDM = async (friend: Friend) => {
    try {
      // Se já tem canal de DM, navegar direto
      if (friend.dmChannelId) {
        navigate(`/chat/${friend.dmChannelId}`)
        return
      }

      // Criar novo canal de DM
      const response = await api.createDM(friend.userId)
      const channelId = response.data.channelId
      navigate(`/chat/${channelId}`)
    } catch (error) {
      console.error('Failed to open DM:', error)
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
    <div className="flex flex-col h-screen bg-dark-900 text-white">
      {/* Header */}
      <div className="h-14 bg-dark-800 border-b border-dark-700 flex items-center px-4">
        <Users className="w-5 h-5 mr-3 text-dark-400" />
        <h2 className="font-semibold text-lg">Friends</h2>
      </div>

      {/* Tabs */}
      <div className="bg-dark-800 border-b border-dark-700 px-4 py-2 flex items-center gap-4">
        <button
          onClick={() => setActiveTab('online')}
          className={`px-3 py-1.5 rounded transition-colors ${
            activeTab === 'online'
              ? 'bg-dark-600 text-white'
              : 'text-dark-300 hover:bg-dark-700 hover:text-white'
          }`}
        >
          Online
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded transition-colors ${
            activeTab === 'all'
              ? 'bg-dark-600 text-white'
              : 'text-dark-300 hover:bg-dark-700 hover:text-white'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-3 py-1.5 rounded transition-colors ${
            activeTab === 'pending'
              ? 'bg-dark-600 text-white'
              : 'text-dark-300 hover:bg-dark-700 hover:text-white'
          }`}
        >
          Pending
          {friendRequests.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
              {friendRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('blocked')}
          className={`px-3 py-1.5 rounded transition-colors ${
            activeTab === 'blocked'
              ? 'bg-dark-600 text-white'
              : 'text-dark-300 hover:bg-dark-700 hover:text-white'
          }`}
        >
          Blocked
        </button>

        <div className="flex-1" />

        <button
          onClick={() => navigate('/chat')}
          className="px-4 py-1.5 bg-primary-600 hover:bg-primary-700 rounded transition-colors"
        >
          Back to Chat
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Add Friend Section */}
        {activeTab !== 'pending' && (
          <div className="mb-6 bg-dark-800 rounded-lg p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Add Friend
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={addFriendInput}
                onChange={(e) => setAddFriendInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
                placeholder="Enter username (e.g. dannyah or dannyah#1234)"
                className="flex-1 px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
              <button
                onClick={handleAddFriend}
                disabled={loading || !addFriendInput.trim()}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 disabled:text-dark-500 rounded-lg transition-colors"
              >
                {loading ? 'Sending...' : 'Send Request'}
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            {success && <p className="mt-2 text-sm text-green-400">{success}</p>}
          </div>
        )}

        {/* Pending Requests */}
        {activeTab === 'pending' && (
          <div>
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Inbox className="w-4 h-4" />
              Pending Requests ({friendRequests.length})
            </h3>
            {friendRequests.length === 0 ? (
              <div className="text-center py-12 text-dark-400">
                <Inbox className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No pending friend requests</p>
              </div>
            ) : (
              <div className="space-y-2">
                {friendRequests.map((request) => (
                  <div
                    key={request.id}
                    className="bg-dark-800 rounded-lg p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
                        {request.fromUsername.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{request.fromUsername}</p>
                        <p className="text-sm text-dark-400">
                          {new Date(request.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAcceptRequest(request)}
                        className="p-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                        title="Accept"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRejectRequest(request)}
                        className="p-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                        title="Reject"
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

        {/* Friends List */}
        {activeTab !== 'pending' && activeTab !== 'blocked' && (
          <div>
            <h3 className="font-semibold mb-4">
              {activeTab === 'online' ? 'Online' : 'All Friends'} ({filteredFriends.length})
            </h3>
            {filteredFriends.length === 0 ? (
              <div className="text-center py-12 text-dark-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No friends {activeTab === 'online' ? 'online' : 'yet'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFriends.map((friend) => (
                  <div
                    key={friend.userId}
                    className="bg-dark-800 rounded-lg p-4 flex items-center justify-between hover:bg-dark-750 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
                          {(friend.displayName || friend.username).charAt(0).toUpperCase()}
                        </div>
                        <div
                          className={`absolute bottom-0 right-0 w-3 h-3 ${getStatusColor(
                            friend.status
                          )} rounded-full border-2 border-dark-800`}
                        />
                      </div>
                      <div>
                        <p className="font-medium">{friend.displayName || friend.username}</p>
                        <p className="text-sm text-dark-400">
                          {friend.discriminator ? `${friend.username}#${friend.discriminator}` : friend.username}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleOpenDM(friend)}
                        className="p-2 bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
                        title="Message"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveFriend(friend)}
                        className="p-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                        title="Remove Friend"
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
          <div className="text-center py-12 text-dark-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No blocked users</p>
          </div>
        )}
      </div>
    </div>
  )
}
