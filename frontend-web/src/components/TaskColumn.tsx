import React from 'react'
import { MoreHorizontal } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Task } from '../store/taskStore'
import SortableTaskCard from './SortableTaskCard'

interface Column {
    column_id: string
    name: string
    position: number
}

interface TaskColumnProps {
    column: Column
    tasks: Task[]
    onDeleteColumn: (id: string, position: number, name: string) => void
    onTaskClick: (task: Task) => void
    onDeleteTask: (id: string, title: string) => void
    getPriorityColor: (priority: string) => string
}

export default function TaskColumn({ column, tasks, onDeleteColumn, onTaskClick, onDeleteTask, getPriorityColor }: TaskColumnProps) {
    const { setNodeRef } = useDroppable({
        id: column.column_id,
        data: {
            type: 'Column',
            column
        }
    })

    return (
        <div className="w-80 flex flex-col bg-black/20 backdrop-blur-xl rounded-2xl border border-white/10 shadow-xl">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5 rounded-t-2xl">
                <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-white tracking-wide text-sm uppercase">{column.name}</h3>
                    <span className="text-[10px] font-bold text-white/50 bg-white/10 px-2 py-0.5 rounded-full">
                        {tasks.length}
                    </span>
                </div>
                <button
                    onClick={() => onDeleteColumn(column.column_id, column.position, column.name)}
                    className="text-white/30 hover:text-red-400 transition-colors p-1.5 hover:bg-white/5 rounded-lg"
                >
                    <MoreHorizontal className="w-4 h-4" />
                </button>
            </div>

            <div ref={setNodeRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[150px] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <SortableContext
                    items={tasks.map(t => t.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {tasks.map((task) => (
                        <SortableTaskCard
                            key={task.id}
                            task={task}
                            onClick={() => onTaskClick(task)}
                            onDelete={(e: React.MouseEvent) => { e.stopPropagation(); onDeleteTask(task.id, task.title) }}
                            getPriorityColor={getPriorityColor}
                        />
                    ))}
                </SortableContext>
                {tasks.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-white/20 text-sm italic min-h-[100px] border-2 border-dashed border-white/5 rounded-xl m-2">
                        <span>Drop tasks here</span>
                    </div>
                )}
            </div>
        </div>
    )
}
