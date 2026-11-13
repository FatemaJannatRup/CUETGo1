import { Router } from 'express'
import crypto from 'crypto'
import { readDb, mutateDb } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { findMatches, optimizeSharedRoute } from '../services/gemini.js'
import { HALLS, LOCATIONS } from '../constants/campusLocations.js'

const router = Router()
const BOOKING_CUTOFF_MS = 2 * 60 * 1000
const MATCH_WINDOW_MS = 10 * 60 * 1000
const STUDENT_CONFLICT_WINDOW_MS = 15 * 60 * 1000
const DRIVER_BUFFER_MS = 15 * 60 * 1000
const GUEST_PHONE = /^(01[3-9]\d{8}|\+?8801[3-9]\d{8})$/

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

function passengerSeats(passenger) {
  const count = Number(passenger?.seatCount || 1)
  return Number.isFinite(count) ? Math.max(1, Math.min(2, Math.floor(count))) : 1
}

function occupiedSeats(ride) {
  if (Array.isArray(ride.passengers) && ride.passengers.length) {
    return ride.passengers.reduce((sum, passenger) => sum + passengerSeats(passenger), 0)
  }
  const count = Number(ride.seats || 1)
  return Number.isFinite(count) ? Math.max(1, Math.min(2, Math.floor(count))) : 1
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
  const seats = passengers.reduce((sum, passenger) => sum + passengerSeats(passenger), 0)
  ride.seats = seats
  ride.passengerCount = seats
  ride.farePerSeat = farePerSeat(ride.from, ride.to)
  ride.fare = ride.farePerSeat * seats
}

function studentIsOnRide(ride, studentId) {
  return ride.studentId === studentId ||
    (Array.isArray(ride.passengers) && ride.passengers.some((passenger) => passenger.studentId === studentId))
}

function rideGroupRecords(db, ride) {
  if (!ride.sharedGroupId) return [ride]
  return db.rides.filter((item) =>
    item.sharedGroupId === ride.sharedGroupId &&
    item.driverId === ride.driverId &&
    ['pending', 'accepted', 'arrived'].includes(item.status)
  )
}

function totalGroupSeats(db, ride) {
  return rideGroupRecords(db, ride).reduce((sum, item) => sum + occupiedSeats(item), 0)
}

function totalGroupRiders(db, ride) {
  return rideGroupRecords(db, ride).reduce((sum, item) => {
    const owner = db.students.find((student) => student.id === item.studentId)
    return sum + normalizePassengers(item, owner).reduce((count, passenger) => count + passengerSeats(passenger), 0)
  }, 0)
}

function studentIsOnRideGroup(db, ride, studentId) {
  return rideGroupRecords(db, ride).some((item) => studentIsOnRide(item, studentId))
}

function hasStudentTimeConflict(db, studentId, requestedAt, exceptRideId = null) {
  return db.rides.some((ride) => {
    if (ride.id === exceptRideId || !['pending', 'accepted', 'arrived', 'in_progress'].includes(ride.status)) return false
    if (!studentIsOnRide(ride, studentId)) return false
    if (ride.status === 'in_progress') return true
    return Math.abs(pickupTime(ride) - requestedAt) < STUDENT_CONFLICT_WINDOW_MS
  })
}

function sameRoute(a, b) {
  return a.from === b.from && a.to === b.to
}

function assignedRideGroup(db, target, driverId) {
  if (!target.sharedGroupId) return [target]
  return db.rides.filter((ride) => ride.sharedGroupId === target.sharedGroupId && ride.driverId === driverId)
}

function validSharedGroup(rides) {
  if (!Array.isArray(rides) || rides.length < 1 || rides.length > 2) return false
  if (!rides.every((ride) => sameRoute(ride, rides[0]))) return false
  const times = rides.map(pickupTime)
  if (times.some((time) => !Number.isFinite(time))) return false
  if (Math.max(...times) - Math.min(...times) > MATCH_WINDOW_MS) return false
  return rides.reduce((sum, ride) => sum + occupiedSeats(ride), 0) <= 2
}

