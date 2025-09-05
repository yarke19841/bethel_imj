// src/pages/LeaderHome.jsx
import RequireAuth from '../components/RequireAuth'
import LogoutButton from '../components/LogoutButton'
import { useAuth } from '../context/AuthContext'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import './LeaderHome.css'

function getLocalYYYYMMDD(d = new Date()) {
  return d.toLocaleDateString('en-CA')
}
function firstDayOfCurrentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}

// UI básicos (sin Tailwind)
const Card = ({ title, description, children, className = '' }) => (
  <div className={`card ${className}`}>
    {(title || description) && (
      <div className="card-head">
        {title && <h3 className="card-title">{title}</h3>}
        {description && <p className="card-desc">{description}</p>}
      </div>
    )}
    <div className="card-body">{children}</div>
  </div>
)

const Stat = ({ label, value, hint }) => (
  <div className="kpi">
    <div className="kpi-label">{label}</div>
    <div className="kpi-value">{value}</div>
    {hint && <div className="kpi-hint">{hint}</div>}
  </div>
)

const Badge = ({ children, color="gray" }) => {
  const map = {
    gray:   "badge badge-gray",
    green:  "badge badge-green",
    blue:   "badge badge-blue",
    amber:  "badge badge-amber",
    red:    "badge badge-red",
  }
  return <span className={map[color] || map.gray}>{children}</span>
}

const Button = ({ children, variant="primary", className='', ...props }) => {
  const map = {
    primary:   'btn btn-primary',
    secondary: 'btn btn-secondary',
    success:   'btn btn-success',
    warning:   'btn btn-warning',
    danger:    'btn btn-danger',
    ghost:     'btn btn-ghost',
  }
  return <button className={`${map[variant] || map.primary} ${className}`} {...props}>{children}</button>
}

function Avatar({name}) {
  const initials = (name || 'Líder').split(/\s+/).slice(0,2).map(s=>s[0]?.toUpperCase()||'').join('')
  return <div className="avatar">{initials || 'L'}</div>
}

const Caret = ({open}) => (
  <span className={`caret ${open ? 'open' : ''}`} aria-hidden>▸</span>
)

