// src/pages/AdminDashboard.jsx
import RequireAuth from '../components/RequireAuth'
import LogoutButton from '../components/LogoutButton'
import { useAuth } from '../context/AuthContext'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  PieChart, Pie, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'

const TERRITORIES_TABLE = 'territories'

export default function AdminDashboard() {
  const { profile, session } = useAuth()
  const displayName = profile?.full_name || session?.user?.email?.split('@')[0] || 'Admin'

  const [counts, setCounts] = useState({ leaders: 0, pastors: 0, groups: 0, territories: 0 })
  const [byTerritory, setByTerritory] = useState([]) // [{ territory, leaders, pastors, total }]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError('')
      try {
        // ✅ Conteos vía RPC (no toques profiles directo)
        const [leadersCnt, pastorsCnt, territoriesHead] = await Promise.all([
          supabase.rpc('admin_count_profiles_by_role', { role_in: 'leader' }),
          supabase.rpc('admin_count_profiles_by_role', { role_in: 'pastor' }),
          supabase.from(TERRITORIES_TABLE).select('*', { count: 'exact', head: true }),
        ])

        if (leadersCnt.error) throw leadersCnt.error
        if (pastorsCnt.error) throw pastorsCnt.error
        if (territoriesHead.error) throw territoriesHead.error

        const leaders = leadersCnt.data ?? 0
        const pastors = pastorsCnt.data ?? 0
        const territories = territoriesHead.count ?? 0
        setCounts({ leaders, pastors, territories, groups: 0 }) // TODO: reemplaza groups cuando tengas la tabla

        // ✅ Distribución por territorio (RPC)
        const dist = await supabase.rpc('admin_territory_distribution')
        if (dist.error) throw dist.error

        const merged = (dist.data || [])
          .filter(r => r.is_active !== false)
          .map(x => ({ ...x, total: (x.leaders || 0) + (x.pastors || 0) }))

        setByTerritory(merged)
      } catch (e) {
        console.error(e)
        setError(e.message || 'No se pudo cargar el dashboard')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const pieData = useMemo(() => ([
    { name: 'Líderes', value: counts.leaders },
    { name: 'Pastores', value: counts.pastors },
  ]), [counts])

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold">Dashboard</h1>
              <p className="text-sm text-gray-600">Bienvenido/a: {displayName}</p>
            </div>
            <LogoutButton />
          </div>

          {error && <div className="mb-4 text-red-600 text-sm">{error}</div>}

          {loading ? (
            <div>Cargando...</div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid md:grid-cols-4 gap-4">
                <CardStat title="Líderes" value={counts.leaders} to="/manageleaders" />
                <CardStat title="Pastores" value={counts.pastors} to="/managepastors" />
                <CardStat title="Territorios" value={counts.territories} to="/manageterritories" />
                <CardStat title="Grupos" value={counts.groups} to="/groups" />
              </div>

              {/* Gráficas */}
              <div className="mt-8 grid lg:grid-cols-2 gap-6">
                <div className="p-4 rounded-xl bg-gray-50 shadow">
                  <h3 className="font-semibold mb-3">Distribución por Rol</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" label />
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-gray-50 shadow">
                  <h3 className="font-semibold mb-3">Personas por Territorio</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byTerritory}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="territory" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="leaders" name="Líderes" />
                        <Bar dataKey="pastors" name="Pastores" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Accesos rápidos */}
              <div className="mt-8 grid md:grid-cols-3 gap-4">
                <QuickLink title="Gestionar Líderes" to="/manageleaders" />
                <QuickLink title="Gestionar Pastores" to="/managepastors" />
                <QuickLink title="Gestionar Territorios" to="/manageterritories" />
              </div>
            </>
          )}
        </div>
      </div>
    </RequireAuth>
  )
}

function CardStat({ title, value, to }) {
  return (
    <Link to={to} className="block p-5 rounded-xl bg-gray-50 shadow hover:shadow-md transition">
      <div className="text-gray-500 text-sm">{title}</div>
      <div className="text-3xl font-semibold">{value}</div>
    </Link>
  )
}

function QuickLink({ title, to }) {
  return (
    <Link to={to} className="block p-4 rounded-xl bg-gray-50 shadow hover:shadow-md transition">
      {title}
    </Link>
  )
}
