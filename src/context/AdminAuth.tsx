import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface AdminAuthCtx {
  token: string | null
  login: (password: string) => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AdminAuthCtx | null>(null)

const TOKEN_KEY = 'admin_token'

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))

  useEffect(() => {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  }, [token])

  async function login(password: string) {
    const res = await fetch('http://localhost:8002/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) throw new Error('Invalid password')
    const data = await res.json()
    setToken(data.token)
  }

  async function logout() {
    if (token) {
      await fetch('http://localhost:8002/admin/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
    setToken(null)
  }

  return <Ctx.Provider value={{ token, login, logout }}>{children}</Ctx.Provider>
}

export function useAdminAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAdminAuth must be inside AdminAuthProvider')
  return ctx
}
