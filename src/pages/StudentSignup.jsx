import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Field, { inputClass } from '../components/Field.jsx'
import GoogleAuthButton from '../components/GoogleAuthButton.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'

export default function StudentSignup() {
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { googleSignup } = useAuth()
  const notify = useFeedback()
  const navigate = useNavigate()
  const valid = /^[a-zA-Z0-9_.-]{3,24}$/.test(username.trim())

  async function handleGoogle(credential) {
    if (!valid || busy) return
    setError('')
    setBusy(true)
    notify('Creating your student account…', 'loading', 0)
    const result = await googleSignup(credential, 'student', { username: username.trim() })
    setBusy(false)
    if (!result.ok) { notify(result.message, 'error'); return setError(result.message) }
    notify('Your account is ready. Welcome to CUETGo!', 'success')
    navigate('/student/home', { replace: true })
  }

  return <div className="auth-page">
    <button onClick={() => navigate('/student/login')} className="auth-back">← Back to login</button>
    <div className="auth-brand"><span className="auth-brand-mark">C</span><span>CUET<span className="auth-brand-accent">Go</span></span></div>
    <div className="auth-heading"><span className="auth-eyebrow">STUDENT ACCOUNT</span><h1>Create your account</h1><p>One quick step before you join your campus rides.</p></div>
    <div className="auth-panel">
      <Field label="Choose your username"><input className={inputClass + " auth-input"} value={username} onChange={e => { setUsername(e.target.value); setError('') }} placeholder="e.g. rup_2204064" minLength={3} maxLength={24} autoComplete="username" /></Field>
      <p className="auth-hint">3–24 characters · Letters, numbers, dots, underscores and hyphens.</p>
      <div className="auth-divider"><span>THEN CONTINUE WITH</span></div>
      {valid ? <div className="auth-google">{busy ? <p className="auth-progress">Creating your account and signing you in…</p> : <GoogleAuthButton text="signup_with" onSuccess={handleGoogle} onError={setError} />}</div> : <div className="auth-google auth-google-disabled"><span>G</span><span>Enter a valid username to continue with Google</span></div>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <p className="auth-privacy">Use your official <strong>@student.cuet.ac.bd</strong> Google account. Your account is created automatically after Google verification.</p>
    </div>
    <p className="auth-switch">Already have an account? <Link to="/student/login">Log in</Link></p>
  </div>
}
