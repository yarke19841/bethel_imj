import RequireAuth from '../components/RequireAuth'
import LogoutButton from '../components/LogoutButton'
import { useAuth } from '../context/AuthContext'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  PieChart, Pie, Tooltip, Legend, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'
import './AdminDashboard.css'

const TERRITORIES_TABLE = 'territories'
const PIE_COLORS = ['#6366f1', '#06b6d4'] // indigo & cyan

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
      <div className="dash-page">
        <div className="dash-container">
          <header className="dash-header">
            <div className="head-left">
              <h1 className="dash-title">Dashboard</h1>
              <p className="dash-subtitle">Bienvenido/a: <strong>{displayName}</strong></p>
            </div>
            <LogoutButton />
          </header>

          {error && <div className="dash-alert" role="alert">{error}</div>}

          {loading ? (
            <div className="dash-loading">Cargando…</div>
          ) : (
            <>
              {/* KPIs */}
              <section className="kpi-grid">
                <CardStat title="Líderes" value={counts.leaders} to="/manageleaders" />
                <CardStat title="Pastores" value={counts.pastors} to="/managepastors" />
                <CardStat title="Territorios" value={counts.territories} to="/manageterritories" />
                <CardStat title="Grupos" value={counts.groups} to="/groups" />
              </section>

              {/* Gráficas */}
              <section className="chart-grid">
                <div className="card chart-card">
                  <h3 className="card-title">Distribución por Rol</h3>
                  <div className="chart-box">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" label outerRadius="80%">
                          {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card chart-card">
                  <h3 className="card-title">Personas por Territorio</h3>
                  <div className="chart-box">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byTerritory}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="territory" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="leaders" name="Líderes" fill="#6366f1" radius={[6,6,0,0]} />
                        <Bar dataKey="pastors" name="Pastores" fill="#06b6d4" radius={[6,6,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>

              {/* Accesos rápidos */}
              <section className="quick-grid">
                <QuickLink title="Gestionar Líderes" to="/manageleaders" />
                <QuickLink title="Gestionar Pastores" to="/managepastors" />
                <QuickLink title="Gestionar Territorios" to="/manageterritories" />
              </section>
            </>
          )}
        </div>
        {/* Fondo decorativo */}
        <div className="dash-bubble b1" />
        <div className="dash-bubble b2" />
        <div className="dash-bubble b3" />
      </div>
    </RequireAuth>
  )
}

function CardStat({ title, value, to }) {
  return (
    <Link to={to} className="kpi-card">
      <div className="kpi-title">{title}</div>
      <div className="kpi-value">{value}</div>
    </Link>
  )
}

function QuickLink({ title, to }) {
  return (
    <Link to={to} className="quick-card">
      <span>{title}</span>
      <svg className="quick-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M7 17L17 7M17 7H9M17 7V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </Link>
  )
}
