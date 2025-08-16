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
import ManageBethels from './pages/ManageBethels'
import LeaderHome from './pages/LeaderHome'
import StaffDashboard from './pages/StaffDashboard'
import Login from './pages/Login'
import BethelAnalytics from './pages/BethelAnalytics' // 👈

import { Toaster } from 'sonner'
import { RequireAuth, AdminOnly, RoleSwitch } from './components/RouteGuards'

const router = createHashRouter([
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  { path: '/login', element: <Login /> },

  { path: '/dashboard', element: <RequireAuth><RoleSwitch /></RequireAuth> },
  { path: '/leader', element: <RequireAuth><LeaderHome /></RequireAuth> },
  { path: '/staff', element: <RequireAuth><StaffDashboard /></RequireAuth> },

  { path: '/admin', element: <AdminOnly><AdminDashboard /></AdminOnly> },

  { path: '/manageleaders', element: <AdminOnly><ManageLeaders /></AdminOnly> },
  { path: '/managepastors', element: <AdminOnly><ManagePastors /></AdminOnly> },
  { path: '/manageterritories', element: <AdminOnly><ManageTerritories /></AdminOnly> },
  { path: '/managebethels', element: <AdminOnly><ManageBethels /></AdminOnly> },

  // ✅ Ruta recomendada con :bethelId
  { path: '/bethels/:bethelId/analytics', element: <RequireAuth><BethelAnalytics /></RequireAuth> },

  // ✅ Alias por compatibilidad: #/bethel-analytics?id=123
  { path: '/bethelanalytics', element: <RequireAuth><BethelAnalytics /></RequireAuth> },

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
