import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn, session, profile } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (session && profile?.role) {
      navigate('/dashboard', { replace: true })
    }
  }, [session, profile, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMsg('')
    try {
      await signIn({ email, password })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      console.error('LOGIN_ERROR', err)
      setMsg(err.message || 'No se pudo iniciar sesión')
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 360, margin: '60px auto', display: 'grid', gap: 12 }}>
      <h2>Ingresar</h2>
      <input placeholder="Correo" value={email} onChange={e=>setEmail(e.target.value)} />
      <input type="password" placeholder="Contraseña" value={password} onChange={e=>setPassword(e.target.value)} />
      <button>Entrar</button>
      {msg && <p style={{ color:'crimson' }}>{msg}</p>}
    </form>
  )
}
