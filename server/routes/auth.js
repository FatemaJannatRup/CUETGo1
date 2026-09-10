import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { readDb, writeDb } from '../db.js'
import { signToken, requireAuth } from '../middleware/auth.js'

const router = Router()

const CUET_EMAIL = /^u\d{7}@student\.cuet\.ac\.bd$/i
const STUDENT_ID = /^\d{7}$/
const GENDERS = ['male', 'female', 'unknown']
const GMAIL = /^[a-zA-Z0-9._%+-]+@gmail\.com$/
const PHONE = /^01[3-9]\d{8}$/
const NID = /^\d{10}$|^\d{13}$|^\d{17}$/

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
