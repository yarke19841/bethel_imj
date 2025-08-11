// src/components/RouteGuards.jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div style={{ padding: 20 }}>Cargando…</div>
  if (!session) return <Navigate to="/login" replace />
  return children
}

export function AdminOnly({ children }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <div style={{ padding: 20 }}>Cargando…</div>
  if (!session) return <Navigate to="/login" replace />
  if (profile?.role !== 'admin') return <Navigate to="/login" replace /> // 👈 cambia a login
  return children
}

export function RoleSwitch() {
  const { session, profile, loading } = useAuth()
  if (loading) return <div style={{ padding: 20 }}>Cargando…</div>
  if (!session) return <Navigate to="/login" replace />

  const role = profile?.role
  if (role === 'leader') return <Navigate to="/leader" replace />
  if (role === 'pastor') return <Navigate to="/staff" replace />
  if (role === 'admin')  return <Navigate to="/admin" replace />

  // 👇 si no hay rol, vuelve al login
  return <Navigate to="/login" replace />
}
