import { useNavigate } from 'react-router-dom'

export default function RoleSelect() {
  const navigate = useNavigate()
  return <div className="role-page">
    <button onClick={() => navigate('/')} className="auth-back">← Back</button>
    <div className="auth-brand"><span className="auth-brand-mark">C</span><span>CUET<span className="auth-brand-accent">Go</span></span></div>
    <div className="role-heading"><span className="auth-eyebrow">LET'S GET YOU MOVING</span><h1>How will you<br/>use CUETGo?</h1><p>Choose your account type to continue.</p></div>
    <div className="role-options">
      <button onClick={() => navigate('/student/login')} className="role-card">
        <span className="role-icon">🎓</span><span className="role-copy"><strong>I'm a student</strong><small>Find a ride, share the fare, and travel together.</small></span><span className="role-arrow">→</span>
      </button>
      <button onClick={() => navigate('/driver/login')} className="role-card">
        <span className="role-icon driver-role-icon">🛺</span><span className="role-copy"><strong>I'm a rickshaw driver</strong><small>View ride requests and manage your trips.</small></span><span className="role-arrow">→</span>
      </button>
    </div>
    <p className="role-footnote">Already have an account? Choose your role to sign in.</p>
  </div>
}
