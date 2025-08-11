import { supabase } from '../lib/supabase'

export async function createUserAdmin({ email, password, full_name, role, territory_id }) {
  // 👈 password ahora sí existe en este scope
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: {
      email,
      password,                  // se envía a la Edge Function
      full_name,
      role,
      territory_id: Number(territory_id)
    }
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}
