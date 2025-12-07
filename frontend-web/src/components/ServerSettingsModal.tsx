import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, Upload, Hash, Save, Trash2 } from 'lucide-react'
import { api } from '../services/api'

interface ServerSettingsModalProps {
    isOpen: boolean
    onClose: () => void
    server: {
        id: string
        name: string
        description?: string
        icon?: string
        ownerId: string
    }
    onUpdate: () => void
}

export default function ServerSettingsModal({ isOpen, onClose, server, onUpdate }: ServerSettingsModalProps) {
    const { t } = useTranslation('chat')
    const { t: tCommon } = useTranslation('common')
    const [name, setName] = useState(server.name)
    const [description, setDescription] = useState(server.description || '')
    const [icon, setIcon] = useState(server.icon || '')
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setName(server.name)
            setDescription(server.description || '')
            setIcon(server.icon || '')
        }
    }, [isOpen, server])

    if (!isOpen) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return

        setLoading(true)
        try {
            // TODO: Implement update server API endpoint
            // await api.updateServer(server.id, { name, description, icon })
            console.log('Updating server:', { name, description, icon })

            // Mock update for now until API is ready
            onUpdate()
            onClose()
        } catch (error) {
            console.error('Failed to update server:', error)
        } finally {
            setLoading(false)
        }
    }

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fade-in">
            <div className="bg-[#121214]/80 backdrop-blur-xl border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
                    <h2 className="text-xl font-bold text-white tracking-tight">{t('serverSettings')}</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white"
                        disabled={loading}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Icon Upload */}
                    <div className="flex flex-col items-center">
                        <div className="w-24 h-24 bg-black/20 rounded-full flex items-center justify-center mb-3 border-2 border-dashed border-white/10 hover:border-primary-500 transition-colors cursor-pointer group overflow-hidden relative">
                            {icon ? (
                                <img src={icon} alt="Server icon" className="w-full h-full object-cover" />
                            ) : (
                                <Upload className="w-8 h-8 text-white/30 group-hover:text-primary-400 transition-colors" />
                            )}
                        </div>
                        <p className="text-xs text-white/40 text-center">
                            {t('clickToUploadIcon')}
                        </p>
                    </div>

                    {/* Icon URL */}
                    <div>
                        <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
                            {t('iconUrl')}
                        </label>
                        <input
                            type="url"
                            value={icon}
                            onChange={(e) => setIcon(e.target.value)}
                            placeholder={t('iconUrlPlaceholder')}
                            className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all"
                            disabled={loading}
                        />
                    </div>

                    {/* Server Name */}
                    <div>
                        <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
                            {t('serverName')}
                        </label>
                        <div className="relative group">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-primary-400 transition-colors">
                                <Hash className="w-5 h-5" />
                            </div>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('serverNamePlaceholder')}
                                className="w-full pl-12 pr-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all"
                                required
                                disabled={loading}
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
                            {t('serverDescription')}
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={t('serverDescriptionPlaceholder')}
                            rows={3}
                            className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all resize-none"
                            disabled={loading}
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors font-medium"
                            disabled={loading}
                        >
                            {tCommon('cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim() || loading}
                            className="flex-1 px-4 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white rounded-xl transition-all font-medium shadow-lg shadow-primary-900/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    {t('saveChanges')}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    )
}