function studentName(db, studentId) {
  const student = db.students.find((item) => item.id === studentId)
  return student ? (student.username || student.name) : 'Student'
}

// Student-facing ride payloads deliberately omit passenger phone numbers.
function studentRideView(ride) {
  const safeRide = {}
  for (const field of [
    'id', 'from', 'to', 'fare', 'farePerSeat', 'seats', 'passengerCount',
    'status', 'requestedTime', 'createdAt', 'updatedAt', 'driverCancelledAt',
    'bookingClosesAt', 'matchDetails',
  ]) {
    if (ride[field] !== undefined) safeRide[field] = ride[field]
  }
  const passengers = Array.isArray(ride.passengers) ? ride.passengers : []
  return {
    ...safeRide,
    passengers: passengers.map(({ phone, nid, nidHash, studentId, ...passenger }) => passenger),
  }
}

function assertApprovedDriver(db, driverId) {
  const driver = db.drivers.find((item) => item.id === driverId)
  if (!driver) throw fail(404, 'Driver account not found.')
  if (driver.verificationStatus !== 'approved') {
    throw fail(403, 'Your driver account is not approved to manage rides.')
  }
}

async function readDbAndExpirePending() {
  const snapshot = await readDb()
  const now = Date.now()
  const hasExpired = snapshot.rides.some((ride) => ride.status === 'pending' && pickupTime(ride) <= now)
  if (!hasExpired) return snapshot
  return mutateDb((db) => {
    const expiredAt = new Date().toISOString()
    for (const ride of db.rides) {
      if (ride.status === 'pending' && pickupTime(ride) <= now) {
        ride.status = 'expired'
        ride.expiredAt = expiredAt
        ride.updatedAt = expiredAt
      }
    }
    return db
  })
}

router.get('/routes', (req, res) => {
  res.json({ locations: LOCATIONS, halls: HALLS })
})

