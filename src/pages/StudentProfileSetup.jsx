import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'

export default function StudentProfileSetup() {
  const { user, updateProfile, logout } = useAuth()
  const navigate = useNavigate()
  const [gender, setGender] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (!['male', 'female', 'unknown'].includes(gender) || busy) return
    setBusy(true); setError('')
    const result = await updateProfile({ username: user?.username || user?.name || '', hall: user?.hall || '', gender })
    setBusy(false)
    if (!result.ok) return setError(result.message)
    navigate('/student/home', { replace: true })
  }
  return <main className="profile-setup-page">
    <div className="profile-setup-brand"><span>C</span> CUET<b>Go</b></div>
    <div className="profile-setup-card">
      <div className="profile-setup-icon">🎓</div>
      <p className="profile-setup-kicker">ONE-TIME SETUP</p>
      <h1>Set up your ride profile</h1>
      <p className="profile-setup-copy">Choose your gender for ride-sharing matches.</p>
      <form onSubmit={submit}>
        <div className="profile-gender-options">
          {[{value:'female',label:'Female',icon:'♀'},{value:'male',label:'Male',icon:'♂'},{value:'unknown',label:'Prefer not to say',icon:'—'}].map(option => <button key={option.value} type="button" aria-pressed={gender===option.value} onClick={()=>setGender(option.value)} className={`profile-gender-option ${gender===option.value?'selected':''}`}><span>{option.icon}</span>{option.label}</button>)}
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="profile-setup-submit" type="submit" disabled={!gender||busy}>{busy?'Saving…':'Continue to CUETGo'}</button>
      </form>
      <button className="profile-setup-logout" onClick={logout}>Sign out</button>
    </div>
    <p className="profile-setup-foot">Saved to your profile. You can change it later.</p>
  </main>
}
