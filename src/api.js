const isLocalNetworkHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  || window.location.hostname.startsWith('10.')
  || window.location.hostname.startsWith('192.168.')
  || window.location.hostname.startsWith('172.')

const API_BASE = isLocalNetworkHost
  ? `http://${window.location.hostname}:5000/api`
  : (import.meta.env.VITE_API_URL || 'https://gonad-humped-rockiness.ngrok-free.dev/api')

function getToken() {
  return localStorage.getItem('csr_token')
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {}

if (body) {
  headers['Content-Type'] = 'application/json'
}
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.message || 'Something went wrong. Please try again.')
  }
  return data
}

export const api = {
  studentSignup: (payload) => request('/auth/student/signup', { method: 'POST', body: payload }),
  studentLogin: (payload) => request('/auth/student/login', { method: 'POST', body: payload }),
  driverSignup: (payload) => request('/auth/driver/signup', { method: 'POST', body: payload }),
  driverLogin: (payload) => request('/auth/driver/login', { method: 'POST', body: payload }),
  me: () => request('/auth/me', { auth: true }),
  updateProfile: (payload) => request('/auth/profile', { method: 'PUT', body: payload, auth: true }),

  routes: () => request('/rides/routes'),
  requestRide: (payload) => request('/rides/request', { method: 'POST', body: payload, auth: true }),
  openRides: () => request('/rides/open', { auth: true }),
  joinRide: (id, payload = {}) => request(`/rides/${id}/join`, { method: 'POST', body: payload, auth: true }),
  myRides: () => request('/rides/mine', { auth: true }),
  pendingGroups: () => request('/rides/pending', { auth: true }),
  acceptRide: (rideIds) => request('/rides/accept', { method: 'POST', body: { rideIds }, auth: true }),
  completeRide: (id) => request(`/rides/${id}/complete`, { method: 'POST', auth: true }),
  myDriverRides: () => request('/rides/mine-driver', { auth: true }),
}

export { getToken }
