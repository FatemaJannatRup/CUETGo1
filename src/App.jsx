import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Welcome from './pages/Welcome.jsx'
import RoleSelect from './pages/RoleSelect.jsx'
import StudentLogin from './pages/StudentLogin.jsx'
import StudentSignup from './pages/StudentSignup.jsx'
import DriverLogin from './pages/DriverLogin.jsx'
import DriverSignup from './pages/DriverSignup.jsx'
import StudentHome from './pages/StudentHome.jsx'
import DriverHome from './pages/DriverHome.jsx'
import Admin from './pages/Admin.jsx'
import { useAuth } from './context/AuthContext.jsx'

function Protected({ role, children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="auth-loading">Restoring your CUETGo session…</div>
  if (!user || user.role !== role) return <Navigate to="/" replace />
  return children
}
function GuestOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="auth-loading">Restoring your CUETGo session…</div>
  if (user) return <Navigate to={user.role === 'driver' ? '/driver/home' : '/student/home'} replace />
  return children
}
export default function App() {
  const location = useLocation()
  return <div className="phone-shell"><div className="phone-screen"><div className="screen-scroll">
    <div key={location.pathname} className="route-transition">
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/role" element={<RoleSelect />} />
      <Route path="/student/login" element={<GuestOnly><StudentLogin /></GuestOnly>} />
      <Route path="/student/signup" element={<GuestOnly><StudentSignup /></GuestOnly>} />
      <Route path="/driver/login" element={<GuestOnly><DriverLogin /></GuestOnly>} />
      <Route path="/driver/signup" element={<GuestOnly><DriverSignup /></GuestOnly>} />
      <Route path="/student/home" element={<Protected role="student"><StudentHome /></Protected>} />
      <Route path="/driver/home" element={<Protected role="driver"><DriverHome /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </div>
  </div></div></div>
}
