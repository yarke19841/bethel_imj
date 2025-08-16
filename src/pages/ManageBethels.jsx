// src/pages/ManageBethels.jsx
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import RequireAuth from '../components/RequireAuth'
import LogoutButton from '../components/LogoutButton'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import './ManageBethels.css'

function cx(...xs){ return xs.filter(Boolean).join(' ') }

const GROUPS = [
  { value: 'women', label: 'Mujeres' },
  { value: 'men', label: 'Varones' },
]
const ROLES_SINGLE = [
  { value: 'coordinator', label: 'Coordinador/a' },
  { value: 'spiritual_guide', label: 'Guía espiritual' },
]

/* ========== Buscador opcional por NOMBRE (profiles) ========== */
function PersonPicker({ value, onChange, placeholder = 'Buscar persona por nombre…' }) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    if ((q || '').trim().length < 2) { setItems([]); return }
    setLoading(true)
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .ilike('full_name', `%${q.trim()}%`)
        .order('full_name', { ascending: true })
        .limit(12)
      if (!error) setItems(data || [])
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [q, open])

  return (
    <div className="picker">
      <div className="picker-input-wrap">
        <input
          className="input"
          placeholder={placeholder}
          value={value?.full_name || q}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(()=>setOpen(false), 120)}
          onChange={e => {
            onChange?.(null)
            setQ(e.target.value)
          }}
        />
        {value && (
          <button className="picker-clear" type="button"
            onClick={() => { onChange(null); setQ(''); }}>
            ×
          </button>
        )}
      </div>

      {open && (
        <div className="picker-results" onMouseDown={e => e.preventDefault()}>
          {loading ? (
            <div className="picker-item muted">Buscando…</div>
          ) : (items.length === 0 ? (
            <div className="picker-item muted">Sin resultados. Escribe al menos 2 letras.</div>
          ) : (
            items.map(p => (
              <button
                key={p.user_id}
                type="button"
                className="picker-item"
                onClick={() => { onChange(p); setOpen(false); setQ(p.full_name || '') }}
              >
                <div className="picker-name">{p.full_name || '(sin nombre)'}</div>
                <div className="picker-sub">{p.email || '—'}</div>
              </button>
            ))
          ))}
        </div>
      )}
    </div>
  )
}

