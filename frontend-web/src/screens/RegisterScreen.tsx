import { useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/authStore'
import { UserPlus, Mail, User, Lock, Eye, EyeOff, Check } from 'lucide-react'
import FloatingLines from '@/components/FloatingLinesBackground'
import TextPressure from '@/components/TextPressure'

// --- CONFIGURAÇÃO VISUAL ---
const WAVES_CONFIG: ("top" | "middle" | "bottom")[] = ['top', 'middle', 'bottom'];

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

export default function RegisterScreen() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const register = useAuthStore((state) => state.register)

  // State
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Estilos reutilizáveis
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

  const labelClass = "block text-xs font-medium text-white/50 mb-1.5 ml-1 uppercase tracking-wider group-focus-within:text-purple-400 transition-colors";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validação básica antes de enviar
    if (password !== confirmPassword) {
      setError(t('passwordsDoNotMatch'))
      return
    }
    if (password.length < 6) {
      setError(t('passwordMinLength'))
      return
    }

    setLoading(true)
    try {
      await register(email, username, password)
      navigate('/home')
    } catch (err: any) {
      setError(err.response?.data?.error || t('registerError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black flex items-center justify-center font-sans">

      <BackgroundLayer />

      <div className="relative z-10 w-full max-w-md px-2">
        <div className="backdrop-blur-xl bg-black/20 border border-white/10 rounded-3xl shadow-[0_0_40px_-10px_rgba(100,0,255,0.1)] p-8">

          {/* Header */}
          <div className="flex flex-col items-center mb-10 h-24 justify-end">
            <div className="relative w-full flex justify-center">
              <div style={{ height: 'auto', width: '100%', position: 'relative' }}>
                <TextPressure
                  text={"JOIN NEXUS"}
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
              {t('start Your Journey')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6"> {/* Espaçamento aumentado para 6 */}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-200 px-4 py-3 rounded-xl text-sm backdrop-blur-md flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                {error}
              </div>
            )}

            <div className="group">
              <label htmlFor="username" className={labelClass}>
                {t('username')}
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-purple-400 transition-colors" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`${inputClass} pl-12`}
                  placeholder="Neo_Anderson"
                  required
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="group">
              <label htmlFor="email" className={labelClass}>
                {t('email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-purple-400 transition-colors" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${inputClass} pl-12`}
                  placeholder="neo@matrix.com"
                  required
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="group">
              <label htmlFor="password" className={labelClass}>
                {t('password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-purple-400 transition-colors" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pl-12 pr-12`}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password Strength Checklist */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium transition-colors ${password.length >= 8 ? 'text-green-400' : 'text-white/30'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${password.length >= 8 ? 'bg-green-400' : 'bg-white/20'}`} />
                  8+ Characters
                </div>
                <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium transition-colors ${/[A-Z]/.test(password) ? 'text-green-400' : 'text-white/30'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${/[A-Z]/.test(password) ? 'bg-green-400' : 'bg-white/20'}`} />
                  Uppercase
                </div>
                <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium transition-colors ${/[a-z]/.test(password) ? 'text-green-400' : 'text-white/30'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${/[a-z]/.test(password) ? 'bg-green-400' : 'bg-white/20'}`} />
                  Lowercase
                </div>
                <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium transition-colors ${/[0-9]/.test(password) ? 'text-green-400' : 'text-white/30'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${/[0-9]/.test(password) ? 'bg-green-400' : 'bg-white/20'}`} />
                  Number
                </div>
                <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium transition-colors ${/[!@#$%^&*(),.?":{}|<>]/.test(password) ? 'text-green-400' : 'text-white/30'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${/[!@#$%^&*(),.?":{}|<>]/.test(password) ? 'bg-green-400' : 'bg-white/20'}`} />
                  Special Char
                </div>
              </div>
            </div>

            <div className="group">
              <label htmlFor="confirmPassword" className={labelClass}>
                {t('confirmPassword')}
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-purple-400 transition-colors" />
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`${inputClass} pl-12`}
                  placeholder="••••••••"
                  required
                />
                {password && confirmPassword && password === confirmPassword && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-green-400">
                    <Check className="w-4 h-4" />
                  </div>
                )}
              </div>
              <p className="mt-1.5 text-[10px] text-red-400/80 pl-1 uppercase tracking-wider h-4">
                {confirmPassword && password !== confirmPassword ? t('passwordsDoNotMatch') : ''}
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 px-4 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white font-semibold rounded-xl transition-all duration-300 shadow-[0_0_20px_-5px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_-5px_rgba(124,58,237,0.5)] transform hover:scale-[1.01] flex items-center justify-center gap-2 mt-8"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span className="opacity-80">{t('creatingAccount')}</span>
                </>
              ) : (
                <>
                  <span className="tracking-wide">{t('createAccount')}</span>
                  <UserPlus className="w-4 h-4 opacity-70" />
                </>
              )}
            </button>
          </form>

          {/* Footer Link */}
          <div className="mt-8 text-center">
            <p className="text-white/30 text-sm">
              {t('alreadyHaveAccount')}{' '}
              <a href="/login" className="text-white hover:text-purple-400 transition-colors font-medium underline underline-offset-4 decoration-white/20 hover:decoration-purple-400">
                {t('signIn')}
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