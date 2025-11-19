import { useState } from 'react'
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
      setError('Digite um código de convite')
      return
    }

    setJoining(true)
    setError('')

    try {
      await api.joinServer(inviteCode.trim())
      alert('Você entrou no servidor com sucesso!')
      window.location.reload() // Recarregar para atualizar lista de servidores
    } catch (err: any) {
      console.error('Failed to join server:', err)
      setError(err.response?.data || 'Código de convite inválido')
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
                <h2 className="text-xl font-bold text-white">Convidar para {server.name}</h2>
                <p className="text-sm text-dark-400">Compartilhe este link com seus amigos</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Link de Convite
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteLink}
                    readOnly
                    className="flex-1 px-3 py-2 bg-dark-900 border border-dark-700 rounded text-white text-sm"
                  />
                  <button
                    onClick={handleCopy}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded font-medium transition-colors flex items-center gap-2"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copiar
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-dark-900 p-4 rounded-lg">
                <p className="text-sm text-dark-400">
                  <strong className="text-white">Código:</strong> {server.inviteCode}
                </p>
                <p className="text-xs text-dark-500 mt-2">
                  Este link nunca expira e pode ser usado por qualquer pessoa.
                </p>
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
              <h2 className="text-xl font-bold text-white text-center">Entrar em um Servidor</h2>
              <p className="text-sm text-dark-400 text-center mt-2">
                Digite o código de convite abaixo
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Código de Convite
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
                  placeholder="Ex: ABC12345"
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
                {joining ? 'Entrando...' : 'Entrar no Servidor'}
              </button>

              <div className="bg-dark-900 p-4 rounded-lg">
                <p className="text-xs text-dark-400">
                  <strong className="text-white">Dica:</strong> Os códigos de convite geralmente têm 8 caracteres e são fornecidos pelos administradores do servidor.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
