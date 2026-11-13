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

const TABLES = {
  { id:'demo-student-1', username:'rup_demo', name:'Rup Demo', email:'u2204001@student.cuet.ac.bd', studentId:'2204001', hall:'Muktijoddha Hall', gender:'female', googleId:'demo-google-student-1', authProvider:'demo', demo:true, createdAt:new Date().toISOString() },
  { id:'demo-student-2', username:'sami_demo', name:'Sami Demo', email:'u2204002@student.cuet.ac.bd', studentId:'2204002', hall:'Shaheed Tareq Huda Hall', gender:'male', googleId:'demo-google-student-2', authProvider:'demo', demo:true, createdAt:new Date().toISOString() },
  { id:'demo-student-3', username:'nabila_demo', name:'Nabila Demo', email:'u2204003@student.cuet.ac.bd', studentId:'2204003', hall:'Sufia Kamal Hall', gender:'female', googleId:'demo-google-student-3', authProvider:'demo', demo:true, createdAt:new Date().toISOString() },
]
const DEMO_DRIVERS = [
  { id:'demo-driver-1', name:'Rahim Demo', email:'driver1@example.test', phone:'01700000001', identifier:'01700000001', nidHash:'demo-nid-hash-1', nidLast4:'0001', googleId:'demo-google-driver-1', authProvider:'demo', verificationStatus:'approved', verified:true, demo:true, createdAt:new Date().toISOString(), approvedAt:new Date().toISOString() },
  { id:'demo-driver-2', name:'Karim Demo', email:'driver2@example.test', phone:'01700000002', identifier:'01700000002', nidHash:'demo-nid-hash-2', nidLast4:'0002', googleId:'demo-google-driver-2', authProvider:'demo', verificationStatus:'pending', verified:false, demo:true, createdAt:new Date().toISOString() },
]
const DEMO_RIDES = [
  { id:'demo-ride-1', studentId:'demo-student-1', from:'Muktijoddha Hall', to:'CUET Main Gate', fare:30, requestedTime:new Date(Date.now()+35*60000).toISOString(), seats:1, passengerCount:1, status:'pending', driverId:null, matchedRideIds:['demo-ride-2'], passengers:[{studentId:'demo-student-1',name:'Rup Demo',phone:'',info:'Primary rider',seatCount:1,isGuest:false}], coPassenger:null, createdAt:new Date().toISOString(), demo:true },
  { id:'demo-ride-2', studentId:'demo-student-2', from:'Shaheed Tareq Huda Hall', to:'CUET Main Gate', fare:30, requestedTime:new Date(Date.now()+42*60000).toISOString(), seats:1, passengerCount:1, status:'pending', driverId:null, matchedRideIds:['demo-ride-1'], passengers:[{studentId:'demo-student-2',name:'Sami Demo',phone:'',info:'Primary rider',seatCount:1,isGuest:false}], coPassenger:null, createdAt:new Date().toISOString(), demo:true },
  { id:'demo-ride-3', studentId:'demo-student-3', from:'Sufia Kamal Hall', to:'Central Library', fare:25, requestedTime:new Date(Date.now()-25*60000).toISOString(), seats:1, passengerCount:1, status:'accepted', driverId:'demo-driver-1', matchedRideIds:[], passengers:[{studentId:'demo-student-3',name:'Nabila Demo',phone:'',info:'Primary rider',seatCount:1,isGuest:false}], coPassenger:null, createdAt:new Date(Date.now()-60*60000).toISOString(), acceptedAt:new Date(Date.now()-30*60000).toISOString(), demo:true },
  { id:'demo-ride-4', studentId:'demo-student-1', from:'Academic Building', to:'Muktijoddha Hall', fare:30, requestedTime:new Date(Date.now()-180*60000).toISOString(), seats:1, passengerCount:1, status:'completed', driverId:'demo-driver-1', matchedRideIds:[], passengers:[{studentId:'demo-student-1',name:'Rup Demo',phone:'',info:'Primary rider',seatCount:1,isGuest:false}], coPassenger:null, createdAt:new Date(Date.now()-240*60000).toISOString(), completedAt:new Date(Date.now()-180*60000).toISOString(), demo:true },
]

const TABLES = {
  students: { name:'cuetgo_students', columns:['email','username','student_id','hall','gender','created_at'], values:r=>[r.email||null,r.username||null,r.studentId||null,r.hall||null,r.gender||null,r.createdAt||null] },
  drivers: { name:'cuetgo_drivers', columns:['email','name','phone','nid_last4','verification_status','created_at'], values:r=>[r.email||null,r.name||null,r.phone||null,r.nidLast4||null,r.verificationStatus||'pending',r.createdAt||null] },
  rides: { name:'cuetgo_rides', columns:['student_id','driver_id','from_location','to_location','fare','seats','status','requested_time','created_at'], values:r=>[r.studentId||null,r.driverId||null,r.from||null,r.to||null,Number(r.fare||0),Number(r.seats||1),r.status||'pending',r.requestedTime||null,r.createdAt||null] },
}

