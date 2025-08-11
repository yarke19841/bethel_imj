// src/pages/ManageTerritories.jsx
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import RequireAuth from '../components/RequireAuth'
import LogoutButton from '../components/LogoutButton'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  PieChart, Pie, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'

const TABLE = 'territories'        // cámbialo a "Territories" si tu tabla usa mayúscula
const LEADERS_VIEW = 'leaders_admin'
const PASTORS_VIEW = 'pastors_admin'

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
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto bg-white rounded-xl shadow p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold">Gestionar Territorios</h1>
              <p className="text-sm text-gray-600">Hola, {displayName}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/dashboard" className="px-3 py-2 rounded bg-gray-200">Dashboard</Link>
              <LogoutButton />
            </div>
          </div>

          {/* GRÁFICAS */}
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <div className="p-4 rounded-xl bg-gray-50 shadow">
              <h3 className="font-semibold mb-3">Distribución por Rol (activos)</h3>
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
              <h3 className="font-semibold mb-3">Personas por Territorio (activos)</h3>
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

          {/* Crear + Tabla */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Form crear */}
            <div className="p-4 rounded-xl bg-gray-50 shadow">
              <h2 className="font-semibold mb-3">Crear territorio</h2>
              {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
              <form onSubmit={handleCreate} className="flex gap-2">
                <input
                  className="flex-1 border rounded px-3 py-2"
                  placeholder="Nombre del territorio"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
                <button
                  disabled={loading}
                  className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Creando...' : 'Crear'}
                </button>
              </form>
              <p className="text-xs text-gray-500 mt-2">* El nombre debe ser único.</p>
            </div>

            {/* Tabla */}
            <div className="p-4 rounded-xl bg-gray-50 shadow">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Territorios</h2>
                <input
                  className="border rounded px-3 py-2"
                  placeholder="Buscar..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 px-2">Nombre</th>
                      <th className="py-2 px-2">Estado</th>
                      <th className="py-2 px-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => (
                      <tr key={r.id} className="border-b">
                        <td className="py-2 px-2">{r.name}</td>
                        <td className="py-2 px-2">
                          <span className={`px-2 py-1 rounded text-xs ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                            {r.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="py-2 px-2 flex gap-2">
                          <button
                            onClick={() => setEditing({ id: r.id, name: r.name, is_active: r.is_active })}
                            className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => toggleActive(r)}
                            className="px-2 py-1 rounded bg-gray-700 text-white hover:bg-gray-800"
                          >
                            {r.is_active ? 'Inactivar' : 'Activar'}
                          </button>
                          <button
                            onClick={() => remove(r)}
                            className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td className="py-4 px-2 text-gray-500" colSpan="3">Sin territorios.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Modal edición */}
          {editing && (
            <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
              <div className="bg-white rounded-xl p-4 w-full max-w-md">
                <h3 className="font-semibold mb-3">Editar territorio</h3>

                <label className="block text-sm mb-1">Nombre</label>
                <input
                  className="w-full border rounded px-3 py-2 mb-3"
                  value={editing.name}
                  onChange={e => setEditing(prev => ({ ...prev, name: e.target.value }))}
                />

                <label className="inline-flex items-center gap-2 mb-4">
                  <input
                    type="checkbox"
                    checked={!!editing.is_active}
                    onChange={e => setEditing(prev => ({ ...prev, is_active: e.target.checked }))}
                  />
                  <span>Activo</span>
                </label>

                <div className="flex justify-end gap-2">
                  <button className="px-3 py-2 rounded bg-gray-200" onClick={() => setEditing(null)}>Cancelar</button>
                  <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={saveEdit}>Guardar</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </RequireAuth>
  )
}
