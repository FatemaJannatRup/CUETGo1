import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import GoogleAuthButton from '../components/GoogleAuthButton.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'

export default function StudentLogin() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { googleLogin, demoLogin } = useAuth()
  const notify = useFeedback()
  const navigate = useNavigate()
  async function handleGoogle(credential) {
    if (busy) return
    setError(''); setBusy(true)
    notify('Signing you in…', 'loading', 0)
    const result = await googleLogin(credential, 'student')
    setBusy(false)
    if (!result.ok) { notify(result.message, 'error'); return setError(result.message) }
    notify('You are signed in.', 'success')
    navigate('/student/home', { replace: true })
  }
  async function handleDemo() {
    if (busy) return
    setError(''); setBusy(true)
    const result = await demoLogin('student')
    setBusy(false)
    if (!result.ok) return setError(result.message)
    notify('Demo student session started.', 'success')
    navigate('/student/home', { replace: true })
  }
  return <div className="auth-page">
    <button onClick={() => navigate('/role')} className="auth-back">← Choose account type</button>
    <div className="auth-brand"><span className="auth-brand-mark">C</span><span>CUET<span className="auth-brand-accent">Go</span></span></div>
    <div className="auth-heading"><span className="auth-eyebrow">WELCOME BACK</span><h1>Student sign in</h1><p>Your campus rides are just one sign-in away.</p></div>
    <div className="auth-panel auth-login-panel">
      <div className="auth-icon-tile">🎓</div><h2>Continue with your CUET account</h2>
      <p className="auth-panel-copy">Choose the Google account you used when creating your CUETGo account.</p>
      <div className="auth-google">{busy ? <p className="auth-progress">Verifying your Google account…</p> : <GoogleAuthButton onSuccess={handleGoogle} onError={setError} />}</div>
      <button type="button" onClick={handleDemo} disabled={busy} className="secondary-btn w-full mt-3 py-3">Explore with demo student account</button>\n      {error && <p className="auth-error" role="alert">{error}</p>}
      <p className="auth-privacy">Only verified <strong>@student.cuet.ac.bd</strong> accounts can sign in as students.</p>
    </div>
    <p className="auth-switch">New to CUETGo? <Link to="/student/signup">Create an account</Link></p>
  </div>
}
