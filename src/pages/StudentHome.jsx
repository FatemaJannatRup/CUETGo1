import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../api.js'
import { useFeedback } from '../context/FeedbackContext.jsx'

const HALLS = ['Muktijoddha Hall', 'Shahid Mohammad Shah Hall', 'Dr. Qudrat-E-Khuda Hall', 'Kabi Kazi Nazrul Islam Hall', 'Shaheed Tareq Huda Hall', 'Shaheed Abu Sayed Hall', 'Sufia Kamal Hall', 'Begum Shamsunnahar Khan Hall', 'Tapashi Rabeya Hall']
const formatTime = (value) => new Date(value).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const toLocalDateTimeInput = (date) => { const pad = (value) => String(value).padStart(2, '0'); return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) }
const formatDateLabel = (date) => date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

function genderLabel(g) {
  if (g === 'female') return 'Female'
  if (g === 'male') return 'Male'
  if (g === 'unknown') return 'Prefer not to say'
  return 'Not set'
}

export default function StudentHome() {
  const { user, logout, updateProfile } = useAuth()
  const notify = useFeedback()
  const [locations, setLocations] = useState([])
  const [rides, setRides] = useState([])
  const [openRides, setOpenRides] = useState([])
  const [tab, setTab] = useState(() => ['dashboard', 'rides', 'profile'].includes(sessionStorage.getItem('cuetgo_student_tab')) ? sessionStorage.getItem('cuetgo_student_tab') : 'dashboard')
  const [busy, setBusy] = useState(false)
  useEffect(() => { sessionStorage.setItem('cuetgo_student_tab', tab) }, [tab])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [joiningId, setJoiningId] = useState(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({ username: user?.username || user?.name || '', hall: user?.hall || '', gender: user?.gender || '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [calendarDays] = useState(() => Array.from({ length: 7 }, (_, idx) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + idx)
    return date
  }))
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const [form, setForm] = useState({
    from: user?.hall || '',
    to: 'Academic Building',
    requestedTime: '',
    seats: 1,
    coPassengerName: '',
    coPassengerPhone: '',
    coPassengerInfo: '',
  })

  const selectedDay = calendarDays[selectedDayIndex]

  useEffect(() => {
    if (user) {
      setForm((prev) => ({ ...prev, from: prev.from || user.hall || '' }))
      setProfileForm({ username: user.username || user.name || '', hall: user.hall || '', gender: user.gender || '' })
    }
  }, [user])

  const refreshData = async () => {
    try {
      const [{ rides: myRides }, { rides: availableRides }, { locations: nextLocations }] = await Promise.all([
        api.myRides(),
        api.openRides(),
        api.routes(),
      ])
      setRides(myRides || [])
      setOpenRides(availableRides || [])
      setLocations(nextLocations || [])
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    refreshData()
    const timer = setInterval(refreshData, 6000)
    return () => clearInterval(timer)
  }, [])

  const recommendedRides = useMemo(() => {
    const matchDetails = new Map()
    rides.forEach((request) => {
      ;(request.matchDetails || []).forEach((match) => matchDetails.set(match.rideId, match))
    })
    return openRides
      .map((ride) => ({
        ...ride,
        aiMatch: matchDetails.get(ride.id) || null,
        relevance: matchDetails.has(ride.id) ? 100 : (ride.from === form.from ? 30 : 0) + (ride.to === form.to ? 30 : 0) + (ride.from === user?.hall || ride.to === user?.hall ? 10 : 0),
      }))
      .filter((ride) => ride.aiMatch || ride.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 3)
  }, [openRides, rides, user?.hall, form.from, form.to])

  const pendingRides = rides.filter((ride) => ride.status === 'pending')
  const acceptedRides = rides.filter((ride) => ride.status === 'accepted')
  const completedRides = rides.filter((ride) => ride.status === 'completed')

  useEffect(() => {
    if (!selectedDay) return
    const nextDate = new Date(selectedDay)
    nextDate.setHours(9, 0, 0, 0)
    setForm((prev) => ({ ...prev, requestedTime: toLocalDateTimeInput(nextDate) }))
  }, [selectedDay])

  const handleRequestRide = async (event) => {
    event.preventDefault()
    setBusy(true)
    notify('Booking your ride…', 'loading', 0)
    setError('')
    setSuccess('')

    try {
      const payload = {
        ...form,
        requestedTime: form.requestedTime || toLocalDateTimeInput(new Date(new Date(selectedDay).setHours(9, 0, 0, 0))),
      }
      const result = await api.requestRide(payload)
      notify('Ride booked successfully.', 'success')
      setSuccess(`Ride request created for ${payload.from} → ${payload.to}.`)
      setForm({ ...form, from: user?.hall || '', to: 'Academic Building', requestedTime: payload.requestedTime, seats: 1, coPassengerName: '', coPassengerPhone: '', coPassengerInfo: '' })
      await refreshData()
      setTab('rides')
      setTimeout(() => setSuccess(''), 3500)
      if (result.matches?.length) {
        setSuccess(`Found ${result.matches.length} matching rider${result.matches.length > 1 ? 's' : ''}!`)
      }
    } catch (err) {
      notify(err.message, 'error')
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleJoinRide = async (ride) => {
    setJoiningId(ride.id)
    notify('Joining ride…', 'loading', 0)
    setError('')
    setSuccess('')
    try {
      const payload = { seats: 1, phone: user?.phone || '', info: 'Joining this ride' }
      await api.joinRide(ride.id, payload)
      notify('You joined the ride successfully.', 'success')
      setSuccess('You joined the ride successfully.')
      await refreshData()
    } catch (err) {
      notify(err.message, 'error')
      setError(err.message)
    } finally {
      setJoiningId(null)
    }
  }

  const handleCancelRide = async (ride) => {
    setError('')
    setSuccess('')
    const confirmed = window.confirm('Cancel your place in this ride? Any seat you release will become available to another student.')
    if (!confirmed) return
    notify('Cancelling your ride…', 'loading', 0)
    try {
      await api.cancelRide(ride.id)
      notify('Your ride place was cancelled.', 'success')
      setSuccess('Your ride place was cancelled and any released seat is available again.')
      await refreshData()
    } catch (err) {
      notify(err.message, 'error')
      setError(err.message)
    }
  }

  const handleSaveProfile = async (event) => {
    event.preventDefault()
    setSavingProfile(true)
    notify('Saving profile changes…', 'loading', 0)
    setError('')
    try {
      const result = await updateProfile(profileForm)
      if (!result.ok) throw new Error(result.message)
      setEditingProfile(false)
      notify('Profile updated successfully.', 'success')
      setSuccess('Profile updated.')
      setTimeout(() => setSuccess(''), 2400)
    } catch (err) {
      notify(err.message, 'error')
      setError(err.message)
    } finally {
      setSavingProfile(false)
    }
  }

  return (
    <div className="app-dashboard h-full min-h-full flex flex-col bg-cream text-ink">
      <header className="app-header bg-gradient-to-br from-sky-500 via-sky-400 to-sky-600 text-ink px-6 pt-10 pb-6 rounded-b-[30px] shadow-soft">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-ink/70 text-xs uppercase tracking-[0.2em]">Student Dashboard</p>
            <h1 className="text-2xl font-bold mt-2">{user?.name || 'Student'}</h1>
          </div>
          <button onClick={() => { notify('Logging out…', 'loading', 0); window.setTimeout(logout, 500) }} className="text-sm font-semibold text-ink/80 underline">Log out</button>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/30 backdrop-blur-sm border border-white/40 px-3 py-2 shadow-soft">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink/70">Status</p>
            <p className="text-xl font-bold">Ready to ride</p>
          </div>
          <span className="metric-pill">🚗 Ready</span>
        </div>
      </header>

      <main className="app-main flex-1 px-5 py-5 overflow-y-auto">
        <div className="app-tabs flex gap-2 mb-5">
          {['dashboard', 'rides', 'profile'].map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] ${tab === value ? 'bg-sky-500 text-white shadow-soft' : 'bg-white text-ink/70 border border-sky-100'}`}
            >
              {value}
            </button>
          ))}
        </div>

        {error && <div className="mb-4 rounded-2xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
        {success && <div className="mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">{success}</div>}

        {tab === 'dashboard' && (
          <div className="space-y-5">
            <div className="app-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold">Plan your trip</h2>
                <span className="metric-pill">📅 7-day</span>
              </div>

              <div className="grid grid-cols-7 gap-2 mb-4">
                {calendarDays.map((day, idx) => (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDayIndex(idx)}
                    className={`rounded-xl border px-2 py-2 text-center transition ${selectedDayIndex === idx ? 'bg-sky-500 text-white border-sky-500 shadow-soft' : 'bg-sky-50 border-sky-100 text-ink'}`}
                  >
                    <div className="text-[10px] font-bold uppercase">{day.toLocaleDateString([], { weekday: 'short' })}</div>
                    <div className="text-sm font-bold">{day.getDate()}</div>
                  </button>
                ))}
              </div>

              <form onSubmit={handleRequestRide} className="space-y-3">
                <div className="grid grid-cols-1 gap-3">
                  <label className="text-xs font-bold uppercase tracking-[0.14em] text-ink/60">From</label>
                  <select value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className="w-full rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3 text-ink focus:outline-none focus:border-sky-400">
                    <option value="">Select pickup</option>
                    {locations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <label className="text-xs font-bold uppercase tracking-[0.14em] text-ink/60">To</label>
                  <select value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className="w-full rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3 text-ink focus:outline-none focus:border-sky-400">
                    <option value="">Select destination</option>
                    {locations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <label className="text-xs font-bold uppercase tracking-[0.14em] text-ink/60">Time</label>
                  <input type="datetime-local" min={toLocalDateTimeInput(new Date(Date.now() + 2 * 60 * 1000 + 1000))} value={form.requestedTime} onChange={(e) => setForm({ ...form, requestedTime: e.target.value })} className="w-full rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3 text-ink focus:outline-none focus:border-sky-400" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-[0.14em] text-ink/60">Seats</label>
                    <select value={form.seats} onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })} className="mt-1 w-full rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3 text-ink focus:outline-none focus:border-sky-400">
                      <option value={1}>1 seat</option>
                      <option value={2}>2 seats</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-[0.14em] text-ink/60">Day</label>
                    <div className="mt-1 rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3 text-sm font-bold text-ink">
                      {formatDateLabel(selectedDay)}
                    </div>
                  </div>
                </div>

                {Number(form.seats) === 2 && (
                  <div className="rounded-2xl border border-sky-100 bg-sky-50 p-3 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink/60">Companion details</p>
                    <input value={form.coPassengerName} onChange={(e) => setForm({ ...form, coPassengerName: e.target.value })} placeholder="Companion name" className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-ink focus:outline-none" />
                    <input value={form.coPassengerPhone} onChange={(e) => setForm({ ...form, coPassengerPhone: e.target.value })} placeholder="Companion phone" className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-ink focus:outline-none" />
                    <input value={form.coPassengerInfo} onChange={(e) => setForm({ ...form, coPassengerInfo: e.target.value })} placeholder="Extra info (optional)" className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-ink focus:outline-none" />
                  </div>
                )}

                <p className="text-xs text-ink/60">Bookings and passenger changes close automatically 2 minutes before pickup. You can still book a ride shortly before departure.</p>
                <button type="submit" disabled={busy} className="primary-btn w-full py-3.5 text-sm uppercase tracking-[0.16em]">
                  {busy ? 'Booking...' : 'Book ride'}
                </button>
              </form>
            </div>

            <div className="app-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold">Recommended rides</h3>
                <span className="metric-pill">✨ smart matches</span>
              </div>

              {recommendedRides.length === 0 ? (
                <p className="text-sm text-ink/60">No matching rides yet. Try another route or time.</p>
              ) : (
                <div className="space-y-3">
                  {recommendedRides.map((ride) => (
                    <div key={ride.id} className="rounded-2xl border border-sky-100 bg-sky-50 p-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-bold text-ink">{ride.from} → {ride.to}</p>
                          <p className="text-xs text-ink/60 mt-1">{ride.hostName} • {formatTime(ride.requestedTime || ride.createdAt)}</p>
                          {ride.aiMatch && <p className="mt-2 text-xs font-semibold text-violet-700">✨ AI match · {ride.aiMatch.reason}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700">{ride.seatsLeft ?? Math.max(0, 2 - Number(ride.seats || 1))} left</span>
                          <button onClick={() => handleJoinRide(ride)} disabled={joiningId === ride.id || (ride.seatsLeft ?? Math.max(0, 2 - Number(ride.seats || 1))) < 1} className="primary-btn px-3 py-2 text-[10px] uppercase tracking-[0.10em] disabled:opacity-50">{joiningId === ride.id ? 'Joining…' : 'Join'}</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'rides' && (
          <div className="space-y-5">
            <div className="app-card p-4">
              <h2 className="text-lg font-bold mb-3">Available rides</h2>
              {openRides.length === 0 ? (
                <p className="text-sm text-ink/60">No rides are open right now.</p>
              ) : (
                <div className="space-y-3">
                  {openRides.map((ride) => {
                    const seatsLeft = Number.isFinite(Number(ride.seatsLeft)) ? Number(ride.seatsLeft) : Math.max(0, 2 - Number(ride.seats || 1))
                    return (
                      <div key={ride.id} className="rounded-2xl border border-sky-100 bg-white p-3 shadow-sm">
                        <div className="flex justify-between">
                          <p className="font-bold text-ink">{ride.from} → {ride.to}</p>
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700">{seatsLeft} left</span>
                        </div>
                        <p className="text-xs text-ink/60 mt-2">{ride.hostName} • {formatTime(ride.requestedTime || ride.createdAt)}</p>
                        <p className="text-[11px] text-ink/50 mt-1">{ride.status === 'accepted' ? 'Driver accepted' : 'Waiting for a driver'} • Booking closes 2 minutes before pickup</p>
                        <div className="mt-3 flex justify-between items-center">
                          <span className="text-xs text-ink/60">{ride.passengers?.length || 1} rider(s)</span>
                          <button onClick={() => handleJoinRide(ride)} disabled={joiningId === ride.id || seatsLeft === 0} className="primary-btn px-4 py-2 text-xs uppercase tracking-[0.12em] disabled:opacity-50">
                            {joiningId === ride.id ? 'Joining...' : 'Join ride'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="app-card p-4">
              <h2 className="text-lg font-bold mb-3">My ride requests</h2>
              {rides.length === 0 ? (
                <p className="text-sm text-ink/60">Your ride history will show up here.</p>
              ) : (
                <div className="space-y-3">
                  {rides.map((ride) => (
                    <div key={ride.id} className="rounded-2xl border border-sky-100 bg-sky-50 p-3">
                      <div className="flex justify-between items-center">
                        <p className="font-bold text-ink">{ride.from} → {ride.to}</p>
                        <span className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-bold uppercase text-sky-700">{ride.status}</span>
                      </div>
                      <p className="text-xs text-ink/60 mt-2">{formatTime(ride.requestedTime || ride.createdAt)} • {ride.seats || 1} seat(s)</p>
                      <p className="text-xs text-ink/60 mt-1">Passengers: {ride.passengers?.map((item) => item.name).join(', ') || '1 rider'}</p>
                      {['pending', 'accepted'].includes(ride.status) && new Date(ride.requestedTime || ride.createdAt).getTime() - Date.now() > 2 * 60 * 1000 && (
                        <button onClick={() => handleCancelRide(ride)} className="secondary-btn w-full mt-3 py-2 text-xs uppercase tracking-[0.12em]">Cancel my place</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="app-card p-4">
              <h2 className="text-lg font-bold mb-3">Status summary</h2>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3 text-center">
                  <div className="text-xl font-bold text-sky-700">{pendingRides.length}</div>
                  <div className="text-[10px] uppercase tracking-[0.15em] text-ink/60">Pending</div>
                </div>
                <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3 text-center">
                  <div className="text-xl font-bold text-amber-700">{acceptedRides.length}</div>
                  <div className="text-[10px] uppercase tracking-[0.15em] text-ink/60">Accepted</div>
                </div>
                <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3 text-center">
                  <div className="text-xl font-bold text-emerald-700">{completedRides.length}</div>
                  <div className="text-[10px] uppercase tracking-[0.15em] text-ink/60">Done</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'profile' && (
          <div className="app-card p-5">
            {!editingProfile ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Profile</h2>
                  <button onClick={() => setEditingProfile(true)} className="secondary-btn px-4 py-2 text-xs uppercase tracking-[0.12em]">Edit</button>
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-ink/60">Username</p>
                    <p className="mt-1 font-bold text-lg">{user?.username || user?.name}</p>
                  </div>
                  <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-ink/60">Email</p>
                    <p className="mt-1 font-bold">{user?.email}</p>
                  </div>
                  <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-ink/60">Student ID</p>
                    <p className="mt-1 font-bold">{user?.studentId}</p>
                  </div>
                  <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-ink/60">Hall</p>
                    <p className="mt-1 font-bold">{user?.hall || 'Not set'}</p>
                  </div>
                  <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-ink/60">Gender</p>
                    <p className="mt-1 font-bold">{genderLabel(user?.gender)}</p>
                  </div>
                </div>
              </>
            ) : (
              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.14em] text-ink/60">Username</label>
                  <input required minLength={3} maxLength={24} value={profileForm.username} onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })} className="mt-1 w-full rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3 text-ink" />
                  <p className="mt-1 text-xs text-ink/60">3–24 characters. Letters, numbers, dots, underscores and hyphens.</p>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.14em] text-ink/60">Hall</label>
                  <select value={profileForm.hall} onChange={(e) => setProfileForm({ ...profileForm, hall: e.target.value })} className="mt-1 w-full rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3 text-ink">
                    <option value="">Not specified</option>
                    {HALLS.map((hall) => <option key={hall} value={hall}>{hall}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.14em] text-ink/60">Gender</label>
                  <select value={profileForm.gender} onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })} className="mt-1 w-full rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3 text-ink">
                    <option value="">Not specified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="unknown">Prefer not to say</option>
                  </select>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-ink/60">
                  Your CUET email and Student ID are verified account details and cannot be changed here.
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setEditingProfile(false)} className="secondary-btn flex-1 px-4 py-3 text-xs uppercase tracking-[0.12em]">Cancel</button>
                  <button type="submit" disabled={savingProfile} className="primary-btn flex-1 px-4 py-3 text-xs uppercase tracking-[0.12em]">
                    {savingProfile ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
