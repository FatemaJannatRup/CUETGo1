import React, { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('csr_token')
    if (!token) {
      setLoading(false)
      return
    }
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => {
        localStorage.removeItem('csr_token')
      })
      .finally(() => setLoading(false))
  }, [])

  function persist(token, userData) {
    localStorage.setItem('csr_token', token)
    setUser(userData)
  }

  function updateUser(nextUser) {
    setUser((current) => ({ ...(current || {}), ...(nextUser || {}) }))
  }

  async function googleAuth(credential, role, intent = 'login', profile = {}) {
    try {
      const { token, user } = await api.googleAuth({ credential, role, intent, profile })
      persist(token, user)
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e.message }
    }
  }

  async function studentSignup(payload) {
    try {
      const { token, user } = await api.studentSignup(payload)
      persist(token, user)
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e.message }
    }
  }

  async function studentLogin(email, password) {
    try {
      const { token, user } = await api.studentLogin({ email, password })
      persist(token, user)
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e.message }
    }
  }

  async function driverSignup(payload) {
    try {
      const { token, user } = await api.driverSignup(payload)
      persist(token, user)
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e.message }
    }
  }

  async function driverLogin(identifier, password) {
    try {
      const { token, user } = await api.driverLogin({ identifier, password })
      persist(token, user)
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e.message }
    }
  }

  async function updateProfile(payload) {
    try {
      const { user } = await api.updateProfile(payload)
      updateUser(user)
      return { ok: true, user }
    } catch (e) {
      return { ok: false, message: e.message }
    }
  }

  function logout() {
    localStorage.removeItem('csr_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, googleAuth, studentSignup, studentLogin, driverSignup, driverLogin, updateProfile, updateUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
