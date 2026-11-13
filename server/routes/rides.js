import { Router } from 'express'
import crypto from 'crypto'
import { readDb, mutateDb } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { findMatches, optimizeSharedRoute } from '../services/gemini.js'

const router = Router()
const BOOKING_CUTOFF_MS = 2 * 60 * 1000
const MATCH_WINDOW_MS = 10 * 60 * 1000
const STUDENT_CONFLICT_WINDOW_MS = 15 * 60 * 1000
const DRIVER_BUFFER_MS = 15 * 60 * 1000

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

function fail(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function farePerSeat(from, to) {
  if (HALLS.includes(from) && HALLS.includes(to)) return 20
  if (HALLS.includes(from)) return 30
  return 25
}

function pickupTime(ride) {
  return new Date(ride.requestedTime || ride.createdAt).getTime()
}

function isBeforeCutoff(ride, now = Date.now()) {
  return pickupTime(ride) - now > BOOKING_CUTOFF_MS
}

function occupiedSeats(ride) {
  if (Array.isArray(ride.passengers) && ride.passengers.length) {
    return ride.passengers.reduce((sum, passenger) => sum + Math.max(1, Number(passenger.seatCount || 1)), 0)
  }
  return Math.max(1, Number(ride.seats || 1))
}

function normalizePassengers(ride, fallbackStudent) {
  if (Array.isArray(ride.passengers) && ride.passengers.length) return ride.passengers
  return [{
    studentId: ride.studentId || fallbackStudent?.id,
    name: fallbackStudent?.name || 'Student',
    phone: String(fallbackStudent?.phone || ''),
    info: 'Primary rider',
    seatCount: Math.max(1, Number(ride.seats || 1)),
    isGuest: false,
  }]
}

function recalculateRide(ride) {
  const passengers = Array.isArray(ride.passengers) ? ride.passengers : []
  const seats = passengers.reduce((sum, passenger) => sum + Math.max(1, Number(passenger.seatCount || 1)), 0)
  ride.seats = seats
  ride.passengerCount = seats
  ride.farePerSeat = farePerSeat(ride.from, ride.to)
  ride.fare = ride.farePerSeat * seats
}

function studentIsOnRide(ride, studentId) {
  return ride.studentId === studentId ||
    (Array.isArray(ride.passengers) && ride.passengers.some((passenger) => passenger.studentId === studentId))
}

function hasStudentTimeConflict(db, studentId, requestedAt, exceptRideId = null) {
  return db.rides.some((ride) => {
    if (ride.id === exceptRideId || !['pending', 'accepted'].includes(ride.status)) return false
    if (!studentIsOnRide(ride, studentId)) return false
    return Math.abs(pickupTime(ride) - requestedAt) < STUDENT_CONFLICT_WINDOW_MS
  })
}

function sameRoute(a, b) {
  return a.from === b.from && a.to === b.to
}

function validSharedGroup(rides) {
  if (!Array.isArray(rides) || rides.length < 1 || rides.length > 2) return false
  if (!rides.every((ride) => sameRoute(ride, rides[0]))) return false
  const times = rides.map(pickupTime)
  if (Math.max(...times) - Math.min(...times) > MATCH_WINDOW_MS) return false
  return rides.reduce((sum, ride) => sum + occupiedSeats(ride), 0) <= 2
}

function studentName(db, studentId) {
  const student = db.students.find((item) => item.id === studentId)
  return student ? (student.username || student.name) : 'Student'
}

router.get('/routes', (req, res) => {
  res.json({ locations: LOCATIONS, halls: HALLS })
})

// Students can see both unassigned and driver-accepted rides while the group
// still has a seat. No passenger may join during the final two minutes.
router.get('/open', requireAuth('student'), async (req, res) => {
  const db = await readDb()
  const now = Date.now()
  const rides = db.rides
    .filter((ride) =>
      ['pending', 'accepted'].includes(ride.status) &&
      pickupTime(ride) > now + BOOKING_CUTOFF_MS &&
      occupiedSeats(ride) < 2 &&
      !studentIsOnRide(ride, req.user.id)
    )
    .map((ride) => {
      const host = db.students.find((student) => student.id === ride.studentId)
      const passengers = normalizePassengers(ride, host)
      const seatsUsed = occupiedSeats({ ...ride, passengers })
      return {
        ...ride,
        hostName: host?.username || host?.name || 'Campus rider',
        hostGender: host?.gender || 'unknown',
        seats: seatsUsed,
        seatsLeft: Math.max(0, 2 - seatsUsed),
        passengers,
        bookingClosesAt: new Date(pickupTime(ride) - BOOKING_CUTOFF_MS).toISOString(),
      }
    })
    .sort((a, b) => pickupTime(a) - pickupTime(b))
  res.json({ rides })
})

router.post('/request', requireAuth('student'), async (req, res) => {
  const { from, to, requestedTime, seats = 1, coPassengerName = '', coPassengerPhone = '', coPassengerInfo = '' } = req.body || {}
  if (!LOCATIONS.includes(from) || !LOCATIONS.includes(to) || from === to) {
    return res.status(400).json({ message: 'Choose two different CUET locations.' })
  }
  const requestedAt = Date.parse(requestedTime)
  if (!Number.isFinite(requestedAt)) return res.status(400).json({ message: 'Choose a valid pickup time.' })
  if (requestedAt - Date.now() <= BOOKING_CUTOFF_MS) {
    return res.status(400).json({ message: 'Bookings close 2 minutes before pickup. Choose a later time.' })
  }
  const seatCount = Number(seats)
  if (![1, 2].includes(seatCount)) return res.status(400).json({ message: 'A rickshaw has only 1 or 2 seats.' })
  if (seatCount === 2 && (!String(coPassengerName).trim() || !String(coPassengerPhone).trim())) {
    return res.status(400).json({ message: 'For 2 seats, add the companion name and phone number.' })
  }

  const ride = await mutateDb((db) => {
    const student = db.students.find((item) => item.id === req.user.id)
    if (!student) throw fail(404, 'Student account not found.')
    if (hasStudentTimeConflict(db, req.user.id, requestedAt)) {
      throw fail(409, 'You already have another ride close to this pickup time. Cancel it or choose a different time.')
    }

    const created = {
      id: crypto.randomUUID(),
      studentId: student.id,
      from,
      to,
      farePerSeat: farePerSeat(from, to),
      fare: farePerSeat(from, to) * seatCount,
      requestedTime: new Date(requestedAt).toISOString(),
      seats: seatCount,
      passengerCount: seatCount,
      status: 'pending',
      driverId: null,
      matchedRideIds: [],
      passengers: [{
        studentId: student.id,
        name: student.username || student.name,
        phone: String(student.phone || ''),
        info: 'Primary rider',
        seatCount: 1,
        isGuest: false,
      }],
      createdAt: new Date().toISOString(),
    }

    if (seatCount === 2) {
      created.passengers.push({
        studentId: 'guest-' + crypto.randomUUID(),
        name: String(coPassengerName).trim(),
        phone: String(coPassengerPhone).trim(),
        info: String(coPassengerInfo || 'Companion passenger').trim(),
        seatCount: 1,
        isGuest: true,
      })
    }

    db.rides.push(created)
    return created
  })

  // Candidate discovery is intentionally outside the DB transaction. Gemini
  // can never hold a seat lock or block a booking if its API is slow.
  const db = await readDb()
  const candidates = db.rides.filter((candidate) =>
    candidate.id !== ride.id &&
    ['pending', 'accepted'].includes(candidate.status) &&
    occupiedSeats(candidate) < 2 &&
    pickupTime(candidate) > Date.now() + BOOKING_CUTOFF_MS
  )
  const matches = await findMatches(ride, candidates)
  const matchDetails = matches.map((match) => {
    const candidate = candidates.find((item) => item.id === match.rideId)
    return candidate ? {
      rideId: candidate.id,
      reason: match.reason,
      route: candidate.from + ' → ' + candidate.to,
      time: candidate.requestedTime,
      seatsLeft: 2 - occupiedSeats(candidate),
    } : null
  }).filter(Boolean)

  res.status(201).json({ ride, matches: matchDetails })
})

router.post('/:id/join', requireAuth('student'), async (req, res) => {
  const seatCount = Number(req.body?.seats || 1)
  if (![1, 2].includes(seatCount)) return res.status(400).json({ message: 'Choose 1 or 2 seats.' })

  const ride = await mutateDb((db) => {
    const target = db.rides.find((item) => item.id === req.params.id)
    if (!target || !['pending', 'accepted'].includes(target.status)) {
      throw fail(404, 'This shared ride is no longer available.')
    }
    if (!isBeforeCutoff(target)) throw fail(409, 'This ride is closed. Bookings close 2 minutes before pickup.')
    if (studentIsOnRide(target, req.user.id)) throw fail(409, 'You are already part of this ride.')
    const seatsUsed = occupiedSeats(target)
    if (seatsUsed + seatCount > 2) throw fail(409, 'There are not enough empty seats left.')

    const student = db.students.find((item) => item.id === req.user.id)
    if (!student) throw fail(404, 'Student account not found.')
    if (hasStudentTimeConflict(db, req.user.id, pickupTime(target))) {
      throw fail(409, 'You already have another ride close to this pickup time.')
    }

    target.passengers = normalizePassengers(target, db.students.find((item) => item.id === target.studentId))
    target.passengers.push({
      studentId: student.id,
      name: student.username || student.name,
      phone: String(req.body?.phone || student.phone || ''),
      info: 'Joined ride',
      seatCount,
      isGuest: false,
      joinedAt: new Date().toISOString(),
    })
    recalculateRide(target)
    target.updatedAt = new Date().toISOString()
    return target
  })

  res.json({ ride, joined: true, seatsLeft: Math.max(0, 2 - occupiedSeats(ride)) })
})

// A passenger can cancel only before the two-minute lock. If the ride owner
// leaves but another registered passenger remains, ownership transfers to them.
router.post('/:id/cancel', requireAuth('student'), async (req, res) => {
  const result = await mutateDb((db) => {
    const ride = db.rides.find((item) => item.id === req.params.id)
    if (!ride || !['pending', 'accepted'].includes(ride.status)) throw fail(404, 'Active ride not found.')
    if (!isBeforeCutoff(ride)) throw fail(409, 'Passenger changes are locked 2 minutes before pickup.')
    const passengers = normalizePassengers(ride, db.students.find((item) => item.id === ride.studentId))
    if (!passengers.some((passenger) => passenger.studentId === req.user.id)) {
      throw fail(403, 'You are not a passenger on this ride.')
    }

    if (ride.studentId === req.user.id) {
      ride.passengers = passengers.filter((passenger) => !passenger.isGuest && passenger.studentId !== req.user.id)
      if (ride.passengers.length) {
        ride.studentId = ride.passengers[0].studentId
      }
    } else {
      ride.passengers = passengers.filter((passenger) => passenger.studentId !== req.user.id)
    }

    if (!ride.passengers.length) {
      ride.status = 'cancelled'
      ride.cancelledAt = new Date().toISOString()
      ride.cancelledBy = 'student'
      ride.driverId = null
    } else {
      recalculateRide(ride)
    }
    ride.updatedAt = new Date().toISOString()
    return { ride, cancelled: true }
  })
  res.json({ ride: result.ride, cancelled: true })
})

router.get('/mine', requireAuth('student'), async (req, res) => {
  const db = await readDb()
  const mine = db.rides
    .filter((ride) => studentIsOnRide(ride, req.user.id))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const withMatches = await Promise.all(mine.map(async (ride) => {
    if (!['pending', 'accepted'].includes(ride.status) || !isBeforeCutoff(ride)) return ride
    const candidates = db.rides.filter((candidate) =>
      candidate.id !== ride.id &&
      ['pending', 'accepted'].includes(candidate.status) &&
      occupiedSeats(candidate) < 2 &&
      pickupTime(candidate) > Date.now() + BOOKING_CUTOFF_MS
    )
    const matches = await findMatches(ride, candidates)
    return { ...ride, matchDetails: matches }
  }))
  res.json({ rides: withMatches })
})

router.get('/pending', requireAuth('driver'), requireApprovedDriver, async (req, res) => {
  const db = await readDb()
  const pending = db.rides
    .filter((ride) => ride.status === 'pending' && pickupTime(ride) > Date.now())
    .sort((a, b) => pickupTime(a) - pickupTime(b))

  const groups = []
  for (const ride of pending) {
    const seats = occupiedSeats(ride)
    const group = groups.find((candidate) => {
      if (!sameRoute(candidate, ride)) return false
      const all = candidate.rideIds.map((id) => pending.find((item) => item.id === id)).filter(Boolean)
      return all.length < 2 &&
        Math.abs(pickupTime(candidate) - pickupTime(ride)) <= MATCH_WINDOW_MS &&
        all.reduce((sum, item) => sum + occupiedSeats(item), 0) + seats <= 2
    })

    if (group) {
      group.rideIds.push(ride.id)
      group.riders += seats
      group.fare += Number(ride.fare || 0)
      group.requestedTime = new Date(Math.min(pickupTime({ requestedTime: group.requestedTime }), pickupTime(ride))).toISOString()
    } else {
      groups.push({
        key: ride.id,
        from: ride.from,
        to: ride.to,
        fare: Number(ride.fare || 0),
        rideIds: [ride.id],
        riders: seats,
        time: ride.createdAt,
        requestedTime: ride.requestedTime || ride.createdAt,
      })
    }
  }
  res.json({ groups })
})

router.post('/optimize', requireAuth('driver'), requireApprovedDriver, async (req, res) => {
  const rideIds = Array.isArray(req.body?.rideIds) ? [...new Set(req.body.rideIds)] : []
  if (!rideIds.length || rideIds.length > 2) throw fail(400, 'Select one shared ride group to optimize.')
  const db = await readDb()
  const selected = rideIds.map((id) => db.rides.find((ride) => ride.id === id && ride.status === 'pending')).filter(Boolean)
  if (selected.length !== rideIds.length || !validSharedGroup(selected)) {
    throw fail(409, 'These requests are no longer a feasible shared ride group.')
  }
  const plan = await optimizeSharedRoute(selected)
  res.json({ ...plan, legs: selected.map((ride) => ({ from: ride.from, to: ride.to })) })
})

router.post('/accept', requireAuth('driver'), requireApprovedDriver, async (req, res) => {
  const selectedRideIds = Array.isArray(req.body?.rideIds) ? [...new Set(req.body.rideIds)] : []
  if (!selectedRideIds.length || selectedRideIds.length > 2) {
    throw fail(400, 'Select one ride or one compatible two-request group.')
  }

  const accepted = await mutateDb((db) => {
    const selected = selectedRideIds.map((id) => db.rides.find((ride) => ride.id === id))
    if (selected.some((ride) => !ride || ride.status !== 'pending')) {
      throw fail(409, 'One or more rides are no longer available.')
    }
    if (!validSharedGroup(selected)) {
      throw fail(409, 'These requests cannot share one rickshaw. They must have the same route, be within 10 minutes, and use no more than two seats.')
    }
    if (selected.some((ride) => pickupTime(ride) <= Date.now())) {
      throw fail(409, 'This pickup time has already passed.')
    }

    const existing = db.rides.filter((ride) =>
      ride.driverId === req.user.id && ride.status === 'accepted' &&
      !selectedRideIds.includes(ride.id)
    )
    const conflict = selected.some((ride) => existing.some((current) =>
      Math.abs(pickupTime(current) - pickupTime(ride)) < DRIVER_BUFFER_MS
    ))
    if (conflict) throw fail(409, 'This request overlaps with another accepted trip in your schedule.')

    for (const ride of selected) {
      ride.status = 'accepted'
      ride.driverId = req.user.id
      ride.acceptedAt = new Date().toISOString()
      ride.updatedAt = ride.acceptedAt
    }
    return selected.length
  })
  res.json({ accepted })
})

router.post('/:id/driver-cancel', requireAuth('driver'), requireApprovedDriver, async (req, res) => {
  const ride = await mutateDb((db) => {
    const target = db.rides.find((item) =>
      item.id === req.params.id && item.driverId === req.user.id && item.status === 'accepted'
    )
    if (!target) throw fail(404, 'Accepted ride not found.')
    const now = Date.now()
    if (pickupTime(target) - now > BOOKING_CUTOFF_MS) {
      target.status = 'pending'
      target.driverId = null
      target.driverCancelledAt = new Date().toISOString()
      target.driverCancelReason = String(req.body?.reason || '').slice(0, 240)
      target.updatedAt = target.driverCancelledAt
      return { ride: target, reopened: true }
    }
    target.status = 'cancelled'
    target.driverCancelledAt = new Date().toISOString()
    target.driverCancelReason = String(req.body?.reason || '').slice(0, 240)
    target.updatedAt = target.driverCancelledAt
    return { ride: target, reopened: false }
  })
  res.json(ride)
})

router.post('/:id/complete', requireAuth('driver'), requireApprovedDriver, async (req, res) => {
  const ride = await mutateDb((db) => {
    const target = db.rides.find((item) =>
      item.id === req.params.id && item.driverId === req.user.id && item.status === 'accepted'
    )
    if (!target) throw fail(404, 'Accepted ride not found.')
    target.status = 'completed'
    target.completedAt = new Date().toISOString()
    target.paidOut = false
    target.updatedAt = target.completedAt
    return target
  })
  res.json({ ride })
})

router.get('/mine-driver', requireAuth('driver'), requireApprovedDriver, async (req, res) => {
  const db = await readDb()
  const mine = db.rides
    .filter((ride) => ride.driverId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  res.json({ rides: mine })
})

export default router
