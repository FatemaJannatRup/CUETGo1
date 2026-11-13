import { Router } from 'express'
import crypto from 'crypto'
import { readDb, writeDb } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { findMatches, optimizeSharedRoute } from '../services/gemini.js'

const router = Router()

async function requireApprovedDriver(req, res, next) {
  try {
  const db = await readDb()
  const driver = db.drivers.find((item) => item.id === req.user.id)
  if (!driver) return res.status(404).json({ message: 'Driver account not found.' })
  if (driver.verificationStatus === 'rejected') {
    return res.status(403).json({ message: 'Your driver application was rejected. Please contact CUETGo support.' })
  }
  if (driver.verificationStatus !== 'approved') {
    return res.status(403).json({ message: 'Your driver account is awaiting administrator approval.' })
  }
  next()
  } catch (error) { next(error) }
}

const HALLS = [
  'Muktijoddha Hall', 'Shahid Mohammad Shah Hall', 'Dr. Qudrat-E-Khuda Hall',
  'Kabi Kazi Nazrul Islam Hall', 'Shaheed Tareq Huda Hall', 'Shaheed Abu Sayed Hall',
  'Sufia Kamal Hall', 'Begum Shamsunnahar Khan Hall', 'Tapashi Rabeya Hall',
]
const LOCATIONS = [...HALLS, 'CUET Main Gate', 'Academic Building', 'Central Library', 'Cafeteria']

function fareFor(from, to) {
  if (HALLS.includes(from) && HALLS.includes(to)) return 20
  if (HALLS.includes(from)) return 30
  return 25
}

function studentName(db, studentId) {
  const s = db.students.find((x) => x.id === studentId)
  return s ? s.name : 'Student'
}

function normalizePassengers(ride, fallbackStudent) {
  if (Array.isArray(ride.passengers) && ride.passengers.length) return ride.passengers
  return [{ studentId: ride.studentId || fallbackStudent?.id, name: fallbackStudent?.name || 'Student', phone: '', info: 'Primary rider', seatCount: Number(ride.seats || 1), isGuest: false }]
}

router.get('/routes', (req, res) => {
  res.json({ locations: LOCATIONS, halls: HALLS })
})

router.get('/open', requireAuth('student'), async (req, res) => {
  const db = await readDb()
  const rides = db.rides
    .filter((ride) => ride.status === 'pending' && ride.studentId !== req.user.id)
    .map((ride) => {
      const student = db.students.find((s) => s.id === ride.studentId)
      return {
        ...ride,
        hostName: student?.name || 'Campus rider',
        hostGender: student?.gender || 'unknown',
        seatsLeft: Math.max(0, 2 - Number(ride.seats || 1)),
        passengers: normalizePassengers(ride, student),
      }
    })
    .sort((a, b) => new Date(a.requestedTime || a.createdAt) - new Date(b.requestedTime || b.createdAt))

  res.json({ rides })
})

