import pg from 'pg'

const { Pool } = pg
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

const DEMO_STUDENTS = [
  { id:'demo-student-1', username:'rup_demo', name:'Rup Demo', email:'u2204001@student.cuet.ac.bd', studentId:'2204001', hall:'Muktijoddha Hall', gender:'female', googleId:'demo-google-student-1', authProvider:'demo', demo:true, createdAt:new Date().toISOString() },
  { id:'demo-student-2', username:'sami_demo', name:'Sami Demo', email:'u2204002@student.cuet.ac.bd', studentId:'2204002', hall:'Shaheed Tareq Huda Hall', gender:'male', googleId:'demo-google-student-2', authProvider:'demo', demo:true, createdAt:new Date().toISOString() },
  { id:'demo-student-3', username:'nabila_demo', name:'Nabila Demo', email:'u2204003@student.cuet.ac.bd', studentId:'2204003', hall:'Sufia Kamal Hall', gender:'female', googleId:'demo-google-student-3', authProvider:'demo', demo:true, createdAt:new Date().toISOString() },
]
const DEMO_DRIVERS = [
  { id:'demo-driver-1', name:'Rahim Demo', email:'driver1@example.test', phone:'01700000001', identifier:'01700000001', nidHash:'demo-nid-hash-1', nidLast4:'0001', googleId:'demo-google-driver-1', authProvider:'demo', verificationStatus:'approved', verified:true, demo:true, createdAt:new Date().toISOString(), approvedAt:new Date().toISOString() },
  { id:'demo-driver-2', name:'Karim Demo', email:'driver2@example.test', phone:'01700000002', identifier:'01700000002', nidHash:'demo-nid-hash-2', nidLast4:'0002', googleId:'demo-google-driver-2', authProvider:'demo', verificationStatus:'pending', verified:false, demo:true, createdAt:new Date().toISOString() },
]
const DEMO_RIDES = [
  { id:'demo-ride-1', studentId:'demo-student-1', from:'Muktijoddha Hall', to:'CUET Main Gate', fare:30, requestedTime:new Date(Date.now() + 35 * 60 * 1000).toISOString(), seats:1, passengerCount:1, status:'pending', driverId:null, matchedRideIds:['demo-ride-2'], passengers:[{studentId:'demo-student-1',name:'Rup Demo',phone:'',info:'Primary rider',seatCount:1,isGuest:false}], coPassenger:null, createdAt:new Date().toISOString(), demo:true },
  { id:'demo-ride-2', studentId:'demo-student-2', from:'Shaheed Tareq Huda Hall', to:'CUET Main Gate', fare:30, requestedTime:new Date(Date.now() + 42 * 60 * 1000).toISOString(), seats:1, passengerCount:1, status:'pending', driverId:null, matchedRideIds:['demo-ride-1'], passengers:[{studentId:'demo-student-2',name:'Sami Demo',phone:'',info:'Primary rider',seatCount:1,isGuest:false}], coPassenger:null, createdAt:new Date().toISOString(), demo:true },
  { id:'demo-ride-3', studentId:'demo-student-3', from:'Sufia Kamal Hall', to:'Central Library', fare:25, requestedTime:new Date(Date.now() + -25 * 60 * 1000).toISOString(), seats:1, passengerCount:1, status:'accepted', driverId:'demo-driver-1', matchedRideIds:[], passengers:[{studentId:'demo-student-3',name:'Nabila Demo',phone:'',info:'Primary rider',seatCount:1,isGuest:false}], coPassenger:null, createdAt:new Date(Date.now()-60*60*1000).toISOString(), acceptedAt:new Date(Date.now()-30*60*1000).toISOString(), demo:true },
  { id:'demo-ride-4', studentId:'demo-student-1', from:'Academic Building', to:'Muktijoddha Hall', fare:30, requestedTime:new Date(Date.now() + -180 * 60 * 1000).toISOString(), seats:1, passengerCount:1, status:'completed', driverId:'demo-driver-1', matchedRideIds:[], passengers:[{studentId:'demo-student-1',name:'Rup Demo',phone:'',info:'Primary rider',seatCount:1,isGuest:false}], coPassenger:null, createdAt:new Date(Date.now()-4*60*60*1000).toISOString(), completedAt:new Date(Date.now()-3*60*60*1000).toISOString(), demo:true },
]

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cuetgo_students (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS cuetgo_drivers (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS cuetgo_rides (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS cuetgo_students_email_idx ON cuetgo_students ((data->>'email'));
    CREATE INDEX IF NOT EXISTS cuetgo_drivers_email_idx ON cuetgo_drivers ((data->>'email'));
    CREATE INDEX IF NOT EXISTS cuetgo_rides_status_idx ON cuetgo_rides ((data->>'status'));
    CREATE INDEX IF NOT EXISTS cuetgo_rides_student_idx ON cuetgo_rides ((data->>'studentId'));
    CREATE INDEX IF NOT EXISTS cuetgo_rides_driver_idx ON cuetgo_rides ((data->>'driverId'));
  `)

  if (String(process.env.SEED_DEMO_DATA || 'true').toLowerCase() === 'true') {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const [table, records] of [['cuetgo_students', DEMO_STUDENTS], ['cuetgo_drivers', DEMO_DRIVERS], ['cuetgo_rides', DEMO_RIDES]]) {
        for (const record of records) {
          await client.query(`INSERT INTO ${table} (id,data) VALUES ($1,$2::jsonb) ON CONFLICT (id) DO NOTHING`, [record.id, JSON.stringify(record)])
        }
      }
      await client.query('COMMIT')
      console.log('Demo records ensured in PostgreSQL.')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  const counts = await pool.query(`
    SELECT (SELECT COUNT(*) FROM cuetgo_students) AS students,
           (SELECT COUNT(*) FROM cuetgo_drivers) AS drivers,
           (SELECT COUNT(*) FROM cuetgo_rides) AS rides
  `)
  console.log('PostgreSQL ready. Record counts:', counts.rows[0])
}

export async function readDb() {
  const [students, drivers, rides] = await Promise.all([
    pool.query('SELECT data FROM cuetgo_students ORDER BY updated_at DESC'),
    pool.query('SELECT data FROM cuetgo_drivers ORDER BY updated_at DESC'),
    pool.query('SELECT data FROM cuetgo_rides ORDER BY updated_at DESC'),
  ])
  return { students: students.rows.map((r) => r.data), drivers: drivers.rows.map((r) => r.data), rides: rides.rows.map((r) => r.data) }
}

// Upsert changed snapshots without deleting other users' records.
export async function writeDb(data) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const [key, table] of [['students','cuetgo_students'],['drivers','cuetgo_drivers'],['rides','cuetgo_rides']]) {
      for (const record of (Array.isArray(data[key]) ? data[key] : [])) {
        if (!record?.id) throw new Error(`Cannot save ${key} record without an id.`)
        await client.query(`INSERT INTO ${table} (id,data,updated_at) VALUES ($1,$2::jsonb,NOW()) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`, [String(record.id), JSON.stringify(record)])
      }
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function closeDatabase() { await pool.end() }