async function saveRecord(client, kind, record, ignoreConflict = false) {
  const table = TABLES[kind]
  if (!table || !record?.id) throw new Error(`Cannot save invalid ${kind} record.`)
  const columns = ['id','data',...table.columns]
  const values = [String(record.id),JSON.stringify(record),...table.values(record)]
  const placeholders = values.map((_,i)=>`$${i+1}`)
  const updates = ['data',...table.columns].map((column)=>`${column}=EXCLUDED.${column}`)
  const conflict = ignoreConflict ? 'DO NOTHING' : `DO UPDATE SET ${updates.join(',')}, updated_at=NOW()`
  await client.query(
    `INSERT INTO ${table.name} (${columns.join(',')},updated_at) VALUES (${placeholders.join(',')},NOW()) ON CONFLICT (id) ${conflict}`,
    values,
  )
}

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cuetgo_students (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS cuetgo_drivers (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS cuetgo_rides (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

    ALTER TABLE cuetgo_students ADD COLUMN IF NOT EXISTS email TEXT, ADD COLUMN IF NOT EXISTS username TEXT, ADD COLUMN IF NOT EXISTS student_id TEXT, ADD COLUMN IF NOT EXISTS hall TEXT, ADD COLUMN IF NOT EXISTS gender TEXT, ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
    ALTER TABLE cuetgo_drivers ADD COLUMN IF NOT EXISTS email TEXT, ADD COLUMN IF NOT EXISTS name TEXT, ADD COLUMN IF NOT EXISTS phone TEXT, ADD COLUMN IF NOT EXISTS nid_last4 TEXT, ADD COLUMN IF NOT EXISTS verification_status TEXT, ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
    ALTER TABLE cuetgo_rides ADD COLUMN IF NOT EXISTS student_id TEXT, ADD COLUMN IF NOT EXISTS driver_id TEXT, ADD COLUMN IF NOT EXISTS from_location TEXT, ADD COLUMN IF NOT EXISTS to_location TEXT, ADD COLUMN IF NOT EXISTS fare NUMERIC(10,2), ADD COLUMN IF NOT EXISTS seats INTEGER, ADD COLUMN IF NOT EXISTS status TEXT, ADD COLUMN IF NOT EXISTS requested_time TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

    UPDATE cuetgo_students SET email=data->>'email', username=data->>'username', student_id=data->>'studentId', hall=data->>'hall', gender=data->>'gender', created_at=NULLIF(data->>'createdAt','')::timestamptz WHERE email IS NULL;
    UPDATE cuetgo_drivers SET email=data->>'email', name=data->>'name', phone=data->>'phone', nid_last4=data->>'nidLast4', verification_status=COALESCE(data->>'verificationStatus','pending'), created_at=NULLIF(data->>'createdAt','')::timestamptz WHERE email IS NULL;
    UPDATE cuetgo_rides SET student_id=data->>'studentId', driver_id=data->>'driverId', from_location=data->>'from', to_location=data->>'to', fare=COALESCE(NULLIF(data->>'fare','')::numeric,0), seats=COALESCE(NULLIF(data->>'seats','')::integer,1), status=COALESCE(data->>'status','pending'), requested_time=NULLIF(data->>'requestedTime','')::timestamptz, created_at=NULLIF(data->>'createdAt','')::timestamptz WHERE student_id IS NULL;
    CREATE INDEX IF NOT EXISTS cuetgo_students_email_column_idx ON cuetgo_students (email);
    CREATE INDEX IF NOT EXISTS cuetgo_drivers_email_column_idx ON cuetgo_drivers (email);
    CREATE INDEX IF NOT EXISTS cuetgo_drivers_status_column_idx ON cuetgo_drivers (verification_status);
    CREATE INDEX IF NOT EXISTS cuetgo_rides_status_column_idx ON cuetgo_rides (status);
    CREATE INDEX IF NOT EXISTS cuetgo_rides_student_column_idx ON cuetgo_rides (student_id);
    CREATE INDEX IF NOT EXISTS cuetgo_rides_driver_column_idx ON cuetgo_rides (driver_id);
  `)

  // Remove only records created by the temporary demo seed. Real user data is preserved.
  const removed = await pool.query(`
    DELETE FROM cuetgo_rides WHERE id LIKE 'demo-%' OR data->>'demo' = 'true';
    DELETE FROM cuetgo_drivers WHERE id LIKE 'demo-%' OR data->>'demo' = 'true';
    DELETE FROM cuetgo_students WHERE id LIKE 'demo-%' OR data->>'demo' = 'true';
  `)
  console.log('Temporary demo records removed from PostgreSQL.')


  console.log('PostgreSQL ready. Record counts:', await checkDatabase())
}

export async function readDb() {
  const [students,drivers,rides] = await Promise.all([
    pool.query('SELECT data FROM cuetgo_students ORDER BY updated_at DESC'),
    pool.query('SELECT data FROM cuetgo_drivers ORDER BY updated_at DESC'),
    pool.query('SELECT data FROM cuetgo_rides ORDER BY updated_at DESC'),
  ])
  return { students:students.rows.map(r=>r.data), drivers:drivers.rows.map(r=>r.data), rides:rides.rows.map(r=>r.data) }
}

export async function writeDb(data) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const kind of Object.keys(TABLES)) {
      for (const record of (Array.isArray(data[kind]) ? data[kind] : [])) await saveRecord(client,kind,record)
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function checkDatabase() {
  const result = await pool.query(`SELECT (SELECT COUNT(*) FROM cuetgo_students) AS students, (SELECT COUNT(*) FROM cuetgo_drivers) AS drivers, (SELECT COUNT(*) FROM cuetgo_rides) AS rides`)
  return result.rows[0]
}

export async function closeDatabase() { await pool.end() }
