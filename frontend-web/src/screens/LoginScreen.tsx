import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { LogIn } from 'lucide-react'

export default function LoginScreen() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  const login = useAuthStore((state) => state.login)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(username, password)
      navigate('/chat')
    } catch (err) {
      setError('Failed to login. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-dark-800 rounded-2xl shadow-2xl p-8 border border-dark-700">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center mb-4">
              <LogIn className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Welcome to Nexus</h1>
            <p className="text-dark-400 text-center">
              Connect, collaborate, and communicate
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-dark-300 mb-2">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent transition"
                placeholder="Enter your username"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-dark-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent transition"
                placeholder="Enter your password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Logging in...
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  Log In
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-dark-400 text-sm">
              Don't have an account?{' '}
              <a href="/register" className="text-primary-500 hover:text-primary-400 font-medium">
                Sign up
              </a>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center text-dark-500 text-sm">
          <p>Made with ❤️ by EclipsIA Team</p>
        </div>
      </div>
    </div>
  )
}
