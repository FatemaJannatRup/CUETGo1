import { Router } from 'express'
import crypto from 'crypto'
import { OAuth2Client } from 'google-auth-library'
import { readDb, writeDb } from '../db.js'
import { signToken, requireAuth } from '../middleware/auth.js'

const router = Router()
const CUET_EMAIL = /^(u\d{7})@student\.cuet\.ac\.bd$/i
const GMAIL = /^[a-z0-9._%+-]+@gmail\.com$/i
const PHONE = /^01[3-9]\d{8}$/
const NID = /^(\d{10}|\d{13}|\d{17})$/
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

function publicStudent(student) {
  const { password, googleId, ...safe } = student
  return { ...safe, name: safe.username, role: 'student' }
}
function publicDriver(driver) {
  const { password, googleId, nid, nidHash, ...safe } = driver
  return { ...safe, identifier: safe.phone, role: 'driver' }
}
function hashNid(value) {
  const key = process.env.NID_HASH_SECRET || process.env.JWT_SECRET
  return crypto.createHmac('sha256', key).update(String(value)).digest('hex')
}
function normalize(value) {
  return String(value || '').trim().toLowerCase()
}
function uniqueGoogleId(db, googleId) {
  return db.students.some((s) => s.googleId === googleId) ||
    db.drivers.some((d) => d.googleId === googleId)
}

async function verifiedGoogleUser(credential) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    const error = new Error('Google sign-in is not configured on the server.')
    error.status = 503
    throw error
  }
  if (!credential) {
    const error = new Error('Complete Google verification first.')
    error.status = 400
    throw error
  }
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  })
  const user = ticket.getPayload()
  if (!user?.sub || !user.email || user.email_verified !== true) {
    const error = new Error('Google did not provide a verified email address.')
    error.status = 401
    throw error
  }
  return { googleId: user.sub, email: normalize(user.email), googleName: String(user.name || '').trim() }
}

function issueSession(res, account, role) {
  const token = signToken({ id: account.id, role })
  return res.json({ token, user: role === 'student' ? publicStudent(account) : publicDriver(account) })
}

router.post('/google/signup', async (req, res) => {
  try {
    const { credential, role, profile = {} } = req.body || {}
    if (!['student', 'driver'].includes(role)) {
      return res.status(400).json({ message: 'Choose a valid account type.' })
    }
    const google = await verifiedGoogleUser(credential)
    const db = readDb()

    if (uniqueGoogleId(db, google.googleId)) {
      return res.status(409).json({ message: 'This Google account is already registered. Please log in.' })
    }

    let account
    if (role === 'student') {
      const match = google.email.match(CUET_EMAIL)
      if (!match) return res.status(403).json({ message: 'Students must use their verified CUET student Google account.' })
      const username = String(profile.username || '').trim()
      if (username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
        return res.status(400).json({ message: 'Username must be 3–24 characters and contain only letters, numbers, dots, underscores or hyphens.' })
      }
      if (db.students.some((s) => normalize(s.username) === normalize(username))) {
        return res.status(409).json({ message: 'That username is already taken. Choose another one.' })
      }
      if (db.students.some((s) => normalize(s.email) === google.email)) {
        return res.status(409).json({ message: 'An account already exists for this CUET email. Please contact support to link it safely.' })
      }
      account = {
        id: crypto.randomUUID(),
        username,
        name: username,
        email: google.email,
        studentId: match[1].slice(1),
        googleId: google.googleId,
        authProvider: 'google',
        createdAt: new Date().toISOString(),
      }
      db.students.push(account)
    } else {
      if (!GMAIL.test(google.email)) {
        return res.status(403).json({ message: 'Drivers must use a verified personal Gmail account.' })
      }
      const name = String(profile.name || '').trim()
      const nid = String(profile.nid || '').trim()
      const phone = String(profile.phone || '').trim()
      if (name.length < 2 || name.length > 80) return res.status(400).json({ message: 'Enter your full name.' })
      if (!NID.test(nid)) return res.status(400).json({ message: 'Enter a valid 10, 13 or 17-digit NID number.' })
      if (!PHONE.test(phone)) return res.status(400).json({ message: 'Enter a valid Bangladeshi mobile number, e.g. 017XXXXXXXX.' })
      if (db.drivers.some((d) => normalize(d.email) === google.email)) return res.status(409).json({ message: 'A driver account already exists for this Gmail. Please log in.' })
      const nidHash = hashNid(nid)
      if (db.drivers.some((d) => d.nidHash === nidHash || (!d.nidHash && String(d.nid || '') === nid))) return res.status(409).json({ message: 'This NID is already associated with an account.' })
      if (db.drivers.some((d) => String(d.phone || '') === phone)) return res.status(409).json({ message: 'This phone number is already associated with an account.' })
      account = {
        id: crypto.randomUUID(),
        name,
        nidHash,
        nidLast4: nid.slice(-4),
        phone,
        identifier: phone,
        email: google.email,
        googleId: google.googleId,
        authProvider: 'google',
        verificationStatus: 'pending',
        verified: false,
        createdAt: new Date().toISOString(),
      }
      db.drivers.push(account)
    }

    writeDb(db)
    return issueSession(res, account, role)
  } catch (error) {
    console.error('Google signup failed:', error.message)
    return res.status(error.status || 401).json({ message: error.status ? error.message : 'Google verification failed. Please try again.' })
  }
})

