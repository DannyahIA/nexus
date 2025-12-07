import React from 'react'
import { Trash2, Calendar } from 'lucide-react'
import { Task } from '../store/taskStore'

interface TaskCardProps {
    task: Task
    onClick: () => void
    onDelete: (e: React.MouseEvent) => void
    getPriorityColor: (priority: string) => string
}

export default function TaskCard({ task, onClick, onDelete, getPriorityColor }: TaskCardProps) {
    return (
        <div
            onClick={onClick}
            className="group relative bg-white/5 hover:bg-white/10 p-4 rounded-xl border border-white/5 hover:border-white/20 transition-all duration-300 shadow-lg hover:shadow-purple-500/10 cursor-pointer backdrop-blur-md"
        >
            <div className="flex items-start justify-between mb-3">
                <h4 className="font-medium text-white/90 text-sm leading-snug tracking-wide">{task.title}</h4>
                <button
                    onClick={onDelete}
                    className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-red-400 transition-all duration-200 p-1 hover:bg-white/5 rounded"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {task.labels && task.labels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {task.labels.map((label, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 bg-purple-500/10 text-purple-300 rounded-full border border-purple-500/20 font-medium tracking-wider">
                            {label}
                        </span>
                    ))}
                </div>
            )}

            <div className="flex items-center justify-between mt-2 pt-3 border-t border-white/5">
                <div className="flex items-center gap-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getPriorityColor(task.priority)} uppercase font-bold tracking-wider shadow-sm`}>
                        {task.priority}
                    </span>
                    {task.dueDate && (
                        <span className="flex items-center gap-1.5 text-[10px] text-white/40 font-medium">
                            <Calendar className="w-3 h-3" />
                            {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
