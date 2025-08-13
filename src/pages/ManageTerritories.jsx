import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import RequireAuth from '../components/RequireAuth'
import LogoutButton from '../components/LogoutButton'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  PieChart, Pie, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell
} from 'recharts'
import './ManageTerritories.css'

const TABLE = 'territories'
const LEADERS_VIEW = 'leaders_admin'
const PASTORS_VIEW = 'pastors_admin'

const PIE_COLORS = ['#6366f1', '#06b6d4']

export default function ManageTerritories() {
  const { profile, session } = useAuth()
  const displayName = profile?.full_name || session?.user?.email?.split('@')[0] || 'Admin'

  // Form/tabla
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // { id, name, is_active }

  // Gráficas
  const [byTerritory, setByTerritory] = useState([]) // [{ territory, leaders, pastors, total }]
  const [totals, setTotals] = useState({ leaders: 0, pastors: 0 })

  const load = async () => {
    setError('')
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, name, is_active, created_at')
      .order('name', { ascending: true })
    if (error) setError(error.message)
    setRows(data || [])
  }

  useEffect(() => { load() }, [])

  // Carga datos para gráficas
  useEffect(() => {
    (async () => {
      try {
        const [{ data: lrows, error: lerr }, { data: prows, error: perr }] = await Promise.all([
          supabase.from(LEADERS_VIEW).select('territory_name, is_active'),
          supabase.from(PASTORS_VIEW).select('territory_name, is_active')
        ])
        if (lerr) throw lerr
        if (perr) throw perr

        const onlyActive = (arr = []) => arr.filter(r => r.is_active !== false)

        const agg = new Map()
        const addRow = (name, key) => {
          const t = name || 'Sin territorio'
          const cur = agg.get(t) || { territory: t, leaders: 0, pastors: 0 }
          cur[key] += 1
          agg.set(t, cur)
        }

        onlyActive(lrows).forEach(r => addRow(r.territory_name, 'leaders'))
        onlyActive(prows).forEach(r => addRow(r.territory_name, 'pastors'))

        const merged = Array.from(agg.values())
          .map(x => ({ ...x, total: x.leaders + x.pastors }))
          .sort((a, b) => b.total - a.total)

        setByTerritory(merged)
        setTotals({ leaders: onlyActive(lrows).length, pastors: onlyActive(prows).length })
      } catch (e) {
        console.error(e)
        // No bloqueamos la pantalla si fallan solo las gráficas
      }
    })()
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    const trimmed = name.trim()
    if (!trimmed) { setError('Ingresa un nombre'); return }
    setLoading(true)
    try {
      const { error } = await supabase.from(TABLE).insert({ name: trimmed, is_active: true })
      if (error) throw error
      setName('')
      await load()
    } catch (e) {
      setError(e.message || 'No se pudo crear el territorio')
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = async (row) => {
    try {
      const { error } = await supabase
        .from(TABLE)
        .update({ is_active: !row.is_active })
        .eq('id', row.id)
      if (error) throw error
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_active: !r.is_active } : r))
    } catch (e) {
      alert(e.message || 'No se pudo cambiar el estado')
    }
  }

  const remove = async (row) => {
    if (!confirm(`¿Eliminar el territorio "${row.name}"?`)) return
    try {
      const { error } = await supabase.from(TABLE).delete().eq('id', row.id)
      if (error) throw error
      setRows(prev => prev.filter(r => r.id !== row.id))
    } catch (e) {
      alert(e.message || 'No se pudo eliminar')
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    const trimmed = (editing.name || '').trim()
    if (!trimmed) return alert('El nombre no puede estar vacío')
    try {
      const { error } = await supabase
        .from(TABLE)
        .update({ name: trimmed, is_active: editing.is_active })
        .eq('id', editing.id)
      if (error) throw error
      setRows(prev => prev.map(r => r.id === editing.id ? { ...r, name: trimmed, is_active: editing.is_active } : r))
      setEditing(null)
    } catch (e) {
      alert(e.message || 'No se pudo guardar cambios')
    }
  }

  const filtered = rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
  const pieData = useMemo(() => ([
    { name: 'Líderes', value: totals.leaders },
    { name: 'Pastores', value: totals.pastors },
  ]), [totals])

  return (
    <RequireAuth>
      <div className="mt-page">
        <div className="mt-container">
          {/* Header */}
          <header className="mt-header">
            <div>
              <h1 className="mt-title">Gestionar Territorios</h1>
              <p className="mt-subtitle">Hola, <strong>{displayName}</strong></p>
            </div>
            <div className="mt-actions">
              <Link to="/dashboard" className="btn btn-secondary">Dashboard</Link>
              <LogoutButton />
            </div>
          </header>

          {/* GRÁFICAS */}
          <section className="chart-grid">
            <div className="card chart-card">
              <h3 className="card-title">Distribución por Rol (activos)</h3>
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
              <h3 className="card-title">Personas por Territorio (activos)</h3>
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

          {/* Crear + Tabla */}
          <section className="mt-grid">
            {/* Form crear */}
            <div className="card">
              <h2 className="card-title">Crear territorio</h2>
              {error && <p className="mt-alert">{error}</p>}
              <form onSubmit={handleCreate} className="mt-form-row">
                <input
                  className="input"
                  placeholder="Nombre del territorio"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
                <button className="btn btn-primary" disabled={loading}>
                  {loading ? 'Creando…' : 'Crear'}
                </button>
              </form>
              <p className="hint">* El nombre debe ser único.</p>
            </div>

            {/* Tabla */}
            <div className="card">
              <div className="table-head">
                <h2 className="card-title">Territorios</h2>
                <input
                  className="input input-sm"
                  placeholder="Buscar..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>
                          <span className={`badge ${r.is_active ? 'badge-green' : 'badge-gray'}`}>
                            {r.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              onClick={() => setEditing({ id: r.id, name: r.name, is_active: r.is_active })}
                              className="btn btn-small btn-blue"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => toggleActive(r)}
                              className="btn btn-small btn-dark"
                            >
                              {r.is_active ? 'Inactivar' : 'Activar'}
                            </button>
                            <button
                              onClick={() => remove(r)}
                              className="btn btn-small btn-red"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan="3" className="empty">Sin territorios.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Modal edición */}
          {editing && (
            <div className="modal-backdrop" role="dialog" aria-modal="true">
              <div className="modal">
                <h3 className="card-title">Editar territorio</h3>

                <label className="label">Nombre</label>
                <input
                  className="input"
                  value={editing.name}
                  onChange={e => setEditing(prev => ({ ...prev, name: e.target.value }))}
                />

                <label className="check">
                  <input
                    type="checkbox"
                    checked={!!editing.is_active}
                    onChange={e => setEditing(prev => ({ ...prev, is_active: e.target.checked }))}
                  />
                  <span>Activo</span>
                </label>

                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
                  <button className="btn btn-primary" onClick={saveEdit}>Guardar</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fondo decorativo */}
        <div className="mt-bubble b1" />
        <div className="mt-bubble b2" />
        <div className="mt-bubble b3" />
      </div>
    </RequireAuth>
  )
}
