import { useEffect, useRef, useState, useCallback, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Trash2, Edit, Reply } from 'lucide-react'
import MessageContextMenu from './MessageContextMenu'
import { formatMessageTime, formatDateSeparator } from '../i18n/dateFormatter'
import { Avatar } from '@heroui/avatar'

interface Message {
  id: string
  channelId: string
  userId: string
  username: string
  avatar?: string
  content: string
  timestamp: number
  editedAt?: number
}

interface MessageListProps {
  messages: Message[]
  loading: boolean
  hasMore: boolean
  onLoadMore: () => void
  currentUserId: string
  isServerOwner?: boolean
  isServerAdmin?: boolean
  onDeleteMessage: (messageId: string) => void
  onEditMessage?: (messageId: string, newContent: string) => void
  onReplyMessage?: (messageId: string) => void
}

// Componente de mensagem individual memoizado para evitar re-renders
const MessageItem = memo(({ 
  message, 
  showDateSeparator,
  isGrouped,
  currentUserId,
  isServerOwner,
  isServerAdmin,
  onDeleteMessage,
  onEditMessage,
  onReplyMessage
}: { 
  message: Message; 
  showDateSeparator: boolean;
  isGrouped: boolean;
  currentUserId: string;
  isServerOwner?: boolean;
  isServerAdmin?: boolean;
  onDeleteMessage: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onReplyMessage?: (messageId: string) => void;
}) => {
  const { t } = useTranslation('chat')
  const [isHovered, setIsHovered] = useState(false)
  const [isShiftPressed, setIsShiftPressed] = useState(false)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })

  // Detectar tecla Shift
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(true)
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  const formatTime = (timestamp: number) => {
    return formatMessageTime(timestamp)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
    setShowContextMenu(true)
  }

  const canDelete = message.userId === currentUserId || isServerOwner || isServerAdmin
  const canEdit = message.userId === currentUserId

  return (
    <>
      {/* Separador de data */}
      {showDateSeparator && (
        <div className="flex items-center justify-center my-4">
          <div className="flex-1 h-px bg-dark-700"></div>
          <span className="px-4 text-xs text-dark-400">
            {formatDateSeparator(message.timestamp)}
          </span>
          <div className="flex-1 h-px bg-dark-700"></div>
        </div>
      )}

      {/* Menu de contexto */}
      {showContextMenu && (
        <MessageContextMenu
          messageId={message.id}
          authorId={message.userId}
          currentUserId={currentUserId}
          isServerOwner={isServerOwner}
          isServerAdmin={isServerAdmin}
          content={message.content}
          position={contextMenuPosition}
          onClose={() => setShowContextMenu(false)}
          onDelete={onDeleteMessage}
          onEdit={onEditMessage}
          onReply={onReplyMessage}
        />
      )}

      {/* Mensagem */}
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: '40px minmax(0, 1fr)',
          gap: '12px',
          maxWidth: '100%',
          width: '100%',
          position: 'relative'
        }}
        className={`hover:bg-dark-800/50 -mx-2 px-2 rounded transition-colors group ${isGrouped ? 'py-0.5' : 'py-1 mt-4'}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onContextMenu={handleContextMenu}
      >
        {/* Botões de ação no hover com Shift */}
        {isHovered && isShiftPressed && (
          <div className="absolute top-0 right-2 -mt-2 flex gap-1 bg-dark-800 border border-dark-700 rounded shadow-lg p-1 z-10">
            {onReplyMessage && (
              <button
                onClick={() => onReplyMessage(message.id)}
                className="p-1.5 hover:bg-dark-700 rounded text-dark-300 hover:text-white transition-colors"
                title={t('reply')}
              >
                <Reply className="w-4 h-4" />
              </button>
            )}
            {canEdit && onEditMessage && (
              <button
                onClick={() => {
                  const newContent = prompt(t('editMessage') + ':', message.content)
                  if (newContent && newContent.trim()) {
                    onEditMessage(message.id, newContent.trim())
                  }
                }}
                className="p-1.5 hover:bg-dark-700 rounded text-dark-300 hover:text-white transition-colors"
                title={t('edit')}
              >
                <Edit className="w-4 h-4" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => {
                  if (window.confirm(t('deleteConfirm'))) {
                    onDeleteMessage(message.id)
                  }
                }}
                className="p-1.5 hover:bg-red-600 rounded text-dark-300 hover:text-white transition-colors"
                title={t('delete')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Avatar - oculto se agrupado */}
        <Avatar name={message.username} src={message.avatar} className={`bg-primary-600 ${isGrouped ? 'opacity-0' : ''}`} />
        
        <div 
          style={{
            minWidth: 0,
            maxWidth: '100%',
            width: '100%',
            overflow: 'hidden'
          }}
        >
          {/* Header com nome e timestamp - só mostra se não for agrupado */}
          {!isGrouped && (
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-medium">{message.username}</span>
              <span className="text-xs text-dark-400 flex-shrink-0">
                {formatTime(message.timestamp)}
              </span>
              {message.editedAt && (
                <span className="text-xs text-dark-500 flex-shrink-0">({t('edited')})</span>
              )}
            </div>
          )}
          
          {/* Conteúdo da mensagem */}
          <div 
            className="text-dark-200 leading-relaxed"
            style={{
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap',
            }}
          >
            {message.content}
          </div>
        </div>
      </div>
    </>
  )
})

MessageItem.displayName = 'MessageItem'

export default function MessageList({ 
  messages, 
  loading, 
  hasMore, 
  onLoadMore,
  currentUserId,
  isServerOwner = false,
  isServerAdmin = false,
  onDeleteMessage,
  onEditMessage,
  onReplyMessage
}: MessageListProps) {
  const { t } = useTranslation('chat')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const prevMessagesLengthRef = useRef(0)
  const lastScrollHeightRef = useRef(0)
  const lastScrollTopRef = useRef(0)
  const isLoadingMoreRef = useRef(false)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const scrollAdjustmentPendingRef = useRef(false)
  const lastLoadTimeRef = useRef(0)
  const loadDebounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  // Height calculation cache
  const heightCacheRef = useRef<Map<string, number>>(new Map())
  const lastHeightCalculationRef = useRef<number>(0)
  const HEIGHT_CACHE_TTL = 1000 // Cache for 1 second
  
  // RequestAnimationFrame handles for cleanup
  const rafHandlesRef = useRef<Set<number>>(new Set())
  
  // Timers for cleanup
  const timersRef = useRef<Set<NodeJS.Timeout>>(new Set())
  
  // Scroll event debouncing/throttling
  const scrollThrottleTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastScrollEventTimeRef = useRef<number>(0)
  const SCROLL_THROTTLE_MS = 150 // Throttle scroll events to once per 150ms

  // Helper function to get cached height or calculate
  const getCachedHeight = useCallback((element: HTMLElement, cacheKey: string): number => {
    const now = Date.now()
    const cached = heightCacheRef.current.get(cacheKey)
    
    // Return cached value if still valid
    if (cached !== undefined && (now - lastHeightCalculationRef.current) < HEIGHT_CACHE_TTL) {
      return cached
    }
    
    // Calculate and cache new height
    const height = element.scrollHeight
    heightCacheRef.current.set(cacheKey, height)
    lastHeightCalculationRef.current = now
    
    return height
  }, [])
  
  // Helper to schedule RAF with cleanup tracking
  const scheduleRAF = useCallback((callback: FrameRequestCallback): number => {
    const handle = requestAnimationFrame((time) => {
      rafHandlesRef.current.delete(handle)
      callback(time)
    })
    rafHandlesRef.current.add(handle)
    return handle
  }, [])
  
  // Helper to schedule timer with cleanup tracking
  const scheduleTimer = useCallback((callback: () => void, delay: number): NodeJS.Timeout => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer)
      callback()
    }, delay)
    timersRef.current.add(timer)
    return timer
  }, [])

  // Intersection Observer para detectar quando chegar no topo
  useEffect(() => {
    if (!topSentinelRef.current || !hasMore) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        
        // Prevent duplicate loads with comprehensive checks
        if (!entry.isIntersecting) return
        if (loading) {
          console.log('🚫 Load prevented: Already loading')
          return
        }
        if (!hasMore) {
          console.log('🚫 Load prevented: No more messages')
          return
        }
        if (isLoadingMoreRef.current) {
          console.log('🚫 Load prevented: isLoadingMore flag is true')
          return
        }
        
        // Debounce: prevent loads within 500ms of last load
        const now = Date.now()
        const timeSinceLastLoad = now - lastLoadTimeRef.current
        const DEBOUNCE_MS = 500
        
        if (timeSinceLastLoad < DEBOUNCE_MS) {
          console.log(`🚫 Load prevented: Debounced (${timeSinceLastLoad}ms since last load)`)
          return
        }
        
        // Clear any pending debounce timer
        if (loadDebounceTimerRef.current) {
          clearTimeout(loadDebounceTimerRef.current)
          timersRef.current.delete(loadDebounceTimerRef.current)
          loadDebounceTimerRef.current = null
        }
        
        // All checks passed - trigger load with debounce
        const timer = scheduleTimer(() => {
          // Double-check flags haven't changed during debounce
          if (isLoadingMoreRef.current || loading) {
            console.log('🚫 Load prevented: State changed during debounce', {
              isLoadingMoreRef: isLoadingMoreRef.current,
              loading,
              timestamp: Date.now(),
            })
            return
          }
          
          console.log('🔝 Intersection Observer: Triggering load more', {
            timestamp: Date.now(),
            timeSinceLastLoad: Date.now() - lastLoadTimeRef.current,
          })
          isLoadingMoreRef.current = true
          lastLoadTimeRef.current = Date.now()
          
          // Save current scroll state before loading using cached height
          if (scrollRef.current) {
            try {
              lastScrollHeightRef.current = getCachedHeight(scrollRef.current, 'scrollContainer')
              lastScrollTopRef.current = scrollRef.current.scrollTop
              
              const distanceFromBottom = lastScrollHeightRef.current - (lastScrollTopRef.current + scrollRef.current.clientHeight)
              
              console.log('📊 Scroll State Before Load:', {
                scrollHeight: lastScrollHeightRef.current,
                scrollTop: lastScrollTopRef.current,
                clientHeight: scrollRef.current.clientHeight,
                distanceFromBottom,
                messagesCount: messages.length,
                timestamp: Date.now(),
              })
            } catch (error) {
              console.error('❌ Error saving scroll state before load:', error, {
                scrollRefExists: !!scrollRef.current,
                timestamp: Date.now(),
              })
            }
          }
          
          onLoadMore()
          loadDebounceTimerRef.current = null
        }, 100)
        
        loadDebounceTimerRef.current = timer
      },
      {
        root: scrollRef.current,
        rootMargin: '200px 0px 0px 0px',
        threshold: 0.1,
      }
    )

    observerRef.current.observe(topSentinelRef.current)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
      // Clean up debounce timer on unmount
      if (loadDebounceTimerRef.current) {
        clearTimeout(loadDebounceTimerRef.current)
        timersRef.current.delete(loadDebounceTimerRef.current)
        loadDebounceTimerRef.current = null
      }
    }
  }, [loading, hasMore, onLoadMore, getCachedHeight, scheduleTimer])

  // Auto-scroll para o final quando novas mensagens chegam
  useEffect(() => {
    if (!scrollRef.current) return

    const isNewMessage = messages.length > prevMessagesLengthRef.current
    const wasLoading = prevMessagesLengthRef.current === 0
    
    prevMessagesLengthRef.current = messages.length

    if (wasLoading && messages.length > 0) {
      // First load: scroll to bottom
      console.log('📍 Auto-scroll: Initial load', {
        messagesCount: messages.length,
        timestamp: Date.now(),
      })
      scheduleRAF(() => {
        if (scrollRef.current) {
          try {
            const beforeScrollTop = scrollRef.current.scrollTop
            const beforeScrollHeight = scrollRef.current.scrollHeight
            
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
            
            console.log('📊 Scroll State After Initial Load:', {
              beforeScrollTop,
              beforeScrollHeight,
              afterScrollTop: scrollRef.current.scrollTop,
              afterScrollHeight: scrollRef.current.scrollHeight,
              clientHeight: scrollRef.current.clientHeight,
              messagesCount: messages.length,
              timestamp: Date.now(),
            })
          } catch (error) {
            console.error('❌ Error during initial scroll to bottom:', error, {
              scrollRefExists: !!scrollRef.current,
              messagesCount: messages.length,
              timestamp: Date.now(),
            })
          }
        }
      })
    } else if (isNewMessage && isLoadingMoreRef.current) {
      // Loaded old messages: maintain visual position
      console.log('📍 Maintain position: Old messages loaded', {
        newMessagesCount: messages.length,
        previousMessagesCount: prevMessagesLengthRef.current,
        messagesAdded: messages.length - prevMessagesLengthRef.current,
        timestamp: Date.now(),
      })
      scrollAdjustmentPendingRef.current = true
      
      // Use requestAnimationFrame for proper timing
      scheduleRAF(() => {
        if (scrollRef.current && scrollAdjustmentPendingRef.current) {
          try {
            const newScrollHeight = getCachedHeight(scrollRef.current, 'scrollContainer')
            const heightDifference = newScrollHeight - lastScrollHeightRef.current
            
            // Calculate new scroll position to maintain visual position
            const newScrollTop = lastScrollTopRef.current + heightDifference
            
            console.log('📊 Scroll Position Calculation:', {
              previousScrollHeight: lastScrollHeightRef.current,
              newScrollHeight: newScrollHeight,
              heightDifference: heightDifference,
              previousScrollTop: lastScrollTopRef.current,
              calculatedNewScrollTop: newScrollTop,
              messagesCount: messages.length,
              timestamp: Date.now(),
            })
            
            // Apply the scroll adjustment
            const beforeScrollTop = scrollRef.current.scrollTop
            scrollRef.current.scrollTop = newScrollTop
            const actualScrollTop = scrollRef.current.scrollTop
            
            // Update refs for next load
            lastScrollHeightRef.current = newScrollHeight
            lastScrollTopRef.current = actualScrollTop
            
            console.log('📊 Scroll State After Adjustment:', {
              beforeScrollTop,
              requestedScrollTop: newScrollTop,
              actualScrollTop,
              scrollTopDifference: actualScrollTop - beforeScrollTop,
              scrollHeight: scrollRef.current.scrollHeight,
              clientHeight: scrollRef.current.clientHeight,
              distanceFromBottom: scrollRef.current.scrollHeight - (actualScrollTop + scrollRef.current.clientHeight),
              adjustmentSuccessful: Math.abs(actualScrollTop - newScrollTop) < 1,
              timestamp: Date.now(),
            })
            
            scrollAdjustmentPendingRef.current = false
            
            // Reset loading flag after adjustment is complete
            // Use requestAnimationFrame to ensure DOM has settled
            scheduleRAF(() => {
              isLoadingMoreRef.current = false
              console.log('✅ Load more flag reset after scroll adjustment', {
                timestamp: Date.now(),
              })
            })
          } catch (error) {
            console.error('❌ Error during scroll position adjustment:', error, {
              scrollRefExists: !!scrollRef.current,
              lastScrollHeight: lastScrollHeightRef.current,
              lastScrollTop: lastScrollTopRef.current,
              messagesCount: messages.length,
              timestamp: Date.now(),
            })
            
            // Reset flags even on error to prevent stuck state
            scrollAdjustmentPendingRef.current = false
            isLoadingMoreRef.current = false
          }
        }
      })
    } else if (isNewMessage && shouldAutoScroll && !isLoadingMoreRef.current) {
      // New message and we're near the bottom - auto scroll
      console.log('📍 Auto-scroll: New message (at bottom)', {
        messagesCount: messages.length,
        shouldAutoScroll,
        timestamp: Date.now(),
      })
      scheduleRAF(() => {
        if (scrollRef.current) {
          try {
            const beforeScrollTop = scrollRef.current.scrollTop
            const beforeScrollHeight = scrollRef.current.scrollHeight
            
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
            
            console.log('📊 Scroll State After New Message:', {
              beforeScrollTop,
              beforeScrollHeight,
              afterScrollTop: scrollRef.current.scrollTop,
              afterScrollHeight: scrollRef.current.scrollHeight,
              clientHeight: scrollRef.current.clientHeight,
              scrolledDistance: scrollRef.current.scrollTop - beforeScrollTop,
              timestamp: Date.now(),
            })
          } catch (error) {
            console.error('❌ Error during auto-scroll for new message:', error, {
              scrollRefExists: !!scrollRef.current,
              messagesCount: messages.length,
              timestamp: Date.now(),
            })
          }
        }
      })
    } else if (isNewMessage && !shouldAutoScroll && !isLoadingMoreRef.current) {
      // New message but user is viewing history - explicitly prevent scroll adjustment
      const distanceFromBottom = scrollRef.current.scrollHeight - (scrollRef.current.scrollTop + scrollRef.current.clientHeight)
      console.log('📍 No scroll: User viewing history', {
        distanceFromBottom,
        shouldAutoScroll,
        scrollTop: scrollRef.current.scrollTop,
        scrollHeight: scrollRef.current.scrollHeight,
        clientHeight: scrollRef.current.clientHeight,
        messagesCount: messages.length,
        timestamp: Date.now(),
      })
      // Do nothing - preserve current scroll position
    }
  }, [messages, shouldAutoScroll, scheduleRAF, getCachedHeight])
  
  // Reset loading flag when loading prop changes from true to false
  // This ensures flag is reset even if messages don't change
  useEffect(() => {
    if (!loading && isLoadingMoreRef.current) {
      console.log('⏳ Loading completed, scheduling flag reset', {
        loading,
        isLoadingMoreRef: isLoadingMoreRef.current,
        timestamp: Date.now(),
      })
      
      // Give a small delay to ensure scroll adjustment has completed
      const timer = scheduleTimer(() => {
        if (isLoadingMoreRef.current) {
          console.log('✅ Load more flag reset (loading completed)', {
            timestamp: Date.now(),
          })
          isLoadingMoreRef.current = false
        }
      }, 200)
      
      return () => {
        clearTimeout(timer)
        timersRef.current.delete(timer)
      }
    }
  }, [loading, scheduleTimer])

  // Emit scroll state change events
  const emitScrollStateChange = useCallback((state: {
    scrollTop: number
    scrollHeight: number
    clientHeight: number
    distanceFromBottom: number
    isNearBottom: boolean
    isAtBottom: boolean
  }) => {
    // Emit custom event that can be monitored
    const event = new CustomEvent('messageListScrollStateChange', {
      detail: state,
      bubbles: true,
    })
    scrollRef.current?.dispatchEvent(event)
    
    console.log('📡 Scroll state change event emitted:', state)
  }, [])

  // Detect when user is near the bottom with throttling
  const handleScrollImmediate = useCallback(() => {
    if (!scrollRef.current) {
      console.warn('⚠️ handleScrollImmediate called but scrollRef is null', {
        timestamp: Date.now(),
      })
      return
    }

    try {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
      
      // Calculate distance from bottom
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight)
      
      // Auto-scroll threshold: 150px from bottom
      const AUTO_SCROLL_THRESHOLD = 150
      
      // User is considered "at bottom" if within threshold
      const isNearBottom = distanceFromBottom < AUTO_SCROLL_THRESHOLD
      const isAtBottom = distanceFromBottom < 1
      
      // Prepare scroll state
      const scrollState = {
        scrollTop,
        scrollHeight,
        clientHeight,
        distanceFromBottom,
        isNearBottom,
        isAtBottom,
      }
      
      // Only update state if it changed to avoid unnecessary re-renders
      if (isNearBottom !== shouldAutoScroll) {
        console.log('📊 Auto-scroll state changed:', {
          previousShouldAutoScroll: shouldAutoScroll,
          newShouldAutoScroll: isNearBottom,
          distanceFromBottom,
          threshold: AUTO_SCROLL_THRESHOLD,
          scrollTop,
          scrollHeight,
          clientHeight,
          isAtBottom,
          messagesCount: messages.length,
          timestamp: Date.now(),
        })
        setShouldAutoScroll(isNearBottom)
        
        // Emit state change event
        emitScrollStateChange(scrollState)
      }
    } catch (error) {
      console.error('❌ Error in handleScrollImmediate:', error, {
        scrollRefExists: !!scrollRef.current,
        shouldAutoScroll,
        messagesCount: messages.length,
        timestamp: Date.now(),
      })
    }
  }, [shouldAutoScroll, emitScrollStateChange, messages.length])
  
  // Debounced/throttled scroll handler
  const handleScroll = useCallback(() => {
    try {
      const now = Date.now()
      const timeSinceLastScroll = now - lastScrollEventTimeRef.current
      
      // Throttle: if we've processed a scroll event recently, schedule for later
      if (timeSinceLastScroll < SCROLL_THROTTLE_MS) {
        console.log(`⏱️ Scroll event throttled`, {
          timeSinceLastScroll,
          threshold: SCROLL_THROTTLE_MS,
          willExecuteIn: SCROLL_THROTTLE_MS - timeSinceLastScroll,
          timestamp: now,
        })
        
        // Clear any pending throttle timer
        if (scrollThrottleTimerRef.current) {
          clearTimeout(scrollThrottleTimerRef.current)
          timersRef.current.delete(scrollThrottleTimerRef.current)
        }
        
        // Schedule the scroll handler to run after throttle period
        const timer = setTimeout(() => {
          console.log('⏱️ Throttled scroll event executing', {
            timestamp: Date.now(),
          })
          lastScrollEventTimeRef.current = Date.now()
          handleScrollImmediate()
          scrollThrottleTimerRef.current = null
        }, SCROLL_THROTTLE_MS - timeSinceLastScroll)
        
        scrollThrottleTimerRef.current = timer
        timersRef.current.add(timer)
        
        return
      }
      
      // Process immediately if enough time has passed
      console.log(`✅ Scroll event processing immediately`, {
        timeSinceLastScroll,
        threshold: SCROLL_THROTTLE_MS,
        timestamp: now,
      })
      lastScrollEventTimeRef.current = now
      handleScrollImmediate()
    } catch (error) {
      console.error('❌ Error in handleScroll:', error, {
        scrollRefExists: !!scrollRef.current,
        timestamp: Date.now(),
      })
    }
  }, [handleScrollImmediate])
  
  // Cleanup effect: cancel all pending RAF and timers on unmount
  useEffect(() => {
    return () => {
      // Cancel all pending requestAnimationFrame calls
      rafHandlesRef.current.forEach(handle => {
        cancelAnimationFrame(handle)
      })
      rafHandlesRef.current.clear()
      
      // Clear all pending timers
      timersRef.current.forEach(timer => {
        clearTimeout(timer)
      })
      timersRef.current.clear()
      
      // Clear scroll throttle timer
      if (scrollThrottleTimerRef.current) {
        clearTimeout(scrollThrottleTimerRef.current)
        scrollThrottleTimerRef.current = null
      }
      
      // Clear height cache
      heightCacheRef.current.clear()
      
      console.log('🧹 MessageList cleanup: All observers and timers cleared')
    }
  }, [])

  // Renderizar apenas primeiras 100 mensagens se tiver muitas (otimização inicial)
  const visibleMessages = messages.length > 100 ? messages.slice(-100) : messages

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overflow-x-hidden p-4"
      style={{ 
        overflowAnchor: 'none',
        maxWidth: '100%',
        width: '100%',
        contain: 'layout style paint',
        willChange: 'scroll-position',
        contentVisibility: 'auto' as any
      }}
    >
      {/* Sentinel para Intersection Observer (invisível) */}
      <div ref={topSentinelRef} style={{ height: '1px', marginBottom: '-1px' }} />

      {/* Loading indicator no topo */}
      {loading && hasMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </div>
      )}

      {/* Mensagem quando não há mais mensagens antigas */}
      {!hasMore && messages.length > 0 && (
        <div className="flex justify-center py-4">
          <p className="text-sm text-dark-400">📜 {t('conversationStart')}</p>
        </div>
      )}

      {/* Container de mensagens */}
      <div 
        style={{
          maxWidth: '100%',
          width: '100%',
          overflow: 'hidden',
          contain: 'layout style paint'
        }}
      >
        {/* Lista de mensagens otimizada */}
        {visibleMessages.map((msg, index) => {
          const prevMsg = index > 0 ? visibleMessages[index - 1] : undefined
          
          const showDateSeparator =
            index === 0 ||
            new Date(prevMsg!.timestamp).toDateString() !==
              new Date(msg.timestamp).toDateString()

          // Agrupar mensagens do mesmo usuário enviadas em até 5 minutos
          const isGrouped =
            !!prevMsg &&
            !showDateSeparator &&
            prevMsg.userId === msg.userId &&
            msg.timestamp - prevMsg.timestamp < 5 * 60 * 1000 // 5 minutos

          return (
            <MessageItem
              key={msg.id}
              message={msg}
              showDateSeparator={showDateSeparator}
              isGrouped={isGrouped}
              currentUserId={currentUserId}
              isServerOwner={isServerOwner}
              isServerAdmin={isServerAdmin}
              onDeleteMessage={onDeleteMessage}
              onEditMessage={onEditMessage}
              onReplyMessage={onReplyMessage}
            />
          )
        })}
      </div>

      {/* Aviso quando há mensagens ocultas */}
      {messages.length > 100 && (
        <div className="flex justify-center py-2">
          <p className="text-xs text-dark-500">
            {t('showingLastMessages', { count: messages.length })}
          </p>
        </div>
      )}

      {/* Mensagem quando não há mensagens */}
      {messages.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center h-full text-dark-400">
          <p className="text-lg mb-2">{t('noMessagesYet')}</p>
          <p className="text-sm">{t('beFirstToSend')}</p>
        </div>
      )}
    </div>
  )
}
