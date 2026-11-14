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
  const conflict = ignoreConflict ? 'DO NOTHING' : `DO UPDATE SET ${updates.join(',')}, updated_at=NOW() WHERE EXCLUDED.data ? 'updatedAt' AND COALESCE(NULLIF(${table.name}.data->>'updatedAt','')::timestamptz, 'epoch'::timestamptz) <= NULLIF(EXCLUDED.data->>'updatedAt','')::timestamptz`
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

  // Backfill the explicit ride mode and single-rickshaw fare for existing records.
  // Legacy one-seat bookings were shareable; two-seat bookings with a companion remain private.
  await pool.query(`
    UPDATE cuetgo_rides
    SET fare = COALESCE(
          NULLIF(data->>'farePerSeat','')::numeric,
          NULLIF(data->>'fare','')::numeric,
          0
        ),
        data = data || jsonb_build_object(
      'sharingMode', COALESCE(
        data->>'sharingMode',
        CASE
          WHEN COALESCE((SELECT COUNT(*) FROM jsonb_array_elements(COALESCE(data->'passengers', '[]'::jsonb)) AS passengers(passenger)
            WHERE COALESCE((passenger->>'isGuest')::boolean, false) = false), 0) > 1 THEN 'share'
          WHEN COALESCE(NULLIF(data->>'seats','')::integer, 1) = 1 THEN 'share'
          ELSE 'private'
        END
      ),
      'genderPreference', COALESCE(data->>'genderPreference', 'any'),
      'farePaymentMode', COALESCE(data->>'farePaymentMode', 'single-payer'),
      'fare', to_jsonb(COALESCE(
        NULLIF(data->>'farePerSeat','')::numeric,
        NULLIF(data->>'fare','')::numeric,
        0
      ))
    )
    WHERE data->>'sharingMode' IS NULL
       OR data->>'farePaymentMode' IS NULL;
  `)

  // Existing accepted shared groups must split the one vehicle fare across both bookings.
  await pool.query(`
    WITH active_groups AS (
      SELECT
        data->>'sharedGroupId' AS group_id,
        COUNT(*) AS ride_count,
        SUM(COALESCE(NULLIF(data->>'seats','')::integer, 1)) AS seat_count,
        MIN(COALESCE(NULLIF(data->>'seats','')::integer, 1)) AS min_seats,
        MAX(COALESCE(NULLIF(data->>'seats','')::integer, 1)) AS max_seats
      FROM cuetgo_rides
      WHERE data->>'sharingMode' = 'share'
        AND data->>'sharedGroupId' IS NOT NULL
        AND status IN ('pending', 'accepted', 'arrived')
      GROUP BY data->>'sharedGroupId'
    )
    UPDATE cuetgo_rides AS ride
    SET fare = COALESCE(
          NULLIF(ride.data->>'farePerSeat','')::numeric,
          NULLIF(ride.data->>'fare','')::numeric,
          0
        ) / 2,
        data = ride.data || jsonb_build_object(
          'fare',
          to_jsonb(COALESCE(
            NULLIF(ride.data->>'farePerSeat','')::numeric,
            NULLIF(ride.data->>'fare','')::numeric,
            0
          ) / 2),
          'farePaymentMode',
          'split'
        )
    FROM active_groups AS shared
    WHERE ride.data->>'sharedGroupId' = shared.group_id
      AND shared.ride_count = 2
      AND shared.seat_count = 2
      AND shared.min_seats = 1
      AND shared.max_seats = 1
      AND ride.status IN ('pending', 'accepted', 'arrived');
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

async function loadDb(queryable) {
  const [students, drivers, rides] = await Promise.all([
    queryable.query('SELECT data FROM cuetgo_students ORDER BY updated_at DESC'),
    queryable.query('SELECT data FROM cuetgo_drivers ORDER BY updated_at DESC'),
    queryable.query('SELECT data FROM cuetgo_rides ORDER BY updated_at DESC'),
  ])
  return {
    students: students.rows.map((row) => row.data),
    drivers: drivers.rows.map((row) => row.data),
    rides: rides.rows.map((row) => row.data),
  }
}

async function persistDb(queryable, data) {
  for (const kind of Object.keys(TABLES)) {
    for (const record of (Array.isArray(data[kind]) ? data[kind] : [])) {
      await saveRecord(queryable, kind, record)
    }
  }
}

export async function readDb() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const data = await loadDb(client)
    await client.query('COMMIT')
    return data
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// All application writes use the same transaction-scoped advisory lock. This
// prevents two concurrent ride joins/acceptances from overwriting each other.
export async function mutateDb(mutator) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1)', [72419031])
    const data = await loadDb(client)
    const result = await mutator(data)
    await persistDb(client, data)
    await client.query('COMMIT')
    return result
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
