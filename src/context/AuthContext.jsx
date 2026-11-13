import React, { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api.js'

const AuthContext = createContext(null)

function cachedSessionUser(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (!payload.id || !['student', 'driver'].includes(payload.role)) return null
    try {
      const cached = JSON.parse(localStorage.getItem('csr_user') || 'null')
      if (cached?.id === payload.id && cached?.role === payload.role) return cached
    } catch {}
    return { id: payload.id, role: payload.role }
  } catch { return null }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('csr_token')
    if (!token) { setLoading(false); return }
    setUser(cachedSessionUser(token))
    api.me().then(({ user: current }) => {
      localStorage.setItem('csr_user', JSON.stringify(current))
      setUser(current)
    }).catch((error) => {
      const invalidSession = /session expired|invalid session|not logged in|account not found/i.test(error.message)
      if (invalidSession) {
        localStorage.removeItem('csr_token')
        localStorage.removeItem('csr_user')
        setUser(null)
      }
      // Keep the last known session during temporary network/server failures.
    }).finally(() => setLoading(false))
  }, [])

  function persist(token, userData) {
    localStorage.setItem('csr_token', token)
    localStorage.setItem('csr_user', JSON.stringify(userData))
    setUser(userData)
  }

  async function googleLogin(credential, role) {
    try {
      const { token, user } = await api.googleLogin({ credential, role })
      persist(token, user)
      return { ok: true, user }
    } catch (e) { return { ok: false, message: e.message } }
  }

  async function googleSignup(credential, role, profile) {
    try {
      const { token, user } = await api.googleSignup({ credential, role, profile })
      persist(token, user)
      return { ok: true, user }
    } catch (e) { return { ok: false, message: e.message } }
  }

  async function updateProfile(payload) {
    try {
      const { user } = await api.updateProfile(payload)
      localStorage.setItem('csr_user', JSON.stringify(user))
      setUser(user)
      return { ok: true, user }
    } catch (e) { return { ok: false, message: e.message } }
  }

  function logout() {
    localStorage.removeItem('csr_token')
    localStorage.removeItem('csr_user')
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, googleLogin, googleSignup, updateProfile, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() { return useContext(AuthContext) }
