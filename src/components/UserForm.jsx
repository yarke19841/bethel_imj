import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { createUserAdmin } from '../services/adminApi'

export default function UserForm({ defaultRole, onCreated }) {
  const [full_name, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [territory_id, setTerritoryId] = useState('')

  const [territories, setTerritories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase
        .from('territories')           // cambia a 'Territories' si tu tabla está con mayúscula
        .select('id, name')            // cambia 'name' por 'nombre' si aplica
        .order('name', { ascending: true })

      if (error) {
        console.error('Error cargando territories', error)
        setError('No se pudieron cargar los territorios')
      } else {
        setTerritories(data || [])
      }
    })()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!email) { setError('Email es obligatorio'); return }
    if (!password || password.length < 6) { setError('Contraseña mínima de 6 caracteres'); return }
    if (!territory_id) { setError('Debes seleccionar un territorio'); return }

    setLoading(true)
    try {
      await createUserAdmin({
        email,
        password,
        full_name,
        role: defaultRole,                  // 'leader' o 'pastor'
        territory_id: Number(territory_id)  // requerido por la Edge Function
      })

      // Limpieza
      setFullName(''); setEmail(''); setPassword(''); setTerritoryId('')
      onCreated?.()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Error al crear usuario')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div>
        <label className="block text-sm font-medium">Nombre completo</label>
        <input
          className="w-full border rounded px-3 py-2"
          value={full_name}
          onChange={e => setFullName(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Email</label>
        <input
          type="email"
          className="w-full border rounded px-3 py-2"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Contraseña</label>
        <input
          type="password"
          className="w-full border rounded px-3 py-2"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Territorio</label>
        <select
          className="w-full border rounded px-3 py-2"
          value={territory_id}
          onChange={e => setTerritoryId(e.target.value)}
          required
        >
          <option value="">Seleccione un territorio</option>
          {territories.map(t => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <button
        disabled={loading}
        className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Creando...' : `Crear ${defaultRole === 'pastor' ? 'Pastor' : 'Líder'}`}
      </button>
    </form>
  )
}