// Students can see both unassigned and driver-accepted rides while the group
// still has a seat. No passenger may join during the final two minutes.
router.get('/open', requireAuth('student'), async (req, res) => {
  const db = await readDbAndExpirePending()
  const now = Date.now()
  const seenGroups = new Set()
  const rides = db.rides
    .filter((ride) => {
      if (!['pending', 'accepted', 'arrived'].includes(ride.status) ||
          pickupTime(ride) <= now + BOOKING_CUTOFF_MS ||
          totalGroupSeats(db, ride) >= 2 ||
          studentIsOnRideGroup(db, ride, req.user.id)) return false
      const groupKey = ride.sharedGroupId ? `${ride.sharedGroupId}:${ride.driverId || 'unassigned'}` : ride.id
      if (seenGroups.has(groupKey)) return false
      seenGroups.add(groupKey)
      return true
    })
    .map((ride) => {
      const host = db.students.find((student) => student.id === ride.studentId)
      const passengers = normalizePassengers(ride, host)
      const seatsUsed = totalGroupSeats(db, ride)
      return {
        id: ride.id,
        from: ride.from,
        to: ride.to,
        requestedTime: ride.requestedTime || ride.createdAt,
        createdAt: ride.createdAt,
        status: ride.status,
        driverCancelledAt: ride.driverCancelledAt || null,
        hostName: host?.username || host?.name || 'Campus rider',
        seats: seatsUsed,
        seatsLeft: Math.max(0, 2 - seatsUsed),
        riderCount: totalGroupRiders(db, ride),
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
  if (seatCount === 2) {
    const guestName = String(coPassengerName).trim()
    const guestPhone = String(coPassengerPhone).trim()
    const guestInfo = String(coPassengerInfo || '').trim()
    if (guestName.length < 2 || guestName.length > 80 || !GUEST_PHONE.test(guestPhone) || guestInfo.length > 120) {
      return res.status(400).json({ message: 'Enter a valid companion name and Bangladeshi mobile number. Additional information must be 120 characters or fewer.' })
    }
  }

  const ride = await mutateDb((db) => {
    // Recheck after acquiring the transaction lock: a request can wait in the
    // queue long enough to cross the two-minute cutoff.
    if (requestedAt - Date.now() <= BOOKING_CUTOFF_MS) {
      throw fail(409, 'Bookings close 2 minutes before pickup. Choose a later time.')
    }
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
      updatedAt: new Date().toISOString(),
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
    ['pending', 'accepted', 'arrived'].includes(candidate.status) &&
    totalGroupSeats(db, candidate) < 2 &&
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
      seatsLeft: 2 - totalGroupSeats(db, candidate),
    } : null
  }).filter(Boolean)

  res.status(201).json({ ride: studentRideView(ride), matches: matchDetails })
})

router.post('/:id/join', requireAuth('student'), async (req, res) => {
  const seatCount = Number(req.body?.seats || 1)
  const coPassengerName = String(req.body?.coPassengerName || '').trim()
  const coPassengerPhone = String(req.body?.coPassengerPhone || '').trim()
  const coPassengerInfo = String(req.body?.coPassengerInfo || '').trim()
  if (![1, 2].includes(seatCount)) return res.status(400).json({ message: 'Choose 1 or 2 seats.' })
  if (seatCount === 2 && (coPassengerName.length < 2 || coPassengerName.length > 80 || !GUEST_PHONE.test(coPassengerPhone) || coPassengerInfo.length > 120)) {
    return res.status(400).json({ message: 'Enter a valid companion name and Bangladeshi mobile number. Additional information must be 120 characters or fewer.' })
  }

  const ride = await mutateDb((db) => {
    const target = db.rides.find((item) => item.id === req.params.id)
    if (!target || !['pending', 'accepted', 'arrived'].includes(target.status)) {
      throw fail(404, 'This shared ride is no longer available.')
    }
    if (!LOCATIONS.includes(target.from) || !LOCATIONS.includes(target.to) || target.from === target.to) {
      throw fail(409, 'This ride has an invalid campus route and cannot accept passengers.')
    }
    if (!isBeforeCutoff(target)) throw fail(409, 'This ride is closed. Bookings close 2 minutes before pickup.')
    if (studentIsOnRideGroup(db, target, req.user.id)) throw fail(409, 'You are already part of this ride.')
    const seatsUsed = totalGroupSeats(db, target)
    if (seatsUsed + seatCount > 2) throw fail(409, 'There are not enough empty seats left.')

    const student = db.students.find((item) => item.id === req.user.id)
    if (!student) throw fail(404, 'Student account not found.')

    // If this student already created a matching one-seat request, pool it into
    // this ride atomically instead of making them cancel manually.
    const ownRequest = db.rides.find((item) =>
      item.id !== target.id &&
      item.studentId === student.id &&
      item.status === 'pending' &&
      sameRoute(item, target) &&
      Math.abs(pickupTime(item) - pickupTime(target)) <= MATCH_WINDOW_MS &&
      occupiedSeats(item) === 1
    )
    if (ownRequest) {
      ownRequest.status = 'cancelled'
      ownRequest.cancelledAt = new Date().toISOString()
      ownRequest.cancelledBy = 'student-pooled'
      ownRequest.updatedAt = ownRequest.cancelledAt
    }

    if (hasStudentTimeConflict(db, req.user.id, pickupTime(target))) {
      throw fail(409, 'You already have another ride close to this pickup time.')
    }

    target.passengers = normalizePassengers(target, db.students.find((item) => item.id === target.studentId))
    const joinedAt = new Date().toISOString()
    target.passengers.push({
      studentId: student.id,
      name: student.username || student.name,
      phone: String(req.body?.phone || student.phone || ''),
      info: 'Joined ride',
      seatCount: 1,
      isGuest: false,
      joinedAt,
    })
    if (seatCount === 2) {
      target.passengers.push({
        studentId: 'guest-' + crypto.randomUUID(),
        name: coPassengerName,
        phone: coPassengerPhone,
        info: coPassengerInfo || 'Companion passenger',
        seatCount: 1,
        isGuest: true,
        joinedAt,
      })
    }
    recalculateRide(target)
    target.updatedAt = new Date().toISOString()
    return target
  })

  res.json({ ride: studentRideView(ride), joined: true, seatsLeft: Math.max(0, 2 - occupiedSeats(ride)) })
})

// A passenger can cancel only before the two-minute lock. If the ride owner
// leaves but another registered passenger remains, ownership transfers to them.
router.post('/:id/cancel', requireAuth('student'), async (req, res) => {
  const result = await mutateDb((db) => {
    const ride = db.rides.find((item) => item.id === req.params.id)
    if (!ride || !['pending', 'accepted', 'arrived'].includes(ride.status)) throw fail(404, 'Active ride not found.')
    if (pickupTime(ride) <= Date.now()) throw fail(409, 'The pickup time has passed. Contact your driver if you cannot travel.')
    // Cancellations remain possible after the cutoff, but the released seat is
    // not advertised to another student once the booking window has closed.
    const seatReopened = isBeforeCutoff(ride)
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
      delete ride.sharedGroupId
    } else {
      recalculateRide(ride)
    }
    ride.updatedAt = new Date().toISOString()
    return { ride, cancelled: true, seatReopened }
  })
  res.json({ ride: studentRideView(result.ride), cancelled: true, seatReopened: result.seatReopened })
})

router.get('/mine', requireAuth('student'), async (req, res) => {
  const db = await readDbAndExpirePending()
  const mine = db.rides
    .filter((ride) => studentIsOnRide(ride, req.user.id))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const withMatches = await Promise.all(mine.map(async (ride) => {
    if (!['pending', 'accepted', 'arrived'].includes(ride.status) || !isBeforeCutoff(ride)) return ride
    const candidates = db.rides.filter((candidate) =>
      candidate.id !== ride.id &&
      ['pending', 'accepted', 'arrived'].includes(candidate.status) &&
      totalGroupSeats(db, candidate) < 2 &&
      pickupTime(candidate) > Date.now() + BOOKING_CUTOFF_MS
    )
    const matches = await findMatches(ride, candidates, { useAI: false })
    return { ...ride, matchDetails: matches }
  }))
  res.json({ rides: withMatches.map(studentRideView) })
})

router.get('/pending', requireAuth('driver'), requireApprovedDriver, async (req, res) => {
  const db = await readDbAndExpirePending()
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
    assertApprovedDriver(db, req.user.id)
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
      ride.driverId === req.user.id && ['accepted', 'arrived', 'in_progress'].includes(ride.status) &&
      !selectedRideIds.includes(ride.id)
    )
    const conflict = selected.some((ride) => existing.some((current) =>
      current.status === 'in_progress' || Math.abs(pickupTime(current) - pickupTime(ride)) < DRIVER_BUFFER_MS
    ))
    if (conflict) throw fail(409, 'This request overlaps with another accepted trip in your schedule.')

    const sharedGroupId = crypto.randomUUID()
    for (const ride of selected) {
      ride.status = 'accepted'
      ride.driverId = req.user.id
      ride.sharedGroupId = sharedGroupId
      ride.acceptedAt = new Date().toISOString()
      ride.updatedAt = ride.acceptedAt
    }
    return selected.length
  })
  res.json({ accepted })
})

