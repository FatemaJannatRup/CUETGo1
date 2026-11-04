import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Field, { inputClass } from '../components/Field.jsx'
import GoogleAuthButton from '../components/GoogleAuthButton.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'

export default function DriverSignup() {
  const [form, setForm] = useState({ name: '', nid: '', phone: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { googleSignup } = useAuth()
  const notify = useFeedback()
  const navigate = useNavigate()
  function update(key, value) { setForm(current => ({ ...current, [key]: value })); setError('') }
  const valid = form.name.trim().length >= 2 && /^(\d{10}|\d{13}|\d{17})$/.test(form.nid.trim()) && /^01[3-9]\d{8}$/.test(form.phone.trim())
  async function handleGoogle(credential) {
    if (!valid || busy) return
    setError(''); setBusy(true)
    notify('আপনার চালক অ্যাকাউন্ট তৈরি হচ্ছে…', 'loading', 0)
    const result = await googleSignup(credential, 'driver', form)
    setBusy(false)
    if (!result.ok) { notify(result.message, 'error'); return setError(result.message) }
    notify('চালক অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে।', 'success')
    navigate('/driver/home', { replace: true })
  }
  return <div className="auth-page bn">
    <button onClick={() => navigate('/driver/login')} className="auth-back">← ফিরে যান</button>
    <div className="auth-brand"><span className="auth-brand-mark">C</span><span>CUET<span className="auth-brand-accent">Go</span></span></div>
    <div className="auth-heading"><span className="auth-eyebrow">DRIVER REGISTRATION</span><h1>চালক অ্যাকাউন্ট খুলুন</h1><p>তথ্য দিন, Gmail দিয়ে যাচাই করুন, তারপর অ্যাকাউন্ট তৈরি হবে।</p></div>
    <div className="auth-panel">
      <Field label="পুরো নাম"><input className={inputClass + " auth-input"} value={form.name} onChange={e => update('name', e.target.value)} placeholder="আপনার পুরো নাম" autoComplete="name" /></Field>
      <Field label="NID নম্বর"><input className={inputClass + " auth-input"} value={form.nid} onChange={e => update('nid', e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={17} placeholder="১০, ১৩ অথবা ১৭ সংখ্যার NID" /></Field>
      <Field label="মোবাইল নম্বর"><input className={inputClass + " auth-input"} value={form.phone} onChange={e => update('phone', e.target.value)} inputMode="tel" maxLength={11} placeholder="01XXXXXXXXX" autoComplete="tel" /></Field>
      <div className="auth-divider"><span>VERIFY & CREATE ACCOUNT</span></div>
      {valid ? <div className="auth-google">{busy ? <p className="auth-progress">অ্যাকাউন্ট তৈরি হচ্ছে…</p> : <GoogleAuthButton text="signup_with" onSuccess={handleGoogle} onError={setError} />}</div> : <div className="auth-google auth-google-disabled"><span>G</span><span>প্রথমে সঠিক তথ্য পূরণ করুন</span></div>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <p className="auth-privacy">Gmail যাচাই এবং NID অনুমোদন আলাদা বিষয়। অ্যাকাউন্ট তৈরির পর চালকের অনুমোদন pending থাকবে।</p>
    </div>
    <p className="auth-switch">অ্যাকাউন্ট আছে? <Link to="/driver/login">লগইন করুন</Link></p>
  </div>
}