router.post('/request', requireAuth('student'), async (req, res) => {
  const { from, to, requestedTime, seats = 1, coPassengerName = '', coPassengerPhone = '', coPassengerInfo = '' } = req.body || {}
  if (!LOCATIONS.includes(from) || !LOCATIONS.includes(to) || from === to) return res.status(400).json({ message: 'Choose two different CUET locations.' })
  if (!requestedTime || Number.isNaN(new Date(requestedTime).getTime())) return res.status(400).json({ message: 'Choose a pickup time.' })
  const seatCount = Number(seats)
  if (![1, 2].includes(seatCount)) return res.status(400).json({ message: 'A rickshaw has only 1 or 2 seats.' })
  if (seatCount === 2 && (!coPassengerName || !coPassengerName.trim() || !coPassengerPhone || !String(coPassengerPhone).trim())) {
    return res.status(400).json({ message: 'For 2-seat rides, add the companion name and phone number.' })
  }

  const db = await readDb()
  const student = db.students.find((s) => s.id === req.user.id)
  if (!student) return res.status(404).json({ message: 'Student account not found.' })

  const ride = {
    id: crypto.randomUUID(),
    studentId: req.user.id,
    from,
    to,
    fare: fareFor(from, to) * seatCount,
    requestedTime: new Date(requestedTime).toISOString(),
    seats: seatCount,
    passengerCount: seatCount,
    status: 'pending',
    driverId: null,
    matchedRideIds: [],
    passengers: [{
      studentId: student.id,
      name: student.name,
      phone: String(student.phone || ''),
      info: 'Primary rider',
      seatCount: seatCount === 2 ? 1 : seatCount,
      isGuest: false,
    }],
    coPassenger: seatCount === 2 ? {
      name: String(coPassengerName).trim(),
      phone: String(coPassengerPhone).trim(),
      info: coPassengerInfo || 'Companion passenger',
    } : null,
    createdAt: new Date().toISOString(),
  }

  if (seatCount === 2) {
    ride.passengers.push({
      studentId: `guest-${crypto.randomUUID()}`,
      name: String(coPassengerName).trim(),
      phone: String(coPassengerPhone).trim(),
      info: coPassengerInfo || 'Companion passenger',
      seatCount: 1,
      isGuest: true,
    })
  }

  db.rides.push(ride)

  const others = db.rides.filter((r) => r.status === 'pending' && r.id !== ride.id && Math.abs(new Date(r.requestedTime || r.createdAt) - new Date(ride.requestedTime)) <= 45 * 60 * 1000 && (Number(r.seats || 1) + ride.seats) <= 2)
  const matches = await findMatches(ride, others)
  ride.matchedRideIds = matches.map((m) => m.rideId)
  ride.matchDetails = matches
  await writeDb(db)

  const matchedRiders = ride.matchedRideIds
    .map((id) => db.rides.find((r) => r.id === id))
    .filter(Boolean)
    .map((r) => ({ name: studentName(db, r.studentId), route: `${r.from} → ${r.to}`, time: r.requestedTime || r.createdAt }))

  res.json({ ride, matches: matchedRiders })
})

router.post('/:id/join', requireAuth('student'), async (req, res) => {
  const seatCount = Number(req.body?.seats || 1)
  if (![1, 2].includes(seatCount)) return res.status(400).json({ message: 'Choose 1 or 2 seats.' })
  const db = await readDb()
  const ride = db.rides.find((r) => r.id === req.params.id && r.status === 'pending' && r.studentId !== req.user.id)
  if (!ride) return res.status(404).json({ message: 'Open ride not found.' })
  if ((Number(ride.seats) || 1) + seatCount > 2) {
    return res.status(409).json({ message: 'This ride no longer has enough space for that many seats.' })
  }

  const student = db.students.find((s) => s.id === req.user.id)
  if (!student) return res.status(404).json({ message: 'Student account not found.' })

  if (!Array.isArray(ride.passengers)) ride.passengers = [{ studentId: ride.studentId, name: studentName(db, ride.studentId), phone: '', info: 'Primary rider', seatCount: Number(ride.seats || 1), isGuest: false }]
  ride.passengers.push({
    studentId: student.id,
    name: student.name,
    phone: String(req.body?.phone || ''),
    info: 'Joined ride',
    seatCount,
    isGuest: false,
  })
  ride.seats = Number(ride.seats || 1) + seatCount
  ride.passengerCount = Number(ride.passengerCount || ride.seats || 1) + seatCount
  ride.fare = fareFor(ride.from, ride.to) * Math.max(1, Number(ride.seats || 1))
  await writeDb(db)
  res.json({ ride, joined: true })
})

router.get('/mine', requireAuth('student'), async (req, res) => {
  const db = await readDb()
  const mine = db.rides
    .filter((r) => r.studentId === req.user.id || (Array.isArray(r.passengers) && r.passengers.some((p) => p.studentId === req.user.id)))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  res.json({ rides: mine })
})

