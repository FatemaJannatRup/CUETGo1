import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { readDb, writeDb } from '../db.js'
import { signToken, requireAuth } from '../middleware/auth.js'

const router = Router()
const loginAttempts = new Map()
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

function rateLimitLogin(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const record = loginAttempts.get(key)
  if (record && now - record.startedAt < WINDOW_MS && record.count >= MAX_ATTEMPTS) {
    return res.status(429).json({ message: 'Too many login attempts. Try again in 15 minutes.' })
  }
  if (!record || now - record.startedAt >= WINDOW_MS) loginAttempts.set(key, { startedAt: now, count: 0 })
  next()
}

function safeDriver(driver) {
  return {
    id: driver.id,
    name: driver.name,
    email: driver.email,
    phone: driver.phone,
    nidLast4: driver.nidLast4 || '',
    verificationStatus: driver.verificationStatus || 'pending',
    createdAt: driver.createdAt,
    approvedAt: driver.approvedAt || null,
    reviewedAt: driver.reviewedAt || null,
  }
}

function safeStudent(student) {
  return {
    id: student.id,
    username: student.username || student.name,
    email: student.email,
    studentId: student.studentId,
    hall: student.hall || '',
    gender: student.gender || 'unknown',
    createdAt: student.createdAt,
  }
}

router.post('/login', rateLimitLogin, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const configuredEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase()
  const passwordHash = String(process.env.ADMIN_PASSWORD_HASH || '')

  if (!configuredEmail || !passwordHash.startsWith('$2')) {
    return res.status(503).json({ message: 'Admin login is not configured yet. Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH on the backend.' })
  }

  const emailMatches = email === configuredEmail
  let passwordMatches = false
  try {
    passwordMatches = await bcrypt.compare(password, passwordHash)
  } catch {
    passwordMatches = false
  }

  if (!emailMatches || !passwordMatches) {
    const key = req.ip || req.socket.remoteAddress || 'unknown'
    const record = loginAttempts.get(key)
    if (record) record.count += 1
    return res.status(401).json({ message: 'Invalid administrator email or password.' })
  }

  loginAttempts.delete(req.ip || req.socket.remoteAddress || 'unknown')
  const token = signToken({ id: 'cuetgo-admin', role: 'admin' }, { expiresIn: '8h' })
  return res.json({ token, admin: { email: configuredEmail, role: 'admin' } })
})

router.get('/me', requireAuth('admin'), (req, res) => {
  res.json({ admin: { email: String(process.env.ADMIN_EMAIL || '').trim().toLowerCase(), role: 'admin' } })
})

router.get('/overview', requireAuth('admin'), async (req, res) => {
  const db = await readDb()
  const drivers = db.drivers || []
  const students = db.students || []
  const rides = db.rides || []
  res.json({
    counts: {
      students: students.length,
      drivers: drivers.length,
      pendingDrivers: drivers.filter((d) => (d.verificationStatus || 'pending') === 'pending').length,
      approvedDrivers: drivers.filter((d) => d.verificationStatus === 'approved').length,
      rejectedDrivers: drivers.filter((d) => d.verificationStatus === 'rejected').length,
      rides: rides.length,
      pendingRides: rides.filter((r) => r.status === 'pending').length,
      activeRides: rides.filter((r) => r.status === 'accepted').length,
      completedRides: rides.filter((r) => r.status === 'completed').length,
    },
  })
})

router.get('/drivers', requireAuth('admin'), async (req, res) => {
  const db = readDb()
  const status = String(req.query.status || 'all')
  const drivers = (db.drivers || [])
    .filter((d) => status === 'all' || (d.verificationStatus || 'pending') === status)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map(safeDriver)
  res.json({ drivers })
})

router.patch('/drivers/:id/status', requireAuth('admin'), async (req, res) => {
  const status = String(req.body?.status || '')
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ message: 'Choose approved, rejected, or pending.' })
  }
  const db = readDb()
  const driver = (db.drivers || []).find((item) => item.id === req.params.id)
  if (!driver) return res.status(404).json({ message: 'Driver account not found.' })
  driver.verificationStatus = status
  driver.verified = status === 'approved'
  driver.reviewedAt = new Date().toISOString()
  if (status === 'approved') driver.approvedAt = driver.reviewedAt
  else delete driver.approvedAt
  await writeDb(db)
  res.json({ driver: safeDriver(driver) })
})

router.get('/students', requireAuth('admin'), async (req, res) => {
  const db = readDb()
  const students = (db.students || [])
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map(safeStudent)
  res.json({ students })
})

router.get('/rides', requireAuth('admin'), async (req, res) => {
  const db = readDb()
  const students = db.students || []
  const drivers = db.drivers || []
  const rides = (db.rides || []).map((ride) => {
    const student = students.find((item) => item.id === ride.studentId)
    const driver = drivers.find((item) => item.id === ride.driverId)
    return {
      id: ride.id,
      from: ride.from,
      to: ride.to,
      fare: ride.fare,
      seats: ride.seats,
      status: ride.status,
      requestedTime: ride.requestedTime || ride.createdAt,
      createdAt: ride.createdAt,
      studentName: student?.username || student?.name || 'Unknown student',
      studentEmail: student?.email || '',
      driverName: driver?.name || '',
      driverPhone: driver?.phone || '',
    }
  }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  res.json({ rides })
})

router.patch('/rides/:id/cancel', requireAuth('admin'), async (req, res) => {
  const db = readDb()
  const ride = (db.rides || []).find((item) => item.id === req.params.id)
  if (!ride) return res.status(404).json({ message: 'Ride not found.' })
  if (!['pending', 'accepted'].includes(ride.status)) {
    return res.status(409).json({ message: 'Only pending or active rides can be cancelled.' })
  }
  ride.status = 'cancelled'
  ride.cancelledAt = new Date().toISOString()
  ride.cancelledBy = 'admin'
  writeDb(db)
  res.json({ ride: { id: ride.id, status: ride.status } })
})

export default router
