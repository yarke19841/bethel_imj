// src/pages/LeaderHome.jsx
import RequireAuth from '../components/RequireAuth'
import LogoutButton from '../components/LogoutButton'
import { useAuth } from '../context/AuthContext'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'

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

  // Metadatos de la reunión
  const [meta, setMeta] = useState({
    date: new Date().toISOString().slice(0, 10),
    address: '',
    start_time: '',
    end_time: '',
    leader_name: '', // solo visual (read-only), útil para informes
  })

  // Duración calculada (hh:mm)
  const [duration, setDuration] = useState({ text: '', ok: true })

  // Form agregar visitante
  const [addForm, setAddForm] = useState({
    full_name: '',
    age: '',
    email: '',
    phone: '',
    is_new: true,
  })

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => {
    setMeta(m => ({ ...m, leader_name: leaderName }))
  }, [leaderName])

  useEffect(() => {
    if (!userId) return
    ;(async () => {
      setLoading(true); setMsg('')
      // 1) Grupo del líder
      const { data: g, error: gErr } = await supabase
        .from('groups').select('*').eq('leader_user_id', userId).maybeSingle()
      if (gErr) { console.error(gErr); setMsg('No se pudo cargar el grupo.'); setLoading(false); return }
      if (!g) { setMsg('Aún no tienes un grupo asignado. Contacta al administrador.'); setLoading(false); return }
      setGroup(g)

      // 2) Reunión por fecha seleccionada (crear si no existe)
      let { data: m, error: mErr } = await supabase
        .from('meetings')
        .select('*')
        .eq('group_id', g.id)
        .eq('date', meta.date)
        .maybeSingle()
      if (mErr) { console.error(mErr); setMsg('No se pudo consultar la reunión.'); setLoading(false); return }
      if (!m) {
        const { data: created, error: cErr } = await supabase
          .from('meetings').insert({ group_id: g.id, date: meta.date }).select().single()
        if (cErr) { console.error(cErr); setMsg('No se pudo crear la reunión.'); setLoading(false); return }
        m = created
      }
      setMeeting(m)
      setMeta(s => ({
        ...s,
        date: m.date,
        address: m.address || '',
        start_time: m.start_time || '',
        end_time: m.end_time || '',
      }))

      // 3) Miembros
      const { data: mems, error: memErr } = await supabase
        .from('memberships')
        .select('person:people(id, full_name, phone, email, age)')
        .eq('group_id', g.id)
        .order('id', { ascending: true })
      if (memErr) console.error(memErr)
      setMembers((mems || []).map(r => r.person).filter(Boolean))

      // 4) Asistencia del día
      await refreshAttendance(m.id)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, meta.date])

  async function refreshAttendance(meetingId) {
    const { data, error } = await supabase
      .from('attendance')
      .select('id, is_new, created_at, person:people(id, full_name, phone, email, age)')
      .eq('meeting_id', meetingId)
      .order('id', { ascending: true })
    if (error) { console.error(error); return }
    setTodayAtt((data || []).map(a => ({ ...a, person: a.person || {} })))
  }

  // Calcula duración cuando cambian horas
  useEffect(() => {
    if (!meta.start_time || !meta.end_time) { setDuration({ text: '', ok: true }); return }
    const [sh, sm] = meta.start_time.split(':').map(Number)
    const [eh, em] = meta.end_time.split(':').map(Number)
    const start = sh * 60 + (sm || 0)
    const end = eh * 60 + (em || 0)
    if (end < start) {
      setDuration({ text: '⚠️ Hora fin es menor que inicio', ok: false })
    } else {
      const diff = end - start
      const h = Math.floor(diff / 60)
      const m = diff % 60
      setDuration({ text: `${h} h ${m} min`, ok: true })
    }
  }, [meta.start_time, meta.end_time])

  async function saveMeetingMeta(e) {
    e?.preventDefault?.()
    if (!meeting?.id) return
    const payload = {
      address: meta.address || null,
      start_time: meta.start_time || null,
      end_time: meta.end_time || null,
      date: meta.date,
      // Si quieres guardar el nombre del líder en la fila (no es necesario):
      // leader_name: meta.leader_name
    }
    const { error } = await supabase.from('meetings').update(payload).eq('id', meeting.id)
    if (error) { console.error(error); alert('No se pudo guardar la reunión.'); return }
    alert('Reunión guardada.')
  }

  async function markPresent(p) {
    if (!meeting?.id || !p?.id) return
    const { data: exists } = await supabase
      .from('attendance').select('id').eq('meeting_id', meeting.id).eq('person_id', p.id).limit(1)
    if (exists && exists.length) { alert(`${p.full_name} ya está marcado presente.`); return }
    const { error } = await supabase
      .from('attendance').insert({ meeting_id: meeting.id, person_id: p.id, is_new: false })
    if (error) { console.error(error); alert('No se pudo marcar asistencia.'); return }
    await refreshAttendance(meeting.id)
  }

  async function addVisitor(e) {
    e?.preventDefault?.()
    if (!meeting?.id || !group?.id) return
    const full_name = addForm.full_name.trim()
    if (!full_name) { alert('El nombre es requerido'); return }

    const { data: person, error: pErr } = await supabase
      .from('people')
      .insert({
        full_name,
        age: addForm.age ? Number(addForm.age) : null,
        email: addForm.email || null,
        phone: addForm.phone || null,
        first_visit_date: meta.date
      })
      .select().single()
    if (pErr) { console.error(pErr); alert('No se pudo crear la persona.'); return }

    const { error: aErr } = await supabase
      .from('attendance')
      .insert({ meeting_id: meeting.id, person_id: person.id, is_new: !!addForm.is_new })
    if (aErr) { console.error(aErr); alert('No se pudo marcar asistencia.'); return }

    const { error: mErr } = await supabase
      .from('memberships')
      .insert({ group_id: group.id, person_id: person.id, is_member: true })
    if (mErr) console.warn('MEMBERSHIP_WARN', mErr)

    setAddForm({ full_name: '', age: '', email: '', phone: '', is_new: true })
    setMembers(prev => [{ id: person.id, full_name: person.full_name, email: person.email, phone: person.phone, age: person.age }, ...prev])
    await refreshAttendance(meeting.id)
  }

  const filtered = useMemo(() => {
    const q = (search || '').toLowerCase().trim()
    if (!q) return members
    return members.filter(p => (p.full_name || '').toLowerCase().includes(q))
  }, [members, search])

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto bg-white rounded-xl shadow p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold">{group ? group.name : 'Mi Grupo'}</h1>
              <p className="text-sm text-gray-600">
                Líder: <strong>{leaderName}</strong>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/dashboard" className="px-3 py-2 rounded bg-gray-200">Dashboard</Link>
              <LogoutButton />
            </div>
          </div>

          {msg && <div className="mb-4 text-red-600 text-sm">{msg}</div>}

          {loading ? (
            <div>Cargando…</div>
          ) : (
            <>
              {/* Metadatos de la reunión */}
              <div className="p-4 rounded-xl bg-gray-50 shadow mb-6">
                <h2 className="font-semibold mb-3">Datos de la reunión</h2>
                <form onSubmit={saveMeetingMeta} className="grid md:grid-cols-5 gap-3">
                  {/* NOMBRE DEL LÍDER (solo lectura) */}
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-600 mb-1">Líder</label>
                    <input
                      className="border rounded p-2 w-full bg-gray-100"
                      value={meta.leader_name}
                      readOnly
                    />
                  </div>
                  {/* FECHA = CALENDARIO */}
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Fecha</label>
                    <input
                      type="date"
                      className="border rounded p-2 w-full"
                      value={meta.date}
                      onChange={e => setMeta(m => ({ ...m, date: e.target.value }))}
                    />
                  </div>
                  {/* HORAS */}
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Hora inicio</label>
                    <input
                      type="time"
                      className="border rounded p-2 w-full"
                      value={meta.start_time}
                      onChange={e => setMeta(m => ({ ...m, start_time: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Hora fin</label>
                    <input
                      type="time"
                      className="border rounded p-2 w-full"
                      value={meta.end_time}
                      onChange={e => setMeta(m => ({ ...m, end_time: e.target.value }))}
                    />
                  </div>
                  {/* DIRECCIÓN */}
                  <div className="col-span-5">
                    <label className="block text-sm text-gray-600 mb-1">Dirección</label>
                    <input
                      className="border rounded p-2 w-full"
                      placeholder="Ej. Calle 123, Barrio..."
                      value={meta.address}
                      onChange={e => setMeta(m => ({ ...m, address: e.target.value }))}
                    />
                  </div>

                  {/* DURACIÓN CALCULADA */}
                  <div className="col-span-5 text-sm">
                    <span className={duration.ok ? 'text-gray-600' : 'text-red-600'}>
                      Duración: {duration.text || '—'}
                    </span>
                  </div>

                  <div className="col-span-5">
                    <button className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">
                      Guardar reunión
                    </button>
                  </div>
                </form>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Agregar persona / visitante */}
                <div className="p-4 rounded-xl bg-gray-50 shadow">
                  <h2 className="font-semibold mb-3">Agregar persona / visitante</h2>
                  <form onSubmit={addVisitor} className="grid gap-3">
                    <input
                      className="border rounded p-2"
                      placeholder="Nombre completo *"
                      value={addForm.full_name}
                      onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))}
                      required
                    />
                    <div className="grid grid-cols-3 gap-3">
                      <input
                        className="border rounded p-2"
                        placeholder="Edad"
                        value={addForm.age}
                        onChange={e => setAddForm(f => ({ ...f, age: e.target.value.replace(/\D/g,'') }))}
                        inputMode="numeric"
                      />
                      <input
                        className="border rounded p-2"
                        placeholder="Teléfono"
                        value={addForm.phone}
                        onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                      />
                      <input
                        className="border rounded p-2"
                        placeholder="Correo"
                        type="email"
                        value={addForm.email}
                        onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                      />
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={addForm.is_new}
                        onChange={e => setAddForm(f => ({ ...f, is_new: e.target.checked }))}
                      />
                      ¿Es nuevo?
                    </label>
                    <button className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700">
                      Guardar y marcar presente
                    </button>
                  </form>
                </div>

                {/* Personas del grupo */}
                <div className="p-4 rounded-xl bg-gray-50 shadow">
                  <h2 className="font-semibold mb-3">Personas del grupo</h2>
                  <input
                    className="border rounded p-2 w-full mb-3"
                    placeholder="Buscar persona…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {filtered.length === 0 ? (
                    <p className="text-sm text-gray-500">No hay personas registradas aún.</p>
                  ) : (
                    <ul className="divide-y">
                      {filtered.map(p => (
                        <li key={p.id} className="py-2 flex items-center justify-between">
                          <div>
                            <strong>{p.full_name}</strong>
                            {typeof p.age === 'number' && <span className="ml-2 text-sm text-gray-600">• {p.age} años</span>}
                            {p.phone && <span className="ml-2 text-sm text-gray-600">• {p.phone}</span>}
                            {p.email && <span className="ml-2 text-sm text-gray-600">• {p.email}</span>}
                          </div>
                          <button
                            onClick={() => markPresent(p)}
                            className="px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            Marcar presente
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Asistencia del día */}
              <div className="mt-6 p-4 rounded-xl bg-gray-50 shadow">
                <h2 className="font-semibold mb-3">Asistencia ({meta.date})</h2>
                {todayAtt.length === 0 ? (
                  <p className="text-sm text-gray-500">Aún no hay asistencia registrada.</p>
                ) : (
                  <ul className="divide-y">
                    {todayAtt.map(a => (
                      <li key={a.id} className="py-2 flex items-center justify-between">
                        <div>
                          <strong>{a.person.full_name}</strong>
                          {typeof a.person.age === 'number' && <span className="ml-2 text-sm text-gray-600">• {a.person.age} años</span>}
                          {a.person.phone && <span className="ml-2 text-sm text-gray-600">• {a.person.phone}</span>}
                          {a.person.email && <span className="ml-2 text-sm text-gray-600">• {a.person.email}</span>}
                          {a.is_new && <span className="ml-2 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded">Nuevo</span>}
                        </div>
                        <small className="text-gray-500">
                          {new Date(a.created_at).toLocaleTimeString()}
                        </small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </RequireAuth>
  )
}
