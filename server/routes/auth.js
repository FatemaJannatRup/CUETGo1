import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { OAuth2Client } from 'google-auth-library'
import { readDb, writeDb } from '../db.js'
import { signToken, requireAuth } from '../middleware/auth.js'

const router = Router()

const CUET_EMAIL = /^u\d{7}@student\.cuet\.ac\.bd$/i
const STUDENT_ID = /^\d{7}$/
const GENDERS = ['male', 'female', 'unknown']
const GMAIL = /^[a-zA-Z0-9._%+-]+@gmail\.com$/
const PHONE = /^01[3-9]\d{8}$/
const NID = /^\d{10}$|^\d{13}$|^\d{17}$/

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

function publicStudent(s) {
  const { password, ...rest } = s
  return { ...rest, role: 'student' }
}
function publicDriver(d) {
  const { password, ...rest } = d
  return { ...rest, role: 'driver' }
}

// ---------- STUDENT ----------

router.post('/student/signup', async (req, res) => {
  const { name, email, studentId, gender, hall, password } = req.body || {}
  if (!name || !name.trim()) return res.status(400).json({ message: 'Enter your full name.' })
  if (!CUET_EMAIL.test(email || '')) {
    return res.status(400).json({ message: 'Use your CUET student email, e.g. u2204064@student.cuet.ac.bd' })
  }
  if (!STUDENT_ID.test(studentId || '')) {
    return res.status(400).json({ message: 'Enter your 7-digit student ID, e.g. 2204064' })
  }
  if (!GENDERS.includes(gender)) {
    return res.status(400).json({ message: 'Select your gender.' })
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' })
  }

  const db = readDb()
  const emailLower = String(email || '').toLowerCase()
  if (db.students.find((s) => s.email === emailLower)) {
    return res.status(409).json({ message: 'An account with this email already exists.' })
  }
  if (db.students.find((s) => s.studentId === String(studentId))) {
    return res.status(409).json({ message: 'An account with this student ID already exists.' })
  }

  const hashed = await bcrypt.hash(password, 10)
  const student = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: emailLower,
    studentId: String(studentId),
    gender,
    hall: hall || '',
    password: hashed,
    createdAt: new Date().toISOString(),
  }
  db.students.push(student)
  writeDb(db)

  const token = signToken({ id: student.id, role: 'student' })
  res.json({ token, user: publicStudent(student) })
})

router.post('/student/login', async (req, res) => {
  const { email, password } = req.body || {}
  const db = readDb()
  const student = db.students.find((s) => s.email === (email || '').toLowerCase())
  if (!student) return res.status(401).json({ message: 'No account found with this email.' })

  const match = await bcrypt.compare(password || '', student.password)
  if (!match) return res.status(401).json({ message: 'Incorrect password.' })

  const token = signToken({ id: student.id, role: 'student' })
  res.json({ token, user: publicStudent(student) })
})

// ---------- DRIVER ----------

router.post('/driver/signup', async (req, res) => {
  const { name, identifier, nid, rickshaw, password } = req.body || {}
  if (!name || !name.trim()) return res.status(400).json({ message: 'নাম লিখুন' })

  const idLower = (identifier || '').trim().toLowerCase()
  if (!GMAIL.test(idLower) && !PHONE.test(idLower)) {
    return res.status(400).json({ message: 'জিমেইল অথবা সঠিক মোবাইল নম্বর দিন (যেমন 017XXXXXXXX)' })
  }
  if (!NID.test((nid || '').trim())) {
    return res.status(400).json({ message: 'সঠিক এনআইডি নম্বর দিন (যাচাইয়ের জন্য প্রয়োজন)' })
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ message: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে' })
  }

  const db = readDb()
  if (db.drivers.find((d) => d.identifier === idLower)) {
    return res.status(409).json({ message: 'এই তথ্য দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট আছে।' })
  }

  const hashed = await bcrypt.hash(password, 10)
  const driver = {
    id: crypto.randomUUID(),
    name: name.trim(),
    identifier: idLower,
    nid: String(nid || '').trim(),
    rickshaw: rickshaw || '',
    verified: false,
    password: hashed,
    createdAt: new Date().toISOString(),
  }
  db.drivers.push(driver)
  writeDb(db)

  const token = signToken({ id: driver.id, role: 'driver' })
  res.json({ token, user: publicDriver(driver) })
})

router.post('/driver/login', async (req, res) => {
  const { identifier, password } = req.body || {}
  const db = readDb()
  const driver = db.drivers.find((d) => d.identifier === (identifier || '').trim().toLowerCase())
  if (!driver) return res.status(401).json({ message: 'এই তথ্য দিয়ে কোনো অ্যাকাউন্ট পাওয়া যায়নি।' })

  const match = await bcrypt.compare(password || '', driver.password)
  if (!match) return res.status(401).json({ message: 'পাসওয়ার্ড সঠিক নয়।' })

  const token = signToken({ id: driver.id, role: 'driver' })
  res.json({ token, user: publicDriver(driver) })
})


