import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters before the server starts.')
}

export function signToken(payload, options = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: options.expiresIn || '7d', issuer: 'cuetgo', audience: 'cuetgo-client' })
}

export function requireAuth(role) {
  return (req, res, next) => {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ message: 'Not logged in.' })
    try {
      const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'cuetgo', audience: 'cuetgo-client' })
      if (!decoded.id || !['student', 'driver', 'admin'].includes(decoded.role)) {
        return res.status(401).json({ message: 'Invalid session.' })
      }
      if (role && decoded.role !== role) {
        return res.status(403).json({ message: 'Not allowed for this role.' })
      }
      req.user = decoded
      next()
    } catch {
      return res.status(401).json({ message: 'Session expired. Please log in again.' })
    }
  }
}