/* ==================== CSV helpers ==================== */
function toCsv(rows, headers){
  const esc = v => {
    if (v == null) return ''
    const s = String(v).replace(/"/g,'""')
    return /[",\n]/.test(s) ? `"${s}"` : s
  }
  const head = headers.map(h=>esc(h.label)).join(',')
  const body = rows.map(r => headers.map(h=>esc(r[h.key])).join(',')).join('\n')
  return head+'\n'+body
}
function downloadCsv(filename, rows, headers){
  const blob = new Blob([toCsv(rows, headers)], { type:'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a')
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}

export default function ManageBethels() {
  const { profile, session } = useAuth()
  const isAdmin = (profile?.role === 'admin')
  const displayName = profile?.full_name || session?.user?.email?.split('@')[0] || 'Admin'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([]) // bethels
  const [search, setSearch] = useState('')

  // form bethel
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    name:'', year: new Date().getFullYear(),
    starts_on:'', ends_on:'',
    is_active:true, notes:''
  })
  const [saving, setSaving] = useState(false)

  // staff section (debajo)
  const [staffOpen, setStaffOpen] = useState(false)
  const [curBethel, setCurBethel] = useState(null)
  const [staff, setStaff] = useState([]) // [{... , external_name, external_email, profile}]
  const [staffLoading, setStaffLoading] = useState(false)

  // forms
  const [singleForm, setSingleForm] = useState({
    role_type:'coordinator', group_type:'women', mode:'free', user:null, name:'', email:''
  })
  const [guideForm, setGuideForm] = useState({
    group_type:'women', mode:'free', user:null, name:'', email:'', is_active:true, excuse:''
  })

  // scroll automático al abrir la sección de staff
  useEffect(() => {
    if (!staffOpen) return
    const el = document.getElementById('staff-panel-anchor')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [staffOpen])

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  async function load(){
    setError(''); setLoading(true)
    const { data, error } = await supabase
      .from('bethels')
      .select('id, name, year, starts_on, ends_on, is_active, notes, created_at')
      .order('year', { ascending:false })
      .order('name', { ascending:true })
    if (error) setError(error.message)
    setRows(data || [])
    setLoading(false)
  }

  function startCreate(){
    setEditing(null)
    setForm({ name:'', year:new Date().getFullYear(), starts_on:'', ends_on:'', is_active:true, notes:'' })
  }
  function startEdit(row){
    setEditing(row)
    setForm({
      name: row.name || '',
      year: row.year || new Date().getFullYear(),
      starts_on: row.starts_on || '',
      ends_on: row.ends_on || '',
      is_active: !!row.is_active,
      notes: row.notes || ''
    })
  }

  async function saveBethel(e){
    e?.preventDefault?.()
    if (!form.name.trim()) { setError('Ingresa un nombre.'); return }
    const payload = {
      name: form.name.trim(),
      year: Number(form.year) || new Date().getFullYear(),
      starts_on: form.starts_on || null,
      ends_on: form.ends_on || null,
      is_active: !!form.is_active,
      notes: form.notes || null,
      ...(editing ? {} : { created_by: session?.user?.id || null })
    }
    setSaving(true)
    try{
      if (editing){
        const { error } = await supabase.from('bethels').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('bethels').insert(payload)
        if (error) throw error
      }
      await load(); startCreate()
    }catch(e){ setError(e.message || 'No se pudo guardar el Bethel.') }
    finally{ setSaving(false) }
  }

  // ======= Bethels =======
  async function toggleBethelActive(row){
    const { error } = await supabase.from('bethels').update({ is_active: !row.is_active }).eq('id', row.id)
    if (error) alert(error.message)
    else setRows(prev => prev.map(r => r.id===row.id ? { ...r, is_active: !r.is_active } : r))
  }
  async function removeRow(row){
    if (!confirm(`¿Eliminar el Bethel "${row.name} ${row.year}"?`)) return
    const { error } = await supabase.from('bethels').delete().eq('id', row.id)
    if (error) alert(error.message)
    else setRows(prev => prev.filter(r => r.id !== row.id))
  }

  // ===== Staff (roles por sexo) =====
  async function openStaff(row){
    setCurBethel(row); setStaffOpen(true); setStaff([]); setStaffLoading(true)
    try{
      const { data: bs, error } = await supabase
        .from('bethel_staff')
        .select('id, bethel_id, user_id, role_type, group_type, is_active, excuse, external_name, external_email, created_at')
        .eq('bethel_id', row.id)
        .order('role_type', { ascending:true })
        .order('group_type', { ascending:true })
        .order('created_at', { ascending:true })
      if (error) throw error
      const ids = Array.from(new Set((bs||[]).map(s=>s.user_id).filter(Boolean)))
      let profMap = new Map()
      if (ids.length){
        const { data: ps } = await supabase.from('profiles').select('user_id, full_name, email').in('user_id', ids)
        profMap = new Map((ps||[]).map(p => [p.user_id, p]))
      }
      setStaff((bs||[]).map(s => ({ ...s, profile: s.user_id ? (profMap.get(s.user_id) || null) : null })))
    }catch(e){ alert(e.message || 'No se pudo cargar el staff.') }
    finally{ setStaffLoading(false) }
  }

  function staffOf(role, group){
    return staff.filter(s => s.role_type===role && s.group_type===group)
  }
  function singleOf(role, group){
    const arr = staffOf(role, group); return arr[0] || null
  }

  /* ========= helpers payload según modo ========= */
  function buildPayloadFromSingle(){
    if (singleForm.mode === 'lookup'){
      if (!singleForm.user?.user_id) return { error: 'Selecciona una persona del sistema.' }
      return {
        user_id: singleForm.user.user_id,
        external_name: null,
        external_email: null,
        is_active: true,
      }
    } else {
      const name = (singleForm.name || '').trim()
      if (!name) return { error: 'Escribe el nombre.' }
      return {
        user_id: null,
        external_name: name,
        external_email: (singleForm.email || '').trim() || null,
        is_active: true,
      }
    }
  }
  function buildPayloadFromGuide(){
    if (guideForm.mode === 'lookup'){
      if (!guideForm.user?.user_id) return { error: 'Selecciona la persona guía.' }
      return {
        user_id: guideForm.user.user_id,
        external_name: null,
        external_email: null,
        is_active: !!guideForm.is_active,
        excuse: guideForm.excuse || null
      }
    } else {
      const name = (guideForm.name || '').trim()
      if (!name) return { error: 'Escribe el nombre del guía.' }
      return {
        user_id: null,
        external_name: name,
        external_email: (guideForm.email || '').trim() || null,
        is_active: !!guideForm.is_active,
        excuse: guideForm.excuse || null
      }
    }
  }

  async function addOrReplaceSingle(e){
    e?.preventDefault?.()
    if (!curBethel) return
    const p = buildPayloadFromSingle()
    if (p.error) { alert(p.error); return }

    const existing = singleOf(singleForm.role_type, singleForm.group_type)
    try{
      if (existing){
        const { error } = await supabase
          .from('bethel_staff')
          .update({
            role_type: singleForm.role_type,
            group_type: singleForm.group_type,
            ...p
          })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('bethel_staff').insert({
          bethel_id: curBethel.id,
          role_type: singleForm.role_type,
          group_type: singleForm.group_type,
          ...p
        })
        if (error) throw error
      }
      await openStaff(curBethel)
      setSingleForm(f => ({ ...f, user:null, name:'', email:'' }))
    }catch(e){ alert(e.message || 'No se pudo asignar.') }
  }

  async function addGuide(e){
    e?.preventDefault?.()
    if (!curBethel) return
    const p = buildPayloadFromGuide()
    if (p.error) { alert(p.error); return }
    try{
      const { error } = await supabase.from('bethel_staff').insert({
        bethel_id: curBethel.id,
        role_type: 'guide',
        group_type: guideForm.group_type,
        ...p
      })
      if (error) throw error
      await openStaff(curBethel)
      setGuideForm({ group_type:'women', mode:'free', user:null, name:'', email:'', is_active:true, excuse:'' })
    }catch(e){ alert(e.message || 'No se pudo agregar el guía (¿duplicado?).') }
  }

  async function toggleStaffActive(s){
    const { error } = await supabase.from('bethel_staff').update({ is_active: !s.is_active }).eq('id', s.id)
    if (error) alert(error.message)
    else setStaff(prev => prev.map(x => x.id===s.id ? { ...x, is_active: !x.is_active } : x))
  }
  async function updateExcuse(s, excuse){
    const { error } = await supabase.from('bethel_staff').update({ excuse: excuse || null }).eq('id', s.id)
    if (error) alert(error.message)
    else setStaff(prev => prev.map(x => x.id===s.id ? { ...x, excuse } : x))
  }
  async function removeStaff(s){
    if (!confirm('¿Eliminar asignación?')) return
    const { error } = await supabase.from('bethel_staff').delete().eq('id', s.id)
    if (error) alert(error.message)
    else setStaff(prev => prev.filter(x => x.id !== s.id))
  }

  // filtros lista
  const filtered = useMemo(() => {
    const q = (search || '').toLowerCase().trim()
    if (!q) return rows
    return rows.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      String(r.year).includes(q)
    )
  }, [rows, search])

  function exportBethels(){
    const headers = [
      { key:'name', label:'Bethel' },
      { key:'year', label:'Año' },
      { key:'starts_on', label:'Inicio' },
      { key:'ends_on', label:'Fin' },
      { key:'is_active', label:'Activo' },
    ]
    downloadCsv(`bethels_${Date.now()}.csv`, filtered, headers)
  }

  function displayNameEmail(s){
    const name = s.profile?.full_name || s.external_name || '—'
    const email = s.profile?.email || s.external_email || '—'
    return { name, email }
  }

  function exportStaff(){
    if (!curBethel){ alert('Abre primero “Administrar staff”.'); return }
    const headers = [
      { key:'bethel', label:'Bethel' },
      { key:'year', label:'Año' },
      { key:'role', label:'Rol' },
      { key:'group', label:'Grupo' },
      { key:'name', label:'Nombre' },
      { key:'email', label:'Email' },
      { key:'active', label:'Activo' },
      { key:'excuse', label:'Excusa' },
    ]
    const rows = staff.map(s => {
      const { name, email } = displayNameEmail(s)
      return {
        bethel: curBethel.name,
        year: curBethel.year,
        role: s.role_type === 'coordinator' ? 'Coordinador/a' : (s.role_type === 'spiritual_guide' ? 'Guía espiritual' : 'Guía'),
        group: s.group_type === 'women' ? 'Mujeres' : 'Varones',
        name, email,
        active: s.is_active ? 'Sí' : 'No',
        excuse: s.excuse || ''
      }
    })
    downloadCsv(`bethel_${curBethel.year}_${curBethel.name}_staff.csv`, rows, headers)
  }

  if (!isAdmin){
    return (
      <RequireAuth>
        <div className="mb-page">
          <div className="mb-container">
            <header className="mb-header">
              <h1 className="mb-title">Gestionar Bethels</h1>
              <LogoutButton />
            </header>
            <div className="mb-alert">No tienes permiso para ver esta página.</div>
          </div>
        </div>
      </RequireAuth>
    )
  }

  return (
    <RequireAuth>
      <div className="mb-page">
        <div className="mb-container">
          {/* Header */}
          <header className="mb-header">
            <div>
              <h1 className="mb-title">Gestionar Bethels</h1>
              <p className="mb-subtitle">Hola, <strong>{displayName}</strong></p>
            </div>
            <div className="mb-actions">
              <Link to="/dashboard" className="btn btn-secondary">Dashboard</Link>
              <LogoutButton />
            </div>
          </header>

          {error && <div className="mb-alert" role="alert">{error}</div>}

          {loading ? (
            <div className="mb-loading">Cargando…</div>
          ) : (
            <>
              <div className="mb-grid">
                {/* Form Bethel */}
                <section className="card">
                  <div className="card-head">
                    <h2 className="card-title">{editing ? 'Editar Bethel' : 'Crear Bethel'}</h2>
                    {editing && <button className="btn btn-light" onClick={startCreate}>Nuevo</button>}
                  </div>
                  <div className="card-body">
                    <form onSubmit={saveBethel} className="form-grid">
                      <div className="grid-2">
                        <div>
                          <label className="label">Nombre *</label>
                          <input className="input" placeholder="Ej. Liberados"
                            value={form.name} onChange={e=>setForm(f=>({ ...f, name:e.target.value }))} />
                        </div>
                        <div>
                          <label className="label">Año *</label>
                          <input className="input" inputMode="numeric"
                            value={form.year} onChange={e=>setForm(f=>({ ...f, year:e.target.value.replace(/\D/g,'') }))} />
                        </div>
                      </div>

                      <div className="grid-2">
                        <div>
                          <label className="label">Inicio</label>
                          <input type="date" className="input"
                            value={form.starts_on || ''} onChange={e=>setForm(f=>({ ...f, starts_on:e.target.value }))} />
                        </div>
                        <div>
                          <label className="label">Fin</label>
                          <input type="date" className="input"
                            value={form.ends_on || ''} onChange={e=>setForm(f=>({ ...f, ends_on:e.target.value }))} />
                        </div>
                      </div>

                      <label className="check">
                        <input type="checkbox" checked={form.is_active}
                          onChange={e=>setForm(f=>({ ...f, is_active:e.target.checked }))} />
                        <span>Activo</span>
                      </label>

                      <div>
                        <label className="label">Notas</label>
                        <textarea className="input" rows={3}
                          value={form.notes} onChange={e=>setForm(f=>({ ...f, notes:e.target.value }))} />
                      </div>

                      <div className="form-actions">
                        <button type="button" className="btn btn-light" onClick={startCreate}>Limpiar</button>
                        <button className="btn btn-primary" disabled={saving}>
                          {saving ? 'Guardando…' : (editing ? 'Guardar cambios' : 'Crear')}
                        </button>
                      </div>
                    </form>
                  </div>
                </section>

                {/* Lista Bethels */}
                <section className="card">
                  <div className="card-head">
                    <h2 className="card-title">Bethels</h2>
                    <div className="toolbar">
                      <input className="input" placeholder="Buscar por nombre/año…"
                        value={search} onChange={e=>setSearch(e.target.value)} />
                      <button className="btn btn-emerald" onClick={exportBethels}>Exportar CSV</button>
                    </div>
                  </div>

                  <div className="card-body">
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Bethel</th>
                            <th>Año</th>
                            <th>Rango</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map(r => (
                            <tr key={r.id}>
                              <td>{r.name}</td>
                              <td>{r.year}</td>
                              <td>{r.starts_on || '—'} {r.ends_on ? `→ ${r.ends_on}` : ''}</td>
                              <td>
                                <span className={cx('badge', r.is_active ? 'badge-green' : 'badge-gray')}>
                                  {r.is_active ? 'Activo' : 'Inactivo'}
                                </span>
                              </td>
                              <td>
                                <div className="table-actions">
                                  <button className="btn btn-blue btn-sm" onClick={()=>startEdit(r)}>Editar</button>
                                  <button className="btn btn-indigo btn-sm" onClick={()=>openStaff(r)}>Staff</button>
                                  <button className="btn btn-dark btn-sm" onClick={()=>toggleBethelActive(r)}>
                                    {r.is_active ? 'Inactivar' : 'Activar'}
                                  </button>
                                  <button className="btn btn-red btn-sm" onClick={()=>removeRow(r)}>Eliminar</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {filtered.length === 0 && (
                            <tr>
                              <td colSpan="5" className="empty">Sin registros.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              </div>

              {/* ===== Staff panel debajo ===== */}
              {staffOpen && (
                <section id="staff-panel-anchor" className="card staff-panel">
                  <div className="staff-head">
                    <div>
                      <h3 className="card-title">Staff — {curBethel?.name} {curBethel?.year}</h3>
                      <p className="staff-desc">Coordinación, guía espiritual y guías por grupo (Mujeres/Varones). Modo “Escribir nombre” o “Buscar usuario”.</p>
                    </div>
                    <div className="table-actions">
                      <button className="btn btn-emerald" onClick={exportStaff}>Exportar CSV</button>
                      <button className="btn btn-light" onClick={()=>setStaffOpen(false)}>Cerrar</button>
                    </div>
                  </div>

                  {staffLoading ? (
                    <div className="mb-loading">Cargando…</div>
                  ) : (
                    <div className="staff-grid">
                      {/* Asignaciones únicas */}
                      <div className="card soft">
                        <h4 className="card-subtitle">Asignación única</h4>

                        <div className="seg">
                          <button type="button" className={cx('seg-btn', singleForm.mode==='free' && 'active')}
                            onClick={()=>setSingleForm(f=>({ ...f, mode:'free' }))}>Escribir nombre</button>
                          <button type="button" className={cx('seg-btn', singleForm.mode==='lookup' && 'active')}
                            onClick={()=>setSingleForm(f=>({ ...f, mode:'lookup' }))}>Buscar usuario</button>
                        </div>

                        <form onSubmit={addOrReplaceSingle} className="grid gap-2">
                          <div className="grid-2">
                            <select className="input" value={singleForm.role_type}
                              onChange={e=>setSingleForm(f=>({ ...f, role_type:e.target.value }))}>
                              {ROLES_SINGLE.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                            <select className="input" value={singleForm.group_type}
                              onChange={e=>setSingleForm(f=>({ ...f, group_type:e.target.value }))}>
                              {GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                            </select>
                          </div>

                          {singleForm.mode === 'lookup' ? (
                            <PersonPicker
                              value={singleForm.user}
                              onChange={(user)=>setSingleForm(f=>({ ...f, user }))}
                              placeholder="Seleccionar persona…"
                            />
                          ) : (
                            <div className="grid-2">
                              <input className="input" placeholder="Nombre completo *"
                                value={singleForm.name} onChange={e=>setSingleForm(f=>({ ...f, name:e.target.value }))} />
                              <input className="input" placeholder="Email (opcional)"
                                value={singleForm.email} onChange={e=>setSingleForm(f=>({ ...f, email:e.target.value }))} />
                            </div>
                          )}

                          <button className="btn btn-indigo">Asignar/Reemplazar</button>
                        </form>

                        <div className="stack" style={{ marginTop: 10 }}>
                          {ROLES_SINGLE.map(r => (
                            <div key={r.value} className="card white">
                              <div className="row-between">
                                <div className="card-subtitle">{r.label}</div>
                              </div>
                              <div className="list">
                                {GROUPS.map(g => {
                                  const s = singleOf(r.value, g.value)
                                  const { name, email } = s ? displayNameEmail(s) : { name:'—', email:'—' }
                                  return (
                                    <div key={g.value} className="row-between list-item">
                                      <div>
                                        <div className="label">{g.label}</div>
                                        <div className="sub">{name} {email && email !== '—' ? `(${email})` : ''}</div>
                                      </div>
                                      <div className="table-actions">
                                        {s ? (
                                          <>
                                            <button className={cx('btn btn-sm', s.is_active ? 'btn-emerald' : 'btn-dark')}
                                              onClick={()=>toggleStaffActive(s)}>{s.is_active ? 'Activo' : 'Inactivo'}</button>
                                            <button className="btn btn-red btn-sm" onClick={()=>removeStaff(s)}>Quitar</button>
                                          </>
                                        ) : (
                                          <span className="muted">Sin asignar</span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Agregar guías */}
                      <div className="card soft">
                        <h4 className="card-subtitle">Agregar guía</h4>

                        <div className="seg">
                          <button type="button" className={cx('seg-btn', guideForm.mode==='free' && 'active')}
                            onClick={()=>setGuideForm(f=>({ ...f, mode:'free' }))}>Escribir nombre</button>
                          <button type="button" className={cx('seg-btn', guideForm.mode==='lookup' && 'active')}
                            onClick={()=>setGuideForm(f=>({ ...f, mode:'lookup' }))}>Buscar usuario</button>
                        </div>

                        <form onSubmit={addGuide} className="grid gap-2">
                          <select className="input" value={guideForm.group_type}
                            onChange={e=>setGuideForm(f=>({ ...f, group_type:e.target.value }))}>
                            {GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                          </select>

                          {guideForm.mode === 'lookup' ? (
                            <PersonPicker
                              value={guideForm.user}
                              onChange={(user)=>setGuideForm(f=>({ ...f, user }))}
                              placeholder="Seleccionar guía…"
                            />
                          ) : (
                            <div className="grid-2">
                              <input className="input" placeholder="Nombre del guía *"
                                value={guideForm.name} onChange={e=>setGuideForm(f=>({ ...f, name:e.target.value }))} />
                              <input className="input" placeholder="Email (opcional)"
                                value={guideForm.email} onChange={e=>setGuideForm(f=>({ ...f, email:e.target.value }))} />
                            </div>
                          )}

                          <label className="check">
                            <input type="checkbox" checked={guideForm.is_active}
                              onChange={e=>setGuideForm(f=>({ ...f, is_active:e.target.checked }))} />
                            <span>Activo</span>
                          </label>
                          <input className="input" placeholder="Excusa (opcional)"
                            value={guideForm.excuse} onChange={e=>setGuideForm(f=>({ ...f, excuse:e.target.value }))} />
                          <button className="btn btn-indigo">Agregar</button>
                        </form>
                      </div>

                      {/* Listados por grupo */}
                      <div className="stack">
                        {GROUPS.map(g => (
                          <div key={g.value} className="card soft">
                            <h4 className="card-subtitle">Guías — {g.label}</h4>
                            <div className="stack">
                              {staffOf('guide', g.value).map(s => {
                                const { name, email } = displayNameEmail(s)
                                return (
                                  <div key={s.id} className="item">
                                    <div className="row-between">
                                      <div>
                                        <div className="label">{name}</div>
                                        <div className="sub">{email}</div>
                                      </div>
                                      <div className="table-actions">
                                        <button className={cx('btn btn-sm', s.is_active ? 'btn-emerald':'btn-dark')}
                                          onClick={()=>toggleStaffActive(s)}>{s.is_active ? 'Activo' : 'Inactivo'}</button>
                                        <button className="btn btn-red btn-sm" onClick={()=>removeStaff(s)}>Eliminar</button>
                                      </div>
                                    </div>
                                    <input className="input mt-2" placeholder="Excusa (opcional)"
                                      value={s.excuse || ''} onChange={e=>updateExcuse(s, e.target.value)} />
                                  </div>
                                )
                              })}
                              {staffOf('guide', g.value).length === 0 && (
                                <div className="muted">Sin guías en este grupo.</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        {/* Fondo decorativo */}
        <div className="mb-bubble b1" />
        <div className="mb-bubble b2" />
        <div className="mb-bubble b3" />
      </div>
    </RequireAuth>
  )
}
