import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MessageCircle, X, Plus } from 'lucide-react'
import { DMChannel } from '../store/friendsStore'
import UserProfilePanel from './UserProfilePanel'

interface DMListProps {
    channels: DMChannel[] // This prop comes from the store in MainLayout, so it should be reactive if MainLayout is reactive
    activeChannelId?: string
}

export default function DMList({ channels, activeChannelId }: DMListProps) {
    const { t } = useTranslation('friends')
    const navigate = useNavigate()

    const handleChannelClick = (channelId: string) => {
        navigate(`/dm/${channelId}`)
    }

    // Helper to format timestamp
    const formatTime = (timestamp?: number) => {
        if (!timestamp) return ''
        const date = new Date(timestamp)
        const now = new Date()
        // If today, show HH:MM
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
        // If this year, show MM/DD
        return date.toLocaleDateString([], { month: '2-digit', day: '2-digit' })
    }

    // Sort channels by last message timestamp (newest first)
    const sortedChannels = [...channels].sort((a, b) => {
        const timeA = a.lastMessageAt || 0
        const timeB = b.lastMessageAt || 0
        return timeB - timeA
    })

    return (
        <div className="w-60 h-full flex flex-col bg-black/20 backdrop-blur-md border-r border-white/5">
            {/* Header */}
            <div className="h-12 px-4 flex items-center justify-between border-b border-white/5 shadow-sm bg-white/5">
                <h2 className="font-semibold text-white/90 truncate tracking-wide text-sm uppercase">
                    Direct Messages
                </h2>
                <button className="p-1 hover:bg-white/10 rounded transition-colors group">
                    <Plus className="w-4 h-4 text-white/50 group-hover:text-white" />
                </button>
            </div>

            {/* DM List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {sortedChannels.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-white/20 p-4 border border-dashed border-white/10 rounded-xl mx-2 mt-4">
                        <MessageCircle className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-xs text-center">{t('empty.noDMs', 'No conversations yet')}</p>
                    </div>
                ) : (
                    sortedChannels.map((channel) => {
                        const participant = channel.participants[0]
                        const name = channel.name || participant?.username || 'Unknown User'
                        const avatar = participant?.avatarUrl

                        return (
                            <button
                                key={channel.id}
                                onClick={() => handleChannelClick(channel.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative overflow-hidden ${channel.id === activeChannelId
                                    ? 'bg-gradient-to-r from-white/10 to-white/5 text-white shadow-sm border border-white/5'
                                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                                    }`}
                            >
                                {/* Active indicator bar */}
                                {channel.id === activeChannelId && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-500 rounded-r-full shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
                                )}

                                {/* Avatar */}
                                <div className="relative flex-shrink-0">
                                    <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center overflow-hidden border border-white/10 group-hover:border-white/20 transition-colors">
                                        {avatar ? (
                                            <img src={avatar} alt={name} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-sm font-bold text-white/70">
                                                {name.charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    {/* Status dot could go here */}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0 text-left">
                                    <div className="flex items-center justify-between mb-0.5">
                                        <span className={`font-medium text-sm truncate ${channel.id === activeChannelId ? 'text-white' : 'text-white/90'}`}>
                                            {name}
                                        </span>
                                        {channel.lastMessageAt && (
                                            <span className="text-[10px] text-white/30 flex-shrink-0 ml-2">
                                                {formatTime(channel.lastMessageAt)}
                                            </span>
                                        )}
                                    </div>
                                    <p className={`text-xs truncate ${channel.id === activeChannelId ? 'text-white/60' : 'text-white/40 group-hover:text-white/50'}`}>
                                        {channel.lastMessage || 'Start a conversation'}
                                    </p>
                                </div>

                                {/* Close Button (on hover) */}
                                <div
                                    className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded-full bg-[#1a1a1a]"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // Handle close/hide DM logic here
                                    }}
                                >
                                    <X className="w-3 h-3 text-white/50 hover:text-white" />
                                </div>
                            </button>
                        )
                    })
                )}
            </div>

            {/* User Profile Panel (Footer) */}
            <UserProfilePanel />
        </div>
    )
}
