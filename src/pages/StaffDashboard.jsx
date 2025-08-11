// pages/StaffDashboard.jsx
import LogoutButton from '../components/LogoutButton'
import { useAuth } from '../context/AuthContext'
import RequireAuth from '../components/RequireAuth'

export default function StaffDashboard() {
  const { profile, session } = useAuth()
  const displayName =
    profile?.full_name ||
    profile?.name ||
    session?.user?.email?.split('@')[0] ||
    'Usuario'

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold">Panel del Personal</h1>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">Hola, {displayName}</span>
              <LogoutButton />
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-gray-50 shadow">Mis clases</div>
            <div className="p-4 rounded-xl bg-gray-50 shadow">Tomar asistencia</div>
            <div className="p-4 rounded-xl bg-gray-50 shadow">Registrar notas</div>
            <div className="p-4 rounded-xl bg-gray-50 shadow">Reportes</div>
          </div>
        </div>
      </div>
    </RequireAuth>
  )
}
