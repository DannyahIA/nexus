import { useState } from 'react'
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
      window.location.reload() // Recarregar para atualizar lista de servidores
    } catch (err: any) {
      console.error('Failed to join server:', err)
      setError(err.response?.data || t('invalidInviteCode'))
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-lg w-full max-w-md p-6 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-dark-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        {mode === 'invite' && server ? (
          <>
            {/* Invite Mode */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-primary-600 rounded-lg flex items-center justify-center">
                {server.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{t('inviteToServer', { serverName: server.name })}</h2>
                <p className="text-sm text-dark-400">{t('shareThisLink')}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  {t('inviteLink')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteLink}
                    readOnly
                    onClick={(e) => e.currentTarget.select()}
                    className="flex-1 px-3 py-2.5 bg-dark-900 border border-dark-700 rounded-lg text-white text-sm font-mono cursor-pointer hover:bg-dark-850 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600"
                  />
                  <button
                    onClick={handleCopy}
                    className={`px-4 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 ${
                      copied
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-primary-600 hover:bg-primary-700'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        {t('copied')}
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        {t('copy')}
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-dark-900 border border-dark-700 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary-600/20 rounded-lg flex items-center justify-center">
                    <span className="text-primary-400 text-sm font-bold">#</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white mb-1">
                      {t('code')}: <span className="font-mono text-primary-400">{server.inviteCode}</span>
                    </p>
                    <p className="text-xs text-dark-400">
                      {t('linkNeverExpires')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Join Mode */}
            <div className="mb-6">
              <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                <UserPlus className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white text-center">{t('joinServer')}</h2>
              <p className="text-sm text-dark-400 text-center mt-2">
                {t('enterInviteCode')}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
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
                  className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-600"
                />
                {error && (
                  <p className="text-red-500 text-sm mt-2">{error}</p>
                )}
              </div>

              <button
                onClick={handleJoinServer}
                disabled={!inviteCode.trim() || joining}
                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-dark-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
              >
                {joining ? t('joining') : t('joinServerButton')}
              </button>

              <div className="bg-dark-900 p-4 rounded-lg">
                <p className="text-xs text-dark-400">
                  <strong className="text-white">{t('tip')}:</strong> {t('inviteCodeTip')}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
