// components/UsersTable.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function UsersTable({ role = 'leader', refreshKey }) {
  const VIEW = role === 'pastor' ? 'pastors_admin' : 'leaders_admin'
  const REL_TABLE = role === 'pastor' ? 'pastor_territories' : 'leader_territories'
  const REL_KEY = role === 'pastor' ? 'pastor_user_id' : 'leader_user_id'
  const LABEL = role === 'pastor' ? 'Pastores' : 'Líderes'

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [territories, setTerritories] = useState([])
  const [editing, setEditing] = useState(null) // { user_id, full_name, territory_id, is_active }

  useEffect(() => {
    (async () => {
      setLoading(true); setError('')
      try {
        const { data, error } = await supabase
          .from(VIEW)
          .select('*')
          .order('full_name', { ascending: true })
        if (error) throw error
        setRows(data || [])
      } catch (e) {
        console.error(e)
        setError(e.message || `Error al cargar ${LABEL.toLowerCase()}`)
      } finally {
        setLoading(false)
      }
    })()
  }, [refreshKey, VIEW])

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase
        .from('territories') // ajusta a 'Territories' si aplica
        .select('id, name')
        .order('name', { ascending: true })
      if (!error) setTerritories(data || [])
    })()
  }, [])

  const toggleActive = async (row) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !row.is_active })
        .eq('user_id', row.user_id)
      if (error) throw error
      setRows(prev => prev.map(r => r.user_id === row.user_id ? { ...r, is_active: !r.is_active } : r))
    } catch (e) {
      alert(e.message || 'No se pudo cambiar el estado')
    }
  }

  const openEdit = (row) => {
    setEditing({
      user_id: row.user_id,
      full_name: row.full_name || '',
      territory_id: row.territory_id || '',
      is_active: row.is_active
    })
  }

  const saveEdit = async () => {
    if (!editing) return
    try {
      // 1) Actualiza nombre/estado en profiles
      const { error: e1 } = await supabase
        .from('profiles')
        .update({
          full_name: editing.full_name,
          is_active: editing.is_active
        })
        .eq('user_id', editing.user_id)
      if (e1) throw e1

      // 2) Upsert del territorio (líder o pastor según role)
      if (editing.territory_id) {
        const payload = {
          [REL_KEY]: editing.user_id,
          territory_id: Number(editing.territory_id)
        }
        const { error: e2 } = await supabase
          .from(REL_TABLE)
          .upsert(payload, { onConflict: `${REL_KEY},territory_id` })
        if (e2) throw e2
      }

      // Sincroniza UI
      setRows(prev => prev.map(r => r.user_id === editing.user_id
        ? {
            ...r,
            full_name: editing.full_name,
            is_active: editing.is_active,
            territory_id: editing.territory_id,
            territory_name: (territories.find(t => t.id === Number(editing.territory_id))?.name) || r.territory_name
          }
        : r
      ))
      setEditing(null)
    } catch (e) {
      alert(e.message || 'No se pudo guardar cambios')
    }
  }

  return (
    <div>
      {loading && <p>Cargando...</p>}
      {error && <p className="text-red-600">{error}</p>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 px-2">Nombre</th>
              <th className="py-2 px-2">Email</th>
              <th className="py-2 px-2">Territorio</th>
              <th className="py-2 px-2">Estado</th>
              <th className="py-2 px-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.user_id} className="border-b">
                <td className="py-2 px-2">{r.full_name || '-'}</td>
                <td className="py-2 px-2">{r.email || '-'}</td>
                <td className="py-2 px-2">{r.territory_name || '-'}</td>
                <td className="py-2 px-2">
                  <span className={`px-2 py-1 rounded text-xs ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                    {r.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="py-2 px-2 flex gap-2">
                  <button onClick={() => openEdit(r)} className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">Editar</button>
                  <button onClick={() => toggleActive(r)} className="px-2 py-1 rounded bg-gray-700 text-white hover:bg-gray-800">
                    {r.is_active ? 'Inactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}

            {rows.length === 0 && !loading && (
              <tr>
                <td className="py-4 px-2 text-gray-500" colSpan="5">Sin registros aún.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal simple de edición */}
      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-xl p-4 w-full max-w-md">
            <h3 className="font-semibold mb-3">Editar {role === 'pastor' ? 'pastor' : 'líder'}</h3>

            <label className="block text-sm mb-1">Nombre</label>
            <input
              className="w-full border rounded px-3 py-2 mb-3"
              value={editing.full_name}
              onChange={e => setEditing(prev => ({ ...prev, full_name: e.target.value }))}
            />

            <label className="block text-sm mb-1">Territorio</label>
            <select
              className="w-full border rounded px-3 py-2 mb-3"
              value={editing.territory_id || ''}
              onChange={e => setEditing(prev => ({ ...prev, territory_id: e.target.value }))}
            >
              <option value="">Seleccione</option>
              {territories.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

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
  )
}