export default function LeaderHome() {
  const { profile, session } = useAuth()
  const leaderName = profile?.full_name || session?.user?.email?.split('@')[0] || 'Líder'
  const userId = session?.user?.id

  const [group, setGroup] = useState(null)
  const [meeting, setMeeting] = useState(null)
  const [members, setMembers] = useState([])
  const [todayAtt, setTodayAtt] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [uiInfo, setUiInfo] = useState('')

  // mensaje específico del formulario de reunión (debajo del botón)
  const [meetingMsg, setMeetingMsg] = useState('')

  const [meta, setMeta] = useState({
    date: getLocalYYYYMMDD(),
    address: '',
    start_time: '',
    end_time: '',
    leader_name: '',
    helper_name: '',
  })

  const [duration, setDuration] = useState({ text: '', ok: true, minutes: null })

  const [addForm, setAddForm] = useState({
    full_name: '',
    age: '',
    email: '',
    phone: '',
    is_new: true,
  })

  const [editingPerson, setEditingPerson] = useState(null)

  // ===== Modal Bethel =====
  const [bethelModalOpen, setBethelModalOpen] = useState(false)
  const [bethels, setBethels] = useState([])
  const [selectedBethelId, setSelectedBethelId] = useState('')
  const [bethelDate, setBethelDate] = useState(getLocalYYYYMMDD())
  const [prospects, setProspects] = useState([])
  const [prospectForm, setProspectForm] = useState({
    full_name: '',
    age: '',
    phone: '',
    address: '',
  })
  const [bethelUi, setBethelUi] = useState('')

  // ===== Rango de asistencia (agrupado por reunión) =====
  const [rangeFrom, setRangeFrom] = useState(firstDayOfCurrentMonth())
  const [rangeTo, setRangeTo] = useState(getLocalYYYYMMDD())
  const [rangeLoading, setRangeLoading] = useState(false)
  // { meeting_id, date, total, nuevos, rows: [{att_id, person_name, is_new}] }
  const [rangeDays, setRangeDays] = useState([])
  const [expandedMeetingId, setExpandedMeetingId] = useState(null)

  const today = useMemo(() => getLocalYYYYMMDD(), [])

  useEffect(() => {
    setMeta(m => ({ ...m, leader_name: leaderName }))
  }, [leaderName])

  useEffect(() => {
    if (!userId) return
    ;(async () => {
      try {
        setLoading(true); setMsg(''); setUiInfo('')

        // Grupo del líder
        const { data: g, error: gErr } = await supabase
          .from('groups')
          .select('*')
          .eq('leader_user_id', userId)
          .maybeSingle()
        if (gErr) { console.error(gErr); setMsg('No se pudo cargar el grupo.'); return }
        if (!g) { setMsg('Aún no tienes un grupo asignado. Contacta al administrador.'); return }
        setGroup(g)

        // Reunión por fecha (crear si no existe)
        let { data: m, error: mErr } = await supabase
          .from('meetings')
          .select('*')
          .eq('group_id', g.id)
          .eq('date', meta.date)
          .maybeSingle()
        if (mErr) { console.error(mErr); setMsg('No se pudo consultar la reunión.'); return }

        if (!m) {
          const { data: created, error: cErr } = await supabase
            .from('meetings')
            .insert({ group_id: g.id, date: meta.date })
            .select()
            .single()
          if (cErr) { console.error(cErr); setMsg('No se pudo crear la reunión.'); return }
          m = created
        }

        setMeeting(m)
        setMeta(s => ({
          ...s,
          date: m.date,
          address: m.address || '',
          start_time: m.start_time || '',
          end_time: m.end_time || '',
          helper_name: m.helper_name || '',
        }))

        // Personas del grupo
        const { data: mems, error: memErr } = await supabase
          .from('memberships')
          .select('person:people(id, full_name, phone, email, age)')
          .eq('group_id', g.id)
          .order('id', { ascending: true })
        if (memErr) console.error(memErr)
        setMembers((mems || []).map(r => r.person).filter(Boolean))

        // Asistencia del día
        await refreshAttendance(m.id)
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, meta.date])

  async function refreshAttendance(meetingId) {
    const { data, error } = await supabase
      .from('attendance')
      .select('id, is_new, created_at, person_id, person:people(id, full_name, phone, email, age)')
      .eq('meeting_id', meetingId)
      .order('id', { ascending: true })
    if (error) { console.error(error); return }
    setTodayAtt((data || []).map(a => ({ ...a, person: a.person || {} })))
  }

  useEffect(() => {
    if (!meta.start_time || !meta.end_time) { setDuration({ text: '', ok: true, minutes: null }); return }
    const [sh, sm] = meta.start_time.split(':').map(Number)
    const [eh, em] = meta.end_time.split(':').map(Number)
    const start = sh * 60 + (sm || 0)
    const end = eh * 60 + (em || 0)
    if (end < start) {
      setDuration({ text: '⚠️ Fin es menor que inicio', ok: false, minutes: null })
    } else {
      const diff = end - start
      const h = Math.floor(diff / 60)
      const m = diff % 60
      setDuration({ text: `${h} h ${m} min`, ok: true, minutes: diff })
    }
  }, [meta.start_time, meta.end_time])

  async function saveMeetingMeta(e) {
    e?.preventDefault?.()
    setMeetingMsg('Guardando reunión...')
    try {
      let currentMeeting = meeting

      if (!currentMeeting?.id) {
        const { data: existing, error: findErr } = await supabase
          .from('meetings')
          .select('*')
          .eq('group_id', group?.id)
          .eq('date', meta.date)
          .maybeSingle()
        if (findErr) { console.error('FIND meeting err =>', findErr); setMeetingMsg('No se pudo consultar la reunión.'); return }
        if (existing) {
          currentMeeting = existing
          setMeeting(existing)
        } else {
          const { data: created, error: createErr } = await supabase
            .from('meetings')
            .insert({ group_id: group?.id, date: meta.date })
            .select()
            .single()
          if (createErr) { console.error('CREATE meeting err =>', createErr); setMeetingMsg('No se pudo crear la reunión.'); return }
          currentMeeting = created
          setMeeting(created)
        }
      }

      const payload = {
        address: meta.address || null,
        start_time: meta.start_time || null,
        end_time: meta.end_time || null,
        date: meta.date,
        helper_name: meta.helper_name || null,
        ...(Number.isInteger(duration.minutes) ? { duration_minutes: duration.minutes } : {})
      }

      const { data, error } = await supabase
        .from('meetings')
        .update(payload)
        .eq('id', currentMeeting.id)
        .select()
        .maybeSingle()

      if (error) {
        console.error('UPDATE meetings error =>', error)
        setMeetingMsg('No se pudo guardar la reunión. Revisa la consola.')
        return
      }

      let updated = data
      if (!updated) {
        const { data: refetched } = await supabase
          .from('meetings')
          .select('*')
          .eq('id', currentMeeting.id)
          .maybeSingle()
        updated = refetched
      }

      if (updated) {
        setMeeting(updated)
        setMeta(m => ({
          ...m,
          date: updated.date,
          address: updated.address || '',
          start_time: updated.start_time || '',
          end_time: updated.end_time || '',
          helper_name: updated.helper_name || ''
        }))
      }
      setMeetingMsg('✅ Reunión guardada correctamente.')
    } catch (err) {
      console.error('UNCAUGHT saveMeetingMeta =>', err)
      setMeetingMsg('Ocurrió un error inesperado al guardar.')
    }
  }

  async function markPresent(p) {
    if (!meeting?.id || !p?.id) return
    const { data: exists, error: exErr } = await supabase
      .from('attendance').select('id').eq('meeting_id', meeting.id).eq('person_id', p.id).limit(1)
    if (exErr) { console.error(exErr); setUiInfo('Error al verificar asistencia.'); return }
    if (exists && exists.length) { setUiInfo(`${p.full_name} ya está marcado presente.`); return }

    const { error } = await supabase
      .from('attendance').insert({ meeting_id: meeting.id, person_id: p.id, is_new: false })
    if (error) { console.error(error); setUiInfo('No se pudo marcar asistencia.'); return }
    await refreshAttendance(meeting.id)
    setUiInfo('Asistencia marcada.')
  }

  async function toggleIsNew(attId, current) {
    const { error } = await supabase.from('attendance').update({ is_new: !current }).eq('id', attId)
    if (error) { console.error(error); setUiInfo('No se pudo actualizar.'); return }
    await refreshAttendance(meeting.id)
    setUiInfo('Actualizado.')
  }

  async function deleteAttendance(attId) {
    if (!confirm('¿Eliminar esta marca de asistencia?')) return
    const { error } = await supabase.from('attendance').delete().eq('id', attId)
    if (error) { console.error(error); setUiInfo('No se pudo eliminar.'); return }
    await refreshAttendance(meeting.id)
    setUiInfo('Eliminado.')
  }

  // Eliminar reunión (borra asistencia del día y luego la reunión)
  async function deleteMeetingCascade(meetingId) {
    if (!meetingId) return
    if (!confirm('¿Eliminar la reunión completa y su asistencia? Esta acción no se puede deshacer.')) return
    try {
      // 1) borra asistencia del día
      const { error: aErr } = await supabase.from('attendance').delete().eq('meeting_id', meetingId)
      if (aErr) throw aErr
      // 2) borra reunión
      const { error: mErr } = await supabase.from('meetings').delete().eq('id', meetingId)
      if (mErr) throw mErr

      // si borramos la reunión actual, reseteamos panel del día
      if (meeting?.id === meetingId) {
        setMeeting(null)
        setTodayAtt([])
        setMeetingMsg('')
      }

      // refresca rango
      await loadAttendanceRange()
      setUiInfo('🗑️ Reunión eliminada.')
    } catch (e) {
      console.error('deleteMeetingCascade', e)
      setUiInfo('No se pudo eliminar la reunión (revisa políticas RLS).')
    }
  }

  // RPC persona + membresía + asistencia
  async function addVisitor(e) {
    e?.preventDefault?.()
    if (!meeting?.id || !group?.id) return

    const full_name = addForm.full_name.trim()
    if (!full_name) { setUiInfo('El nombre es requerido'); return }

    const { error } = await supabase.rpc('add_person_to_group', {
      p_group_id: group.id,
      p_full_name: full_name,
      p_age: addForm.age ? Number(addForm.age) : null,
      p_email: addForm.email || null,
      p_phone: addForm.phone || null,
      p_is_new: !!addForm.is_new,
      p_meeting_id: meeting.id
    })

    if (error) { console.error(error); setUiInfo('No se pudo agregar a la persona.'); return }

    // refresca miembros y asistencia
    const { data: mems } = await supabase
      .from('memberships')
      .select('person:people(id, full_name, phone, email, age)')
      .eq('group_id', group.id)
      .order('id', { ascending: true })
    setMembers((mems || []).map(r => r.person).filter(Boolean))
    await refreshAttendance(meeting.id)

    setAddForm({ full_name: '', age: '', email: '', phone: '', is_new: true })
    setUiInfo('👋 Visitante agregado y marcado presente.')
  }

  function openEditPerson(p) {
    setEditingPerson({ id: p.id, full_name: p.full_name || '', age: p.age || '', phone: p.phone || '', email: p.email || '' })
  }

  async function savePerson() {
    const p = editingPerson
    if (!p?.id) return
    const payload = {
      full_name: p.full_name.trim(),
      age: p.age === '' ? null : Number(p.age),
      phone: p.phone || null,
      email: p.email || null,
    }
    const { error } = await supabase.from('people').update(payload).eq('id', p.id)
    if (error) { console.error(error); setUiInfo('No se pudo guardar la persona.'); return }
    setEditingPerson(null)
    setMembers(ms => ms.map(m => (m.id === p.id ? { ...m, ...payload } : m)))
    await refreshAttendance(meeting.id)
    setUiInfo('✅ Persona actualizada.')
  }

  async function deletePerson(personId) {
    if (!confirm('¿Eliminar esta persona del grupo y su asistencia de hoy?')) return
    await supabase.from('attendance').delete().eq('meeting_id', meeting.id).eq('person_id', personId)
    await supabase.from('memberships').delete().eq('group_id', group.id).eq('person_id', personId)
    setMembers(ms => ms.filter(m => m.id !== personId))
    await refreshAttendance(meeting.id)
    setUiInfo('🗑️ Persona eliminada del grupo y asistencia actual.')
  }

  const filtered = useMemo(() => {
    const q = (search || '').toLowerCase().trim()
    if (!q) return members
    return members.filter(p => (p.full_name || '').toLowerCase().includes(q))
  }, [members, search])

  // ===== Bethel =====
  async function openBethelModal() {
    setBethelUi('')
    setProspects([])
    setSelectedBethelId('')
    setBethelDate(getLocalYYYYMMDD())
    setProspectForm({ full_name: '', age: '', phone: '', address: '' })
    setBethelModalOpen(true)

    const { data, error } = await supabase.from('bethels').select('id, name').order('name', { ascending: true })
    if (error) { console.error(error); setBethelUi('No se pudieron cargar los Bethels.'); return }
    setBethels(data || [])
  }

  async function loadProspects(bethelId) {
    if (!bethelId) { setProspects([]); return }
    const { data, error } = await supabase
      .from('bethel_prospects')
      .select('id, full_name, age, phone, address, status')
      .eq('bethel_id', bethelId)
      .order('created_at', { ascending: false })
    if (error) { console.error(error); setBethelUi('No se pudieron cargar los prospectos.'); return }
    setProspects(data || [])
  }

  async function handleSelectBethel(e) {
    const id = e.target.value
    setSelectedBethelId(id)
    setBethelUi('')
    await loadProspects(id)
  }

  async function addProspect(e) {
    e?.preventDefault?.()
    if (!selectedBethelId) { setBethelUi('Selecciona un Bethel primero.'); return }
    const full_name = prospectForm.full_name.trim()
    if (!full_name) { setBethelUi('El nombre es requerido.'); return }

    const payload = {
      bethel_id: selectedBethelId,
      full_name,
      age: prospectForm.age ? Number(prospectForm.age) : null,
      phone: prospectForm.phone || null,
      address: prospectForm.address || null,
      status: 'prospecto',
    }

    const { error } = await supabase.from('bethel_prospects').insert(payload)
    if (error) { console.error(error); setBethelUi('No se pudo agregar el prospecto.'); return }

    setProspectForm({ full_name: '', age: '', phone: '', address: '' })
    setBethelUi('✅ Prospecto agregado.')
    await loadProspects(selectedBethelId)
  }

  async function markBethelAttendance(p) {
    if (!selectedBethelId) { setBethelUi('Selecciona un Bethel.'); return }
    if (!p?.id) return

    try {
      const { error } = await supabase.rpc('mark_bethel_attendance', {
        p_bethel_id: selectedBethelId,
        p_prospect_id: p.id,
        p_date: bethelDate
      })
      if (error) throw error
      setBethelUi(`🙌 Asistencia registrada para ${p.full_name}.`)
      await loadProspects(selectedBethelId)
    } catch (e) {
      console.error(e)
      setBethelUi('No se pudo registrar la asistencia. Revisa políticas RLS y tipos.')
    }
  }

  // ===== Rango: cargar por fecha (agrupado) =====
  async function loadAttendanceRange() {
    if (!group?.id) return
    setRangeLoading(true)
    try {
      // 1) Reuniones del grupo en el rango
      const { data: meetingsInRange, error: mErr } = await supabase
        .from('meetings')
        .select('id, date')
        .eq('group_id', group.id)
        .gte('date', rangeFrom)
        .lte('date', rangeTo)
        .order('date', { ascending: true })
      if (mErr) throw mErr

      if (!meetingsInRange || meetingsInRange.length === 0) {
        setRangeDays([])
        setExpandedMeetingId(null)
        return
      }
      const meetingIds = meetingsInRange.map(m => m.id)
      const dateByMeeting = new Map(meetingsInRange.map(m => [m.id, m.date]))

      // 2) Asistencia con nombres
      const { data: att, error: aErr } = await supabase
        .from('attendance')
        .select('id, meeting_id, is_new, person:people(id, full_name)')
        .in('meeting_id', meetingIds)
        .order('id', { ascending: true })
      if (aErr) throw aErr

      // 3) Agrupar por reunión
      const bucket = new Map() // meeting_id -> { total, nuevos, rows: [] }
      for (const a of (att || [])) {
        const mid = a.meeting_id
        if (!bucket.has(mid)) bucket.set(mid, { total: 0, nuevos: 0, rows: [] })
        const b = bucket.get(mid)
        b.total++
        if (a.is_new) b.nuevos++
        b.rows.push({
          att_id: a.id,
          person_name: a.person?.full_name || '—',
          is_new: !!a.is_new,
        })
      }

      const days = meetingsInRange.map(m => {
        const rec = bucket.get(m.id) || { total: 0, nuevos: 0, rows: [] }
        // ordenar nombres
        rec.rows.sort((x, y) => x.person_name.localeCompare(y.person_name))
        return {
          meeting_id: m.id,
          date: dateByMeeting.get(m.id) || m.date,
          total: rec.total,
          nuevos: rec.nuevos,
          rows: rec.rows
        }
      })

      setRangeDays(days)
      if (!days.find(d => d.meeting_id === expandedMeetingId)) {
        setExpandedMeetingId(null)
      }
    } catch (e) {
      console.error('loadAttendanceRange', e)
      setUiInfo('No se pudo cargar la asistencia por rango. Revisa la consola.')
    } finally {
      setRangeLoading(false)
    }
  }

  // Acciones sobre filas del rango (modificación cross-fecha)
  async function rangeToggleIsNew(attId, current) {
    const { error } = await supabase.from('attendance').update({ is_new: !current }).eq('id', attId)
    if (error) { console.error(error); setUiInfo('No se pudo actualizar.'); return }
    await loadAttendanceRange()
    setUiInfo('Actualizado.')
  }
  async function rangeDeleteAttendance(attId) {
    if (!confirm('¿Eliminar esta marca de asistencia?')) return
    const { error } = await supabase.from('attendance').delete().eq('id', attId)
    if (error) { console.error(error); setUiInfo('No se pudo eliminar.'); return }
    await loadAttendanceRange()
    setUiInfo('Eliminado.')
  }

  // Carga automática del mes actual al tener grupo
  useEffect(() => {
    if (group?.id) loadAttendanceRange()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id])

  return (
    <RequireAuth>
      <div className="lh-page">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-inner">
            <div className="leader">
              <Avatar name={leaderName} />
              <div>
                <div className="leader-role">Líder</div>
                <div className="leader-name">{leaderName}</div>
              </div>
            </div>
            <div className="top-actions">
              <Button variant="success" onClick={openBethelModal}>
                Asistencia Bethel
              </Button>
              <Link to="/dashboard" className="hide-sm">
                <Button variant="secondary">Dashboard</Button>
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>

        {/* Header grupo */}
        <div className="container">
          <div className="hero">
            <div className="hero-left">
              <div className="hero-sub">Mi grupo</div>
              <h1 className="hero-title">{group ? group.name : 'Cargando grupo…'}</h1>
            </div>
            <div className="hero-badges">
              <Badge color="green">{meta.date}</Badge>
              <Badge color="blue">{todayAtt.length} presentes</Badge>
              <Badge color="amber">{members.length} personas</Badge>
            </div>
          </div>
        </div>

        {/* alerts globales */}
        <div className="container">
          {msg && <div className="alert alert-rose">{msg}</div>}
          {uiInfo && <div className="alert alert-blue">{uiInfo}</div>}
        </div>

        {/* contenido */}
        <div className="container pb-10">
          {/* KPIs */}
          <div className="kpi-grid">
            <Stat label="Miembros" value={members.length} />
            <Stat label="Asistencia de hoy" value={todayAtt.length} />
            <Stat label="Duración" value={duration.text || '—'} hint={!duration.ok ? 'Revisa horas' : ''} />
          </div>

          {loading ? (
            <Card>
              <div className="skeleton">
                <div className="sk w33" />
                <div className="sk h10" />
                <div className="sk h10" />
              </div>
            </Card>
          ) : (
            <>
              {/* Datos de la reunión */}
              <Card title="Datos de la reunión" description="Completa los detalles antes de registrar asistencia.">
                <form onSubmit={saveMeetingMeta} className="grid grid-6 gap-4">
                  <div className="col-2">
                    <label className="label">Líder</label>
                    <input className="input input-muted" value={meta.leader_name} readOnly />
                  </div>
                  <div className="col-2">
                    <label className="label">Ayudante (Timoteo)</label>
                    <input
                      className="input"
                      placeholder="Nombre del Timoteo"
                      value={meta.helper_name}
                      onChange={e => setMeta(m => ({ ...m, helper_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="label">Fecha</label>
                    <input
                      type="date"
                      className="input"
                      value={meta.date}
                      onChange={e => setMeta(m => ({ ...m, date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="label">Hora inicio</label>
                    <input
                      type="time"
                      className="input"
                      value={meta.start_time}
                      onChange={e => setMeta(m => ({ ...m, start_time: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="label">Hora fin</label>
                    <input
                      type="time"
                      className="input"
                      value={meta.end_time}
                      onChange={e => setMeta(m => ({ ...m, end_time: e.target.value }))}
                    />
                  </div>
                  <div className="col-3">
                    <label className="label">Dirección</label>
                    <input
                      className="input"
                      placeholder="Ej. Calle 123, Barrio..."
                      value={meta.address}
                      onChange={e => setMeta(m => ({ ...m, address: e.target.value }))}
                    />
                  </div>

                  <div className="col-6 text-muted">
                    <span className={duration.ok ? '' : 'text-danger'}>
                      Duración: {duration.text || '—'}
                    </span>
                  </div>

                  <div className="col-6">
                    <Button type="submit">Guardar reunión</Button>
                    {meetingMsg && (
                      <div className="mt-2 text-sm" style={{opacity:0.9}}>
                        {meetingMsg}
                      </div>
                    )}
                  </div>
                </form>
              </Card>

              <div className="split-grid">
                {/* Agregar persona / visitante */}
                <Card title="Agregar persona / visitante">
                  <form onSubmit={addVisitor} className="grid gap-3">
                    <input
                      className="input input-success"
                      placeholder="Nombre completo *"
                      value={addForm.full_name}
                      onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))}
                      required
                    />
                    <div className="grid grid-3 gap-3">
                      <input
                        className="input input-success"
                        placeholder="Edad"
                        value={addForm.age}
                        onChange={e => setAddForm(f => ({ ...f, age: e.target.value.replace(/\D/g,'') }))}
                        inputMode="numeric"
                      />
                      <input
                        className="input input-success"
                        placeholder="Teléfono"
                        value={addForm.phone}
                        onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                      />
                      <input
                        className="input input-success"
                        placeholder="Correo"
                        type="email"
                        value={addForm.email}
                        onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                      />
                    </div>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={addForm.is_new}
                        onChange={e => setAddForm(f => ({ ...f, is_new: e.target.checked }))}
                      />
                      ¿Es nuevo?
                    </label>
                    <div className="row gap-2">
                      <Button variant="success" type="submit">Guardar y marcar presente</Button>
                      <Button variant="secondary" type="button" onClick={()=>setAddForm({ full_name:'', age:'', email:'', phone:'', is_new:true })}>Limpiar</Button>
                    </div>
                  </form>
                </Card>

                {/* Personas del grupo */}
                <Card title="Personas del grupo" description="Busca, marca presente o edita datos.">
                  <input
                    className="input mb-3"
                    placeholder="Buscar persona…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {filtered.length === 0 ? (
                    <p className="muted">No hay personas registradas aún.</p>
                  ) : (
                    <ul className="list">
                      {filtered.map(p => (
                        <li key={p.id} className="list-row">
                          <div className="list-col">
                            <div className="list-title">{p.full_name}</div>
                            <div className="list-meta">
                              {typeof p.age === 'number' && <Badge>{p.age} años</Badge>}
                              {p.phone && <span>{p.phone}</span>}
                              {p.email && <span>{p.email}</span>}
                            </div>
                          </div>
                          <div className="row gap-2">
                            <Button variant="success" onClick={() => markPresent(p)}>Presente</Button>
                            <Button variant="warning" onClick={() => openEditPerson(p)}>Editar</Button>
                            <Button variant="danger" onClick={() => deletePerson(p.id)}>Eliminar</Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>

              {/* Asistencia del día */}
              <Card className="mt-6" title={`Asistencia (${meta.date})`}>
                {todayAtt.length === 0 ? (
                  <p className="muted">Aún no hay asistencia registrada.</p>
                ) : (
                  <ul className="list">
                    {todayAtt.map(a => (
                      <li key={a.id} className="list-row">
                        <div className="list-col">
                          <div className="list-title">{a.person.full_name}</div>
                          <div className="list-meta">
                            {typeof a.person.age === 'number' && <Badge>{a.person.age} años</Badge>}
                            {a.person.phone && <span>{a.person.phone}</span>}
                            {a.person.email && <span>{a.person.email}</span>}
                            {a.is_new && <Badge color="green">Nuevo</Badge>}
                          </div>
                        </div>
                        <div className="row gap-2">
                          <Button variant="ghost" onClick={() => toggleIsNew(a.id, a.is_new)}>
                            {a.is_new ? 'Marcar como recurrente' : 'Marcar como nuevo'}
                          </Button>
                          <Button variant="danger" onClick={() => deleteAttendance(a.id)}>Eliminar</Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* ===== Rango de fechas: tabla "cool" con expandible ===== */}
              <Card className="mt-6" title="Asistencia por rango de fechas" description="Selecciona el rango, luego haz clic en una fecha para ver o editar su asistencia.">
                <div className="grid grid-6 gap-3">
                  <div>
                    <label className="label">Desde</label>
                    <input type="date" className="input" value={rangeFrom} onChange={e=>setRangeFrom(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Hasta</label>
                    <input type="date" className="input" value={rangeTo} onChange={e=>setRangeTo(e.target.value)} />
                  </div>
                  <div className="col-2 flex items-end">
                    <Button onClick={loadAttendanceRange} disabled={rangeLoading}>
                      {rangeLoading ? 'Buscando…' : 'Buscar'}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 table-wrapper">
                  {rangeLoading ? (
                    <div className="skeleton">
                      <div className="sk w66" />
                      <div className="sk h10" />
                      <div className="sk h10" />
                    </div>
                  ) : rangeDays.length === 0 ? (
                    <p className="muted">Sin resultados. Elige un rango y presiona “Buscar”.</p>
                  ) : (
                    <div className="table table-cool">
                      <div className="table-row table-head sticky">
                        <div className="table-col w-40">Fecha</div>
                        <div className="table-col w-20">Presentes</div>
                        <div className="table-col w-20">Nuevos</div>
                        <div className="table-col w-20">Acciones</div>
                      </div>

                      {rangeDays.map(d => {
                        const isOpen = expandedMeetingId === d.meeting_id
                        return (
                          <div key={d.meeting_id} className={`table-group ${isOpen ? 'open' : ''}`}>
                            {/* Fila principal (fecha) */}
                            <div
                              className={`table-row hoverable`}
                              onClick={() => setExpandedMeetingId(isOpen ? null : d.meeting_id)}
                              role="button"
                              aria-expanded={isOpen}
                              tabIndex={0}
                              onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); setExpandedMeetingId(isOpen?null:d.meeting_id)} }}
                            >
                              <div className="table-col w-40">
                                <Caret open={isOpen} /> <strong>{d.date}</strong>
                              </div>
                              <div className="table-col w-20">
                                <Badge color="blue">{d.total}</Badge>
                              </div>
                              <div className="table-col w-20">
                                {d.nuevos ? <Badge color="green">{d.nuevos}</Badge> : <Badge>0</Badge>}
                              </div>
                              <div className="table-col w-20 actions" onClick={e=>e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  onClick={() => setExpandedMeetingId(isOpen ? null : d.meeting_id)}
                                >
                                  {isOpen ? 'Ocultar' : 'Ver asistencia'}
                                </Button>
                                <Button
                                  variant="danger"
                                  onClick={() => deleteMeetingCascade(d.meeting_id)}
                                >
                                  Eliminar reunión
                                </Button>
                              </div>
                            </div>

                            {/* Panel expandible */}
                            {isOpen && (
                              <div className="table-subrow">
                                <div className="subrow-head">
                                  <div>
                                    <strong>Asistencia total del día seleccionado:</strong>{' '}
                                    {d.total} {d.total === 1 ? 'persona' : 'personas'}
                                    {d.nuevos ? ` — Nuevos: ${d.nuevos}` : ''}
                                  </div>
                                  <div className="subrow-actions">
                                    <Button variant="danger" onClick={() => deleteMeetingCascade(d.meeting_id)}>
                                      Eliminar reunión
                                    </Button>
                                  </div>
                                </div>

                                {/* Subtabla de asistentes */}
                                <div className="table compact">
                                  <div className="table-row table-head">
                                    <div className="table-col">Nombre</div>
                                    <div className="table-col w-20">Nuevo</div>
                                    <div className="table-col w-30">Acciones</div>
                                  </div>
                                  {d.rows.length === 0 ? (
                                    <div className="table-row">
                                      <div className="table-col col-6">
                                        <span className="muted">No hay asistentes en esta reunión.</span>
                                      </div>
                                    </div>
                                  ) : d.rows.map(r => (
                                    <div key={r.att_id} className="table-row hoverable">
                                      <div className="table-col">{r.person_name}</div>
                                      <div className="table-col w-20">
                                        {r.is_new ? <Badge color="green">Sí</Badge> : <Badge>—</Badge>}
                                      </div>
                                      <div className="table-col w-30">
                                        <div className="row gap-2">
                                          <Button variant="ghost" onClick={()=>rangeToggleIsNew(r.att_id, r.is_new)}>
                                            {r.is_new ? 'Marcar recurrente' : 'Marcar nuevo'}
                                          </Button>
                                          <Button variant="danger" onClick={()=>rangeDeleteAttendance(r.att_id)}>
                                            Eliminar
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </Card>

              {/* Modal editar persona */}
              {editingPerson && (
                <div className="modal-backdrop" role="dialog" aria-modal="true">
                  <div className="modal">
                    <div className="card-head">
                      <h3 className="card-title">Editar persona</h3>
                    </div>
                    <div className="card-body">
                      <div className="grid gap-3">
                        <input className="input"
                          value={editingPerson.full_name}
                          onChange={e => setEditingPerson(p => ({ ...p, full_name: e.target.value }))} />
                        <input className="input"
                          placeholder="Edad" inputMode="numeric"
                          value={editingPerson.age ?? ''}
                          onChange={e => setEditingPerson(p => ({ ...p, age: e.target.value.replace(/\D/g,'') }))} />
                        <input className="input"
                          placeholder="Teléfono"
                          value={editingPerson.phone ?? ''}
                          onChange={e => setEditingPerson(p => ({ ...p, phone: e.target.value }))} />
                        <input className="input"
                          placeholder="Correo" type="email"
                          value={editingPerson.email ?? ''}
                          onChange={e => setEditingPerson(p => ({ ...p, email: e.target.value }))} />
                      </div>
                      <div className="row end gap-2 mt-5">
                        <Button variant="secondary" onClick={() => setEditingPerson(null)}>Cancelar</Button>
                        <Button onClick={savePerson}>Guardar</Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Asistencia Bethel */}
              {bethelModalOpen && (
                <div className="modal-backdrop" role="dialog" aria-modal="true">
                  <div className="modal modal-lg">
                    <div className="card-head">
                      <h3 className="card-title">Asistencia al Bethel</h3>
                    </div>
                    <div className="card-body">
                      <div className="grid grid-50 gap-3">
                        <div className="col-12">
                          <label className="label">Bethel</label>
                          <select className="input"
                                  value={selectedBethelId}
                                  onChange={handleSelectBethel}>
                            <option value="">-- Selecciona --</option>
                            {bethels.map(b => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="label">Fecha</label>
                          <input type="date" className="input" value={bethelDate} onChange={e=>setBethelDate(e.target.value)} />
                        </div>
                        <div className="col-12">
                          {bethelUi && <div className="alert alert-blue">{bethelUi}</div>}
                        </div>
                      </div>

                      <div className="split-grid mt-6">
                        <Card title="Registrar prospecto" description="Se guardará con estado 'prospecto'.">
                          <form onSubmit={addProspect} className="grid gap-3">
                            <input className="input" placeholder="Nombre completo *"
                                   value={prospectForm.full_name}
                                   onChange={e=>setProspectForm(f=>({...f, full_name: e.target.value}))} required />
                            <div className="grid grid-4 gap-4">
                              <input className="input" placeholder="Edad" inputMode="numeric"
                                     value={prospectForm.age}
                                     onChange={e=>setProspectForm(f=>({...f, age: e.target.value.replace(/\D/g,'')}))}/>
                              <input className="input" placeholder="Teléfono"
                                     value={prospectForm.phone}
                                     onChange={e=>setProspectForm(f=>({...f, phone: e.target.value}))}/>
                              <input className="input" placeholder="Dirección"
                                     value={prospectForm.address}
                                     onChange={e=>setProspectForm(f=>({...f, address: e.target.value}))}/>
                            </div>
                            <div className="row gap-12">
                              <Button type="submit" variant="success">Guardar prospecto</Button>
                             
                            </div>
                          </form>
                        </Card>

                        <Card title="Prospectos" description="Marca asistencia para los que asistieron.">
                          {!selectedBethelId ? (
                            <p className="muted">Selecciona un Bethel para ver la lista.</p>
                          ) : prospects.length === 0 ? (
                            <p className="muted">No hay prospectos registrados aún.</p>
                          ) : (
                            <ul className="list">
                              {prospects.map(p => (
                                <li key={p.id} className="list-row">
                                  <div className="list-col">
                                    <div className="list-title">{p.full_name}</div>
                                    <div className="list-meta">
                                      {typeof p.age === 'number' && <Badge>{p.full_name} años</Badge>}
                                       {p.age && <span>{p.age}</span>}
                                      {p.phone && <span>{p.phone}</span>}
                                      {p.address && <span>{p.address}</span>}
                                      <Badge color={p.status === 'asistio' ? 'green' : 'amber'}>
                                        {p.status}
                                      </Badge>
                                       <Button variant="success" onClick={() => markBethelAttendance(p)}>
                                      Marcar asistencia
                                    </Button>
                                    </div>
                                  </div>
                                  <Anen1428@</Anen1428>
                                </li>
                              ))}
                            </ul>
                          )}
                        </Card>
                      </div>
                    </div>
                    <div className="card-foot row end gap-2">
                      <Button variant="secondary" onClick={()=>setBethelModalOpen(false)}>Cerrar</Button>
                    </div>
                  </div>
                </div>
              )}
              {/* FIN MODAL */}
            </>
          )}
        </div>
      </div>
    </RequireAuth>
  )
}
