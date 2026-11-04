import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import rideRoutes from './routes/rides.js'
import adminRoutes from './routes/admin.js'

const app = express()
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.options('*', cors())
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/rides', rideRoutes)
app.use('/api/admin', adminRoutes)

app.get('/api/health', (req, res) => res.json({ ok: true }))

const PORT = Number(process.env.PORT || 5000)

function startServer(port) {
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
      startServer(fallbackPort)
      return
    }

    console.error('Failed to start server:', error)
    process.exit(1)
  })
}

startServer(PORT)
