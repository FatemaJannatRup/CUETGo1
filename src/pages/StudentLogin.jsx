import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import GoogleAuthButton from '../components/GoogleAuthButton.jsx'

export default function StudentLogin() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { googleLogin } = useAuth()
  const navigate = useNavigate()

  async function handleGoogle(credential) {
    setError('')
    setBusy(true)
    const result = await googleLogin(credential, 'student')
    setBusy(false)
    if (!result.ok) return setError(result.message)
    navigate('/student/home')
  }

  return (
    <div className="h-full min-h-full flex flex-col px-7 py-10 bg-cream">
      <button onClick={() => navigate('/role')} className="text-lilac-600 text-sm mb-6 self-start">← Back</button>
      <h1 className="font-display text-2xl text-ink mb-1">Student Login</h1>
      <p className="text-ink/60 text-sm mb-8">Sign in using your verified CUET student Google account.</p>
      <GoogleAuthButton onSuccess={handleGoogle} onError={setError} />
      {busy && <p className="text-center text-sm text-ink/60">Verifying your Google account...</p>}
      {error && <p className="text-rose-500 text-sm text-center mb-3">{error}</p>}
      <p className="text-center text-sm text-ink/60 mt-6">
        New to CUETGo? <Link to="/student/signup" className="text-lilac-600 font-medium">Create an account</Link>
      </p>
    </div>
  )
}
