import { useEffect, useState, createContext, useContext } from "react"
import { getToken, setToken, setRefreshToken, clearTokens } from "@/api/client"
import client from "@/api/client"

interface AuthState {
  isLoggedIn: boolean
  user: { id: number; username: string } | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  checkAuth: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  isLoggedIn: false,
  user: null,
  login: async () => false,
  logout: () => {},
  checkAuth: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export { AuthContext }

export function useAuthProvider() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getToken())
  const [user, setUser] = useState<{ id: number; username: string } | null>(null)

  const checkAuth = async () => {
    const token = getToken()
    if (!token) {
      setIsLoggedIn(false)
      setUser(null)
      return
    }
    try {
      const { data: resp } = await client.get("/auth/me")
      if (resp.success && resp.data) {
        setIsLoggedIn(true)
        setUser(resp.data)
      }
    } catch {
      setIsLoggedIn(false)
      setUser(null)
      clearTokens()
    }
  }

  useEffect(() => {
    checkAuth()
  }, [])

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const { data: resp } = await client.post("/auth/login", { username, password })
      if (resp.success && resp.data?.access_token) {
        setToken(resp.data.access_token)
        setRefreshToken(resp.data.refresh_token)
        setIsLoggedIn(true)
        await checkAuth()
        return true
      }
      return false
    } catch {
      return false
    }
  }

  const logout = () => {
    clearTokens()
    setIsLoggedIn(false)
    setUser(null)
  }

  return { isLoggedIn, user, login, logout, checkAuth }
}
