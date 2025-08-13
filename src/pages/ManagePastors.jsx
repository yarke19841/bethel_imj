import RequireAuth from '../components/RequireAuth'
import LogoutButton from '../components/LogoutButton'
import { useAuth } from '../context/AuthContext'
import UsersTable from '../components/UsersTable'
import UserForm from '../components/UserForm'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import './ManagePastors.css'

export default function ManagePastors() {
  const { profile, session } = useAuth()
  const displayName = profile?.full_name || session?.user?.email?.split('@')[0] || 'Admin'
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <RequireAuth>
      <div className="mp-page">
        <div className="mp-container">
          <header className="mp-header">
            <div>
              <h1 className="mp-title">Gestionar Pastores</h1>
              <p className="mp-subtitle">Hola, <strong>{displayName}</strong></p>
            </div>
            <div className="mp-actions">
              <Link to="/dashboard" className="btn btn-secondary">Dashboard</Link>
              <LogoutButton />
            </div>
          </header>

          <section className="mp-grid">
            <div className="card">
              <h2 className="card-title">Crear Pastor</h2>
              <UserForm
                defaultRole="pastor"
                onCreated={() => setRefreshKey(x => x + 1)}
              />
            </div>

            <div className="card">
              <div className="card-title-row">
                <h2 className="card-title">Pastores</h2>
              </div>
              <UsersTable role="pastor" refreshKey={refreshKey} />
            </div>
          </section>
        </div>

        {/* Fondo decorativo */}
        <div className="mp-bubble b1" />
        <div className="mp-bubble b2" />
        <div className="mp-bubble b3" />
      </div>
    </RequireAuth>
  )
}
