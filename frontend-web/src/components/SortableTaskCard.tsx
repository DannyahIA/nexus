import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Task } from '../store/taskStore'
import TaskCard from './TaskCard'

interface SortableTaskCardProps {
    task: Task
    onClick: () => void
    onDelete: (e: React.MouseEvent) => void
    getPriorityColor: (priority: string) => string
}

export default function SortableTaskCard({ task, onClick, onDelete, getPriorityColor }: SortableTaskCardProps) {
    const {
        setNodeRef,
        attributes,
        listeners,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: task.id,
        data: {
            type: 'Task',
            task,
        },
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
    }

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <TaskCard task={task} onClick={onClick} onDelete={onDelete} getPriorityColor={getPriorityColor} />
        </div>
    )
}