// ---------- GOOGLE AUTHENTICATION ----------
// Google verifies the identity; this route still issues the app's existing JWT.
router.post('/google', async (req, res) => {
  try {
    const { credential, role, intent = 'login', profile = {} } = req.body || {}
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({ message: 'Google sign-in is not configured on the server yet.' })
    }
    if (!credential || !['student', 'driver'].includes(role) || !['login', 'signup'].includes(intent)) {
      return res.status(400).json({ message: 'Invalid Google sign-in request.' })
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const googleUser = ticket.getPayload()
    if (!googleUser?.email || googleUser.email_verified !== true) {
      return res.status(401).json({ message: 'Google did not provide a verified email address.' })
    }

    const email = googleUser.email.trim().toLowerCase()
    const googleName = String(googleUser.name || '').trim()
    const db = readDb()
    let account

    if (role === 'student') {
      if (!CUET_EMAIL.test(email)) {
        return res.status(403).json({ message: 'Students must use their verified CUET student Google account.' })
      }
      account = db.students.find((s) => s.email.toLowerCase() === email)

      if (!account && intent === 'login') {
        return res.status(404).json({ message: 'No student account exists yet. Please create an account first.' })
      }
      if (!account) {
        const studentId = String(profile.studentId || '').trim()
        const gender = profile.gender
        if (!STUDENT_ID.test(studentId) || email !== `u${studentId}@student.cuet.ac.bd`) {
          return res.status(400).json({ message: 'Your 7-digit student ID must match your CUET email address.' })
        }
        if (!GENDERS.includes(gender)) {
          return res.status(400).json({ message: 'Select your gender before continuing.' })
        }
        if (db.students.some((s) => s.studentId === studentId)) {
          return res.status(409).json({ message: 'An account with this student ID already exists.' })
        }
        const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10)
        account = {
          id: crypto.randomUUID(),
          name: googleName || String(profile.name || '').trim() || email.split('@')[0],
          email,
          studentId,
          gender,
          hall: String(profile.hall || ''),
          password: randomPassword,
          authProvider: 'google',
          googleId: googleUser.sub,
          createdAt: new Date().toISOString(),
        }
        db.students.push(account)
      } else if (account.googleId && account.googleId !== googleUser.sub) {
        return res.status(409).json({ message: 'This account is linked to a different Google account.' })
      } else {
        account.googleId = googleUser.sub
        account.authProvider = account.authProvider || 'password+google'
      }
    } else {
      if (!GMAIL.test(email)) {
        return res.status(403).json({ message: 'Drivers must use a verified Gmail account.' })
      }
      account = db.drivers.find((d) => (d.identifier || '').toLowerCase() === email)

      if (!account && intent === 'login') {
        return res.status(404).json({ message: 'No driver account exists for this Gmail address. Please create an account first.' })
      }
      if (!account) {
        const nid = String(profile.nid || '').trim()
        if (!NID.test(nid)) {
          return res.status(400).json({ message: 'Enter a valid NID number to create your driver account.' })
        }
        const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10)
        account = {
          id: crypto.randomUUID(),
          name: googleName || String(profile.name || '').trim() || email.split('@')[0],
          identifier: email,
          nid,
          rickshaw: String(profile.rickshaw || ''),
          verified: false,
          password: randomPassword,
          authProvider: 'google',
          googleId: googleUser.sub,
          createdAt: new Date().toISOString(),
        }
        db.drivers.push(account)
      } else if (account.googleId && account.googleId !== googleUser.sub) {
        return res.status(409).json({ message: 'This account is linked to a different Google account.' })
      } else {
        account.googleId = googleUser.sub
        account.authProvider = account.authProvider || 'password+google'
      }
    }

    writeDb(db)
    const token = signToken({ id: account.id, role })
    return res.json({ token, user: role === 'student' ? publicStudent(account) : publicDriver(account) })
  } catch (error) {
    console.error('Google authentication failed:', error.message)
    return res.status(401).json({ message: 'Google sign-in could not be verified. Please try again.' })
  }
})

// ---------- SESSION ----------

router.get('/me', requireAuth(), (req, res) => {
  const db = readDb()
  if (req.user.role === 'student') {
    const student = db.students.find((s) => s.id === req.user.id)
    if (!student) return res.status(404).json({ message: 'Account not found.' })
    return res.json({ user: publicStudent(student) })
  }
  const driver = db.drivers.find((d) => d.id === req.user.id)
  if (!driver) return res.status(404).json({ message: 'Account not found.' })
  res.json({ user: publicDriver(driver) })
})

router.put('/profile', requireAuth(), (req, res) => {
  const db = readDb()
  const { name, hall, gender } = req.body || {}

  if (req.user.role === 'student') {
    const student = db.students.find((s) => s.id === req.user.id)
    if (!student) return res.status(404).json({ message: 'Account not found.' })
    student.name = String(name || student.name).trim()
    student.hall = hall || student.hall || ''
    student.gender = GENDERS.includes(gender) ? gender : student.gender
    writeDb(db)
    return res.json({ user: publicStudent(student) })
  }

  const driver = db.drivers.find((d) => d.id === req.user.id)
  if (!driver) return res.status(404).json({ message: 'Account not found.' })
  driver.name = String(name || driver.name).trim()
  driver.rickshaw = String(req.body?.rickshaw || driver.rickshaw || '')
  writeDb(db)
  res.json({ user: publicDriver(driver) })
})

export default router
