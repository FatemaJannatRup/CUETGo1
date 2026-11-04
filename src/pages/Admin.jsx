import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useFeedback } from '../context/FeedbackContext.jsx'

const tabs = ['Overview', 'Drivers', 'Students', 'Rides']
const dateLabel = (value) => value ? new Date(value).toLocaleString() : '—'

function Stat({ label, value, hint }) {
  return <div className="admin-stat"><span>{label}</span><strong>{value ?? 0}</strong><small>{hint}</small></div>
}

export default function Admin() {
  const notify = useFeedback()
  const [admin, setAdmin] = useState(null)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [activeTab, setActiveTab] = useState(() => {
    const saved = sessionStorage.getItem('cuetgo_admin_tab')
    return tabs.includes(saved) ? saved : 'Overview'
  })
  const [overview, setOverview] = useState(null)
  const [drivers, setDrivers] = useState([])
  const [students, setStudents] = useState([])
  const [rides, setRides] = useState([])
  const [driverFilter, setDriverFilter] = useState('pending')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [summary, driverData, studentData, rideData] = await Promise.all([
        api.adminOverview(), api.adminDrivers(driverFilter), api.adminStudents(), api.adminRides(),
      ])
      setOverview(summary.counts)
      setDrivers(driverData.drivers)
      setStudents(studentData.students)
      setRides(rideData.rides)
      return true
    } catch (e) {
      setError(e.message)
      return false
      if (/session|logged|token|unauthorized/i.test(e.message)) logout()
    } finally {
      setLoading(false)
    }
  }, [driverFilter])

  useEffect(() => {
    sessionStorage.setItem('cuetgo_admin_tab', activeTab)
  }, [activeTab])

  useEffect(() => {
    const token = localStorage.getItem('cuetgo_admin_token')
    if (!token) { setChecking(false); return }
    api.adminMe()
      .then(({ admin: current }) => setAdmin(current))
      .catch(() => localStorage.removeItem('cuetgo_admin_token'))
      .finally(() => setChecking(false))
  }, [])

  useEffect(() => {
    if (admin) loadDashboard()
  }, [admin, loadDashboard])

  function logout() {
    localStorage.removeItem('cuetgo_admin_token')
    setAdmin(null)
    setOverview(null)
    setDrivers([])
    setStudents([])
    setRides([])
  }

  async function handleLogin(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)
    notify('Signing in to the admin dashboard…', 'loading', 0)
    try {
      const result = await api.adminLogin({ email, password })
      localStorage.setItem('cuetgo_admin_token', result.token)
      setAdmin(result.admin)
      notify('Admin sign-in successful.', 'success')
      setPassword('')
    } catch (e) {
      notify(e.message, 'error')
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function updateDriver(id, status) {
    setBusyId(id)
    setError('')
    setNotice('')
    const actionLabel = status === 'approved' ? 'Approving driver…' : status === 'rejected' ? 'Rejecting driver…' : 'Updating driver status…'
    notify(actionLabel, 'loading', 0)
    try {
      await api.adminSetDriverStatus(id, status)
      notify(`Driver application ${status} successfully.`, 'success')
      setNotice(`Driver application ${status} successfully.`)
      await loadDashboard()
    } catch (e) {
      notify(e.message, 'error')
      setError(e.message)
    } finally {
      setBusyId('')
    }
  }

  async function cancelRide(id) {
    if (!window.confirm('Cancel this ride? This cannot be undone from the dashboard.')) return
    setBusyId(id)
    setError('')
    setNotice('')
    notify('Cancelling ride…', 'loading', 0)
    try {
      await api.adminCancelRide(id)
      notify('Ride cancelled successfully.', 'success')
      setNotice('Ride cancelled.')
      await loadDashboard()
    } catch (e) {
      notify(e.message, 'error')
      setError(e.message)
    } finally {
      setBusyId('')
    }
  }

  if (checking) return <div className="admin-page"><div className="admin-loading">Checking administrator session…</div></div>

  if (!admin) return <div className="admin-page admin-login-page">
    <Link className="admin-back" to="/">← Back to CUETGo</Link>
    <div className="admin-login-card">
      <div className="admin-mark">C</div>
      <span className="admin-eyebrow">RESTRICTED AREA</span>
      <h1>Administrator login</h1>
      <p>Sign in with the administrator credentials configured for CUETGo.</p>
      <form onSubmit={handleLogin}>
        <label htmlFor="admin-email">ADMIN EMAIL</label>
        <input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
        <label htmlFor="admin-password">PASSWORD</label>
        <input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter administrator password" />
        {error && <div className="admin-alert admin-alert-error">{error}</div>}
        <button className="admin-primary" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in securely'}</button>
      </form>
      <small>Only the configured administrator account can access this area.</small>
    </div>
  </div>

  return <div className="admin-page">
    <header className="admin-header">
      <div><div className="admin-brand"><span className="admin-mark-small">C</span> CUET<span>Go</span> <b>ADMIN</b></div><p>Platform control centre</p></div>
      <div className="admin-header-actions"><span>{admin.email}</span><button onClick={() => { notify('Refreshing dashboard…', 'loading', 0); loadDashboard().then(ok => { if (ok) notify('Dashboard updated.', 'success'); else notify('Could not refresh the dashboard.', 'error') }) }} disabled={loading}>↻ Refresh</button><button onClick={() => { notify('Signing out…', 'loading', 0); window.setTimeout(logout, 500) }}>Sign out</button></div>
    </header>
    <main className="admin-main">
      <div className="admin-welcome"><div><span className="admin-eyebrow">ADMINISTRATION</span><h1>Dashboard</h1><p>Review registrations and monitor campus ride activity.</p></div><span className="admin-secure">🔒 Secure admin session</span></div>
      {error && <div className="admin-alert admin-alert-error">{error}</div>}
      {notice && <div className="admin-alert admin-alert-success">{notice}</div>}
      <nav className="admin-tabs">{tabs.map((tab) => <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>

      {loading && !overview ? <div className="admin-loading">Loading dashboard…</div> : <>
        {activeTab === 'Overview' && <section>
          <div className="admin-stats">
            <Stat label="Students" value={overview?.students} hint="Registered accounts" />
            <Stat label="Drivers" value={overview?.drivers} hint="All driver accounts" />
            <Stat label="Pending approvals" value={overview?.pendingDrivers} hint="Require review" />
            <Stat label="Approved drivers" value={overview?.approvedDrivers} hint="Can accept rides" />
            <Stat label="Total rides" value={overview?.rides} hint="All ride records" />
            <Stat label="Active rides" value={overview?.activeRides} hint="Currently accepted" />
          </div>
          <div className="admin-panel"><h2>Quick actions</h2><div className="admin-quick-actions"><button onClick={() => {setActiveTab('Drivers');setDriverFilter('pending')}}>Review pending drivers <b>{overview?.pendingDrivers || 0}</b></button><button onClick={() => setActiveTab('Rides')}>Monitor rides <b>{overview?.pendingRides || 0} pending</b></button><button onClick={() => setActiveTab('Students')}>View student accounts</button></div></div>
        </section>}

        {activeTab === 'Drivers' && <section className="admin-panel">
          <div className="admin-section-heading"><div><h2>Driver applications</h2><p>Review and manage driver verification status.</p></div><select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All drivers</option></select></div>
          {drivers.length === 0 ? <div className="admin-empty">No drivers found in this category.</div> : <div className="admin-table-wrap"><table><thead><tr><th>Driver</th><th>Contact</th><th>NID ending</th><th>Applied</th><th>Status</th><th>Action</th></tr></thead><tbody>{drivers.map((driver) => <tr key={driver.id}><td><strong>{driver.name || '—'}</strong><small>{driver.email}</small></td><td>{driver.phone || '—'}</td><td>•••• {driver.nidLast4 || '—'}</td><td>{dateLabel(driver.createdAt)}</td><td><span className={`admin-status status-${driver.verificationStatus}`}>{driver.verificationStatus}</span></td><td><div className="admin-row-actions">{driver.verificationStatus !== 'approved' && <button disabled={busyId === driver.id} onClick={() => updateDriver(driver.id, 'approved')}>Approve</button>}{driver.verificationStatus !== 'rejected' && <button className="reject" disabled={busyId === driver.id} onClick={() => updateDriver(driver.id, 'rejected')}>Reject</button>}{driver.verificationStatus !== 'pending' && <button className="neutral" disabled={busyId === driver.id} onClick={() => updateDriver(driver.id, 'pending')}>Reset</button>}</div></td></tr>)}</tbody></table></div>}
        </section>}

        {activeTab === 'Students' && <section className="admin-panel"><div className="admin-section-heading"><div><h2>Student accounts</h2><p>Registered CUET student accounts. Sensitive credentials are not displayed.</p></div><span className="admin-count">{students.length} students</span></div>{students.length === 0 ? <div className="admin-empty">No student accounts found.</div> : <div className="admin-table-wrap"><table><thead><tr><th>Student</th><th>CUET ID</th><th>Hall</th><th>Gender</th><th>Joined</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td><strong>{student.username || '—'}</strong><small>{student.email}</small></td><td>{student.studentId || '—'}</td><td>{student.hall || '—'}</td><td>{student.gender || '—'}</td><td>{dateLabel(student.createdAt)}</td></tr>)}</tbody></table></div>}</section>}

        {activeTab === 'Rides' && <section className="admin-panel"><div className="admin-section-heading"><div><h2>Ride management</h2><p>Monitor ride requests and cancel pending or active rides when necessary.</p></div><span className="admin-count">{rides.length} rides</span></div>{rides.length === 0 ? <div className="admin-empty">No ride records found.</div> : <div className="admin-table-wrap"><table><thead><tr><th>Route</th><th>Student</th><th>Driver</th><th>Fare</th><th>Requested</th><th>Status</th><th>Action</th></tr></thead><tbody>{rides.map((ride) => <tr key={ride.id}><td><strong>{ride.from}</strong><small>to {ride.to}</small></td><td>{ride.studentName}<small>{ride.studentEmail}</small></td><td>{ride.driverName || '—'}<small>{ride.driverPhone}</small></td><td>৳{ride.fare ?? '—'}</td><td>{dateLabel(ride.requestedTime)}</td><td><span className={`admin-status status-${ride.status}`}>{ride.status}</span></td><td>{['pending','accepted'].includes(ride.status) ? <button className="admin-cancel" disabled={busyId === ride.id} onClick={() => cancelRide(ride.id)}>Cancel ride</button> : '—'}</td></tr>)}</tbody></table></div>}</section>}
      </>}
      <footer className="admin-footer">CUETGo Administration · Keep account information confidential.</footer>
    </main>
  </div>
}
