import RequireAuth from '../components/RequireAuth'
import LogoutButton from '../components/LogoutButton'
import { useAuth } from '../context/AuthContext'
import UsersTable from '../components/UsersTable'
import UserForm from '../components/UserForm'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import './ManageLeaders.css'

export default function ManageLeaders() {
  const { profile, session } = useAuth()
  const displayName = profile?.full_name || session?.user?.email?.split('@')[0] || 'Admin'
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <RequireAuth>
      <div className="ml-page">
        <div className="ml-container">
          <header className="ml-header">
            <div className="ml-head-left">
              <h1 className="ml-title">Gestionar Líderes</h1>
              <p className="ml-subtitle">Hola, <strong>{displayName}</strong></p>
            </div>
            <div className="ml-actions">
              <Link to="/dashboard" className="btn btn-secondary">Dashboard</Link>
              <LogoutButton />
            </div>
          </header>

          <section className="ml-grid">
            <div className="card">
              <h2 className="card-title">Crear Líder</h2>
              <UserForm
                defaultRole="leader"
                onCreated={() => setRefreshKey(x => x + 1)}
              />
            </div>

            <div className="card">
              <div className="card-title-row">
                <h2 className="card-title">Líderes</h2>
                {/* Si quieres agregar un buscador/filtrado rápido, lo ponemos aquí */}
              </div>
              <UsersTable role="leader" refreshKey={refreshKey} />
            </div>
          </section>
        </div>

        {/* Fondo decorativo */}
        <div className="ml-bubble b1" />
        <div className="ml-bubble b2" />
        <div className="ml-bubble b3" />
      </div>
    </RequireAuth>
  )
}
