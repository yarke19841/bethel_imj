// pages/ManagePastors.jsx
import RequireAuth from '../components/RequireAuth'
import LogoutButton from '../components/LogoutButton'
import { useAuth } from '../context/AuthContext'
import UsersTable from '../components/UsersTable'
import UserForm from '../components/UserForm'
import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function ManagePastors() {
  const { profile, session } = useAuth()
  const displayName = profile?.full_name || session?.user?.email?.split('@')[0] || 'Admin'
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold">Gestionar Pastores</h1>
              <p className="text-sm text-gray-600">Hola, {displayName}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/dashboard" className="px-3 py-2 rounded bg-gray-200">Dashboard</Link>
              <LogoutButton />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-4 rounded-xl bg-gray-50 shadow">
              <h2 className="font-semibold mb-3">Crear Pastor</h2>
              <UserForm
                defaultRole="pastor"
                onCreated={() => setRefreshKey(x => x + 1)}
              />
            </div>

            <div className="p-4 rounded-xl bg-gray-50 shadow">
              <h2 className="font-semibold mb-3">Pastores</h2>
              <UsersTable role="pastor" refreshKey={refreshKey} />
            </div>
          </div>
        </div>
      </div>
    </RequireAuth>
  )
}