router.post('/:id/driver-cancel', requireAuth('driver'), requireApprovedDriver, async (req, res) => {
  const ride = await mutateDb((db) => {
    assertApprovedDriver(db, req.user.id)
    const target = db.rides.find((item) =>
      item.id === req.params.id && item.driverId === req.user.id && ['accepted', 'arrived'].includes(item.status)
    )
    if (!target) throw fail(404, 'Accepted ride not found.')
    const group = assignedRideGroup(db, target, req.user.id)
    if (group.some((ride) => !['accepted', 'arrived'].includes(ride.status))) {
      throw fail(409, 'This shared trip has already changed status. Refresh and try again.')
    }
    const now = Date.now()
    const cancelledAt = new Date().toISOString()
    let reopened = false
    let replacementNeeded = false
    for (const ride of group) {
      ride.driverCancelledAt = cancelledAt
      ride.driverCancelReason = String(req.body?.reason || '').slice(0, 240)
      ride.updatedAt = cancelledAt
      if (pickupTime(ride) <= now) {
        ride.status = 'cancelled'
        ride.driverId = null
        delete ride.sharedGroupId
      } else {
        // Preserve the passenger group after cutoff, but return the trip to the
        // driver queue so another approved driver can take it before pickup.
        ride.status = 'pending'
        ride.driverId = null
        ride.bookingLocked = pickupTime(ride) - now <= BOOKING_CUTOFF_MS
        reopened = reopened || !ride.bookingLocked
        replacementNeeded = true
      }
    }
    return { rides: group, reopened, replacementNeeded }
  })
  res.json(ride)
})

