import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import GoogleAuthButton from '../components/GoogleAuthButton.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'

export default function DriverLogin() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { googleLogin } = useAuth()
  const notify = useFeedback()
  const navigate = useNavigate()
  async function handleGoogle(credential) {
    if (busy) return
    setError(''); setBusy(true)
    notify('লগইন করা হচ্ছে…', 'loading', 0)
    const result = await googleLogin(credential, 'driver')
    setBusy(false)
    if (!result.ok) { notify(result.message, 'error'); return setError(result.message) }
    notify('সফলভাবে লগইন হয়েছে।', 'success')
    navigate('/driver/home', { replace: true })
  }
  return <div className="auth-page bn">
    <button onClick={() => navigate('/role')} className="auth-back">← ফিরে যান</button>
    <div className="auth-brand"><span className="auth-brand-mark">C</span><span>CUET<span className="auth-brand-accent">Go</span></span></div>
    <div className="auth-heading"><span className="auth-eyebrow">DRIVER ACCESS</span><h1>চালক লগইন</h1><p>আপনার নিবন্ধিত Gmail দিয়ে প্রবেশ করুন।</p></div>
    <div className="auth-panel auth-login-panel">
      <div className="auth-icon-tile">🛺</div><h2>আবার স্বাগতম</h2>
      <p className="auth-panel-copy">অ্যাকাউন্ট তৈরির সময় যে Gmail ব্যবহার করেছিলেন, সেটি বেছে নিন।</p>
      <div className="auth-google">{busy ? <p className="auth-progress">Gmail যাচাই হচ্ছে…</p> : <GoogleAuthButton onSuccess={handleGoogle} onError={setError} />}</div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <p className="auth-privacy">শুধু নিবন্ধিত Gmail দিয়েই লগইন করা যাবে।</p>
    </div>
    <p className="auth-switch">নতুন চালক? <Link to="/driver/signup">অ্যাকাউন্ট খুলুন</Link></p>
  </div>
}
