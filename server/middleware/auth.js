import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me'

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function requireAuth(role) {
  return (req, res, next) => {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ message: 'Not logged in.' })
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
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
