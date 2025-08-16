// src/pages/StaffDashboard.jsx
import LogoutButton from '../components/LogoutButton'
import { useAuth } from '../context/AuthContext'
import RequireAuth from '../components/RequireAuth'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link, useNavigate } from 'react-router-dom'
import './StaffDashboard.css'

import {
  ResponsiveContainer,
  ComposedChart,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend
} from 'recharts'

// ===== Helpers de fechas/buckets =====
function clampDateStr(s){ return (s||'').slice(0,10) }
function startOfWeek(d){ const x=new Date(d); const dow=x.getDay()||7; x.setHours(0,0,0,0); x.setDate(x.getDate()-(dow-1)); return x }
function startOfMonth(d){ const x=new Date(d); x.setHours(0,0,0,0); x.setDate(1); return x }
function startOfQuarter(d){ const x=new Date(d); x.setHours(0,0,0,0); const m=Math.floor(x.getMonth()/3)*3; x.setMonth(m,1); return x }
function startOfYear(d){ const x=new Date(d); x.setHours(0,0,0,0); x.setMonth(0,1); return x }
function fmtYMD(d){ return d.toISOString().slice(0,10) }
function quarterLabel(d){ return `${d.getFullYear()}-Q${Math.floor(d.getMonth()/3)+1}` }
function normalizeToBucketStart(d,b){ if(b==='week')return startOfWeek(d); if(b==='month')return startOfMonth(d); if(b==='quarter')return startOfQuarter(d); return startOfYear(d) }
function nextBucket(d,b){ const x=new Date(d); if(b==='week'){x.setDate(x.getDate()+7);return x} if(b==='month'){x.setMonth(x.getMonth()+1,1);return x} if(b==='quarter'){x.setMonth(x.getMonth()+3,1);return x} x.setFullYear(x.getFullYear()+1); x.setMonth(0,1); return x }
function bucketKeyAndLabel(d,b){ if(b==='week') return {key:`W_${fmtYMD(d)}`,label:fmtYMD(d)}; if(b==='month'){const lbl=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; return {key:`M_${lbl}`,label:lbl}}; if(b==='quarter'){const lbl=quarterLabel(d); return {key:`Q_${lbl}`,label:lbl}}; const lbl=String(d.getFullYear()); return {key:`Y_${lbl}`,label:lbl} }
function generateBucketRange(bucket, fromStr, toStr){
  const from = normalizeToBucketStart(new Date(fromStr+'T00:00:00'), bucket)
  const to = new Date(toStr+'T00:00:00')
  const list=[]; let cur=from
  while(cur<=to){ const {key,label}=bucketKeyAndLabel(cur,bucket); list.push({key,label,date:new Date(cur)}); cur=nextBucket(cur,bucket) }
  return list
}

