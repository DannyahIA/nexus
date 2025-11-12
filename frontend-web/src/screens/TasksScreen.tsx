import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTaskStore, Task } from '../store/taskStore'
import { useAuthStore } from '../store/authStore'
import { api } from '../services/api'
import { Plus, Trash2, Edit, Menu, LogOut, MessageSquare } from 'lucide-react'

export default function TasksScreen() {
  const { channelId } = useParams()
  const navigate = useNavigate()
  const [showSidebar, setShowSidebar] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium' as const })

  const tasks = useTaskStore((state) => state.tasks)
  const setTasks = useTaskStore((state) => state.setTasks)
  const addTask = useTaskStore((state) => state.addTask)
  const updateTask = useTaskStore((state) => state.updateTask)
  const deleteTask = useTaskStore((state) => state.deleteTask)
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  const currentChannelId = channelId || 'default'
  const currentTasks = tasks[currentChannelId] || []

  const tasksByStatus = {
    todo: currentTasks.filter((t) => t.status === 'todo'),
    'in-progress': currentTasks.filter((t) => t.status === 'in-progress'),
    done: currentTasks.filter((t) => t.status === 'done'),
  }

  useEffect(() => {
    if (currentChannelId) {
      loadTasks(currentChannelId)
    }
  }, [currentChannelId])

  const loadTasks = async (channelId: string) => {
    try {
      const response = await api.getTasks(channelId)
      setTasks(channelId, response.data)
    } catch (error) {
      console.error('Failed to load tasks:', error)
    }
  }

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) return

    try {
      const response = await api.createTask(currentChannelId, {
        ...newTask,
        status: 'todo',
        assignee: user?.id,
      })
      addTask(response.data)
      setNewTask({ title: '', description: '', priority: 'medium' })
      setShowCreateModal(false)
    } catch (error) {
      console.error('Failed to create task:', error)
    }
  }

  const handleUpdateStatus = async (taskId: string, status: Task['status']) => {
    try {
      await api.updateTask(taskId, { status })
      updateTask(taskId, { status })
    } catch (error) {
      console.error('Failed to update task:', error)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      await api.deleteTask(taskId)
      deleteTask(taskId, currentChannelId)
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-500'
      case 'medium':
        return 'bg-yellow-500'
      case 'low':
        return 'bg-green-500'
      default:
        return 'bg-dark-500'
    }
  }

  return (
    <div className="flex h-screen bg-dark-900 text-white">
      {/* Sidebar */}
      <div
        className={`${
          showSidebar ? 'w-64' : 'w-0'
        } bg-dark-800 border-r border-dark-700 flex flex-col transition-all duration-300 overflow-hidden`}
      >
        <div className="p-4 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{user?.username}</p>
              <p className="text-xs text-dark-400 truncate">{user?.email}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-2">
          <button
            onClick={() => navigate('/chat')}
            className="w-full flex items-center gap-2 px-3 py-2 text-dark-300 hover:bg-dark-700 rounded-lg transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Chat</span>
          </button>
        </div>

        <div className="p-2 border-t border-dark-700">
          <button
            onClick={() => {
              logout()
              navigate('/login')
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-dark-700 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-14 bg-dark-800 border-b border-dark-700 flex items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="font-semibold text-xl">Tasks Board</h2>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-4 h-full min-w-max">
            {(['todo', 'in-progress', 'done'] as const).map((status) => (
              <div key={status} className="w-80 flex flex-col bg-dark-800 rounded-lg">
                <div className="p-4 border-b border-dark-700">
                  <h3 className="font-semibold capitalize">
                    {status.replace('-', ' ')} ({tasksByStatus[status].length})
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {tasksByStatus[status].map((task) => (
                    <div
                      key={task.id}
                      className="bg-dark-700 p-4 rounded-lg border border-dark-600 hover:border-dark-500 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium flex-1">{task.title}</h4>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {task.description && (
                        <p className="text-sm text-dark-300 mb-3">{task.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <span
                          className={`${getPriorityColor(
                            task.priority
                          )} text-xs px-2 py-1 rounded`}
                        >
                          {task.priority}
                        </span>
                        <div className="flex gap-1">
                          {status !== 'todo' && (
                            <button
                              onClick={() =>
                                handleUpdateStatus(
                                  task.id,
                                  status === 'in-progress' ? 'todo' : 'in-progress'
                                )
                              }
                              className="text-xs text-dark-400 hover:text-white"
                            >
                              ← Back
                            </button>
                          )}
                          {status !== 'done' && (
                            <button
                              onClick={() =>
                                handleUpdateStatus(
                                  task.id,
                                  status === 'todo' ? 'in-progress' : 'done'
                                )
                              }
                              className="text-xs text-primary-400 hover:text-primary-300"
                            >
                              Next →
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-dark-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">Create New Task</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Title</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-600"
                  placeholder="Task title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Description
                </label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-600"
                  placeholder="Task description"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Priority</label>
                <select
                  value={newTask.priority}
                  onChange={(e) =>
                    setNewTask({ ...newTask, priority: e.target.value as any })
                  }
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-600"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTask}
                className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
