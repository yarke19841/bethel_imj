import { useAuth } from '../context/AuthContext' // ajusta la ruta

export default function LogoutButton() {
  const { logout } = useAuth()

  const handleLogout = async () => {
    try {
      await logout()
      window.location.href = '/login'
    } catch (err) {
      console.error('LOGOUT_ERROR', err)
      alert('No se pudo cerrar sesión')
    }
  }

  return (
    <button onClick={handleLogout} className="px-3 py-2 rounded bg-red-600 text-white">
      Cerrar sesión
    </button>
  )
}
