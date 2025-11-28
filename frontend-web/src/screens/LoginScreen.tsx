import { useState, memo } from 'react' // 1. Importe o memo
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/authStore'
import { LogIn } from 'lucide-react'
import FloatingLines from '@/components/FloatingLinesBackground'
import TextPressure from '@/components/TextPressure'

const WAVES_CONFIG = ['top', 'middle', 'bottom'];

const BackgroundLayer = memo(() => {
  return (
    <div className="absolute inset-0 z-0">
      <FloatingLines
        enabledWaves={WAVES_CONFIG}
        lineCount={5}
        lineDistance={50}
        bendRadius={5.0}
        bendStrength={-0.5}
        interactive={true}
        parallax={true}
      />
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-black/20 to-black pointer-events-none" />
    </div>
  )
});

BackgroundLayer.displayName = 'BackgroundLayer';

export default function LoginScreen() {
  const { t } = useTranslation('auth')
  const [email, setEmail] = useState('')
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
      await login(email, password)
      navigate('/home')
    } catch (err) {
      setError(t('loginError'))
    } finally {
      setLoading(false)
    }
  }

  const inputClass = `
    w-full px-4 py-3.5 
    bg-white/5 border border-white/10 rounded-xl 
    text-white placeholder-white/30 
    focus:outline-none focus:bg-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 
    transition-all duration-300 backdrop-blur-sm
    autofill:bg-transparent autofill:text-white
    [&:not(:placeholder-shown)]:bg-white/10
    [-webkit-autofill]:shadow-[0_0_0_100px_#00000000_inset] 
    [-webkit-text-fill-color:white]
    caret-purple-500
  `;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black flex items-center justify-center font-sans">
      
      <BackgroundLayer />

      <div className="relative z-10 w-full  max-w-md px-2">
        <div className="backdrop-blur-xl bg-black/20 border border-white/10 rounded-3xl shadow-[0_0_40px_-10px_rgba(100,0,255,0.1)] p-8">
          
          <div className="flex flex-col items-center mb-10 h-24 justify-end">
            <div className="relative w-full flex justify-center">
              <div style={{ height: 'auto', width: '100%', position: 'relative' }}>
                <TextPressure
                  text={"NEXUS"}
                  flex={true}
                  alpha={false}
                  stroke={false}
                  width={true}
                  weight={true}
                  italic={true}
                  textColor="#ffffff"
                  strokeColor="#a855f7" 
                  minFontSize={42}
                />
              </div>
            </div>
            <p className="text-white/40 text-sm tracking-widest uppercase mt-4 text-center">
              {t('tagline')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-200 px-4 py-3 rounded-xl text-sm backdrop-blur-md">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="group">
                <label htmlFor="email" className="block text-xs font-medium text-white/50 mb-1.5 ml-1 uppercase tracking-wider group-focus-within:text-purple-400 transition-colors">
                  {t('email')}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder={t('enterYourEmail')}
                  required
                />
              </div>

              <div className="group">
                <label htmlFor="password" className="block text-xs font-medium text-white/50 mb-1.5 ml-1 uppercase tracking-wider group-focus-within:text-purple-400 transition-colors">
                  {t('password')}
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder={t('enterYourPassword')}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 px-4 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white font-semibold rounded-xl transition-all duration-300 shadow-[0_0_20px_-5px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_-5px_rgba(124,58,237,0.5)] transform hover:scale-[1.01] flex items-center justify-center gap-2 mt-4"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span className="opacity-80">{t('loggingIn')}</span>
                </>
              ) : (
                <>
                  <span className="tracking-wide">{t('logIn')}</span>
                  <LogIn className="w-4 h-4 opacity-70" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-white/30 text-sm">
              {t('dontHaveAccount')}{' '}
              <a href="/register" className="text-white hover:text-purple-400 transition-colors font-medium underline underline-offset-4 decoration-white/20 hover:decoration-purple-400">
                {t('signUp')}
              </a>
            </p>
          </div>
        </div>

        <div className="mt-8 text-center text-white/20 text-xs tracking-widest">
          <p>{t('madeWithLove').toUpperCase()}</p>
        </div>
      </div>
    </div>
  )
}