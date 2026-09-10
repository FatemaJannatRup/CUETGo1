import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Field, { inputClass } from '../components/Field.jsx'

const GMAIL = /^[a-zA-Z0-9._%+-]+@gmail\.com$/
const PHONE = /^01[3-9]\d{8}$/

export default function DriverSignup() {
  const [form, setForm] = useState({ name: '', identifier: '', nid: '', rickshaw: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { driverSignup } = useAuth()
  const navigate = useNavigate()

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) return setError('নাম লিখুন')
    const val = form.identifier.trim()
    if (!GMAIL.test(val) && !PHONE.test(val)) {
      return setError('জিমেইল অথবা সঠিক মোবাইল নম্বর দিন (যেমন 017XXXXXXXX)')
    }
    if (!/^\d{10}$|^\d{13}$|^\d{17}$/.test(form.nid.trim())) {
      return setError('সঠিক এনআইডি নম্বর দিন (যাচাইয়ের জন্য প্রয়োজন)')
    }
    if (form.password.length < 6) return setError('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে')

    setBusy(true)
    const res = await driverSignup({
      name: form.name,
      identifier: val.toLowerCase(),
      nid: form.nid.trim(),
      rickshaw: form.rickshaw,
      password: form.password,
    })
    setBusy(false)
    if (!res.ok) return setError(res.message)
    navigate('/driver/home')
  }

  return (
    <div className="bn h-full min-h-full flex flex-col px-7 py-10 bg-cream">
      <button onClick={() => navigate('/driver/login')} className="text-lilac-600 text-sm mb-6 self-start">
        ← ফিরে যান
      </button>
      <h1 className="font-display text-2xl text-ink mb-1">চালক অ্যাকাউন্ট খুলুন</h1>
      <p className="text-ink/60 text-sm mb-8">নিরাপত্তার জন্য এনআইডি যাচাই আবশ্যক</p>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        <Field label="পুরো নাম">
          <input
            className={inputClass}
            placeholder="আপনার নাম লিখুন"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
          />
        </Field>
        <Field label="জিমেইল অথবা মোবাইল নম্বর">
          <input
            className={inputClass}
            placeholder="example@gmail.com / 017XXXXXXXX"
            value={form.identifier}
            onChange={(e) => update('identifier', e.target.value)}
          />
        </Field>
        <Field label="এনআইডি নম্বর">
          <input
            className={inputClass}
            placeholder="জাতীয় পরিচয়পত্র নম্বর"
            value={form.nid}
            onChange={(e) => update('nid', e.target.value)}
          />
        </Field>
        <Field label="রিকশার বিবরণ (ঐচ্ছিক)">
          <input
            className={inputClass}
            placeholder="যেমনঃ নীল রঙের রিকশা, নং ১২"
            value={form.rickshaw}
            onChange={(e) => update('rickshaw', e.target.value)}
          />
        </Field>
        <Field label="পাসওয়ার্ড">
          <input
            className={inputClass}
            type="password"
            placeholder="কমপক্ষে ৬ অক্ষর"
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
          {busy ? 'তৈরি হচ্ছে...' : 'অ্যাকাউন্ট তৈরি করুন'}
        </button>

        <p className="text-center text-sm text-ink/60 mt-6">
          অ্যাকাউন্ট আছে?{' '}
          <Link to="/driver/login" className="text-lilac-600 font-medium">
            লগইন করুন
          </Link>
        </p>
      </form>
    </div>
  )
}
