// Simple EventEmitter utility for services
export class EventEmitter {
  private listeners = new Map<string, Set<Function>>()

  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.delete(callback)
    }
  }

  once(event: string, callback: Function): void {
    const onceCallback = (...args: any[]) => {
      this.off(event, onceCallback)
      callback(...args)
    }
    this.on(event, onceCallback)
  }

  protected emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`Error in ${event} listener:`, error)
        }
      })
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }
}
