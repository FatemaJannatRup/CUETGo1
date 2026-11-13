import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LEGACY_DB_PATH = path.join(__dirname, 'data', 'db.json')

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Configure it on the backend service.')
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase requires encrypted database connections.
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

function emptyDb() {
  return { students: [], drivers: [], rides: [] }
}

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cuetgo_students (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cuetgo_drivers (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cuetgo_rides (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  const counts = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM cuetgo_students) AS students,
      (SELECT COUNT(*) FROM cuetgo_drivers) AS drivers,
      (SELECT COUNT(*) FROM cuetgo_rides) AS rides
  `)
  const total = Object.values(counts.rows[0]).reduce((sum, value) => sum + Number(value), 0)

  // Import the legacy JSON file once, but only when the new tables are empty.
  if (total === 0 && fs.existsSync(LEGACY_DB_PATH)) {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_DB_PATH, 'utf8'))
    await writeDb({
      students: Array.isArray(legacy.students) ? legacy.students : [],
      drivers: Array.isArray(legacy.drivers) ? legacy.drivers : [],
      rides: Array.isArray(legacy.rides) ? legacy.rides : [],
    })
    console.log('Imported legacy db.json into PostgreSQL.')
  }

  const finalCounts = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM cuetgo_students) AS students,
      (SELECT COUNT(*) FROM cuetgo_drivers) AS drivers,
      (SELECT COUNT(*) FROM cuetgo_rides) AS rides
  `)
  console.log('PostgreSQL ready. Record counts:', finalCounts.rows[0])
}

export async function readDb() {
  const [students, drivers, rides] = await Promise.all([
    pool.query('SELECT data FROM cuetgo_students'),
    pool.query('SELECT data FROM cuetgo_drivers'),
    pool.query('SELECT data FROM cuetgo_rides'),
  ])
  return {
    students: students.rows.map((row) => row.data),
    drivers: drivers.rows.map((row) => row.data),
    rides: rides.rows.map((row) => row.data),
  }
}

export async function writeDb(data) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const collections = [
      ['students', 'cuetgo_students'],
      ['drivers', 'cuetgo_drivers'],
      ['rides', 'cuetgo_rides'],
    ]

    for (const [key, table] of collections) {
      const records = Array.isArray(data[key]) ? data[key] : []
      for (const record of records) {
        if (!record?.id) throw new Error(`Cannot save ${key} record without an id.`)
        await client.query(
          `INSERT INTO ${table} (id, data, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
          [String(record.id), JSON.stringify(record)],
        )
      }
      const ids = records.map((record) => String(record.id))
      if (ids.length) {
        await client.query(`DELETE FROM ${table} WHERE NOT (id = ANY($1::text[]))`, [ids])
      } else {
        await client.query(`DELETE FROM ${table}`)
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

export async function closeDatabase() {
  await pool.end()
}

export { emptyDb }
