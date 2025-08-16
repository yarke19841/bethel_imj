// src/pages/AdminDashboard.jsx
import RequireAuth from '../components/RequireAuth'
import LogoutButton from '../components/LogoutButton'
import { useAuth } from '../context/AuthContext'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  PieChart, Pie, Tooltip, Legend, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line
} from 'recharts'
import './AdminDashboard.css'

const TERRITORIES_TABLE = 'territories'
const PIE_COLORS = ['#6366f1', '#06b6d4'] // indigo & cyan
const STAFF_COLORS = ['#10b981', '#f59e0b', '#ef4444'] // green, amber, red

function getLocalYYYYMMDD(d = new Date()) {
  return d.toLocaleDateString('en-CA')
}
function fmtMonth(ym) {
  const [y,m] = ym.split('-').map(Number)
  const d = new Date(y, m-1, 1)
  return d.toLocaleDateString('es-PA', { year:'numeric', month:'short' })
}
function firstDayOfCurrentMonth() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}
function addDaysStr(yyyy_mm_dd, days){
  const [y,m,dd] = yyyy_mm_dd.split('-').map(Number)
  const d = new Date(y, m-1, dd); d.setDate(d.getDate()+days)
  return d.toLocaleDateString('en-CA')
}
function monthsBetween(start, end) {
  // start/end: YYYY-MM-DD
  const [ys,ms] = start.split('-').map(Number)
  const [ye,me] = end.split('-').map(Number)
  const startD = new Date(ys, ms-1, 1)
  const endD = new Date(ye, me-1, 1)
  const out = []
  const cur = new Date(startD)
  while (cur <= endD) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`)
    cur.setMonth(cur.getMonth()+1)
  }
  return out
}

export default function AdminDashboard() {
  const { profile, session } = useAuth()
  const displayName = profile?.full_name || session?.user?.email?.split('@')[0] || 'Admin'

  const [counts, setCounts] = useState({ leaders: 0, pastors: 0, groups: 0, territories: 0 })
  const [byTerritory, setByTerritory] = useState([]) // [{ territory, leaders, pastors, total }]

  // ---- Bethels / Staff (KPIs extra) ----
  const [bethelKpis, setBethelKpis] = useState({ bethels: 0, active: 0, upcoming: 0, staff: 0 })
  const [bethelsByYear, setBethelsByYear] = useState([]) // [{ year, count }]
  const [staffByRole, setStaffByRole] = useState([]) // [{ name, value }]

  // ---- Tableros con filtros ----
  const [territories, setTerritories] = useState([]) // [{id, name}]
  const [groups, setGroups] = useState([]) // [{id, name, territory_id}]
  const [bethels, setBethels] = useState([]) // [{id, name, year}]

  // filtros
  const [territoryId, setTerritoryId] = useState('all')
  const [period, setPeriod] = useState('month') // 'month' | 'quarter' | 'custom'
  const [startDate, setStartDate] = useState(firstDayOfCurrentMonth())
  const [endDate, setEndDate] = useState(getLocalYYYYMMDD())
  const [bethelFilter, setBethelFilter] = useState('all')

  // datos crudos para gráficos
  const [meetings, setMeetings] = useState([]) // [{id, date, group_id}]
  const [attendance, setAttendance] = useState([]) // [{meeting_id, is_new}]
  const [planRows, setPlanRows] = useState([]) // bethel_plan
  const [attRows, setAttRows] = useState([]) // bethel_attendance

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ===== Carga inicial (KPIs base + territorios + grupos + bethels + staff KPIs) =====
  useEffect(() => {
    const load = async () => {
      setLoading(true); setError('')
      try {
        // ===== Base KPIs =====
        const [leadersCnt, pastorsCnt, territoriesHead, groupsHead] = await Promise.all([
          supabase.rpc('admin_count_profiles_by_role', { role_in: 'leader' }),
          supabase.rpc('admin_count_profiles_by_role', { role_in: 'pastor' }),
          supabase.from(TERRITORIES_TABLE).select('*', { count: 'exact', head: true }),
          supabase.from('groups').select('*', { count: 'exact', head: true }),
        ])
        if (leadersCnt.error) throw leadersCnt.error
        if (pastorsCnt.error) throw pastorsCnt.error
        if (territoriesHead.error) throw territoriesHead.error
        if (groupsHead.error) throw groupsHead.error
        setCounts({
          leaders: leadersCnt.data ?? 0,
          pastors: pastorsCnt.data ?? 0,
          territories: territoriesHead.count ?? 0,
          groups: groupsHead.count ?? 0
        })

        // Distribución por territorio
        const dist = await supabase.rpc('admin_territory_distribution')
        if (dist.error) throw dist.error
        const merged = (dist.data || [])
          .filter(r => r.is_active !== false)
          .map(x => ({ ...x, total: (x.leaders || 0) + (x.pastors || 0) }))
        setByTerritory(merged)

        // Territorios y Grupos
        const [{ data: terrs }, { data: grs }] = await Promise.all([
          supabase.from('territories').select('id, name').order('name', { ascending: true }),
          supabase.from('groups').select('id, name, territory_id').order('name', { ascending: true })
        ])
        setTerritories(terrs || [])
        setGroups(grs || [])

        // Bethels (para filtro y KPIs extra)
        const { data: bethelsArr } = await supabase
          .from('bethels')
          .select('id, name, year, is_active, starts_on')
          .order('year', { ascending: false }).order('name', { ascending: true })
        setBethels(bethelsArr || [])

        // KPIs Bethel
        const today = getLocalYYYYMMDD()
        const totalBethels = (bethelsArr || []).length
        const activeBethels = (bethelsArr || []).filter(b => b.is_active).length
        const upcomingBethels = (bethelsArr || []).filter(b => b.starts_on && b.starts_on >= today).length

        const { data: staffArr, error: sErr } = await supabase.from('bethel_staff').select('role_type')
        if (sErr) throw sErr
        setBethelKpis({ bethels: totalBethels, active: activeBethels, upcoming: upcomingBethels, staff: (staffArr || []).length })

        const yearMap = new Map()
        for (const b of (bethelsArr || [])) {
          const y = b.year || '—'
          yearMap.set(y, (yearMap.get(y) || 0) + 1)
        }
        setBethelsByYear(Array.from(yearMap.entries()).map(([year, count]) => ({ year, count })).sort((a,b)=>b.year-a.year))

        const roles = { coordinator:0, spiritual_guide:0, guide:0 }
        for (const s of (staffArr || [])) if (roles[s.role_type] != null) roles[s.role_type]++
        setStaffByRole([
          { name: 'Coordinación', value: roles.coordinator },
          { name: 'Guía espiritual', value: roles.spiritual_guide },
          { name: 'Guías', value: roles.guide },
        ])
      } catch (e) {
        console.error(e)
        setError(e.message || 'No se pudo cargar el dashboard')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ===== Normaliza fechas según preset =====
  useEffect(() => {
    if (period === 'month') {
      setStartDate(firstDayOfCurrentMonth())
      setEndDate(getLocalYYYYMMDD())
    } else if (period === 'quarter') {
      const end = getLocalYYYYMMDD()
      const start = addDaysStr(end, -90)
      setStartDate(start); setEndDate(end)
    }
    // 'custom' respeta lo que haya
  }, [period])

  // ===== Fetch de datos crudos según filtros (meetings, attendance, bethel plan/attendance) =====
  useEffect(() => {
    const loadSeriesData = async () => {
      if (!groups.length) return
      try {
        // grupos candidatos por territorio
        const groupIds = groups
          .filter(g => territoryId === 'all' ? true : g.territory_id === territoryId)
          .map(g => g.id)

        // MEETINGS en rango y para esos grupos
        let meetingsRows = []
        if (groupIds.length) {
          const { data: mtx } = await supabase
            .from('meetings')
            .select('id, group_id, date')
            .in('group_id', groupIds)
            .gte('date', startDate)
            .lte('date', endDate)
          meetingsRows = mtx || []
        }
        setMeetings(meetingsRows)

        // ATTENDANCE de esos meetings
        let attRows = []
        if (meetingsRows.length) {
          const meetingIds = meetingsRows.map(m => m.id)
          const { data: atx } = await supabase
            .from('attendance')
            .select('id, meeting_id, is_new')
            .in('meeting_id', meetingIds)
          attRows = atx || []
        }
        setAttendance(attRows)

        // BETHEL PLAN / ATTENDANCE (si existen)
        // Nota: filtramos por grupo_id si existe la columna.
        let plan = [], batt = []
        try {
          const { data: p } = await supabase
            .from('bethel_plan')
            .select('id, bethel_id, group_id, created_at')
            .gte('created_at', `${startDate}T00:00:00`)
            .lte('created_at', `${endDate}T23:59:59`)
          plan = (p || []).filter(r => territoryId === 'all' ? true : (r.group_id && groups.find(g => g.id === r.group_id)?.territory_id === territoryId))
        } catch(_) { plan = [] }
        try {
          const { data: a } = await supabase
            .from('bethel_attendance')
            .select('id, bethel_id, group_id, created_at')
            .gte('created_at', `${startDate}T00:00:00`)
            .lte('created_at', `${endDate}T23:59:59`)
          batt = (a || []).filter(r => territoryId === 'all' ? true : (r.group_id && groups.find(g => g.id === r.group_id)?.territory_id === territoryId))
        } catch(_) { batt = [] }
        setPlanRows(plan)
        setAttRows(batt)
      } catch (e) {
        console.error(e)
      }
    }
    loadSeriesData()
  }, [groups, territoryId, startDate, endDate])

  // ====== Series agregadas por MES (YYYY-MM) ======
  const monthKeys = useMemo(() => monthsBetween(startDate, endDate), [startDate, endDate])

  const seriesGrowth = useMemo(() => {
    // 1) Grupos con reuniones por mes
    const groupsByMonth = new Map(monthKeys.map(k => [k, new Set()]))
    for (const m of meetings) {
      const ym = (m.date || '').slice(0,7)
      if (groupsByMonth.has(ym)) groupsByMonth.get(ym).add(m.group_id)
    }
    // 2) Asistencia por mes
    const meetingMonth = new Map(meetings.map(m => [m.id, (m.date || '').slice(0,7)]))
    const attByMonth = new Map(monthKeys.map(k => [k, 0]))
    for (const a of attendance) {
      const ym = meetingMonth.get(a.meeting_id)
      if (attByMonth.has(ym)) attByMonth.set(ym, attByMonth.get(ym)+1)
    }
    // salida
    return monthKeys.map(k => ({
      month: fmtMonth(k),
      groups: groupsByMonth.get(k)?.size || 0,
      attendance: attByMonth.get(k) || 0
    }))
  }, [monthKeys, meetings, attendance])

  const seriesNew = useMemo(() => {
    // Grupos con reuniones por mes (mismo que arriba)
    const groupsByMonth = new Map(monthKeys.map(k => [k, new Set()]))
    for (const m of meetings) {
      const ym = (m.date || '').slice(0,7)
      if (groupsByMonth.has(ym)) groupsByMonth.get(ym).add(m.group_id)
    }
    // Nuevos (attendance.is_new)
    const meetingMonth = new Map(meetings.map(m => [m.id, (m.date || '').slice(0,7)]))
    const newByMonth = new Map(monthKeys.map(k => [k, 0]))
    for (const a of attendance) {
      if (!a.is_new) continue
      const ym = meetingMonth.get(a.meeting_id)
      if (newByMonth.has(ym)) newByMonth.set(ym, newByMonth.get(ym)+1)
    }
    return monthKeys.map(k => ({
      month: fmtMonth(k),
      groups: groupsByMonth.get(k)?.size || 0,
      new_att: newByMonth.get(k) || 0
    }))
  }, [monthKeys, meetings, attendance])

  const seriesBethel = useMemo(() => {
    // Grupos con reuniones por mes (referencia)
    const groupsByMonth = new Map(monthKeys.map(k => [k, new Set()]))
    for (const m of meetings) {
      const ym = (m.date || '').slice(0,7)
      if (groupsByMonth.has(ym)) groupsByMonth.get(ym).add(m.group_id)
    }
    const filterBethel = (row) => bethelFilter === 'all' ? true : row.bethel_id === bethelFilter
    // Tentativos y Asistentes Bethel por mes (created_at)
    const monthOf = (ts) => (ts || '').slice(0,7)
    const tentByMonth = new Map(monthKeys.map(k => [k, 0]))
    for (const r of planRows.filter(filterBethel)) {
      const ym = monthOf(r.created_at)
      if (tentByMonth.has(ym)) tentByMonth.set(ym, tentByMonth.get(ym)+1)
    }
    const goByMonth = new Map(monthKeys.map(k => [k, 0]))
    for (const r of attRows.filter(filterBethel)) {
      const ym = monthOf(r.created_at)
      if (goByMonth.has(ym)) goByMonth.set(ym, goByMonth.get(ym)+1)
    }
    return monthKeys.map(k => ({
      month: fmtMonth(k),
      groups: groupsByMonth.get(k)?.size || 0,
      bethel_go: goByMonth.get(k) || 0,
      bethel_plan: tentByMonth.get(k) || 0
    }))
  }, [monthKeys, meetings, planRows, attRows, bethelFilter])

  // ===== Pie original de perfiles =====
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
              {/* KPIs principales */}
              <section className="kpi-grid">
                <CardStat title="Líderes" value={counts.leaders} to="/manageleaders" />
                <CardStat title="Pastores" value={counts.pastors} to="/managepastors" />
                <CardStat title="Territorios" value={counts.territories} to="/manageterritories" />
                <CardStat title="Grupos" value={counts.groups} to="/groups" />
              </section>

              {/* KPIs Bethel */}
              <section className="kpi-grid" style={{ marginTop: 16 }}>
                <CardStat title="Bethels" value={bethelKpis.bethels} to="/managebethels" />
                <CardStat title="Activos" value={bethelKpis.active} to="/managebethels" />
                <CardStat title="Próximos" value={bethelKpis.upcoming} to="/managebethels" />
                <CardStat title="Staff asignado" value={bethelKpis.staff} to="/managebethels" />
              </section>

              {/* Gráficas existentes */}
              <section className="chart-grid">
                <div className="card chart-card">
                  <h3 className="card-title">Distribución por Rol (perfiles)</h3>
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

              {/* ======== TABLEROS con filtros ======== */}
              <section className="card" style={{ marginTop: 16 }}>
                <div className="card-head">
                  <h3 className="card-title">Tableros (con filtros)</h3>
                  <p className="card-desc">Crecimiento, nuevos y Bethel (prospectos vs asistencia) con filtros de territorio y periodo.</p>
                </div>
                <div className="card-body">
                  {/* Filtros */}
                  <div className="toolbar" style={{ gap: 12, flexWrap:'wrap' }}>
                    {/* Territorio */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Territorio</span>
                      <select className="input" value={territoryId} onChange={e=>setTerritoryId(e.target.value==='all'?'all':Number(e.target.value))}>
                        <option value="all">Todos</option>
                        {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>

                    {/* Periodo */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Periodo</span>
                      <select className="input" value={period} onChange={e=>setPeriod(e.target.value)}>
                        <option value="month">Mes actual</option>
                        <option value="quarter">Último trimestre</option>
                        <option value="custom">Rango</option>
                      </select>
                    </div>

                    {/* Rango personalizado */}
                    {period === 'custom' && (
                      <>
                        <input type="date" className="input" value={startDate} onChange={e=>setStartDate(e.target.value)} />
                        <input type="date" className="input" value={endDate} onChange={e=>setEndDate(e.target.value)} />
                      </>
                    )}

                    {/* Bethel (para la 3ª gráfica) */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Bethel</span>
                      <select className="input" value={bethelFilter} onChange={e=>setBethelFilter(e.target.value)}>
                        <option value="all">Todos</option>
                        {bethels.map(b => (
                          <option key={b.id} value={b.id}>{b.year} — {b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 1) Crecimiento: Grupos vs Asistencia */}
                  <div className="mt-4 p-4 rounded-xl bg-gray-50 shadow chart-card">
                    <h4 className="card-title">Crecimiento — Grupos vs Asistencia</h4>
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={seriesGrowth}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="groups" name="Grupos (activos en el mes)" fill="#6366f1" radius={[6,6,0,0]} />
                          <Bar dataKey="attendance" name="Asistencia" fill="#06b6d4" radius={[6,6,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* 2) Grupos vs Nuevos */}
                  <div className="mt-4 p-4 rounded-xl bg-gray-50 shadow chart-card">
                    <h4 className="card-title">Grupos vs Asistentes nuevos</h4>
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={seriesNew}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="groups" name="Grupos (activos en el mes)" fill="#6366f1" radius={[6,6,0,0]} />
                          <Bar dataKey="new_att" name="Nuevos" fill="#10b981" radius={[6,6,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* 3) Bethel: líneas (Grupos, Van al Bethel, Prospectos) */}
                  <div className="mt-4 p-4 rounded-xl bg-gray-50 shadow chart-card">
                    <h4 className="card-title">Bethel — Grupos vs Van al Bethel vs Prospectos</h4>
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={seriesBethel}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="groups" name="Grupos (activos en el mes)" stroke="#6366f1" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="bethel_go" name="Van al Bethel" stroke="#ef4444" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="bethel_plan" name="Prospectos (plan)" stroke="#f59e0b" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      * La serie de Bethel filtra por el Bethel seleccionado (o “Todos”). Si aún no creaste <code>bethel_plan</code> / <code>bethel_attendance</code>, verás 0s.
                    </p>
                  </div>
                </div>
              </section>

              {/* Gráficas Bethel (resumen general) */}
              <section className="chart-grid">
                <div className="card chart-card">
                  <h3 className="card-title">Bethels por Año</h3>
                  <div className="chart-box">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={bethelsByYear}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="year" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="count" name="Bethels" fill="#10b981" radius={[6,6,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card chart-card">
                  <h3 className="card-title">Staff de Bethels por Rol</h3>
                  <div className="chart-box">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={staffByRole} dataKey="value" nameKey="name" label outerRadius="80%">
                          {staffByRole.map((_, i) => <Cell key={i} fill={STAFF_COLORS[i % STAFF_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>

              {/* Accesos rápidos */}
              <section className="quick-grid">
                <QuickLink title="Gestionar Líderes" to="/manageleaders" />
                <QuickLink title="Gestionar Pastores" to="/managepastors" />
                <QuickLink title="Gestionar Territorios" to="/manageterritories" />
                <QuickLink title="Gestionar Bethels" to="/managebethels" />
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