router.post('/google/login', async (req, res) => {
  try {
    const { credential, role } = req.body || {}
    if (!['student', 'driver'].includes(role)) return res.status(400).json({ message: 'Choose a valid account type.' })
    const google = await verifiedGoogleUser(credential)
    if (role === 'student' && !CUET_EMAIL.test(google.email)) {
      return res.status(403).json({ message: 'Students must use their verified CUET student Google account.' })
    }
    if (role === 'driver' && !GMAIL.test(google.email)) {
      return res.status(403).json({ message: 'Drivers must use a verified personal Gmail account.' })
    }

    const db = readDb()
    const account = role === 'student'
      ? db.students.find((s) => s.googleId === google.googleId)
      : db.drivers.find((d) => d.googleId === google.googleId)

    if (!account) {
      const emailExists = role === 'student'
        ? db.students.some((s) => normalize(s.email) === google.email)
        : db.drivers.some((d) => normalize(d.email) === google.email)
      return res.status(emailExists ? 409 : 404).json({
        message: emailExists
          ? 'An older account exists for this email but is not linked to Google. Contact support to link it safely.'
          : 'No account exists for this Google email. Please sign up first.',
      })
    }
    return issueSession(res, account, role)
  } catch (error) {
    console.error('Google login failed:', error.message)
    return res.status(error.status || 401).json({ message: error.status ? error.message : 'Google verification failed. Please try again.' })
  }
})

router.get('/me', requireAuth(), (req, res) => {
  const db = readDb()
  if (req.user.role === 'student') {
    const student = db.students.find((s) => s.id === req.user.id)
    if (!student) return res.status(404).json({ message: 'Account not found.' })
    return res.json({ user: publicStudent(student) })
  }
  if (req.user.role === 'driver') {
    const driver = db.drivers.find((d) => d.id === req.user.id)
    if (!driver) return res.status(404).json({ message: 'Account not found.' })
    return res.json({ user: publicDriver(driver) })
  }
  return res.status(403).json({ message: 'Invalid account role.' })
})

router.put('/profile', requireAuth(), (req, res) => {
  const db = readDb()
  if (req.user.role === 'student') {
    const student = db.students.find((s) => s.id === req.user.id)
    if (!student) return res.status(404).json({ message: 'Account not found.' })

    const username = String(req.body?.username ?? student.username ?? '').trim()
    const hall = String(req.body?.hall ?? student.hall ?? '').trim()
    const gender = String(req.body?.gender ?? student.gender ?? '').trim()
    const allowedHalls = [
      'Muktijoddha Hall', 'Shahid Mohammad Shah Hall', 'Dr. Qudrat-E-Khuda Hall',
      'Kabi Kazi Nazrul Islam Hall', 'Shaheed Tareq Huda Hall', 'Shaheed Abu Sayed Hall',
      'Sufia Kamal Hall', 'Begum Shamsunnahar Khan Hall', 'Tapashi Rabeya Hall',
    ]
    if (username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return res.status(400).json({ message: 'Username must be 3–24 valid characters.' })
    }
    if (db.students.some((s) => s.id !== student.id && normalize(s.username) === normalize(username))) {
      return res.status(409).json({ message: 'That username is already taken.' })
    }
    if (hall && !allowedHalls.includes(hall)) {
      return res.status(400).json({ message: 'Choose a valid CUET hall.' })
    }
    if (gender && !['male', 'female', 'unknown'].includes(gender)) {
      return res.status(400).json({ message: 'Choose a valid gender option.' })
    }

    student.username = username
    student.name = username
    student.hall = hall
    student.gender = gender
    writeDb(db)
    return res.json({ user: publicStudent(student) })
  }

  if (req.user.role === 'driver') {
    const driver = db.drivers.find((d) => d.id === req.user.id)
    if (!driver) return res.status(404).json({ message: 'Account not found.' })

    const name = String(req.body?.name ?? driver.name ?? '').trim()
    const phone = String(req.body?.phone ?? driver.phone ?? '').trim()
    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ message: 'Name must be between 2 and 80 characters.' })
    }
    if (!PHONE.test(phone)) {
      return res.status(400).json({ message: 'Enter a valid Bangladeshi mobile number, e.g. 017XXXXXXXX.' })
    }
    if (db.drivers.some((d) => d.id !== driver.id && String(d.phone || '') === phone)) {
      return res.status(409).json({ message: 'This phone number is already associated with another account.' })
    }

    driver.name = name
    driver.phone = phone
    driver.identifier = phone
    writeDb(db)
    return res.json({ user: publicDriver(driver) })
  }

  return res.status(403).json({ message: 'Invalid account role.' })
})

export default router
