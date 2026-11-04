import React, { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('csr_token')
    if (!token) { setLoading(false); return }
    api.me().then(({ user }) => setUser(user))
      .catch(() => localStorage.removeItem('csr_token'))
      .finally(() => setLoading(false))
  }, [])

  function persist(token, userData) {
    localStorage.setItem('csr_token', token)
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
      setUser(user)
      return { ok: true, user }
    } catch (e) { return { ok: false, message: e.message } }
  }

  function logout() {
    localStorage.removeItem('csr_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, googleLogin, googleSignup, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() { return useContext(AuthContext) }
