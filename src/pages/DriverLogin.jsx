import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import GoogleAuthButton from '../components/GoogleAuthButton.jsx'

export default function DriverLogin() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { googleLogin } = useAuth()
  const navigate = useNavigate()

  async function handleGoogle(credential) {
    setError('')
    setBusy(true)
    const result = await googleLogin(credential, 'driver')
    setBusy(false)
    if (!result.ok) return setError(result.message)
    navigate('/driver/home')
  }

  return (
    <div className="bn h-full min-h-full flex flex-col px-7 py-10 bg-cream">
      <button onClick={() => navigate('/role')} className="text-lilac-600 text-sm mb-6 self-start">← ফিরে যান</button>
      <h1 className="font-display text-2xl text-ink mb-1">চালক লগইন</h1>
      <p className="text-ink/60 text-sm mb-8">আপনার নিবন্ধিত Gmail দিয়ে প্রবেশ করুন</p>
      <GoogleAuthButton onSuccess={handleGoogle} onError={setError} />
      {busy && <p className="text-center text-sm text-ink/60">Gmail যাচাই হচ্ছে...</p>}
      {error && <p className="text-rose-500 text-sm text-center mb-3">{error}</p>}
      <p className="text-center text-sm text-ink/60 mt-6">নতুন চালক? <Link to="/driver/signup" className="text-lilac-600 font-medium">অ্যাকাউন্ট খুলুন</Link></p>
    </div>
  )
}
