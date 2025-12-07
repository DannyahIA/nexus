import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmationModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    variant?: 'danger' | 'warning' | 'info'
}

export default function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger'
}: ConfirmationModalProps) {

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        if (isOpen) window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    if (!isOpen) return null

    const getVariantStyles = () => {
        switch (variant) {
            case 'danger': return 'bg-red-600 hover:bg-red-500 shadow-red-900/20'
            case 'warning': return 'bg-yellow-600 hover:bg-yellow-500 shadow-yellow-900/20'
            case 'info': return 'bg-primary-600 hover:bg-primary-500 shadow-primary-900/20'
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-in fade-in duration-200">
            <div className="bg-dark-800 rounded-xl border border-white/10 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="p-6 text-center">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${variant === 'danger' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                    <p className="text-dark-300 text-sm leading-relaxed mb-6">
                        {message}
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition-colors font-medium text-sm"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={() => { onConfirm(); onClose() }}
                            className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors font-medium text-sm shadow-lg ${getVariantStyles()}`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
