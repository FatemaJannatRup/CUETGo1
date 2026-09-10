import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Field, { inputClass } from '../components/Field.jsx'

const GMAIL = /^[a-zA-Z0-9._%+-]+@gmail\.com$/
const PHONE = /^01[3-9]\d{8}$/

export default function DriverLogin() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { driverLogin } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const val = identifier.trim()
    if (!GMAIL.test(val) && !PHONE.test(val)) {
      setError('জিমেইল অথবা সঠিক মোবাইল নম্বর দিন (যেমন 017XXXXXXXX)')
      return
    }
    if (!password) return setError('পাসওয়ার্ড দিন')

    setBusy(true)
    const res = await driverLogin(val.toLowerCase(), password)
    setBusy(false)
    if (!res.ok) return setError(res.message)
    navigate('/driver/home')
  }

  return (
    <div className="bn h-full min-h-full flex flex-col px-7 py-10 bg-cream">
      <button onClick={() => navigate('/role')} className="text-lilac-600 text-sm mb-6 self-start">
        ← ফিরে যান
      </button>
      <h1 className="font-display text-2xl text-ink mb-1">চালক লগইন</h1>
      <p className="text-ink/60 text-sm mb-8">জিমেইল অথবা মোবাইল নম্বর দিয়ে লগইন করুন</p>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        <Field label="জিমেইল অথবা মোবাইল নম্বর">
          <input
            className={inputClass}
            placeholder="example@gmail.com / 017XXXXXXXX"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </Field>
        <Field label="পাসওয়ার্ড">
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
          {busy ? 'লগইন হচ্ছে...' : 'লগইন করুন'}
        </button>

        <p className="text-center text-sm text-ink/60 mt-6">
          নতুন চালক?{' '}
          <Link to="/driver/signup" className="text-lilac-600 font-medium">
            অ্যাকাউন্ট খুলুন
          </Link>
        </p>
      </form>
    </div>
  )
}
