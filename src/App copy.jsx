// src/App.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createHashRouter, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import './index.css'

import AdminDashboard from './pages/AdminDashboard'
import ManageLeaders from './pages/ManageLeaders'
import ManagePastors from './pages/ManagePastors'
import ManageTerritories from './pages/ManageTerritories'
import LeaderHome from './pages/LeaderHome'
import StaffDashboard from './pages/StaffDashboard' // úsalo para pastores
import Login from './pages/Login'
import { Toaster } from 'sonner'

import { RequireAuth, AdminOnly, RoleSwitch } from './components/RouteGuards'

// ⚠️ Con HashRouter, las rutas son #/...
const router = createHashRouter([
  // Inicio → decide según rol
  { path: '/', element: <Navigate to="/dashboard" replace /> },

  // Login público
  { path: '/login', element: <Login /> },

  // RoleSwitch decide a dónde ir (leader/staff/admin)
  { path: '/dashboard', element: <RequireAuth><RoleSwitch /></RequireAuth> },

  // Panel de LÍDER
  { path: '/leader', element: <RequireAuth><LeaderHome /></RequireAuth> },

  // Panel de PASTOR (usa tu StaffDashboard)
  { path: '/staff', element: <RequireAuth><StaffDashboard /></RequireAuth> },

  // Panel de ADMIN
  { path: '/admin', element: <AdminOnly><AdminDashboard /></AdminOnly> },

  // Gestión (solo admin)
  { path: '/manageleaders', element: <AdminOnly><ManageLeaders /></AdminOnly> },
  { path: '/managepastors', element: <AdminOnly><ManagePastors /></AdminOnly> },
  { path: '/manageterritories', element: <AdminOnly><ManageTerritories /></AdminOnly> },

  { path: '*', element: <div className="p-6">404 - Página no encontrada</div> },
])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster richColors closeButton />
    </AuthProvider>
  </React.StrictMode>
)
