import { useState } from 'react'
import SFUTest from '../components/SFUTest'

export default function SFUDemoPage() {
  const [roomId, setRoomId] = useState('test-room-1')
  const [userId, setUserId] = useState(`user-${Math.random().toString(36).substr(2, 9)}`)
  const [isReady, setIsReady] = useState(false)

  const handleStart = () => {
    if (roomId && userId) {
      setIsReady(true)
    }
  }

  const handleReset = () => {
    setIsReady(false)
    setUserId(`user-${Math.random().toString(36).substr(2, 9)}`)
  }

  if (isReady) {
    return (
      <div>
        <div className="bg-gray-800 text-white p-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">Nexus SFU Demo</h1>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Reset Demo
          </button>
        </div>
        <SFUTest roomId={roomId} userId={userId} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h1 className="text-2xl font-bold text-center mb-6">Nexus SFU Demo</h1>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Room ID
            </label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter room ID"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              User ID
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter user ID"
            />
          </div>
          
          <button
            onClick={handleStart}
            disabled={!roomId || !userId}
            className="w-full py-2 px-4 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Start SFU Test
          </button>
        </div>
        
        <div className="mt-6 p-4 bg-blue-50 rounded-md">
          <h3 className="font-semibold text-blue-800 mb-2">About this Demo</h3>
          <p className="text-sm text-blue-700">
            This demonstrates our new SFU (Selective Forwarding Unit) implementation that provides scalable video conferencing. 
            The SFU server handles video/audio forwarding between multiple participants efficiently.
          </p>
          
          <div className="mt-3 text-xs text-blue-600">
            <p><strong>SFU Server:</strong> localhost:8083</p>
            <p><strong>Technology:</strong> Pion WebRTC + Go</p>
            <p><strong>Features:</strong> Room-based, Real-time forwarding, Auto-reconnection</p>
          </div>
        </div>
      </div>
    </div>
  )
}
