import 'dotenv/config'
import 'express-async-errors'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import rideRoutes from './routes/rides.js'
import adminRoutes from './routes/admin.js'
import { initializeDatabase, closeDatabase, checkDatabase } from './db.js'

const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})
const allowedOrigins = [
  'https://cuetgo-frontend-87ru.onrender.com',
  'http://localhost:5173',
]
const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}
app.use(cors(corsOptions))
app.options('*', cors(corsOptions))
app.use(express.json({ limit: '32kb' }))

app.use('/api/auth', authRoutes)
app.use('/api/rides', rideRoutes)
app.use('/api/admin', adminRoutes)

app.get('/api/health', async (req, res) => {
  try {
    await checkDatabase()
    res.json({ ok: true, database: 'connected' })
  } catch (error) {
    console.error('Health check failed:', error.message)
    res.status(503).json({ ok: false, database: 'unavailable' })
  }
})

app.use((error, req, res, next) => {
  console.error('Unhandled API error:', error)
  if (res.headersSent) return next(error)
  res.status(error.status || 500).json({ message: error.status ? error.message : 'An unexpected server error occurred.' })
})

const PORT = Number(process.env.PORT || 5000)

async function startServer(port) {
  await initializeDatabase()
  const server = app.listen(port, () => {
    console.log(`CUET Shared Ride backend running on http://localhost:${port}`)
    if (!process.env.GEMINI_API_KEY) {
      console.log('GEMINI_API_KEY not set — ride matching will use the simple rule-based fallback.')
    }
  })

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const fallbackPort = port + 1
      console.warn(`Port ${port} is busy. Retrying on ${fallbackPort}.`)
      startServer(fallbackPort).catch((startupError) => { console.error('Database/server startup failed:', startupError); process.exit(1) })
      return
    }

    console.error('Failed to start server:', error)
    process.exit(1)
  })
}

startServer(PORT).catch((error) => {
  console.error('Database initialization failed:', error)
  closeDatabase().finally(() => process.exit(1))
})
