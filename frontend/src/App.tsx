import DriverDashboard from './DriverDashboard'
import { useCallback, useEffect, useState } from 'react'
import Dashboard from './Dashboard'
import PlatformDashboard from './PlatformDashboard'

import type { Session } from './types'
import { Flame, Truck, Eye, EyeOff } from 'lucide-react'
import './App.css'

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    fetch('/api/auth/me', { signal: controller.signal }).then(async response => {
      if (response.ok) {
        const data = await response.json()
        if (!controller.signal.aborted && data.user) setSession({ user: data.user })
      }
    }).catch(() => {}).finally(() => { if (!controller.signal.aborted) setCheckingSession(false) })
    return () => controller.abort()
  }, [])
  const logout = useCallback((message = '') => {
    void fetch('/api/auth/logout', { method: 'POST' }).then(response => {
      if (!response.ok) throw new Error('logout')
    }).catch(() => setError('Não foi possível encerrar a sessão no servidor. Reconecte e saia novamente antes de compartilhar o aparelho.'))
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setSession(null)
    setPassword('')
    setError(message)
  }, [])

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'E-mail ou senha inválidos.')
      }



      if (!data.user || typeof data.user.id !== 'string' || typeof data.user.name !== 'string' || !['ADMIN', 'DRIVER', 'PLATFORM_ADMIN'].includes(data.user.role)) {
        throw new Error('A API retornou uma sessão inválida.')
      }



      setPassword('')
      setSession({ user: data.user })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor.',
      )
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) return <main className="panel-state" role="status">Verificando sessão…</main>
  if (session?.user.role === 'PLATFORM_ADMIN') {
    if (!session.user.companyId) return <PlatformDashboard onSession={setSession} onLogout={logout} />
    return <><div className="driver-card"><strong>Operação da empresa: {session.user.companyName || 'Empresa selecionada'}</strong><button className="secondary-button" onClick={() => { void fetch('/api/platform/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: null }) }).then(async r => { if (!r.ok) throw new Error('Falha'); setSession(await r.json()) }).catch(() => logout('Entre novamente para selecionar outra empresa.')) }}>Voltar às empresas</button></div><Dashboard key={session.user.companyId} session={session} onLogout={logout} /></>
  }
  if (session?.user.role === 'ADMIN') return <Dashboard session={session} onLogout={logout} />
  if (session) return <DriverDashboard session={session} onLogout={logout} />
  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand">
          <div className="brand-icon"><Flame size={30} /></div>
          <span>Gás<span className="brand-highlight">Express</span></span>
        </div>

        <div className="welcome">
          <h1>Bem-vindo de volta</h1>
          <p>Entre para gerenciar suas entregas.</p>
        </div>

        <form onSubmit={handleLogin}>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="password">Senha</label>
          <div className="password-field">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Digite sua senha"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          {error && <div className="error-message" role="alert">{error}</div>}

          <button className="submit-button" type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="login-footer">
          Sistema de gerenciamento de entregas
        </p>
      </section>

      <aside className="visual-panel">
        <div className="visual-content">
          <div className="visual-badge">
            <Truck size={18} /> Entregas inteligentes
          </div>
          <h2>Sua operação.<br />Em movimento.</h2>
          <p>Organize rotas, acompanhe entregas e mantenha tudo sob controle em um só lugar.</p>
          <div className="visual-decoration">
            <div className="route-line" />
            <div className="route-point point-one" />
            <div className="route-point point-two" />
            <div className="route-point point-three" />
            <div className="route-truck"><Truck size={30} /></div>
          </div>
        </div>
      </aside>
    </main>
  )
}

export default App







