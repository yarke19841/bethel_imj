// src/pages/BethelAnalytics.jsx
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  ResponsiveContainer, CartesianGrid, Tooltip, Legend, XAxis, YAxis,
  AreaChart, Area, BarChart, Bar, ComposedChart, Line
} from 'recharts'
import './LeaderHome.css'     // ← tu CSS con la paleta “leader” (el que compartiste)
import './BethelAnalytics.css' // ← CSS ligero para layout de filtros/KPIs/charts

function EmptyChart({ text='Sin datos para mostrar' }){
  return <div style={{height:280,display:'flex',alignItems:'center',justifyContent:'center',color:'#64748b'}}>{text}</div>
}

export default function BethelAnalytics(){
  const { profile, session } = useAuth()
  const role = profile?.role || 'pastor' // 'admin' o 'pastor'
  const authUserId = session?.user?.id || null

  const { state } = useLocation()
  const presetBethel = state?.bethel || null

  // Selectores base
  const [bethels, setBethels] = useState([])
  const [selectedBethel, setSelectedBethel] = useState(presetBethel)

  // Admin: lista de pastores
  const [pastors, setPastors] = useState([])
  const [selectedPastor, setSelectedPastor] = useState(null)

  // Territorios (depende de rol)
  const [territories, setTerritories] = useState([])
  const [selectedTerritory, setSelectedTerritory] = useState(null) // null = global (admin), 'ALL' = todos mis territorios (pastor)

  // Grupos (para mapa de nombres)
  const [groups, setGroups] = useState([])

  // Datos asistencia
  const [attendance, setAttendance] = useState([])

  // Filtros de fecha
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ====== Cargar Bethels (lista completa) ======
  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase
        .from('bethels')
        .select('id, name, year, is_active')
        .order('year', { ascending:false })
        .order('name', { ascending:true })
      if (!error){
        setBethels(data||[])
        if (!presetBethel && (data||[]).length) {
          setSelectedBethel(data.find(b=>b.is_active) || data[0])
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ====== Admin: cargar pastores ======
  useEffect(() => {
    if (role !== 'admin') return
    ;(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, role')
        .eq('role', 'pastor')
        .order('full_name', { ascending:true })
      if (!error){
        setPastors(data||[])
        if (!selectedPastor && (data||[]).length) setSelectedPastor(data[0])
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  // ====== Territorios: por pastor (admin) o por pastor logueado (pastor) ======
  useEffect(() => {
    const load = async (pastorUserId) => {
      const { data, error } = await supabase
        .from('territories')
        .select('id, name, pastor_id')
        .eq('pastor_id', pastorUserId)
        .order('name', { ascending:true })
      if (!error){
        setTerritories(data || [])
        // Preselección:
        if (role === 'admin'){
          // En admin: por defecto "global" (null). Si quieres forzar el primero, comenta la siguiente línea y descomenta la de abajo.
          setSelectedTerritory(null) // global (todos)
          // if ((data||[]).length) setSelectedTerritory(data[0])
        } else {
          // Pastor: por defecto "Todos mis territorios" si hay >1, o el único si solo hay uno
          if ((data||[]).length > 1) setSelectedTerritory('ALL')
          else setSelectedTerritory((data||[])[0] || null)
        }
      }
    }

    if (role === 'admin'){
      if (!selectedPastor?.user_id){ setTerritories([]); setSelectedTerritory(null); return }
      load(selectedPastor.user_id)
    } else {
      if (!authUserId){ setTerritories([]); setSelectedTerritory(null); return }
      load(authUserId)
    }
  }, [role, selectedPastor?.user_id, authUserId])

  // ====== Cargar grupos (para nombres) ======
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('groups').select('id, name, territory_id')
      setGroups(data||[])
    })()
  }, [])

  // ====== Cargar asistencia (según rol/territorio) ======
  useEffect(() => {
    if (!selectedBethel){ setAttendance([]); return }

    // Determina el set de group_ids para filtrar (si corresponde)
    const computeGroupIds = () => {
      // Admin global (selectedTerritory === null): no filtra por grupo → ver global
      if (role === 'admin' && selectedTerritory === null) return null

      // Pastor: 'ALL' = todos mis territorios ⇒ grupos de todos sus territorios
      if (role !== 'admin' && selectedTerritory === 'ALL'){
        const myTerritoryIds = territories.map(t => t.id)
        const gs = groups.filter(g => myTerritoryIds.includes(g.territory_id)).map(g => Number(g.id))
        return gs
      }

      // Un territorio específico seleccionado (admin o pastor)
      if (selectedTerritory && typeof selectedTerritory === 'object'){
        const gs = groups.filter(g => g.territory_id === selectedTerritory.id).map(g => Number(g.id))
        return gs
      }

      // Por seguridad: admin sin territorio seleccionado explícito ⇒ global
      return null
    }

    const groupIds = computeGroupIds()

    ;(async () => {
      setLoading(true); setError('')
      try{
        let q = supabase
          .from('attendance')
          .select('id, bethel_id, group_id, date, real_attendance, prospects')
          .eq('bethel_id', Number(selectedBethel.id))
          .order('date', { ascending:true })

        if (Array.isArray(groupIds)){
          if (groupIds.length === 0){ setAttendance([]); setLoading(false); return }
          q = q.in('group_id', groupIds)
        }

        if (dateFrom) q = q.gte('date', dateFrom)
        if (dateTo)   q = q.lte('date', dateTo)

        const { data, error } = await q
        if (error) throw error
        setAttendance(data||[])
      }catch(e){
        setError(e.message || 'No se pudo cargar la asistencia')
        setAttendance([])
      }finally{
        setLoading(false)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBethel?.id, role, selectedPastor?.user_id, selectedTerritory, territories.map(t=>t.id).join(','), groups.map(g=>g.id).join(','), dateFrom, dateTo])

  // ====== Helpers series y KPIs ======
  const groupName = id => groups.find(g=>String(g.id)===String(id))?.name || id

  const kpis = useMemo(() => {
    const totalReal = attendance.reduce((a,r)=>a+Number(r.real_attendance||0),0)
    const totalPros = attendance.reduce((a,r)=>a+Number(r.prospects||0),0)
    const fechas = Array.from(new Set(attendance.map(r=>r.date)))
    const avgPerMeeting = fechas.length ? totalReal / fechas.length : 0
    const serieReal = attendance.map(r=>Number(r.real_attendance||0))
    const peak = serieReal.length ? Math.max(...serieReal) : 0
    const trendPct = (serieReal.length>=2 && serieReal[0]>0) ? ((serieReal[serieReal.length-1]-serieReal[0])/serieReal[0])*100 : 0
    const noShowRate = totalPros ? Math.max(totalPros-totalReal,0)/totalPros : 0
    const conv = totalPros ? (totalReal/totalPros)*100 : 0
    return { totalReal, totalPros, avgPerMeeting, peak, trendPct, noShowRate, conv }
  }, [attendance])

  const byDate = useMemo(() => {
    const m = new Map()
    attendance.forEach(r=>{
      const k = r.date
      const curr = m.get(k) || { date:k, real:0, prospects:0 }
      curr.real += Number(r.real_attendance||0)
      curr.prospects += Number(r.prospects||0)
      m.set(k, curr)
    })
    return Array.from(m.values()).sort((a,b)=>a.date.localeCompare(b.date))
  }, [attendance])

  const byGroup = useMemo(() => {
    const m = new Map()
    attendance.forEach(r=>{
      const id = Number(r.group_id)
      const curr = m.get(id) || { group:id, real:0, prospects:0 }
      curr.real += Number(r.real_attendance||0)
      curr.prospects += Number(r.prospects||0)
      m.set(id,curr)
    })
    return Array.from(m.values())
      .map(x => ({ ...x, groupLabel: groupName(x.group) }))
      .sort((a,b)=>b.real-a.real)
      .slice(0,5)
  }, [attendance, groups])

  const combinedGroups = useMemo(() => byGroup.map(g=>({
    ...g, conversion: g.prospects ? (g.real/g.prospects)*100 : 0
  })), [byGroup])

  // ====== Opciones de territorio según rol ======
  const territoryOptions = useMemo(() => {
    if (role === 'admin'){
      // Admin: opción "Global (todos)" + territorios del pastor seleccionado
      return [{ value: null, label: 'Global (todos los territorios)' }]
        .concat((territories||[]).map(t => ({ value: t, label: t.name })))
    } else {
      // Pastor: si tiene >1, opción "Todos mis territorios"
      const base = (territories||[]).map(t => ({ value: t, label: t.name }))
      if (territories.length > 1){
        return [{ value: 'ALL', label:'Todos mis territorios' }].concat(base)
      }
      return base
    }
  }, [role, territories])

  return (
    <div className="ml-page">
      <div className="ml-container">
        <header className="ml-header">
          <div>
            <h1 className="ml-title">Gráficas de Bethel</h1>
            <p className="ml-subtitle">
              {role === 'admin'
                ? 'Vista global o filtrada por pastor/territorio.'
                : 'Vista limitada a tus territorios.'}
            </p>
          </div>
          <div className="ml-actions">
            <Link to="/admin" className="btn btn-secondary">Volver</Link>
          </div>
        </header>

        {/* === Filtros === */}
        <section className="card">
          <div className="card-title-row">
            <h2 className="card-title">Filtros</h2>
          </div>

          <div className="ba-filters">
            <div>
              <label>Bethel</label>
              <select
                value={selectedBethel?.id || ''}
                onChange={e=>{
                  const b = bethels.find(x=>String(x.id)===e.target.value)||null
                  setSelectedBethel(b)
                }}
              >
                <option value="">Seleccionar…</option>
                {bethels.map(b=> <option key={b.id} value={b.id}>{b.name} {b.year}</option>)}
              </select>
            </div>

            {role === 'admin' && (
              <div>
                <label>Pastor</label>
                <select
                  value={selectedPastor?.user_id || ''}
                  onChange={e=>{
                    const p = pastors.find(x=>x.user_id === e.target.value) || null
                    setSelectedPastor(p)
                  }}
                >
                  <option value="">Seleccionar…</option>
                  {pastors.map(p=> <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label>{role === 'admin' ? 'Territorio (del pastor)' : 'Territorio'}</label>
              <select
                value={
                  selectedTerritory === null ? '' :
                  selectedTerritory === 'ALL' ? 'ALL' :
                  (selectedTerritory?.id || '')
                }
                onChange={e=>{
                  const val = e.target.value
                  if (role === 'admin'){
                    // Admin: '' = global (todos); sino, buscar objeto territorio
                    if (val === '') setSelectedTerritory(null)
                    else {
                      const t = territories.find(x=>String(x.id)===val) || null
                      setSelectedTerritory(t)
                    }
                  } else {
                    // Pastor: 'ALL' o territorio específico
                    if (val === 'ALL') setSelectedTerritory('ALL')
                    else {
                      const t = territories.find(x=>String(x.id)===val) || null
                      setSelectedTerritory(t)
                    }
                  }
                }}
              >
                {territoryOptions.map(opt => (
                  <option
                    key={opt.value === null ? 'GLOBAL' : (opt.value === 'ALL' ? 'ALL' : opt.value.id)}
                    value={
                      opt.value === null ? '' :
                      (opt.value === 'ALL' ? 'ALL' : opt.value.id)
                    }
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Desde</label>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
            </div>
            <div>
              <label>Hasta</label>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
            </div>
          </div>

          {(selectedBethel) && (
            <p className="ba-muted">
              Bethel: <strong>{selectedBethel.name} {selectedBethel.year}</strong>
              {role === 'admin'
                ? (selectedTerritory === null
                    ? <> · Territorios: <strong>Global</strong></>
                    : <> · Territorio: <strong>{selectedTerritory?.name}</strong></>)
                : (selectedTerritory === 'ALL'
                    ? <> · Territorios: <strong>Todos</strong></>
                    : <> · Territorio: <strong>{selectedTerritory?.name || '—'}</strong></>)
              }
              {dateFrom || dateTo ? <> · Rango: <strong>{dateFrom || '—'}</strong> → <strong>{dateTo || '—'}</strong></> : null}
            </p>
          )}

          {error && <div className="ba-alert">{error}</div>}
        </section>

        {/* === KPIs === */}
        <section className="ba-kpis">
          <div className="kpi"><div>Total Real</div><strong>{kpis.totalReal}</strong></div>
          <div className="kpi"><div>Total Pros</div><strong>{kpis.totalPros}</strong></div>
          <div className="kpi"><div>Conversión</div><strong>{kpis.conv.toFixed(1)}%</strong></div>
          <div className="kpi"><div>Prom. Reunión</div><strong>{kpis.avgPerMeeting.toFixed(1)}</strong></div>
          <div className="kpi"><div>Pico</div><strong>{kpis.peak}</strong></div>
          <div className="kpi"><div>Tendencia</div><strong>{kpis.trendPct.toFixed(1)}%</strong></div>
          <div className="kpi"><div>No-show</div><strong>{(kpis.noShowRate*100).toFixed(1)}%</strong></div>
        </section>

        {/* === Gráficas === */}
        <section className="ba-charts">
          <div className="card">
            <h3 className="card-title">Asistencia real vs prospectos (tiempo)</h3>
            {byDate.length === 0 ? <EmptyChart text="Sin datos para el filtro actual." /> : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={byDate}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="prospects" name="Prospectos" />
                    <Area type="monotone" dataKey="real" name="Real" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="card-title">Top grupos (real vs prospectos)</h3>
            {byGroup.length === 0 ? <EmptyChart /> : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={byGroup}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="groupLabel" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="real" name="Real" />
                    <Bar dataKey="prospects" name="Prospectos" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="card-title">Combinada (barras + conversión)</h3>
            {combinedGroups.length === 0 ? <EmptyChart /> : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={combinedGroups}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="groupLabel" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="real" name="Real" />
                    <Bar yAxisId="left" dataKey="prospects" name="Prospectos" />
                    <Line yAxisId="right" type="monotone" dataKey="conversion" name="Conversión %" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Fondo decorativo del tema leader */}
      <div className="ml-bubble b1" />
      <div className="ml-bubble b2" />
      <div className="ml-bubble b3" />
    </div>
  )
}
