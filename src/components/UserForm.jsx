import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { createUserAdmin } from '../services/adminApi'

function getTerritoryInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .map(w => (w[0] || '').toUpperCase())
    .join('')
}

export default function UserForm({ defaultRole = 'leader', onCreated }) {
  const [full_name, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [territory_id, setTerritoryId] = useState('')

  const [territories, setTerritories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase
        .from('territories')
        .select('id, name')
        .order('name', { ascending: true })

      if (error) {
        console.error('Error cargando territories', error)
        setError('No se pudieron cargar los territorios')
      } else {
        setTerritories(data || [])
      }
    })()
  }, [])

  // Datos derivados para autogenerar nombre de grupo
  const selectedTerritory = useMemo(
    () => territories.find(t => t.id === Number(territory_id)) || null,
    [territory_id, territories]
  )
  const territoryInitials = useMemo(
    () => (selectedTerritory ? getTerritoryInitials(selectedTerritory.name) : ''),
    [selectedTerritory]
  )
  const leaderFirstName = useMemo(
    () => (full_name.trim() ? full_name.trim().split(/\s+/)[0] : ''),
    [full_name]
  )

  // Nombre del grupo autogenerado (no editable)
  const group_name = useMemo(() => {
    if (defaultRole !== 'leader') return ''
    if (!territoryInitials || !leaderFirstName) return ''
    return `GE-${territoryInitials}-${leaderFirstName}`
  }, [defaultRole, territoryInitials, leaderFirstName])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')

    if (!email) return setError('Email es obligatorio')
    if (!password || password.length < 6) return setError('Contraseña mínima de 6 caracteres')
    if (!territory_id) return setError('Debes seleccionar un territorio')
    if (!full_name.trim()) return setError('Nombre completo es obligatorio')
    if (defaultRole === 'leader' && !group_name) {
      return setError('No se pudo generar el nombre de grupo. Verifica territorio y nombre.')
    }

    setLoading(true)
    try {
      setInfo('Creando usuario…')
      await createUserAdmin({
        email,
        password,
        full_name,
        role: defaultRole,
        territory_id: Number(territory_id),
        // aunque es no editable, lo enviamos igual
        ...(defaultRole === 'leader' ? { group_name } : {})
      })

      setInfo(
        defaultRole === 'leader'
          ? `✅ Usuario y grupo "${group_name}" creados correctamente.`
          : '✅ Usuario creado correctamente.'
      )

      // Limpiar
      setFullName('')
      setEmail('')
      setPassword('')
      setTerritoryId('')
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
      {info && !error && (
        <div className="text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2 text-sm">
          {info}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium">Nombre completo</label>
        <input
          className="w-full border rounded px-3 py-2"
          value={full_name}
          onChange={e => setFullName(e.target.value)}
          placeholder="Ej. Kay Johnson"
          required
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
          minLength={6}
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

      {defaultRole === 'leader' && (
        <div>
          <label className="block text-sm font-medium">Nombre del Grupo</label>
          <input
            className="w-full border rounded px-3 py-2 bg-gray-100 text-gray-700"
            value={group_name}
            readOnly
            disabled
          />
          <p className="text-xs text-gray-500 mt-1">
            Se genera automáticamente con: GE‑(siglas del territorio)‑(primer nombre del líder).
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Creando...' : `Crear ${defaultRole === 'pastor' ? 'Pastor' : 'Líder'}`}
      </button>
    </form>
  )
}