export default function StaffDashboard() {
  const navigate = useNavigate()

  const { profile, session } = useAuth()
  const role = (profile?.role || 'pastor').toLowerCase() // 'admin' o 'pastor'
  const userId = session?.user?.id
  const displayName =
    profile?.full_name || profile?.name || session?.user?.email?.split('@')[0] || 'Usuario'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [territories, setTerritories] = useState([]) // [{id,name}]
  const [groups, setGroups] = useState([])           // [{id,name,territory_id,leader_user_id}]
  const [leaders, setLeaders] = useState({})         // { user_id: {full_name,email} }
  const [search, setSearch] = useState('')

  // === Bethels (TODOS, sin filtro por territorio) ===
  const [bethels, setBethels] = useState([]) // [{id,name,year,is_active}]
  // Selección de Bethel por territorio (clave = territory_id)
  const [selectedBethelByTerritory, setSelectedBethelByTerritory] = useState({})

  // series/aggregados
  const [seriesLoading, setSeriesLoading] = useState(false)
  const [tsAttendance, setTsAttendance] = useState([])
  const [byGroup, setByGroup] = useState([])
  const [byLeader, setByLeader] = useState([])
  const [attendanceRange, setAttendanceRange] = useState(0)

  // filtros globales
  const [timeBucket, setTimeBucket] = useState('week') // week|month|quarter|year
  const [dateFrom, setDateFrom] = useState(() => fmtYMD(startOfWeek(new Date())))
  const [dateTo, setDateTo] = useState(() => fmtYMD(new Date()))
  const [selectedTerritoryIds, setSelectedTerritoryIds] = useState(() => new Set())
  const [selectedGroupIds, setSelectedGroupIds] = useState(() => new Set())

  function activeTerritoryIds(){
    if (!territories?.length) return []
    if (selectedTerritoryIds.size===0) return territories.map(t=>t.id)
    return territories.filter(t=>selectedTerritoryIds.has(t.id)).map(t=>t.id)
  }
  function activeGroupIds(){
    const byTerr = groups.filter(g=>activeTerritoryIds().includes(g.territory_id))
    const scoped = selectedGroupIds.size===0 ? byTerr : byTerr.filter(g=>selectedGroupIds.has(g.id))
    return scoped.map(g=>g.id)
  }
  function toggleTerritory(id){
    setSelectedTerritoryIds(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); setSelectedGroupIds(new Set()); return n })
  }
  function toggleGroup(id){
    setSelectedGroupIds(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })
  }
  function selectAllTerritories(){ setSelectedTerritoryIds(new Set()); setSelectedGroupIds(new Set()) }
  function clearTerritories(){ setSelectedTerritoryIds(new Set()); setSelectedGroupIds(new Set()) }
  function selectAllGroups(){ setSelectedGroupIds(new Set(activeGroupIds())) }
  function clearGroups(){ setSelectedGroupIds(new Set()) }

  // ===== Carga inicial (alcance + datos base) =====
  useEffect(() => {
    if (!userId) return
    ;(async () => {
      try{
        setLoading(true); setError('')

        // Territorios del usuario (o todos si admin)
        const terrSet = new Set(), terrMap = new Map()

        const { data: pt } = await supabase
          .from('pastor_territories')
          .select('territory_id, territories!inner(id,name,is_active)')
          .eq('pastor_user_id', userId)
        pt?.forEach(r => { const t=r.territories; if(t?.id){ terrSet.add(t.id); terrMap.set(t.id,t.name) } })

        const { data: prof } = await supabase
          .from('profiles')
          .select('territory_id, territory:territories(id,name)')
          .eq('user_id', userId)
          .maybeSingle()
        if (prof){
          const t = prof.territory || (prof.territory_id ? {id:prof.territory_id, name:null} : null)
          if (t?.id){ terrSet.add(t.id); if(t.name) terrMap.set(t.id,t.name) }
        }

        if (role==='admin'){
          const { data: allT } = await supabase.from('territories').select('id,name').order('name', { ascending:true })
          allT?.forEach(t=>{ terrSet.add(t.id); terrMap.set(t.id,t.name) })
        }

        const terrIds = Array.from(terrSet)
        if (!terrIds.length){
          setTerritories([]); setGroups([]); setError('No tienes territorios asignados.')
        }
        const missing = terrIds.filter(id=>!terrMap.get(id))
        if (missing.length){
          const { data: ts } = await supabase.from('territories').select('id,name').in('id', missing)
          ts?.forEach(t => terrMap.set(t.id, t.name || `Territorio ${t.id}`))
        }
        const terrList = terrIds.map(id => ({ id, name: terrMap.get(id) || `Territorio ${id}` }))
        setTerritories(terrList)

        // Grupos
        const { data: grs } = await supabase
          .from('groups')
          .select('id,name,territory_id,leader_user_id')
          .in('territory_id', terrIds.length?terrIds:[-1])
          .order('name', { ascending:true })
        const groupsData = grs || []
        setGroups(groupsData)

        // Líderes
        const leaderIds = Array.from(new Set(groupsData.map(g=>g.leader_user_id).filter(Boolean)))
        let leaderDict={}
        if (leaderIds.length){
          const { data: lps } = await supabase
            .from('profiles')
            .select('user_id, full_name, email')
            .in('user_id', leaderIds)
          leaderDict = (lps||[]).reduce((acc,p)=>{ acc[p.user_id]={full_name:p.full_name||'(sin nombre)', email:p.email||''}; return acc },{})
        }
        setLeaders(leaderDict)

        // ===== Bethels: TODOS =====
        const { data: bs, error: bErr } = await supabase
          .from('bethels')
          .select('id, name, year, is_active')
          .order('year', { ascending:false })
          .order('name', { ascending:true })
        if (bErr) throw bErr
        const bethelList = bs || []
        setBethels(bethelList)

      }catch(e){
        console.error(e); setError(e.message || 'No se pudo cargar el panel del pastor.')
      }finally{
        setLoading(false)
      }
    })()
  }, [userId, role])

  // ===== Series al cambiar filtros =====
  useEffect(() => {
    ;(async () => {
      try{
        setSeriesLoading(true)
        const from = clampDateStr(dateFrom), to = clampDateStr(dateTo)
        const buckets = generateBucketRange(timeBucket, from, to)
        const groupIds = (function(){
          const byTerr = groups.filter(g=>activeTerritoryIds().includes(g.territory_id))
          const scoped = selectedGroupIds.size===0 ? byTerr : byTerr.filter(g=>selectedGroupIds.has(g.id))
          return scoped.map(g=>g.id)
        })()

        if (!groupIds.length || !buckets.length){
          setTsAttendance(buckets.map(b=>({bucket:b.key,label:b.label,attendance:0,unique_people:0,groupsActive:0})))
          setByGroup([]); setByLeader([]); setAttendanceRange(0); return
        }

        const { data: meetings, error: mErr } = await supabase
          .from('meetings')
          .select('id, group_id, date')
          .in('group_id', groupIds)
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending:true })
        if (mErr) throw mErr
        const meetingIds = (meetings||[]).map(m=>m.id)

        let attendance=[]
        if (meetingIds.length){
          const { data: att, error: aErr } = await supabase
            .from('attendance')
            .select('id, meeting_id, person_id')
            .in('meeting_id', meetingIds)
          if (aErr) throw aErr
          attendance = att || []
        }

        setAttendanceRange(attendance.length || 0)

        const bucketMaps = buckets.reduce((acc,b)=>{ acc[b.key]={attendance:0,people:new Set(),groups:new Set()}; return acc },{})
        const meetingById = new Map((meetings||[]).map(m=>[m.id,m]))
        const groupById = new Map(groups.map(g=>[g.id,g]))

        for (const m of (meetings||[])){
          const bd = bucketKeyAndLabel(normalizeToBucketStart(new Date(m.date+'T00:00:00'), timeBucket), timeBucket).key
          if (bucketMaps[bd]) bucketMaps[bd].groups.add(m.group_id)
        }
        for (const a of attendance){
          const m = meetingById.get(a.meeting_id); if(!m) continue
          const bd = bucketKeyAndLabel(normalizeToBucketStart(new Date(m.date+'T00:00:00'), timeBucket), timeBucket).key
          const slot = bucketMaps[bd]; if(!slot) continue
          slot.attendance += 1
          if (a.person_id != null) slot.people.add(a.person_id)
          slot.groups.add(m.group_id)
        }

        const ts = buckets.map(b=>({
          bucket:b.key, label:b.label,
          attendance: bucketMaps[b.key].attendance,
          unique_people: bucketMaps[b.key].people.size,
          groupsActive: bucketMaps[b.key].groups.size
        }))
        setTsAttendance(ts)

        // Por grupo
        const perGroup = new Map()
        for (const g of groups.filter(g=>activeTerritoryIds().includes(g.territory_id))){
          perGroup.set(g.id, { attendance:0, people:new Set(), name:g.name })
        }
        for (const a of attendance){
          const m = meetingById.get(a.meeting_id); if(!m) continue
          const slot = perGroup.get(m.group_id); if(!slot) continue
          slot.attendance += 1
          if (a.person_id != null) slot.people.add(a.person_id)
        }
        const byGroupArr = Array.from(perGroup.entries()).map(([id,slot])=>({
          group_id:id, name:slot.name, attendance:slot.attendance, unique_people:slot.people.size
        })).sort((a,b)=> b.unique_people - a.unique_people)
        setByGroup(byGroupArr)

        // Por líder
        const perLeader = new Map()
        for (const g of groups.filter(g=>activeTerritoryIds().includes(g.territory_id))){
          const lid = g.leader_user_id || '—'
          const name = leaders[g.leader_user_id]?.full_name || '—'
          if (!perLeader.has(lid)) perLeader.set(lid, { attendance:0, people:new Set(), name })
        }
        for (const a of attendance){
          const m = meetingById.get(a.meeting_id); if(!m) continue
          const g = groupById.get(m.group_id); if(!g) continue
          const lid = g.leader_user_id || '—'
          const slot = perLeader.get(lid); if(!slot) continue
          slot.attendance += 1
          if (a.person_id != null) slot.people.add(a.person_id)
        }
        const byLeaderArr = Array.from(perLeader.values()).map(v=>({
          name:v.name, attendance:v.attendance, unique_people:v.people.size
        })).sort((a,b)=> b.unique_people - a.unique_people)
        setByLeader(byLeaderArr)

      }catch(e){
        console.error('SERIES_ERR', e)
        setTsAttendance([]); setByGroup([]); setByLeader([]); setAttendanceRange(0)
      }finally{
        setSeriesLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeBucket, dateFrom, dateTo, territories, groups, selectedTerritoryIds, selectedGroupIds, leaders])

  // ===== Helpers UI =====
  const selectedTerritoriesList = useMemo(() => {
    const ids = activeTerritoryIds()
    return territories.filter(t=>ids.includes(t.id))
  }, [territories, selectedTerritoryIds])

  function formatTerritoryNamesShort(ts){
    if (!ts.length) return '—'
    if (ts.length <= 2) return ts.map(t=>t.name).join(', ')
    return `${ts[0].name}, ${ts[1].name} +${ts.length-2}`
  }
  function headerContextText(ts){
    if (!territories.length || selectedTerritoryIds.size===0 || ts.length===territories.length) return 'Todos los territorios'
    if (ts.length===1) return `Del territorio ${ts[0].name}`
    return `De varios territorios (${ts.length})`
  }
  const headerText = headerContextText(selectedTerritoriesList)
  const kpiTerritoriesText = formatTerritoryNamesShort(selectedTerritoriesList)

  const scopedGroups = useMemo(() => {
    const terrIds = activeTerritoryIds()
    let base = groups.filter(g=>terrIds.includes(g.territory_id))
    if (selectedGroupIds.size>0) base = base.filter(g=>selectedGroupIds.has(g.id))
    return base
  }, [groups, selectedGroupIds, territories])

  const filteredGroups = useMemo(() => {
    const q=(search||'').toLowerCase().trim()
    if (!q) return scopedGroups
    return scopedGroups.filter(g => (g.name||'').toLowerCase().includes(q))
  }, [scopedGroups, search])

  const groupsByTerritory = useMemo(() => {
    const ids = activeTerritoryIds()
    const map = new Map()
    territories.filter(t=>ids.includes(t.id)).forEach(t=>map.set(t.id, { territory:t, items:[] }))
    filteredGroups.forEach(g=>{
      const bucket = map.get(g.territory_id) || { territory:{id:g.territory_id, name:`Territorio ${g.territory_id}`}, items:[] }
      bucket.items.push(g); map.set(g.territory_id, bucket)
    })
    return Array.from(map.values()).filter(b=>b.items.length>0)
  }, [territories, filteredGroups])

  const kpiLeadersCount = useMemo(() => {
    const ids = new Set(scopedGroups.map(g=>g.leader_user_id).filter(Boolean))
    return ids.size
  }, [scopedGroups])

  // ===== Bethel selector por territorio + navegación =====
  function setBethelForTerritory(territoryId, bethelId){
    setSelectedBethelByTerritory(prev => ({ ...prev, [territoryId]: bethelId }))
  }
  function openBethelAnalytics(territoryId){
    const bethelId = selectedBethelByTerritory[territoryId]
    if (!bethelId){ alert('Selecciona un Bethel.'); return }
    navigate(`/bethel/${bethelId}?territory=${territoryId}`)
  }

  return (
    <RequireAuth>
      <div className="sd-page">
        <div className="sd-container">
          {/* Header */}
          <header className="sd-header">
            <div>
              <div className="sd-context">{headerText}</div>
              <h1 className="sd-title">Panel del Pastor</h1>
              <p className="sd-subtitle">Hola, <strong>{displayName}</strong></p>
            </div>
            <div className="sd-actions">
              <LogoutButton />
            </div>
          </header>

          {error && <div className="sd-alert" role="alert">{error}</div>}

          {/* ====== FILTROS ====== */}
          <section className="card" style={{ marginBottom: 14 }}>
            <div className="card-head">
              <h3 className="card-title">Filtros</h3>
              <p className="card-desc">Aplica a KPIs, tablas y todas las gráficas.</p>
            </div>
            <div className="card-body">
              {/* Fila 1: período + fechas */}
              <div className="toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Período</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className={`btn ${timeBucket==='week'?'btn-primary':''}`} onClick={()=>setTimeBucket('week')}>Semana</button>
                    <button type="button" className={`btn ${timeBucket==='month'?'btn-primary':''}`} onClick={()=>setTimeBucket('month')}>Mes</button>
                    <button type="button" className={`btn ${timeBucket==='quarter'?'btn-primary':''}`} onClick={()=>setTimeBucket('quarter')}>Trimestre</button>
                    <button type="button" className={`btn ${timeBucket==='year'?'btn-primary':''}`} onClick={()=>setTimeBucket('year')}>Año</button>
                  </div>
                </div>

                <div>
                  <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Desde</label>
                  <input type="date" className="input" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
                </div>
                <div>
                  <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Hasta</label>
                  <input type="date" className="input" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
                </div>
              </div>

              {/* Fila 2: Territorios y Grupos */}
              <div className="toolbar" style={{ flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                <div className="filters-block">
                  <div className="filters-head">
                    <label className="filters-label">Territorios</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn" onClick={selectAllTerritories}>Todos</button>
                      <button type="button" className="btn" onClick={clearTerritories}>Limpiar</button>
                    </div>
                  </div>
                  <div className="chips">
                    {territories.map(t => (
                      <label key={t.id} className={`chip ${selectedTerritoryIds.size===0 || selectedTerritoryIds.has(t.id) ? 'chip-on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selectedTerritoryIds.size===0 ? true : selectedTerritoryIds.has(t.id)}
                          onChange={()=>toggleTerritory(t.id)}
                          style={{ display: 'none' }}
                        />
                        {t.name}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="filters-block">
                  <div className="filters-head">
                    <label className="filters-label">Grupos</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn" onClick={selectAllGroups}>Todos</button>
                      <button type="button" className="btn" onClick={clearGroups}>Limpiar</button>
                    </div>
                  </div>
                  <div className="chips">
                    {groups
                      .filter(g => activeTerritoryIds().includes(g.territory_id))
                      .map(g => (
                        <label key={g.id} className={`chip ${selectedGroupIds.size===0 || selectedGroupIds.has(g.id) ? 'chip-on' : ''}`}>
                          <input
                            type="checkbox"
                            checked={selectedGroupIds.size===0 ? true : selectedGroupIds.has(g.id)}
                            onChange={()=>toggleGroup(g.id)}
                            style={{ display: 'none' }}
                          />
                          {g.name}
                        </label>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ====== KPIs ====== */}
          <section className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Territorio(s)</div>
              <div className="kpi-value">{kpiTerritoriesText}</div>
              <div className="kpi-hint">{selectedTerritoriesList.length} seleccionado(s)</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Grupos</div>
              <div className="kpi-value">{scopedGroups.length}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Líderes</div>
              <div className="kpi-value">{kpiLeadersCount}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Asistencia (rango)</div>
              <div className="kpi-value">{attendanceRange}</div>
              <div className="kpi-hint">{dateFrom} → {dateTo}</div>
            </div>
          </section>

          {/* ====== GRÁFICAS ====== */}
          <section className="chart-grid">
            <div className="card chart-card">
              <div className="card-head">
                <h3 className="card-title">Grupos del territorio vs crecimiento</h3>
                <p className="card-desc">Grupos con reuniones en el período vs personas únicas asistiendo.</p>
              </div>
              <div className="chart-box">
                {seriesLoading ? <div className="sd-loading">Cargando…</div> :
                 tsAttendance.length===0 ? <div className="sd-loading">Sin datos</div> :
                 (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={tsAttendance}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis yAxisId="left" allowDecimals={false} />
                      <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="groupsActive" name="Grupos activos" />
                      <Line yAxisId="right" type="monotone" dataKey="unique_people" name="Personas únicas" />
                    </ComposedChart>
                  </ResponsiveContainer>
                 )}
              </div>
            </div>

            <div className="card chart-card">
              <div className="card-head">
                <h3 className="card-title">Asistencia en el tiempo</h3>
                <p className="card-desc">Total de asistencias vs personas únicas por período.</p>
              </div>
              <div className="chart-box">
                {seriesLoading ? <div className="sd-loading">Cargando…</div> :
                 tsAttendance.length===0 ? <div className="sd-loading">Sin datos</div> :
                 (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tsAttendance}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="attendance" name="Asistencias" />
                      <Line type="monotone" dataKey="unique_people" name="Personas únicas" />
                    </LineChart>
                  </ResponsiveContainer>
                 )}
              </div>
            </div>

            <div className="card chart-card">
              <div className="card-head">
                <h3 className="card-title">Grupos (rango seleccionado)</h3>
                <p className="card-desc">Comparación por grupo: personas únicas y asistencias.</p>
              </div>
              <div className="chart-box">
                {seriesLoading ? <div className="sd-loading">Cargando…</div> :
                 byGroup.length===0 ? <div className="sd-loading">Sin datos</div> :
                 (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byGroup}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={70} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="unique_people" name="Personas únicas" />
                      <Bar dataKey="attendance" name="Asistencias" />
                    </BarChart>
                  </ResponsiveContainer>
                 )}
              </div>
            </div>

            <div className="card chart-card">
              <div className="card-head">
                <h3 className="card-title">Líderes (rango seleccionado)</h3>
                <p className="card-desc">Personas únicas y asistencias por líder.</p>
              </div>
              <div className="chart-box">
                {seriesLoading ? <div className="sd-loading">Cargando…</div> :
                 byLeader.length===0 ? <div className="sd-loading">Sin datos</div> :
                 (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byLeader}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={70} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="unique_people" name="Personas únicas" />
                      <Bar dataKey="attendance" name="Asistencias" />
                    </BarChart>
                  </ResponsiveContainer>
                 )}
              </div>
            </div>
          </section>

          {/* ====== Tabla por territorio ====== */}
          <section className="card">
            <div className="card-head">
              <h3 className="card-title">Grupos bajo mi territorio</h3>
              <p className="card-desc">Selecciona un Bethel por territorio y abre su analítica.</p>
            </div>
            <div className="card-body">
              <div className="toolbar">
                <input
                  className="input"
                  placeholder="Buscar grupo…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              {loading ? (
                <div className="sd-loading">Cargando…</div>
              ) : groupsByTerritory.length === 0 ? (
                <p className="muted">No hay grupos para mostrar.</p>
              ) : (
                groupsByTerritory.map(bucket => (
                  <div key={bucket.territory.id} className="territory-card">
                    <div className="territory-head" style={{ gap: 10 }}>
                      <div className="territory-badge">{bucket.territory.name}</div>
                      <div className="muted">{bucket.items.length} grupo(s)</div>

                      {/* Selector y botón de Bethel por territorio */}
                      <div style={{ display:'flex', gap:8, alignItems:'center', marginLeft:'auto' }}>
                        <select
                          className="input"
                          style={{ minWidth: 240 }}
                          value={selectedBethelByTerritory[bucket.territory.id] || ''}
                          onChange={e => setBethelForTerritory(bucket.territory.id, e.target.value)}
                        >
                          <option value="">— Selecciona Bethel —</option>
                          {bethels.map(b => (
                            <option key={b.id} value={b.id}>{b.name} {b.year}</option>
                          ))}
                        </select>
                        <button
                          className="btn btn-secondary"
                          onClick={() => openBethelAnalytics(bucket.territory.id)}
                        >
                          Ver gráficas
                        </button>
                      </div>
                    </div>

                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Grupo</th>
                            <th>Líder</th>
                            <th>Contacto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bucket.items.map(g => {
                            const leader = g.leader_user_id ? leaders[g.leader_user_id] : null
                            return (
                              <tr key={g.id}>
                                <td>{g.name}</td>
                                <td>{leader?.full_name || '—'}</td>
                                <td>{leader?.email || '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
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
