import { useEffect, useState, useMemo, memo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTaskStore, Task } from '../store/taskStore'
import { useAuthStore } from '../store/authStore'
import { api } from '../services/api'
import { Plus, Menu, LogOut, MessageSquare, ClipboardList } from 'lucide-react'
import TaskDetailModal from '../components/TaskDetailModal'
import ConfirmationModal from '../components/ConfirmationModal'
import TaskCard from '../components/TaskCard'
import TaskColumn from '../components/TaskColumn'
import FloatingLines from '../components/FloatingLinesBackground'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
  DropAnimation
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { createPortal } from 'react-dom'

interface TasksScreenProps {
  channelId?: string
  isEmbedded?: boolean
}

interface Column {
  column_id: string
  name: string
  position: number
}

interface DeleteConfirmation {
  type: 'column' | 'task'
  id: string
  name?: string
  position?: number
}

// Visual Configuration
const WAVES_CONFIG: ("top" | "middle" | "bottom")[] = ['top', 'middle', 'bottom'];

const BackgroundLayer = memo(() => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      <FloatingLines
        enabledWaves={WAVES_CONFIG}
        lineCount={3}
        lineDistance={50}
        bendRadius={5.0}
        bendStrength={-0.5}
        interactive={false} // Disable interaction for performance in tasks view
        parallax={true}
      />
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-black/40 to-black pointer-events-none" />
    </div>
  )
});
BackgroundLayer.displayName = 'BackgroundLayer';

