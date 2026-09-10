import { Routes, Route, Navigate } from 'react-router-dom'
import Welcome from './pages/Welcome.jsx'
import RoleSelect from './pages/RoleSelect.jsx'
import StudentLogin from './pages/StudentLogin.jsx'
import StudentSignup from './pages/StudentSignup.jsx'
import DriverLogin from './pages/DriverLogin.jsx'
import DriverSignup from './pages/DriverSignup.jsx'
import StudentHome from './pages/StudentHome.jsx'
import DriverHome from './pages/DriverHome.jsx'
import { useAuth } from './context/AuthContext.jsx'

function Protected({ role, children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user || user.role !== role) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <div className="phone-shell">
      <div className="phone-screen">
        <div className="screen-scroll">
          <Routes>
            <Route path="/" element={<Welcome />} />
            <Route path="/role" element={<RoleSelect />} />
            <Route path="/student/login" element={<StudentLogin />} />
            <Route path="/student/signup" element={<StudentSignup />} />
            <Route path="/driver/login" element={<DriverLogin />} />
            <Route path="/driver/signup" element={<DriverSignup />} />
            <Route
              path="/student/home"
              element={
                <Protected role="student">
                  <StudentHome />
                </Protected>
              }
            />
            <Route
              path="/driver/home"
              element={
                <Protected role="driver">
                  <DriverHome />
                </Protected>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}
