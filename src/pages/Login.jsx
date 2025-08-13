import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Login.css'

export default function Login() {
  const { signIn, session, profile } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (session && profile?.role) {
      navigate('/dashboard', { replace: true })
    }
  }, [session, profile, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMsg('')
    setLoading(true)
    try {
      await signIn({ email, password })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      console.error('LOGIN_ERROR', err)
      setMsg(err?.message || 'No se pudo iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {/* Burbujas decorativas */}
      <div className="bubble b1" />
      <div className="bubble b2" />
      <div className="bubble b3" />

      <div className="login-card">
        <div className="brand">
          {/* Reemplaza “GE” por tu logo si quieres */}
          <div className="logo">GE</div>
          <h1>Bienvenida</h1>
          <p className="subtitle">Inicia sesión para continuar</p>
        </div>

        {msg && <div className="alert" role="alert">{msg}</div>}

        <form onSubmit={handleSubmit} className="form" noValidate>
          <div className="form-group">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              placeholder="tucorreo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <div className="password-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="toggle"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? 'Ocultar' : 'Ver'}
              </button>
            </div>
          </div>

          <button className="submit" type="submit" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>

          
        </form>
      </div>
    </div>
  )
}
