import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../api.js'
import { useFeedback } from '../context/FeedbackContext.jsx'

const HALLS = ['Muktijoddha Hall', 'Shahid Mohammad Shah Hall', 'Dr. Qudrat-E-Khuda Hall', 'Kabi Kazi Nazrul Islam Hall', 'Shaheed Tareq Huda Hall', 'Shaheed Abu Sayed Hall', 'Sufia Kamal Hall', 'Begum Shamsunnahar Khan Hall', 'Tapashi Rabeya Hall']
const formatRideDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}
const formatRideClock = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
const formatRideStatus = (status) => String(status || 'pending').replaceAll('_', ' ')
const toLocalDateTimeInput = (date) => { const pad = (value) => String(value).padStart(2, '0'); return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) }
const formatDateLabel = (date) => date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

function genderLabel(g) {
  if (g === 'female') return 'Female'
  if (g === 'male') return 'Male'
  if (g === 'unknown') return 'Prefer not to say'
  return 'Not set'
}
function genderAllows(preference, gender) {
  return !['male', 'female'].includes(preference) || preference === gender
}
function preferenceLabel(value) {
  return value === 'male' ? 'Male students' : value === 'female' ? 'Female students' : 'Any gender'
}
function estimateFare(from, to) {
  if (!from || !to || from === to) return null
  if (HALLS.includes(from) && HALLS.includes(to)) return 20
  if (HALLS.includes(from)) return 30
  return 25
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
  const [cancelRideTarget, setCancelRideTarget] = useState(null)
  const [canceling, setCanceling] = useState(false)
  const [editRideTarget, setEditRideTarget] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
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
    sharingMode: 'private',
    genderPreference: 'any',
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
        api.openRides(form.sharingMode === 'share' ? form.genderPreference : 'any'),
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
  }, [form.sharingMode, form.genderPreference])

  const recommendedRides = useMemo(() => {
    // Recommendations are strict whole-journey matches, not independent
    // pickup/destination matches. Only CUET location IDs from the server list
    // can be selected, and both endpoints must match in the same direction.
    if (form.sharingMode !== 'share' || !form.from || !form.to || form.from === form.to || !locations.includes(form.from) || !locations.includes(form.to)) return []

    const requestedAt = Date.parse(form.requestedTime)
    if (!Number.isFinite(requestedAt)) return []
    const requestedSeats = Math.max(1, Math.min(2, Number(form.seats) || 1))
    const timeWindowMs = 10 * 60 * 1000

    return openRides
      .filter((ride) => {
        if (ride.sharingMode !== 'share') return false
        if (ride.from !== form.from || ride.to !== form.to) return false
        if (!locations.includes(ride.from) || !locations.includes(ride.to)) return false
        if (!genderAllows(ride.genderPreference, user?.gender)) return false
        if (!['pending', 'accepted', 'arrived'].includes(ride.status)) return false
        const rideTime = Date.parse(ride.requestedTime || ride.createdAt)
        if (!Number.isFinite(rideTime) || Math.abs(rideTime - requestedAt) > timeWindowMs) return false
        const seatsLeft = Number.isFinite(Number(ride.seatsLeft))
          ? Number(ride.seatsLeft)
          : Math.max(0, 2 - Number(ride.seats ?? 1))
        return seatsLeft >= requestedSeats
      })
      .map((ride) => ({
        ...ride,
        timeDifferenceMinutes: Math.round(Math.abs(Date.parse(ride.requestedTime || ride.createdAt) - requestedAt) / 60000),
      }))
      .sort((a, b) => a.timeDifferenceMinutes - b.timeDifferenceMinutes)
      .slice(0, 3)
  }, [openRides, locations, form.from, form.to, form.requestedTime, form.seats, form.sharingMode, form.genderPreference, user?.gender])

  const pendingRides = rides.filter((ride) => ride.status === 'pending')
  const acceptedRides = rides.filter((ride) => ['accepted', 'arrived', 'in_progress'].includes(ride.status))
  const completedRides = rides.filter((ride) => ride.status === 'completed')

  useEffect(() => {
    if (!selectedDay) return
    const nextDate = new Date(selectedDay)
    nextDate.setHours(9, 0, 0, 0)
    // For today, default to five minutes from now so a last-minute campus
    // booking is immediately possible instead of defaulting to a past 9 AM.
    if (nextDate.getTime() < Date.now() + 3 * 60 * 1000) {
      nextDate.setTime(Date.now() + 5 * 60 * 1000)
      nextDate.setSeconds(0, 0)
    }
    setForm((prev) => ({ ...prev, requestedTime: toLocalDateTimeInput(nextDate) }))
  }, [selectedDay])

  const handleRequestRide = async (event) => {
    event.preventDefault()
    setBusy(true)
    notify('Booking your ride…', 'loading', 0)
    setError('')
    setSuccess('')

    try {
      const localPickupValue = form.requestedTime || toLocalDateTimeInput(new Date(new Date(selectedDay).setHours(9, 0, 0, 0)))
      const payload = {
        ...form,
        // datetime-local values are browser-local; send an explicit UTC instant
        // so Render's server timezone cannot shift a Bangladesh pickup by 6 hours.
        requestedTime: new Date(localPickupValue).toISOString(),
      }
      const result = await api.requestRide(payload)
      notify('Ride booked successfully.', 'success')
      setSuccess(`Ride request created for ${payload.from} → ${payload.to}.`)
      setForm({ ...form, from: user?.hall || '', to: 'Academic Building', requestedTime: toLocalDateTimeInput(new Date(payload.requestedTime)), seats: 1, sharingMode: 'private', genderPreference: 'any', coPassengerName: '', coPassengerPhone: '', coPassengerInfo: '' })
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
      const payload = {
        seats: 1,
        genderPreference: form.sharingMode === 'share' ? form.genderPreference : 'any',
        phone: user?.phone || '',
        info: 'Joining this ride',
        coPassengerName: '',
        coPassengerPhone: '',
        coPassengerInfo: '',
      }
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

  const handleCancelRide = (ride) => {
    setError('')
    setSuccess('')
    setCancelRideTarget(ride)
  }

  const confirmCancelRide = async () => {
    if (!cancelRideTarget) return
    setCanceling(true)
    notify('Cancelling your ride…', 'loading', 0)
    try {
      const result = await api.cancelRide(cancelRideTarget.id)
      setCancelRideTarget(null)
      notify('Your ride place was cancelled.', 'success')
      setSuccess(result.driverAssigned
        ? 'Your place was cancelled. The accepted driver remains assigned and the open shared trip is available to compatible students.'
        : result.tripPreserved
          ? 'Your place was cancelled. The remaining rider’s request stays active and the released seat can be joined.'
          : cancelRideTarget.sharingMode === 'private'
            ? 'Your private booking was cancelled.'
            : 'Your open-to-share request was cancelled because no rider remained or the booking window had closed.')
      await refreshData()
    } catch (err) {
      notify(err.message, 'error')
      setError(err.message)
    } finally {
      setCanceling(false)
    }
  }

  const handleEditRide = (ride) => {
    setEditRideTarget(ride)
    setEditForm({
      from: ride.from,
      to: ride.to,
      requestedTime: toLocalDateTimeInput(new Date(ride.requestedTime || ride.createdAt)),
      sharingMode: ride.sharingMode || 'private',
      genderPreference: ride.genderPreference || 'any',
    })
  }

  const handleSaveRideEdit = async (event) => {
    event.preventDefault()
    if (!editRideTarget || !editForm) return
    setSavingEdit(true)
    notify('Updating your ride…', 'loading', 0)
    try {
      await api.updateRide(editRideTarget.id, {
        ...editForm,
        requestedTime: new Date(editForm.requestedTime).toISOString(),
      })
      setEditRideTarget(null)
      setEditForm(null)
      notify('Ride updated successfully.', 'success')
      await refreshData()
    } catch (err) {
      notify(err.message, 'error')
      setError(err.message)
    } finally {
      setSavingEdit(false)
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
          <button type="button" onClick={logout} className="text-sm font-semibold text-ink/80 underline">Log out</button>
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
        <nav className="app-tabs flex gap-2 mb-5" aria-label="Student dashboard sections">
          {['dashboard', 'rides', 'profile'].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] ${tab === value ? 'bg-sky-500 text-white shadow-soft' : 'bg-white text-ink/70 border border-sky-100'}`}
            >
              {value === 'dashboard' ? 'Book' : value === 'rides' ? 'My rides' : 'Profile'}
            </button>
          ))}
        </nav>

        {error && <div className="mb-4 rounded-2xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
        {success && <div className="mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">{success}</div>}

        {tab === 'dashboard' && (
          <div className="space-y-5">
            <div className="app-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold">Plan your trip</h2>
                <span className="metric-pill">Next 7 days</span>
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
                    <select value={form.seats} onChange={(e) => setForm({ ...form, seats: Number(e.target.value), sharingMode: e.target.value === '2' ? 'private' : form.sharingMode })} className="mt-1 w-full rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3 text-ink focus:outline-none focus:border-sky-400">
                      <option value={1}>1 seat</option>
                      <option value={2}>2 seats (private)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-[0.14em] text-ink/60">Day</label>
                    <div className="mt-1 rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3 text-sm font-bold text-ink">
                      {formatDateLabel(selectedDay)}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block">Ride type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" aria-pressed={form.sharingMode === 'private'} onClick={() => setForm({ ...form, sharingMode: 'private' })} className={`ride-type-option ${form.sharingMode === 'private' ? 'ride-type-private active' : ''}`}>
                      <span className="ride-type-icon">🔒</span><strong>Private</strong><small>Just my group</small>
                    </button>
                    <button type="button" aria-pressed={form.sharingMode === 'share'} onClick={() => setForm({ ...form, sharingMode: 'share', seats: 1, coPassengerName: '', coPassengerPhone: '', coPassengerInfo: '' })} className={`ride-type-option ${form.sharingMode === 'share' ? 'ride-type-share active' : ''}`}>
                      <span className="ride-type-icon">🤝</span><strong>Share ride</strong><small>Find a co-rider</small>
                    </button>
                  </div>
                </div>

                {form.sharingMode === 'share' && (
                  <div>
                    <label className="text-xs font-bold uppercase tracking-[0.14em] text-ink/60">Preferred co-rider gender</label>
                    <select value={form.genderPreference} onChange={(e) => setForm({ ...form, genderPreference: e.target.value })} className="mt-1 w-full rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3 text-ink">
                      <option value="any">No preference</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>

                  </div>
                )}

                {Number(form.seats) === 2 && (
                  <div className="rounded-2xl border border-sky-100 bg-sky-50 p-3 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink/60">Companion details</p>
                    <input value={form.coPassengerName} onChange={(e) => setForm({ ...form, coPassengerName: e.target.value })} placeholder="Companion name" className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-ink focus:outline-none" />
                    <input value={form.coPassengerPhone} onChange={(e) => setForm({ ...form, coPassengerPhone: e.target.value })} placeholder="Companion phone" className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-ink focus:outline-none" />
                    <input value={form.coPassengerInfo} onChange={(e) => setForm({ ...form, coPassengerInfo: e.target.value })} placeholder="Extra info (optional)" className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-ink focus:outline-none" />
                  </div>
                )}

                {estimateFare(form.from, form.to) !== null && (
                  <div className="rounded-2xl border border-sky-100 bg-sky-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink/60">Estimated total rickshaw fare</p>
                    <p className="mt-1 text-xl font-bold text-sky-700">৳{estimateFare(form.from, form.to).toFixed(2)}</p>
                    <p className="mt-1 text-xs text-ink/60">{form.sharingMode === 'share' ? `৳${(estimateFare(form.from, form.to) / 2).toFixed(2)} each when matched` : 'Full fare for your group'}</p>
                  </div>
                )}

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
                <p className="text-sm text-ink/60">{form.sharingMode !== 'share' ? 'Choose “Open to sharing” to see compatible shared rides.' : !form.from || !form.to || form.from === form.to ? 'Choose two different CUET locations to see matching rides.' : 'No exact CUET route, time and gender-preference matches have an available seat.'}</p>
              ) : (
                <div className="space-y-3">
                  {recommendedRides.map((ride) => (
                    <div key={ride.id} className="rounded-2xl border border-sky-100 bg-sky-50 p-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-bold text-ink">{ride.from} → {ride.to}</p>
                          <div className="ride-time-block"><span className="ride-time-date">{formatRideDate(ride.requestedTime || ride.createdAt)}</span><strong className="ride-time-clock">{formatRideClock(ride.requestedTime || ride.createdAt)}</strong></div><p className="ride-host-name">{ride.hostName}</p>
                          <p className="mt-2 text-xs text-ink/60">{ride.timeDifferenceMinutes === 0 ? 'Same time' : `${ride.timeDifferenceMinutes} min difference`}</p>
                          
                          <p className="mt-1 text-xs font-semibold text-sky-700">Estimated fare if you join: ৳{Number(ride.estimatedFare ?? ride.farePerSeat ?? 0).toFixed(2)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="ride-status-pill ride-status-open">{ride.seatsLeft ?? Math.max(0, 2 - Number(ride.seats ?? 1))} LEFT</span>
                          <button onClick={() => handleJoinRide(ride)} disabled={joiningId === ride.id || (ride.seatsLeft ?? Math.max(0, 2 - Number(ride.seats ?? 1))) < 1} className="primary-btn join-ride-btn px-3 py-2 text-[10px] uppercase tracking-[0.10em] disabled:opacity-50">{joiningId === ride.id ? 'Joining…' : 'Join'}</button>
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
                    const seatsLeft = Number.isFinite(Number(ride.seatsLeft)) ? Number(ride.seatsLeft) : Math.max(0, 2 - Number(ride.seats ?? 1))
                    return (
                      <div key={ride.id} className="rounded-2xl border border-sky-100 bg-white p-3 shadow-sm">
                        <div className="ride-card-heading">
                          <p className="ride-route-title">{ride.from} → {ride.to}</p>
                          <span className="ride-status-pill ride-status-open">{seatsLeft} LEFT</span>
                        </div>
                        <div className="ride-time-block" aria-label={`Departure ${formatRideDate(ride.requestedTime || ride.createdAt)} at ${formatRideClock(ride.requestedTime || ride.createdAt)}`}>
                          <span className="ride-time-date">{formatRideDate(ride.requestedTime || ride.createdAt)}</span>
                          <strong className="ride-time-clock">{formatRideClock(ride.requestedTime || ride.createdAt)}</strong>
                        </div>
                        <p className="ride-host-name">{ride.hostName}</p>
                        <p className="mt-1 text-xs text-ink/60">Preferred co-rider: {preferenceLabel(ride.genderPreference)}</p>
                        <p className="mt-1 text-xs font-semibold text-sky-700">Estimated fare if you join: ৳{Number(ride.estimatedFare ?? ride.farePerSeat ?? 0).toFixed(2)}</p>
                        <p className="text-[11px] text-ink/50 mt-1">{ride.status === 'arrived' ? 'Driver at pickup' : ride.status === 'accepted' ? 'Driver assigned' : ride.driverCancelledAt ? 'Finding a driver' : 'Waiting for driver'}</p>
                        <div className="mt-3 flex justify-between items-center">
                          <span className="text-xs text-ink/60">{ride.riderCount ?? 1} rider(s)</span>
                          <button onClick={() => handleJoinRide(ride)} disabled={joiningId === ride.id || seatsLeft < 1} className="primary-btn join-ride-btn px-4 py-2 text-xs uppercase tracking-[0.12em] disabled:opacity-50">
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
                      <div className="ride-card-heading">
                        <p className="ride-route-title">{ride.from} → {ride.to}</p>
                        <span className={`ride-status-pill ride-status-${ride.status}`}>{formatRideStatus(ride.status)}</span>
                      </div>
                      <div className="ride-request-meta">
                        <div className="ride-time-block" aria-label={`Departure ${formatRideDate(ride.requestedTime || ride.createdAt)} at ${formatRideClock(ride.requestedTime || ride.createdAt)}`}>
                          <span className="ride-time-date">{formatRideDate(ride.requestedTime || ride.createdAt)}</span>
                          <strong className="ride-time-clock">{formatRideClock(ride.requestedTime || ride.createdAt)}</strong>
                        </div>
                        <span className="ride-seat-count">{ride.seats ?? 1} seat(s)</span>
                      </div>
                      <p className="text-xs text-ink/60 mt-1">Passengers: {ride.passengers?.map((item) => item.name).join(', ') || '1 rider'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2"><span className={`ride-type-tag ${ride.sharingMode === 'share' ? 'share' : 'private'}`}>{ride.sharingMode === 'share' ? 'Shared' : 'Private'}</span><strong className="text-sm text-sky-700">৳{Number(ride.myFare ?? ride.farePerSeat ?? ride.fare ?? 0).toFixed(2)}</strong></div>
                      {ride.driverCancelledAt && ride.status === 'pending' && <p className="text-xs text-amber-700 mt-1">Your previous driver cancelled. CUETGo is looking for a replacement driver.</p>}
                      {['pending', 'accepted', 'arrived'].includes(ride.status) && new Date(ride.requestedTime || ride.createdAt).getTime() > Date.now() && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {ride.canEdit && <button onClick={() => handleEditRide(ride)} className="secondary-btn edit-ride-btn py-2 text-xs uppercase tracking-[0.12em]">Edit booking</button>}
                          <button onClick={() => handleCancelRide(ride)} className="secondary-btn cancel-ride-btn py-2 text-xs uppercase tracking-[0.12em]">{ride.isCreator ? 'Cancel my ride' : 'Leave shared ride'}</button>
                        </div>
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
      {editRideTarget && editForm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 p-5 backdrop-blur-sm" onClick={() => !savingEdit && setEditRideTarget(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="edit-ride-title" className="w-full max-w-md rounded-3xl border border-white/70 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h2 id="edit-ride-title" className="text-lg font-bold">Edit your booking</h2>
            <form onSubmit={handleSaveRideEdit} className="mt-4 space-y-3">
              <label className="block text-xs font-bold uppercase tracking-[0.12em] text-ink/60">Pickup
                <select required value={editForm.from} onChange={(e) => setEditForm({ ...editForm, from: e.target.value })} className="mt-1 w-full rounded-xl border border-sky-100 bg-sky-50 px-3 py-3 text-ink">
                  {locations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold uppercase tracking-[0.12em] text-ink/60">Destination
                <select required value={editForm.to} onChange={(e) => setEditForm({ ...editForm, to: e.target.value })} className="mt-1 w-full rounded-xl border border-sky-100 bg-sky-50 px-3 py-3 text-ink">
                  {locations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold uppercase tracking-[0.12em] text-ink/60">Pickup time
                <input required type="datetime-local" min={toLocalDateTimeInput(new Date(Date.now() + 2 * 60 * 1000 + 1000))} value={editForm.requestedTime} onChange={(e) => setEditForm({ ...editForm, requestedTime: e.target.value })} className="mt-1 w-full rounded-xl border border-sky-100 bg-sky-50 px-3 py-3 text-ink" />
              </label>
              <label className="block text-xs font-bold uppercase tracking-[0.12em] text-ink/60">Booking type
                <select value={editForm.sharingMode} onChange={(e) => setEditForm({ ...editForm, sharingMode: e.target.value })} className="mt-1 w-full rounded-xl border border-sky-100 bg-sky-50 px-3 py-3 text-ink">
                  <option value="private">Private</option>
                  <option value="share" disabled={Number(editRideTarget.seats || 1) !== 1}>Open to sharing</option>
                </select>
              </label>
              {editForm.sharingMode === 'share' && (
                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-ink/60">Preferred co-rider
                  <select value={editForm.genderPreference} onChange={(e) => setEditForm({ ...editForm, genderPreference: e.target.value })} className="mt-1 w-full rounded-xl border border-sky-100 bg-sky-50 px-3 py-3 text-ink">
                    <option value="any">Any gender</option><option value="male">Male</option><option value="female">Female</option>
                  </select>
                </label>
              )}
              <p className="text-xs text-ink/60">Only the original creator can edit. Editing is available before a driver accepts and before the two-minute booking cutoff.</p>
              <div className="flex gap-2 pt-2">
                <button type="button" disabled={savingEdit} onClick={() => setEditRideTarget(null)} className="secondary-btn flex-1 py-3 text-xs">Keep current booking</button>
                <button type="submit" disabled={savingEdit} className="primary-btn flex-1 py-3 text-xs">{savingEdit ? 'Saving…' : 'Save changes'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {cancelRideTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-5 backdrop-blur-sm" onClick={() => !canceling && setCancelRideTarget(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="student-cancel-title" className="w-full max-w-sm rounded-3xl border border-white/70 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-2xl">⚠️</div>
            <h2 id="student-cancel-title" className="text-lg font-bold text-ink">Cancel your ride place?</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/65">{cancelRideTarget.isCreator
              ? cancelRideTarget.sharingMode === 'share'
                ? 'Cancelling removes your seat. Any registered student who already joined can continue, and the released seat may be offered to another compatible student.'
                : 'This is a private booking. Cancelling removes your booking, including the companion seat.'
              : 'You will leave only your own seat. The creator and any other registered passenger remain booked.'}</p>
            <div className="mt-4 rounded-2xl bg-sky-50 p-3 text-sm font-semibold text-ink">{cancelRideTarget.from} → {cancelRideTarget.to}</div>
            <div className="mt-5 flex gap-2">
              <button type="button" disabled={canceling} onClick={() => setCancelRideTarget(null)} className="secondary-btn flex-1 rounded-xl px-3 py-3 text-sm">Keep ride</button>
              <button type="button" disabled={canceling} onClick={confirmCancelRide} className="flex-1 rounded-xl bg-rose-600 px-3 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{canceling ? 'Cancelling…' : 'Yes, cancel'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
