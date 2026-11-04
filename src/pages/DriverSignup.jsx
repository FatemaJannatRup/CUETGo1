import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Field, { inputClass } from '../components/Field.jsx'
import GoogleAuthButton from '../components/GoogleAuthButton.jsx'

export default function DriverSignup() {
  const [form, setForm] = useState({ name: '', nid: '', phone: '' })
  const [credential, setCredential] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { googleSignup } = useAuth()
  const navigate = useNavigate()

  function update(key, value) { setForm((current) => ({ ...current, [key]: value })) }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!credential) return setError('আগে Google দিয়ে Gmail যাচাই করুন।')
    setBusy(true)
    const result = await googleSignup(credential, 'driver', form)
    setBusy(false)
    if (!result.ok) return setError(result.message)
    navigate('/driver/home')
  }

  return (
    <div className="bn h-full min-h-full flex flex-col px-7 py-10 bg-cream">
      <button onClick={() => navigate('/driver/login')} className="text-lilac-600 text-sm mb-6 self-start">← ফিরে যান</button>
      <h1 className="font-display text-2xl text-ink mb-1">চালক অ্যাকাউন্ট খুলুন</h1>
      <p className="text-ink/60 text-sm mb-6">নাম, NID ও মোবাইল নম্বর দিন এবং Gmail যাচাই করুন।</p>
      <GoogleAuthButton text="signup_with" onSuccess={(value) => { setCredential(value); setError('') }} onError={setError} />
      {credential && <p className="text-center text-xs text-green-700 mb-4">Gmail যাচাই হয়েছে। বাকি তথ্য পূরণ করুন।</p>}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        <Field label="পুরো নাম">
          <input className={inputClass} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="আপনার পুরো নাম" required />
        </Field>
        <Field label="NID নম্বর">
          <input className={inputClass} value={form.nid} onChange={(e) => update('nid', e.target.value)} inputMode="numeric" placeholder="১০, ১৩ অথবা ১৭ সংখ্যার NID" required />
        </Field>
        <Field label="মোবাইল নম্বর">
          <input className={inputClass} value={form.phone} onChange={(e) => update('phone', e.target.value)} inputMode="tel" placeholder="01XXXXXXXXX" required />
        </Field>
        <p className="text-xs text-ink/50 mb-4">Gmail verification confirms access to the email account; NID approval is a separate process.</p>
        {error && <p className="text-rose-500 text-sm mb-3">{error}</p>}
        <button type="submit" disabled={busy || !credential} className="mt-2 bg-lilac-500 hover:bg-lilac-600 disabled:opacity-60 transition-colors text-white font-medium py-3.5 rounded-full shadow-soft">
          {busy ? 'তৈরি হচ্ছে...' : 'অ্যাকাউন্ট তৈরি করুন'}
        </button>
      </form>
      <p className="text-center text-sm text-ink/60 mt-6">অ্যাকাউন্ট আছে? <Link to="/driver/login" className="text-lilac-600 font-medium">লগইন করুন</Link></p>
    </div>
  )
}
