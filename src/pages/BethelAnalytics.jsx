// src/pages/BethelAnalytics.jsx
import { useEffect, useMemo, useState } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import RequireAuth from '../components/RequireAuth'
import LogoutButton from '../components/LogoutButton'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import './StaffDashboard.css' // reutiliza la misma paleta/estilos del panel

import {
  ResponsiveContainer,
  CartesianGrid, Tooltip, Legend, XAxis, YAxis,
  AreaChart, Area, BarChart, Bar, ComposedChart, Line
} from 'recharts'

// ==== helpers de URL/fecha ====
function useBethelId() {
  const { bethelId: paramId } = useParams()
  const location = useLocation()
  const qp = new URLSearchParams(location.search)
  const queryId = qp.get('id')
  const stateId = location.state && location.state.bethelId
  return paramId || queryId || stateId || null
}
const clamp10 = s => (s || '').slice(0, 10)
const ymd = d => d.toISOString().slice(0, 10)

export default function BethelAnalytics() {
  const bethelId = useBethelId()
  const { profile, session } = useAuth()

  const role = (profile?.role || '').toLowerCase() // 'admin' | 'pastor' | ...
  const userId = session?.user?.id
  const displayName = profile?.full_name || session?.user?.email?.split('@')[0] || 'Usuario'

  // Estado base
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bethel, setBethel] = useState(null)

  // Filtros de fecha
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 2); return ymd(d)
  })
  const [dateTo, setDateTo] = useState(() => ymd(new Date()))

  // Alcance (territorios / grupos permitidos)
  const [territoryIds, setTerritoryIds] = useState([]) // ids disponibles para el usuario
  const [groups, setGroups] = useState([]) // grupos dentro de esos territorios
  const [groupNames, setGroupNames] = useState({}) // id -> nombre (para labels)

  // Datos de asistencia
  const [rows, setRows] = useState([])
  const [loadingData, setLoadingData] = useState(false)

  // 1) Cargar el Bethel
  useEffect(() => {
    if (!bethelId) return
    ;(async () => {
      try {
        setLoading(true); setError('')
        const { data: b, error: bErr } = await supabase
          .from('bethels')
          .select('id, name, year, is_active, starts_on, ends_on')
          .eq('id', bethelId)
          .maybeSingle()
        if (bErr) throw bErr
        if (!b) { setError('Bethel no encontrado.'); setBethel(null); return }
        setBethel(b)
      } catch (e) {
        console.error(e)
        setError(e.message || 'No se pudo cargar el Bethel.')
      } finally {
        setLoading(false)
      }
    })()
  }, [bethelId])

  // 2) Resolver alcance (territorios y grupos) según rol
  useEffect(() => {
    if (!userId) return
    ;(async () => {
      try {
        setError('')

        if (role === 'admin') {
          // Admin: puede ver todos los territorios
          const { data: ts, error: tErr } = await supabase
            .from('territories')
            .select('id, name, is_active')
            .order('name', { ascending: true })
          if (tErr) throw tErr
          const allIds = (ts || []).map(t => t.id)
          setTerritoryIds(allIds)

          // Todos los grupos
          const { data: grs, error: gErr } = await supabase
            .from('groups')
            .select('id, name, territory_id')
            .in('territory_id', allIds)
            .order('name', { ascending: true })
          if (gErr) throw gErr
          setGroups(grs || [])
        } else {
          // Pastor: solo sus territorios (mismo enfoque de StaffDashboard)
          const terrSet = new Set()

          // Asignaciones explícitas
          const { data: pt } = await supabase
            .from('pastor_territories')
            .select('territory_id')
            .eq('pastor_user_id', userId)
          pt?.forEach(r => { if (r.territory_id) terrSet.add(r.territory_id) })

          // Perfil con territory_id directo
          const { data: prof } = await supabase
            .from('profiles')
            .select('territory_id')
            .eq('user_id', userId)
            .maybeSingle()
          if (prof?.territory_id) terrSet.add(prof.territory_id)

          // Vista admin-pastor si existiera (compatibilidad)
          const { data: pview } = await supabase
            .from('pastors_admin')
            .select('territory_id')
            .eq('pastor_user_id', userId)
          pview?.forEach(r => { if (r.territory_id) terrSet.add(r.territory_id) })

          const terrIds = Array.from(terrSet)
          setTerritoryIds(terrIds)

          if (!terrIds.length) {
            setGroups([])
            return
          }

          const { data: grs, error: gErr } = await supabase
            .from('groups')
            .select('id, name, territory_id')
            .in('territory_id', terrIds)
            .order('name', { ascending: true })
          if (gErr) throw gErr
          setGroups(grs || [])
        }
      } catch (e) {
        console.error(e)
        setError(e.message || 'No se pudo resolver el alcance del usuario.')
        setTerritoryIds([]); setGroups([])
      }
    })()
  }, [userId, role])

  // 3) Cargar asistencia de ese Bethel PERO filtrando por grupos permitidos
  useEffect(() => {
    if (!bethelId) return

    // Si es pastor y aún no resolvimos sus territorios/grupos, espera a tenerlos:
    if (role !== 'admin' && territoryIds.length === 0) {
      setRows([]) // mostrará mensaje de alcance
      return
    }

    ;(async () => {
      try {
        setLoadingData(true); setError('')

        // ids de grupos permitidos
        const allowedGroupIds = (role === 'admin')
          ? (groups || []).map(g => g.id)
          : (groups || []).filter(g => territoryIds.includes(g.territory_id)).map(g => g.id)

        if (!allowedGroupIds.length) {
          setRows([]); setGroupNames({})
          return
        }

        let q = supabase
          .from('attendance')
          .select('id, bethel_id, group_id, date, real_attendance, prospects')
          .eq('bethel_id', bethelId)
          .in('group_id', allowedGroupIds)
          .order('date', { ascending: true })

        if (dateFrom) q = q.gte('date', clamp10(dateFrom))
        if (dateTo) q = q.lte('date', clamp10(dateTo))

        const { data: att, error: aErr } = await q
        if (aErr) throw aErr

        setRows(att || [])

        // nombres de grupos
        const usedGroupIds = Array.from(new Set((att || []).map(r => r.group_id).filter(Boolean)))
        if (usedGroupIds.length) {
          // usar los groups ya cargados para no ir a DB de nuevo si están en memoria
          const dict = {}
          for (const g of groups) {
            if (usedGroupIds.includes(g.id)) dict[g.id] = g.name || `Grupo ${g.id}`
          }
          // si faltara alguno, completar desde DB
          const missing = usedGroupIds.filter(id => !dict[id])
          if (missing.length) {
            const { data: grs } = await supabase.from('groups').select('id, name').in('id', missing)
            grs?.forEach(g => { dict[g.id] = g.name || `Grupo ${g.id}` })
          }
          setGroupNames(dict)
        } else {
          setGroupNames({})
        }
      } catch (e) {
        console.error(e)
        setError(e.message || 'No se pudo cargar la asistencia del Bethel.')
        setRows([]); setGroupNames({})
      } finally {
        setLoadingData(false)
      }
    })()
  }, [bethelId, role, territoryIds, groups, dateFrom, dateTo])

  // === Derivados para gráficas ===
  const byDate = useMemo(() => {
    const map = {}
    for (const r of rows) {
      const k = r.date
      if (!map[k]) map[k] = { date: k, real: 0, prospects: 0 }
      map[k].real += r.real_attendance || 0
      map[k].prospects += r.prospects || 0
    }
    return Object.values(map)
  }, [rows])

  const topGroups = useMemo(() => {
    const map = {}
    for (const r of rows) {
      const g = r.group_id || '—'
      if (!map[g]) map[g] = { group: g, real: 0, prospects: 0 }
      map[g].real += r.real_attendance || 0
      map[g].prospects += r.prospects || 0
    }
    return Object.values(map)
      .map(x => ({ ...x, label: groupNames[x.group] || String(x.group) }))
      .sort((a, b) => b.real - a.real)
      .slice(0, 8)
  }, [rows, groupNames])

  const combinedGroups = useMemo(() => {
    return topGroups.map(g => ({
      ...g,
      conversion: g.prospects ? (g.real / g.prospects) * 100 : 0
    }))
  }, [topGroups])

  // KPIs
  const kpis = useMemo(() => {
    const totalReal = rows.reduce((a, r) => a + (r.real_attendance || 0), 0)
    const totalPros = rows.reduce((a, r) => a + (r.prospects || 0), 0)
    const conv = totalPros ? (totalReal / totalPros) * 100 : 0
    const fechas = Array.from(new Set(rows.map(r => r.date))).length
    const avg = fechas ? totalReal / fechas : 0
    const peak = Math.max(0, ...rows.map(r => r.real_attendance || 0))
    return { totalReal, totalPros, conv, avg, peak }
  }, [rows])

  // Mensajes de alcance para pastor
  const showScopeHintForPastor =
    role !== 'admin' && (territoryIds.length === 0 || groups.length === 0)

  // ===== Render =====
  if (!bethelId) {
    return (
      <RequireAuth>
        <div className="sd-page">
          <div className="sd-container">
            <div className="sd-alert">No se proporcionó un Bethel válido.</div>
            <Link to={-1} className="btn">← Volver</Link>
          </div>
        </div>
      </RequireAuth>
    )
  }

  return (
    <RequireAuth>
      <div className="sd-page">
        <div className="sd-container">
          {/* Header */}
          <header className="sd-header">
            <div>
              <div className="sd-context">Analítica de Bethel</div>
              <h1 className="sd-title">{bethel ? `${bethel.name} ${bethel.year}` : 'Bethel'}</h1>
              <p className="sd-subtitle">Hola, <strong>{displayName}</strong></p>
            </div>
            <div className="sd-actions" style={{ gap: 8 }}>
              <Link to={-1} className="btn">← Volver</Link>
              <LogoutButton />
            </div>
          </header>

          {error && <div className="sd-alert" role="alert">{error}</div>}

          {/* Hints de alcance */}
          {showScopeHintForPastor && (
            <div className="sd-alert" role="alert">
              No tienes territorios o grupos asignados para este usuario. Pide al admin que te asigne al menos un territorio.
            </div>
          )}

          {/* Filtros fecha */}
          <section className="card" style={{ marginBottom: 14 }}>
            <div className="card-head">
              <h3 className="card-title">Rango de fechas</h3>
              <p className="card-desc">Aplica a todas las gráficas y KPIs.</p>
            </div>
            <div className="card-body">
              <div className="toolbar" style={{ gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Desde</label>
                  <input type="date" className="input" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
                </div>
                <div>
                  <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Hasta</label>
                  <input type="date" className="input" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
                </div>
              </div>
            </div>
          </section>

          {/* KPIs */}
          <section className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Asistencia total</div>
              <div className="kpi-value">{kpis.totalReal}</div>
              <div className="kpi-hint">{dateFrom} → {dateTo}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Prospectos</div>
              <div className="kpi-value">{kpis.totalPros}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Conversión</div>
              <div className="kpi-value">{kpis.conv.toFixed(1)}%</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Promedio por fecha</div>
              <div className="kpi-value">{kpis.avg.toFixed(1)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Pico</div>
              <div className="kpi-value">{kpis.peak}</div>
            </div>
          </section>

          {/* Gráficas */}
          <section className="chart-grid">
            {/* 1) Real vs Prospectos por fecha */}
            <div className="card chart-card">
              <div className="card-head">
                <h3 className="card-title">Asistencia real vs prospectos (por fecha)</h3>
                <p className="card-desc">Sumas diarias en el rango seleccionado.</p>
              </div>
              <div className="chart-box">
                {loadingData ? (
                  <div className="sd-loading">Cargando…</div>
                ) : byDate.length === 0 ? (
                  <div className="sd-loading">
                    {role === 'admin'
                      ? 'Sin datos para este Bethel en el rango seleccionado.'
                      : 'Sin datos en tus territorios para este Bethel en el rango seleccionado.'}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={byDate}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Area dataKey="real" name="Real" />
                      <Area dataKey="prospects" name="Prospectos" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* 2) Top grupos */}
            <div className="card chart-card">
              <div className="card-head">
                <h3 className="card-title">Top grupos por asistencia real</h3>
                <p className="card-desc">Grupos con mayor asistencia real en el rango.</p>
              </div>
              <div className="chart-box">
                {loadingData ? (
                  <div className="sd-loading">Cargando…</div>
                ) : topGroups.length === 0 ? (
                  <div className="sd-loading">Sin datos</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topGroups}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" interval={0} angle={-20} textAnchor="end" height={70} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="real" name="Real" />
                      <Bar dataKey="prospects" name="Prospectos" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* 3) Combinada por grupo */}
            <div className="card chart-card">
              <div className="card-head">
                <h3 className="card-title">Real + Prospectos + Conversión</h3>
                <p className="card-desc">Comparación por grupo (con % de conversión).</p>
              </div>
              <div className="chart-box">
                {loadingData ? (
                  <div className="sd-loading">Cargando…</div>
                ) : topGroups.length === 0 ? (
                  <div className="sd-loading">Sin datos</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={combinedGroups}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis yAxisId="left" allowDecimals={false} />
                      <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="real" name="Real" />
                      <Bar yAxisId="left" dataKey="prospects" name="Prospectos" />
                      <Line yAxisId="right" type="monotone" dataKey="conversion" name="Conversión %" />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Fondo decorativo */}
        <div className="sd-bubble b1" />
        <div className="sd-bubble b2" />
        <div className="sd-bubble b3" />
      </div>
    </RequireAuth>
  )
}
