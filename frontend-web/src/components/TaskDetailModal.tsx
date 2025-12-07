import React, { useState, useEffect } from 'react'
import { X, Calendar, Trash2 } from 'lucide-react'
import { Task } from '../store/taskStore'

interface Column {
    column_id: string
    name: string
}

interface TaskDetailModalProps {
    task: Task
    columns: Column[]
    onClose: () => void
    onUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>
    onDelete: (taskId: string) => Promise<void>
}

export default function TaskDetailModal({ task, columns, onClose, onUpdate, onDelete }: TaskDetailModalProps) {
    const [title, setTitle] = useState(task.title)
    const [description, setDescription] = useState(task.description || '')
    const [priority, setPriority] = useState(task.priority)
    const [columnId, setColumnId] = useState(task.columnId)
    const [dueDate, setDueDate] = useState(task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '')
    const [newLabel, setNewLabel] = useState('')
    const [labels, setLabels] = useState<string[]>(task.labels || [])
    const [isSaving, setIsSaving] = useState(false)

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            await onUpdate(task.id, {
                title,
                description,
                priority,
                columnId,
                labels,
                dueDate: dueDate ? new Date(dueDate).getTime() : undefined
            })
            onClose()
        } catch (error) {
            console.error('Failed to update task:', error)
        } finally {
            setIsSaving(false)
        }
    }

    const handleAddLabel = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && newLabel.trim()) {
            if (!labels.includes(newLabel.trim())) {
                setLabels([...labels, newLabel.trim()])
            }
            setNewLabel('')
        }
    }

    const removeLabel = (labelToRemove: string) => {
        setLabels(labels.filter(l => l !== labelToRemove))
    }

    const getPriorityColor = (p: string) => {
        switch (p) {
            case 'high': return 'text-red-400'
            case 'medium': return 'text-yellow-400'
            case 'low': return 'text-green-400'
            default: return 'text-dark-400'
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-dark-800 rounded-xl border border-white/10 w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-dark-400 uppercase tracking-wider">
                            {columns.find(c => c.column_id === columnId)?.name || 'Task'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onDelete(task.id)}
                            className="p-2 text-dark-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Delete Task"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-dark-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Title */}
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-transparent text-2xl font-bold text-white focus:outline-none placeholder-dark-500"
                        placeholder="Task title"
                    />

                    {/* Properties Grid */}
                    <div className="grid grid-cols-2 gap-6 p-4 bg-dark-900/50 rounded-lg border border-white/5">

                        {/* Status/Column */}
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-dark-400 uppercase tracking-wider">Status</label>
                            <select
                                value={columnId}
                                onChange={(e) => setColumnId(e.target.value)}
                                className="w-full bg-dark-800 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500"
                            >
                                {columns.map(col => (
                                    <option key={col.column_id} value={col.column_id}>{col.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Priority */}
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-dark-400 uppercase tracking-wider">Priority</label>
                            <div className="relative">
                                <select
                                    value={priority}
                                    onChange={(e) => setPriority(e.target.value as any)}
                                    className={`w-full bg-dark-800 border border-white/10 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-primary-500 ${getPriorityColor(priority)}`}
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                        </div>

                        {/* Due Date */}
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-dark-400 uppercase tracking-wider">Due Date</label>
                            <div className="flex items-center gap-2 bg-dark-800 border border-white/10 rounded px-2 py-1.5">
                                <Calendar className="w-4 h-4 text-dark-400" />
                                <input
                                    type="date"
                                    value={dueDate}
                                    onChange={(e) => setDueDate(e.target.value)}
                                    className="bg-transparent text-sm text-white focus:outline-none w-full [&::-webkit-calendar-picker-indicator]:invert"
                                />
                            </div>
                        </div>

                        {/* Labels */}
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-dark-400 uppercase tracking-wider">Labels</label>
                            <div className="flex flex-wrap gap-2 min-h-[34px] bg-dark-800 border border-white/10 rounded px-2 py-1.5">
                                {labels.map(label => (
                                    <span key={label} className="flex items-center gap-1 text-xs bg-primary-500/20 text-primary-300 px-1.5 py-0.5 rounded border border-primary-500/30">
                                        {label}
                                        <button onClick={() => removeLabel(label)} className="hover:text-white"><X className="w-3 h-3" /></button>
                                    </span>
                                ))}
                                <input
                                    type="text"
                                    value={newLabel}
                                    onChange={(e) => setNewLabel(e.target.value)}
                                    onKeyDown={handleAddLabel}
                                    placeholder={labels.length === 0 ? "Add label..." : ""}
                                    className="bg-transparent text-sm text-white focus:outline-none min-w-[60px] flex-1"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-dark-300">
                            <div className="w-4 h-4 rounded-full border border-dark-500 flex items-center justify-center">
                                <div className="w-2 h-0.5 bg-dark-500" />
                            </div>
                            Description
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full min-h-[150px] bg-transparent border-none text-dark-100 focus:outline-none resize-none leading-relaxed"
                            placeholder="Add a more detailed description..."
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/5 flex justify-end gap-3 bg-dark-900/30 rounded-b-xl">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-dark-300 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-primary-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    )
}
