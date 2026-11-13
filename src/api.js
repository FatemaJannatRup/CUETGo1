const isLocalNetworkHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  || window.location.hostname.startsWith('10.')
  || window.location.hostname.startsWith('192.168.')
  || window.location.hostname.startsWith('172.')

function getApiBase() {
  if (isLocalNetworkHost) return `http://${window.location.hostname}:5000/api`
  const envUrl = import.meta.env.VITE_API_URL
  if (!envUrl) return ''
  return envUrl.endsWith('/api') ? envUrl : `${envUrl.replace(/\/$/, '')}/api`
}

const API_BASE = getApiBase()
function getToken() { return localStorage.getItem('csr_token') }
function getAdminToken() { return localStorage.getItem('cuetgo_admin_token') }

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || 'Something went wrong. Please try again.')
  return data
}

async function adminRequest(path, { method = 'GET', body } = {}) {
  const headers = { Authorization: `Bearer ${getAdminToken() || ''}` }
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API_BASE}/admin${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || 'Admin request failed.')
  return data
}

export const api = {
  adminLogin: (payload) => request('/admin/login', { method: 'POST', body: payload }),
  adminMe: () => adminRequest('/me'),
  adminOverview: () => adminRequest('/overview'),
  adminDrivers: (status = 'all') => adminRequest(`/drivers?status=${encodeURIComponent(status)}`),
  adminSetDriverStatus: (id, status) => adminRequest(`/drivers/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status } }),
  adminStudents: () => adminRequest('/students'),
  adminRides: () => adminRequest('/rides'),
  adminCancelRide: (id) => adminRequest(`/rides/${encodeURIComponent(id)}/cancel`, { method: 'PATCH' }),
  googleSignup: (payload) => request('/auth/google/signup', { method: 'POST', body: payload }),
  googleLogin: (payload) => request('/auth/google/login', { method: 'POST', body: payload }),
  me: () => request('/auth/me', { auth: true }),
  updateProfile: (payload) => request('/auth/profile', { method: 'PUT', body: payload, auth: true }),
  routes: () => request('/rides/routes'),
  requestRide: (payload) => request('/rides/request', { method: 'POST', body: payload, auth: true }),
  openRides: () => request('/rides/open', { auth: true }),
  joinRide: (id, payload = {}) => request(`/rides/${id}/join`, { method: 'POST', body: payload, auth: true }),
  myRides: () => request('/rides/mine', { auth: true }),
  pendingGroups: () => request('/rides/pending', { auth: true }),
  optimizeRideRoute: (rideIds) => request('/rides/optimize', { method: 'POST', body: { rideIds }, auth: true }),
  acceptRide: (rideIds) => request('/rides/accept', { method: 'POST', body: { rideIds }, auth: true }),
  completeRide: (id) => request(`/rides/${id}/complete`, { method: 'POST', auth: true }),
  myDriverRides: () => request('/rides/mine-driver', { auth: true }),
}
export { getToken }
