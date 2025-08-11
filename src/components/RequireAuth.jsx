// components/RequireAuth.jsx
import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

export default function RequireAuth({ children }) {
  const { loading, session } = useAuth()

  useEffect(() => {
    if (!loading && !session) window.location.href = '/login'
  }, [loading, session])

  if (loading) return <div className="p-6">Cargando...</div>
  if (!session) return null
  return children
}
