import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Field, { inputClass } from '../components/Field.jsx'

const CUET_EMAIL = /^u\d{7}@student\.cuet\.ac\.bd$/i

export default function StudentLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { studentLogin } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!CUET_EMAIL.test(email)) {
      setError('Use your CUET student email, e.g. uXXXXXXX@student.cuet.ac.bd')
      return
    }
    if (!password) {
      setError('Enter your password.')
      return
    }
    setBusy(true)
    const res = await studentLogin(email.toLowerCase(), password)
    setBusy(false)
    if (!res.ok) return setError(res.message)
    navigate('/student/home')
  }

  return (
    <div className="h-full min-h-full flex flex-col px-7 py-10 bg-cream">
      <button onClick={() => navigate('/role')} className="text-lilac-600 text-sm mb-6 self-start">
        ← Back
      </button>
      <h1 className="font-display text-2xl text-ink mb-1">Student Login</h1>
      <p className="text-ink/60 text-sm mb-8">Sign in with your CUET email</p>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        <Field label="CUET Student Email">
          <input
            className={inputClass}
            type="email"
            placeholder="uXXXXXXX@student.cuet.ac.bd"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            className={inputClass}
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && <p className="text-rose-500 text-sm mb-3">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 bg-lilac-500 hover:bg-lilac-600 disabled:opacity-60 transition-colors text-white font-medium py-3.5 rounded-full shadow-soft"
        >
          {busy ? 'Logging in...' : 'Log In'}
        </button>

        <p className="text-center text-sm text-ink/60 mt-6">
          New here?{' '}
          <Link to="/student/signup" className="text-lilac-600 font-medium">
            Create an account
          </Link>
        </p>
      </form>
    </div>
  )
}