router.post('/:id/status', requireAuth('driver'), requireApprovedDriver, async (req, res) => {
  const nextStatus = String(req.body?.status || '')
  if (!['arrived', 'in_progress'].includes(nextStatus)) {
    throw fail(400, 'Choose arrived or in_progress.')
  }
  const ride = await mutateDb((db) => {
    assertApprovedDriver(db, req.user.id)
    const target = db.rides.find((item) =>
      item.id === req.params.id && item.driverId === req.user.id
    )
    if (!target) throw fail(404, 'Assigned ride not found.')
    const group = assignedRideGroup(db, target, req.user.id)
    const expectedStatus = nextStatus === 'arrived' ? 'accepted' : 'arrived'
    if (group.some((ride) => ride.status !== expectedStatus)) {
      throw fail(409, 'The shared trip status has changed. Refresh and try again.')
    }
    if (nextStatus === 'in_progress' && group.some((ride) => pickupTime(ride) - Date.now() > BOOKING_CUTOFF_MS)) {
      throw fail(409, 'The trip can start only after the two-minute booking window has closed.')
    }
    const timestamp = new Date().toISOString()
    for (const ride of group) {
      ride.status = nextStatus
      if (nextStatus === 'arrived') ride.arrivedAt = timestamp
      if (nextStatus === 'in_progress') ride.startedAt = timestamp
      ride.updatedAt = timestamp
    }
    return target
  })
  res.json({ ride })
})

router.post('/:id/complete', requireAuth('driver'), requireApprovedDriver, async (req, res) => {
  const ride = await mutateDb((db) => {
    assertApprovedDriver(db, req.user.id)
    const target = db.rides.find((item) =>
      item.id === req.params.id && item.driverId === req.user.id && item.status === 'in_progress'
    )
    if (!target) throw fail(404, 'Accepted ride not found.')
    const group = assignedRideGroup(db, target, req.user.id)
    if (group.some((ride) => ride.status !== 'in_progress')) {
      throw fail(409, 'The shared trip status has changed. Refresh and try again.')
    }
    const completedAt = new Date().toISOString()
    for (const ride of group) {
      ride.status = 'completed'
      ride.completedAt = completedAt
      ride.paidOut = false
      ride.updatedAt = completedAt
    }
    return target
  })
  res.json({ ride })
})

router.get('/mine-driver', requireAuth('driver'), requireApprovedDriver, async (req, res) => {
  const db = await readDbAndExpirePending()
  const mine = db.rides
    .filter((ride) => ride.driverId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  res.json({ rides: mine })
})

export default router
