// src/services/adminApi.ts
import { supabase } from '../lib/supabase'

// type CreateUserPayload = {
//   email: string
//   password: string
//   full_name: string
//   role: 'leader' | 'pastor' | string
//   territory_id: number | string
//   group_name?: string
// }

export async function createUserAdmin(payload /*: CreateUserPayload */) {
  const {
    email,
    password,
    full_name,
    role,
    territory_id,
    group_name, // <-- NUEVO (requerido si role === 'leader')
  } = payload ?? {}

  if (!email) throw new Error('Email es obligatorio')
  if (!password || String(password).length < 6) throw new Error('Contraseña mínima de 6 caracteres')
  if (!territory_id) throw new Error('territory_id es obligatorio')
  if (!role) throw new Error('role es obligatorio')
  if (role === 'leader' && !String(group_name || '').trim()) {
    throw new Error('group_name es obligatorio para líderes')
  }

  const body = {
    email,
    password,
    full_name,
    role,
    territory_id: Number(territory_id),
    ...(role === 'leader' ? { group_name: String(group_name).trim() } : {}),
  }

  // Invoca la Edge Function /functions/create-user
  const { data, error } = await supabase.functions.invoke('create-user', { body })

  if (error) {
    // error de transporte/invocación
    throw new Error(error.message || 'Fallo al invocar create-user')
  }
  if (data?.error) {
    // error devuelto por la función (validación/SQL/etc.)
    throw new Error(data.error)
  }

  // data esperado: { ok: true, userId, groupId? }
  return data
}