export default function TasksScreen({ channelId: propChannelId, isEmbedded = false }: TasksScreenProps) {
  const { t } = useTranslation()
  const { channelId: paramChannelId } = useParams()
  const navigate = useNavigate()
  const [showSidebar, setShowSidebar] = useState(!isEmbedded)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showCreateColumnModal, setShowCreateColumnModal] = useState(false)
  const [columns, setColumns] = useState<Column[]>([])

  // New state for modals
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null)

  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium' as const,
    columnId: '',
    labels: [] as string[],
    dueDate: undefined as number | undefined
  })

  const [newColumnName, setNewColumnName] = useState('')

  // DnD State
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const tasks = useTaskStore((state) => state.tasks)
  const setTasks = useTaskStore((state) => state.setTasks)
  const addTask = useTaskStore((state) => state.addTask)
  const updateTask = useTaskStore((state) => state.updateTask)
  const deleteTask = useTaskStore((state) => state.deleteTask)
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  const currentChannelId = propChannelId || paramChannelId || 'default'
  const currentTasks = tasks[currentChannelId] || []

  // Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3, // 3px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    if (currentChannelId) {
      loadData(currentChannelId)
    }
  }, [currentChannelId])

  const loadData = async (channelId: string) => {
    try {
      const [tasksRes, columnsRes] = await Promise.all([
        api.getTasks(channelId),
        api.getColumns(channelId)
      ])

      setTasks(channelId, tasksRes.data)
      setColumns(columnsRes.data.sort((a: Column, b: Column) => a.position - b.position))
    } catch (error) {
      console.error('Failed to load data:', error)
    }
  }

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) return

    try {
      // Use first column if none selected
      const targetColumnId = newTask.columnId || columns[0]?.column_id

      const response = await api.createTask(currentChannelId, {
        ...newTask,
        columnId: targetColumnId,
        status: 'todo', // Legacy
        assignee: user?.id,
      })
      addTask(response.data)
      setNewTask({ title: '', description: '', priority: 'medium', columnId: '', labels: [], dueDate: undefined })
      setShowCreateModal(false)
    } catch (error) {
      console.error('Failed to create task:', error)
    }
  }

  const handleCreateColumn = async () => {
    if (!newColumnName.trim()) return

    try {
      const response = await api.createColumn(currentChannelId, newColumnName)
      setColumns([...columns, response.data])
      setNewColumnName('')
      setShowCreateColumnModal(false)
    } catch (error) {
      console.error('Failed to create column:', error)
    }
  }

  const confirmDeleteColumn = (columnId: string, position: number, name: string) => {
    setDeleteConfirmation({ type: 'column', id: columnId, position, name })
  }

  const confirmDeleteTask = (taskId: string, title: string) => {
    setDeleteConfirmation({ type: 'task', id: taskId, name: title })
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirmation) return

    try {
      if (deleteConfirmation.type === 'column') {
        await api.deleteColumn(currentChannelId, deleteConfirmation.id, deleteConfirmation.position || 0)
        setColumns(columns.filter(c => c.column_id !== deleteConfirmation.id))
      } else {
        await api.deleteTask(deleteConfirmation.id, currentChannelId, 0)
        deleteTask(deleteConfirmation.id, currentChannelId)
        if (selectedTask?.id === deleteConfirmation.id) setSelectedTask(null)
      }
      setDeleteConfirmation(null)
    } catch (error) {
      console.error(`Failed to delete ${deleteConfirmation.type}:`, error)
    }
  }

  const handleUpdateTask = async (taskId: string, updates: Partial<Task>) => {
    try {
      await api.updateTask(taskId, currentChannelId, updates)
      updateTask(taskId, updates)

      // Update local selected task if it's the one being updated
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask({ ...selectedTask, ...updates })
      }
    } catch (error) {
      console.error('Failed to update task:', error)
      throw error
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      case 'low': return 'bg-green-500/20 text-green-400 border-green-500/30'
      default: return 'bg-white/10 text-white/50 border-white/10'
    }
  }

  // DnD Handlers
  const onDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === 'Task') {
      setActiveTask(event.active.data.current.task)
    }
  }

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id
    const overId = over.id

    if (activeId === overId) return

    const isActiveTask = active.data.current?.type === 'Task'
    const isOverTask = over.data.current?.type === 'Task'
    const isOverColumn = over.data.current?.type === 'Column'

    if (!isActiveTask) return

    // Dropping a Task over another Task (reordering or moving column)
    if (isActiveTask && isOverTask) {
      const activeTask = currentTasks.find(t => t.id === activeId)
      const overTask = currentTasks.find(t => t.id === overId)

      if (activeTask && overTask && activeTask.columnId !== overTask.columnId) {
        // Update local state immediately for smooth drag (changing columns)
        const updatedTasks = currentTasks.map(t => {
          if (t.id === activeId) {
            return { ...t, columnId: overTask.columnId }
          }
          return t
        })
        setTasks(currentChannelId, updatedTasks)
      }
    }

    // Dropping a Task over a Column (moving column)
    if (isActiveTask && isOverColumn) {
      const activeTask = currentTasks.find(t => t.id === activeId)
      const overColumnId = overId as string

      if (activeTask && activeTask.columnId !== overColumnId) {
        const updatedTasks = currentTasks.map(t => {
          if (t.id === activeId) {
            return { ...t, columnId: overColumnId }
          }
          return t
        })
        setTasks(currentChannelId, updatedTasks)
      }
    }
  }

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null)
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeTask = currentTasks.find(t => t.id === activeId)
    if (!activeTask) return

    let newColumnId = activeTask.columnId

    // 1. Dropped directly over a Column
    if (over.data.current?.type === 'Column') {
      newColumnId = overId
    }
    // 2. Dropped over another Task
    else if (over.data.current?.type === 'Task') {
      const overTask = currentTasks.find(t => t.id === overId)
      if (overTask) {
        newColumnId = overTask.columnId
      }
    }

    if (activeTask.columnId !== newColumnId) {
      console.log(`Persisting move: Task ${activeTask.title} -> Column ${newColumnId}`)
      try {
        // Optimistic update already happened in onDragOver or we do it here if needed
        // (onDragOver handles the visual 'snap' to the new column, but we must persist)
        await api.updateTask(activeId, currentChannelId, { columnId: newColumnId })
        updateTask(activeId, { columnId: newColumnId })
      } catch (error) {
        console.error("Failed to save drag drop:", error)
        // Revert would be nice here
        loadData(currentChannelId) // Reload data to revert visual state
      }
    }
  }

  const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.5',
        },
      },
    }),
  }

  // Group tasks by column
  const tasksByColumn = useMemo(() => {
    const grouped = columns.reduce((acc, col) => {
      acc[col.column_id] = currentTasks.filter(t => t.columnId === col.column_id)
      return acc
    }, {} as Record<string, Task[]>)

    // Handle legacy tasks (no column) - put in first column
    const legacyTasks = currentTasks.filter(t => !t.columnId)
    if (legacyTasks.length > 0 && columns.length > 0) {
      if (!grouped[columns[0].column_id]) grouped[columns[0].column_id] = []
      grouped[columns[0].column_id].push(...legacyTasks)
    }
    return grouped
  }, [columns, currentTasks])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="relative flex h-full bg-black text-white overflow-hidden">
        {/* Animated Background */}
        <BackgroundLayer />

        {/* Sidebar - Only show if not embedded */}
        {!isEmbedded && (
          <div className={`${showSidebar ? 'w-64' : 'w-0'} relative z-10 bg-black/40 backdrop-blur-xl border-r border-white/10 flex flex-col transition-all duration-300 overflow-hidden`}>
            {/* Sidebar content simplified for brevity, kept consistent with dark theme glassmorphism */}
            <div className="p-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full flex items-center justify-center shadow-lg shadow-purple-900/40">
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-white/90">{user?.username}</p>
                  <p className="text-xs text-white/40 truncate">{user?.email}</p>
                </div>
              </div>
            </div>
            <div className="flex-1 p-2">
              <button onClick={() => navigate('/chat')} className="w-full flex items-center gap-2 px-3 py-2 text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-all duration-200 group">
                <MessageSquare className="w-4 h-4 group-hover:text-purple-400 transition-colors" />
                <span>{t('tasks.chat')}</span>
              </button>
            </div>
            <div className="p-2 border-t border-white/10">
              <button onClick={() => { logout(); navigate('/login') }} className="w-full flex items-center gap-2 px-3 py-2 text-red-400/80 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                <LogOut className="w-4 h-4" />
                <span>{t('tasks.logout')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="relative z-10 flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className={`h-16 border-b border-white/10 flex items-center justify-between px-6 backdrop-blur-md ${isEmbedded ? 'bg-transparent' : 'bg-black/20'}`}>
            <div className="flex items-center gap-4">
              {!isEmbedded && (
                <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 text-white/60 hover:text-white hover:bg-white/5 rounded-xl transition-colors">
                  <Menu className="w-5 h-5" />
                </button>
              )}
              <h2 className="font-bold text-lg text-white tracking-widest uppercase flex items-center gap-3">
                {isEmbedded && <ClipboardList className="w-5 h-5 text-purple-400" />}
                {t('tasks.tasksBoard')}
              </h2>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateColumnModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/90 rounded-xl transition-all duration-300 font-medium text-sm backdrop-blur-sm shadow-lg hover:shadow-purple-500/10"
              >
                <Plus className="w-4 h-4" />
                {t('tasks.addColumn')}
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl transition-all duration-300 font-medium text-sm shadow-lg shadow-purple-600/30 hover:shadow-purple-600/50"
              >
                <Plus className="w-4 h-4" />
                {t('tasks.newTask')}
              </button>
            </div>
          </div>

          {/* Kanban Board */}
          <div className="flex-1 overflow-x-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <div className="flex gap-6 h-full min-w-max pb-2">
              {columns.map((col) => (
                <TaskColumn
                  key={col.column_id}
                  column={col}
                  tasks={tasksByColumn[col.column_id] || []}
                  onDeleteColumn={confirmDeleteColumn}
                  onTaskClick={setSelectedTask}
                  onDeleteTask={confirmDeleteTask}
                  getPriorityColor={getPriorityColor}
                />
              ))}

              {/* Empty State / Add Column Hint */}
              {columns.length === 0 && (
                <div className="flex flex-col items-center justify-center w-full h-full text-white/30">
                  <ClipboardList className="w-16 h-16 mb-4 opacity-50" />
                  <p className="text-lg font-light tracking-wide mb-6">No columns yet. Create one to get started!</p>
                  <button
                    onClick={() => setShowCreateColumnModal(true)}
                    className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all text-white/80 hover:text-white"
                  >
                    Create Column
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modals - Updates for Glassmorphism */}
        {selectedTask && (
          <TaskDetailModal
            task={selectedTask}
            columns={columns}
            onClose={() => setSelectedTask(null)}
            onUpdate={handleUpdateTask}
            onDelete={async (taskId) => { confirmDeleteTask(taskId, selectedTask.title); setSelectedTask(null) }}
          />
        )}

        {/* Confirmation Modal - Assumed to be updated separately or use generic styles */}
        <ConfirmationModal
          isOpen={!!deleteConfirmation}
          onClose={() => setDeleteConfirmation(null)}
          onConfirm={handleConfirmDelete}
          title={deleteConfirmation?.type === 'column' ? t('tasks.deleteColumn') : t('tasks.deleteTask')}
          message={deleteConfirmation?.type === 'column'
            ? `Are you sure you want to delete the column "${deleteConfirmation?.name}"? This action cannot be undone.`
            : `Are you sure you want to delete the task "${deleteConfirmation?.name}"? This action cannot be undone.`
          }
          confirmText="Delete"
          variant="danger"
        />

        {/* Create Task Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center p-4 z-50">
            <div className="bg-black/40 rounded-2xl border border-white/10 p-8 w-full max-w-md shadow-2xl">
              <h3 className="text-xl font-bold mb-6 text-white tracking-wide">{t('tasks.createNewTask')}</h3>
              <div className="space-y-5">
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all"
                  placeholder={t('tasks.taskTitle')}
                  autoFocus
                />
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all resize-none"
                  placeholder={t('tasks.taskDescription')}
                  rows={3}
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-white/40 mb-2 uppercase tracking-widest">{t('tasks.priority')}</label>
                    <select
                      value={newTask.priority}
                      onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as any })}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50"
                    >
                      <option value="low" className="bg-dark-800">{t('tasks.low')}</option>
                      <option value="medium" className="bg-dark-800">{t('tasks.medium')}</option>
                      <option value="high" className="bg-dark-800">{t('tasks.high')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-white/40 mb-2 uppercase tracking-widest">Column</label>
                    <select
                      value={newTask.columnId}
                      onChange={(e) => setNewTask({ ...newTask, columnId: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50"
                    >
                      {columns.map(col => (
                        <option key={col.column_id} value={col.column_id} className="bg-dark-800">{col.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex gap-4 mt-8">
                <button onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors font-medium text-sm">
                  {t('common.cancel')}
                </button>
                <button onClick={handleCreateTask} className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-colors font-medium text-sm shadow-lg shadow-purple-600/20">
                  {t('tasks.create')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Column Modal */}
        {showCreateColumnModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center p-4 z-50">
            <div className="bg-black/40 rounded-2xl border border-white/10 p-8 w-full max-w-sm shadow-2xl">
              <h3 className="text-xl font-bold mb-6 text-white tracking-wide">{t('tasks.addColumn')}</h3>
              <input
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all mb-8"
                placeholder="Column Name (e.g. Backlog)"
                autoFocus
              />
              <div className="flex gap-4">
                <button onClick={() => setShowCreateColumnModal(false)} className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors font-medium text-sm">
                  {t('common.cancel')}
                </button>
                <button onClick={handleCreateColumn} className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-colors font-medium text-sm shadow-lg shadow-purple-600/20">
                  {t('common.create')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Drag Overlay */}
        {createPortal(
          <DragOverlay dropAnimation={dropAnimation}>
            {activeTask ? (
              <TaskCard
                task={activeTask}
                onClick={() => { }}
                onDelete={(e) => e.preventDefault()}
                getPriorityColor={getPriorityColor}
              />
            ) : null}
          </DragOverlay>,
          document.body
        )}
      </div>
    </DndContext>
  )
}

