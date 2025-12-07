import { create } from 'zustand'

export interface Task {
  id: string
  channelId: string
  title: string
  description?: string
  status: 'todo' | 'in-progress' | 'done'
  assignee?: string
  priority: 'low' | 'medium' | 'high'
  columnId?: string
  labels?: string[]
  dueDate?: number
  createdAt: number
  updatedAt: number
}

interface TaskState {
  tasks: Record<string, Task[]>

  setTasks: (channelId: string, tasks: Task[]) => void
  addTask: (task: Task) => void
  updateTask: (taskId: string, updates: Partial<Task>) => void
  deleteTask: (taskId: string, channelId: string) => void
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: {},

  setTasks: (channelId, tasks) =>
    set((state) => ({
      tasks: {
        ...state.tasks,
        [channelId]: tasks,
      },
    })),

  addTask: (task) =>
    set((state) => ({
      tasks: {
        ...state.tasks,
        [task.channelId]: [...(state.tasks[task.channelId] || []), task],
      },
    })),

  updateTask: (taskId, updates) =>
    set((state) => {
      const newTasks = { ...state.tasks }

      for (const channelId in newTasks) {
        const index = newTasks[channelId].findIndex((t) => t.id === taskId)
        if (index !== -1) {
          newTasks[channelId][index] = {
            ...newTasks[channelId][index],
            ...updates,
            updatedAt: Date.now(),
          }
          break
        }
      }

      return { tasks: newTasks }
    }),

  deleteTask: (taskId, channelId) =>
    set((state) => ({
      tasks: {
        ...state.tasks,
        [channelId]: state.tasks[channelId].filter((t) => t.id !== taskId),
      },
    })),
}))
