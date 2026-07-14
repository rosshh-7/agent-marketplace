import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import Landing from './pages/Landing'
import Marketplace from './pages/Marketplace'
import AgentDetail from './pages/AgentDetail'
import Sell from './pages/Sell'
import ListAgent from './pages/ListAgent'
import MyListings from './pages/MyListings'
import Admin from './pages/Admin'
import AdminLogin from './pages/AdminLogin'
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuth'

function ProtectedAdmin() {
  const { token } = useAdminAuth()
  return token ? <Admin /> : <Navigate to="/admin/login" replace />
}

export default function App() {
  return (
    <AdminAuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-950 text-white">
          <Navbar />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/marketplace/:id" element={<AgentDetail />} />
            <Route path="/sell" element={<Sell />} />
            <Route path="/list" element={<ListAgent />} />
            <Route path="/my-listings" element={<MyListings />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<ProtectedAdmin />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AdminAuthProvider>
  )
}
