import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, 'data', 'db.json')

function seedData() {
  const demoStudentPassword = bcrypt.hashSync('student123', 10)
  const demoDriverPassword = bcrypt.hashSync('driver123', 10)

  return {
    students: [
      {
        id: 'demo-student-1',
        name: 'Nusrat Jahan',
        email: 'u2204064@student.cuet.ac.bd',
        studentId: '2204064',
        gender: 'female',
        hall: 'Muktijoddha Hall',
        password: demoStudentPassword,
        createdAt: new Date().toISOString(),
      },
    ],
    drivers: [
      {
        id: 'demo-driver-1',
        name: 'Rahim Ali',
        identifier: 'rahim@gmail.com',
        nid: '1234567890',
        rickshaw: 'Blue rickshaw - 12',
        verified: true,
        password: demoDriverPassword,
        createdAt: new Date().toISOString(),
      },
    ],
    rides: [
      {
        id: 'demo-ride-1',
        studentId: 'demo-student-1',
        from: 'Muktijoddha Hall',
        to: 'Academic Building',
        fare: 30,
        requestedTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        seats: 1,
        passengerCount: 1,
        status: 'pending',
        driverId: null,
        matchedRideIds: [],
        passengers: [
          { studentId: 'demo-student-1', name: 'Nusrat Jahan', phone: '01700000000', info: 'Primary rider', seatCount: 1, isGuest: false },
        ],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'demo-ride-2',
        studentId: 'demo-student-1',
        from: 'Muktijoddha Hall',
        to: 'Central Library',
        fare: 40,
        requestedTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        seats: 2,
        passengerCount: 2,
        status: 'pending',
        driverId: null,
        matchedRideIds: [],
        passengers: [
          { studentId: 'demo-student-1', name: 'Nusrat Jahan', phone: '01700000000', info: 'Primary rider', seatCount: 1, isGuest: false },
          { studentId: 'guest-1', name: 'Mahi Ahmed', phone: '01811111111', info: 'Second rider', seatCount: 1, isGuest: true },
        ],
        createdAt: new Date().toISOString(),
      },
    ],
  }
}

function ensureDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(seedData(), null, 2))
  }
}

export function readDb() {
  ensureDb()
  const raw = fs.readFileSync(DB_PATH, 'utf-8')
  return JSON.parse(raw)
}

export function writeDb(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
}
