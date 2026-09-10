import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Field, { inputClass } from '../components/Field.jsx'

const CUET_EMAIL = /^u\d{7}@student\.cuet\.ac\.bd$/i
const STUDENT_ID = /^\d{7}$/

export default function StudentSignup() {
  const [form, setForm] = useState({ name: '', email: '', studentId: '', gender: '', hall: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { studentSignup } = useAuth()
  const navigate = useNavigate()

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) return setError('Enter your full name.')
    if (!CUET_EMAIL.test(form.email)) {
      return setError('Use your CUET student email, e.g. u2204064@student.cuet.ac.bd')
    }
    if (!STUDENT_ID.test(form.studentId)) return setError('Enter your 7-digit student ID, e.g. 2204064')
    if (!form.gender) return setError('Select your gender.')
    if (form.password.length < 6) return setError('Password must be at least 6 characters.')

    setBusy(true)
    const res = await studentSignup({
      name: form.name,
      email: form.email.toLowerCase(),
      studentId: form.studentId,
      gender: form.gender,
      hall: form.hall,
      password: form.password,
    })
    setBusy(false)
    if (!res.ok) return setError(res.message)
    navigate('/student/home')
  }

  return (
    <div className="h-full min-h-full flex flex-col px-7 py-10 bg-cream">
      <button onClick={() => navigate('/student/login')} className="text-lilac-600 text-sm mb-6 self-start">
        ← Back
      </button>
      <h1 className="font-display text-2xl text-ink mb-1">Create Student Account</h1>
      <p className="text-ink/60 text-sm mb-8">Only for verified CUET students</p>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        <Field label="Full Name">
          <input
            className={inputClass}
            placeholder="XXXXXXXXXX"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
          />
        </Field>
        <Field label="CUET Student Email">
          <input
            className={inputClass}
            type="email"
            placeholder="uXXXXXXX@student.cuet.ac.bd"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
          />
        </Field>
        <Field label="Student ID">
          <input
            className={inputClass}
            inputMode="numeric"
            placeholder="2204064"
            value={form.studentId}
            onChange={(e) => update('studentId', e.target.value)}
          />
        </Field>
        <Field label="Gender">
          <select
            className={inputClass}
            required
            value={form.gender}
            onChange={(e) => update('gender', e.target.value)}
          >
            <option value="">Select gender</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="unknown">Prefer not to say</option>
          </select>
        </Field>
        <Field label="Hall of Residence">
          <select
            className={inputClass}
            required
            value={form.hall}
            onChange={(e) => update('hall', e.target.value)}
          >
            <option value="">Select your hall</option>
            {['Muktijoddha Hall', 'Shahid Mohammad Shah Hall', 'Dr. Qudrat-E-Khuda Hall', 'Kabi Kazi Nazrul Islam Hall', 'Shaheed Tareq Huda Hall', 'Shaheed Abu Sayed Hall', 'Sufia Kamal Hall', 'Begum Shamsunnahar Khan Hall', 'Tapashi Rabeya Hall'].map((hall) => <option key={hall}>{hall}</option>)}
          </select>
        </Field>
        <Field label="Password">
          <input
            className={inputClass}
            type="password"
            placeholder="At least 6 characters"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
          />
        </Field>

        {error && <p className="text-rose-500 text-sm mb-3">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 bg-lilac-500 hover:bg-lilac-600 disabled:opacity-60 transition-colors text-white font-medium py-3.5 rounded-full shadow-soft"
        >
          {busy ? 'Creating account...' : 'Sign Up'}
        </button>

        <p className="text-center text-sm text-ink/60 mt-6">
          Already have an account?{' '}
          <Link to="/student/login" className="text-lilac-600 font-medium">
            Log in
          </Link>
        </p>
      </form>
    </div>
  )
}