router.get('/pending', requireAuth('driver'), requireApprovedDriver, async (req, res) => {
  const db = await readDb()
  const pending = db.rides
    .filter((r) => r.status === 'pending')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

  const groups = []
  for (const ride of pending) {
    const rideTime = new Date(ride.requestedTime || ride.createdAt).getTime()
    const rideSeats = Number(ride.seats || 1)
    const compatible = groups.find((group) => {
      const timeGap = Math.abs(new Date(group.requestedTime).getTime() - rideTime)
      const currentSeats = group.rideIds.reduce((sum, id) => {
        const item = pending.find((candidate) => candidate.id === id)
        return sum + Number(item?.seats || 1)
      }, 0)
      const sharesEndpoint = group.rideIds.some((id) => {
        const item = pending.find((candidate) => candidate.id === id)
        return item && (item.from === ride.from || item.to === ride.to || item.from === ride.to || item.to === ride.from)
      })
      return sharesEndpoint && timeGap <= 20 * 60 * 1000 && currentSeats + rideSeats <= 2
    })

    if (compatible) {
      compatible.rideIds.push(ride.id)
      compatible.riders += Number(ride.passengerCount || ride.seats || 1)
      compatible.fare += Number(ride.fare || 0)
    } else {
      groups.push({
        key: ride.id,
        from: ride.from,
        to: ride.to,
        fare: Number(ride.fare || 0),
        rideIds: [ride.id],
        riders: Number(ride.passengerCount || ride.seats || 1),
        time: ride.createdAt,
        requestedTime: ride.requestedTime || ride.createdAt,
      })
    }
  }
  res.json({ groups })
})

router.post('/optimize', requireAuth('driver'), requireApprovedDriver, async (req, res) => {
  const rideIds = Array.isArray(req.body?.rideIds) ? [...new Set(req.body.rideIds)] : []
  if (!rideIds.length || rideIds.length > 2) return res.status(400).json({ message: 'Select one shared ride group to optimize.' })
  const db = await readDb()
  const selected = rideIds.map((id) => db.rides.find((ride) => ride.id === id && ride.status === 'pending')).filter(Boolean)
  if (selected.length !== rideIds.length) return res.status(409).json({ message: 'One or more ride requests are no longer available.' })
  const totalSeats = selected.reduce((sum, ride) => sum + Number(ride.seats || 1), 0)
  if (totalSeats > 2) return res.status(409).json({ message: 'A rickshaw can carry a maximum of two passengers.' })
  const plan = await optimizeSharedRoute(selected)
  res.json({ ...plan, legs: selected.map((ride) => ({ from: ride.from, to: ride.to })) })
})

router.post('/accept', requireAuth('driver'), requireApprovedDriver, async (req, res) => {
  const { rideIds } = req.body || {}
  if (!Array.isArray(rideIds) || rideIds.length === 0) {
    return res.status(400).json({ message: 'No ride selected.' })
  }

  const db = await readDb()
  const selectedRideIds = [...new Set(rideIds)]
  const acceptedByDriver = db.rides.filter((ride) => ride.driverId === req.user.id && ['accepted', 'completed'].includes(ride.status))

  for (const rideId of selectedRideIds) {
    const ride = db.rides.find((item) => item.id === rideId)
    if (!ride || ride.status !== 'pending') {
      return res.status(409).json({ message: 'One or more rides are no longer available.' })
    }

    const selectedTime = new Date(ride.requestedTime || ride.createdAt).getTime()
    const hasConflict = acceptedByDriver.some((existingRide) => {
      const existingTime = new Date(existingRide.requestedTime || existingRide.createdAt).getTime()
      return Math.abs(existingTime - selectedTime) < 45 * 60 * 1000
    })

    if (hasConflict) {
      return res.status(409).json({ message: 'This ride overlaps with an already accepted trip in your schedule.' })
    }
  }

  for (const rideId of selectedRideIds) {
    const ride = db.rides.find((item) => item.id === rideId)
    if (!ride || ride.status !== 'pending') continue
    ride.status = 'accepted'
    ride.driverId = req.user.id
    ride.acceptedAt = new Date().toISOString()
  }

  await writeDb(db)
  res.json({ accepted: selectedRideIds.length })
})

router.post('/:id/complete', requireAuth('driver'), requireApprovedDriver, async (req, res) => {
  const db = await readDb()
  const ride = db.rides.find((item) => item.id === req.params.id && item.driverId === req.user.id)
  if (!ride) return res.status(404).json({ message: 'Ride not found.' })

  ride.status = 'completed'
  ride.completedAt = new Date().toISOString()
  ride.paidOut = false
  await writeDb(db)
  res.json({ ride })
})

router.get('/mine-driver', requireAuth('driver'), requireApprovedDriver, async (req, res) => {
  const db = await readDb()
  const mine = db.rides
    .filter((r) => r.driverId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  res.json({ rides: mine })
})

export default router
