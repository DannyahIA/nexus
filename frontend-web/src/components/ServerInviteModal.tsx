import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, Copy, Check, UserPlus } from 'lucide-react'
import { api } from '../services/api'

interface ServerInviteModalProps {
  isOpen: boolean
  onClose: () => void
  server?: {
    id: string
    name: string
    inviteCode?: string
  }
  mode: 'invite' | 'join'
}

export default function ServerInviteModal({ isOpen, onClose, server, mode }: ServerInviteModalProps) {
  const { t } = useTranslation('chat')
  const [copied, setCopied] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const inviteLink = server?.inviteCode
    ? `${window.location.origin}/invite/${server.inviteCode}`
    : ''

  const handleCopy = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleJoinServer = async () => {
    if (!inviteCode.trim()) {
      setError(t('enterInviteCode2'))
      return
    }

    setJoining(true)
    setError('')

    try {
      await api.joinServer(inviteCode.trim())
      alert(t('joinedSuccessfully'))
      window.location.reload()
    } catch (err: any) {
      console.error('Failed to join server:', err)
      setError(err.response?.data || t('invalidInviteCode'))
    } finally {
      setJoining(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fade-in">
      <div className="bg-[#121214]/80 backdrop-blur-xl border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
          <h2 className="text-xl font-bold text-white tracking-tight">
            {mode === 'invite' ? t('inviteToServer', { serverName: server?.name }) : t('joinServer')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {mode === 'invite' && server ? (
            <>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-primary-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                  <span className="text-2xl font-bold text-white">
                    {server.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">{server.name}</h3>
                  <p className="text-sm text-white/50">{t('shareThisLink')}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
                    {t('inviteLink')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inviteLink}
                      readOnly
                      onClick={(e) => e.currentTarget.select()}
                      className="flex-1 px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white font-mono text-sm cursor-pointer hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                    />
                    <button
                      onClick={handleCopy}
                      className={`px-4 py-3 rounded-xl font-medium transition-all flex items-center gap-2 shadow-lg ${copied
                          ? 'bg-green-500 hover:bg-green-400 text-white shadow-green-500/20'
                          : 'bg-primary-600 hover:bg-primary-500 text-white shadow-primary-500/20'
                        }`}
                    >
                      {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-primary-500/20 rounded-lg flex items-center justify-center">
                      <span className="text-primary-400 text-sm font-bold">#</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white mb-1">
                        {t('code')}: <span className="font-mono text-primary-400 tracking-wider">{server.inviteCode}</span>
                      </p>
                      <p className="text-xs text-white/40">
                        {t('linkNeverExpires')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center mb-8">
                <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl flex items-center justify-center mb-4 shadow-xl shadow-green-500/20 rotate-3">
                  <UserPlus className="w-10 h-10 text-white" />
                </div>
                <p className="text-center text-white/60">
                  {t('enterInviteCode')}
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
                    {t('inviteCode')}
                  </label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => {
                      setInviteCode(e.target.value)
                      setError('')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleJoinServer()
                      }
                    }}
                    placeholder={t('inviteCodePlaceholder')}
                    className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all text-center text-lg tracking-widest font-mono"
                  />
                  {error && (
                    <p className="text-red-400 text-sm mt-2 flex items-center gap-2 justify-center bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                      <X className="w-4 h-4" />
                      {error}
                    </p>
                  )}
                </div>

                <button
                  onClick={handleJoinServer}
                  disabled={!inviteCode.trim() || joining}
                  className="w-full px-4 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-white text-lg shadow-lg shadow-green-900/20 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {joining ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t('joining')}
                    </div>
                  ) : (
                    t('joinServerButton')
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
