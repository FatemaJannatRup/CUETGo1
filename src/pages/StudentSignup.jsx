import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Field, { inputClass } from '../components/Field.jsx'
import GoogleAuthButton from '../components/GoogleAuthButton.jsx'

export default function StudentSignup() {
  const [credential, setCredential] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { googleSignup } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!credential) return setError('Verify your CUET Google account first.')
    setBusy(true)
    const result = await googleSignup(credential, 'student', { username })
    setBusy(false)
    if (!result.ok) return setError(result.message)
    navigate('/student/home')
  }

  return (
    <div className="h-full min-h-full flex flex-col px-7 py-10 bg-cream">
      <button onClick={() => navigate('/student/login')} className="text-lilac-600 text-sm mb-6 self-start">← Back</button>
      <h1 className="font-display text-2xl text-ink mb-1">Create Student Account</h1>
      <p className="text-ink/60 text-sm mb-6">Use your official CUET student Google account.</p>
      <GoogleAuthButton text="signup_with" onSuccess={(value) => { setCredential(value); setError('') }} onError={setError} />
      {credential && <p className="text-center text-xs text-green-700 mb-4">Google identity received. Enter your username below.</p>}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        <Field label="Choose a username">
          <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. rup_2204064" minLength={3} maxLength={24} required />
        </Field>
        <p className="text-xs text-ink/50 mb-4">3–24 characters. Letters, numbers, dots, underscores and hyphens only.</p>
        {error && <p className="text-rose-500 text-sm mb-3">{error}</p>}
        <button type="submit" disabled={busy || !credential} className="mt-2 bg-lilac-500 hover:bg-lilac-600 disabled:opacity-60 transition-colors text-white font-medium py-3.5 rounded-full shadow-soft">
          {busy ? 'Creating account...' : 'Create account'}
        </button>
      </form>
      <p className="text-center text-sm text-ink/60 mt-6">Already registered? <Link to="/student/login" className="text-lilac-600 font-medium">Log in</Link></p>
    </div>
  )
}
