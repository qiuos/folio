import axios from "axios"

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api/v1",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
})

let accessToken: string | null = null
let refreshToken: string | null = null

export function setToken(token: string | null) {
  accessToken = token
  if (token) {
    localStorage.setItem("folio_token", token)
  } else {
    localStorage.removeItem("folio_token")
  }
}

export function getToken(): string | null {
  if (!accessToken) {
    accessToken = localStorage.getItem("folio_token")
  }
  return accessToken
}

export function setRefreshToken(token: string | null) {
  refreshToken = token
  if (token) {
    localStorage.setItem("folio_refresh_token", token)
  } else {
    localStorage.removeItem("folio_refresh_token")
  }
}

export function getRefreshToken(): string | null {
  if (!refreshToken) {
    refreshToken = localStorage.getItem("folio_refresh_token")
  }
  return refreshToken
}

export function clearTokens() {
  accessToken = null
  refreshToken = null
  localStorage.removeItem("folio_token")
  localStorage.removeItem("folio_refresh_token")
}

let isRefreshing = false
let pendingRequests: ((token: string) => void)[] = []

async function tryRefresh(): Promise<string | null> {
  const rt = getRefreshToken()
  if (!rt) return null

  if (isRefreshing) {
    return new Promise<string | null>((resolve) => {
      pendingRequests.push((token) => resolve(token))
    })
  }

  isRefreshing = true
  try {
    const { data: resp } = await axios.post(
      `${client.defaults.baseURL}/auth/refresh`,
      { refresh_token: rt },
    )
    if (resp.success && resp.data?.access_token) {
      setToken(resp.data.access_token)
      setRefreshToken(resp.data.refresh_token)
      pendingRequests.forEach((cb) => cb(resp.data.access_token))
      pendingRequests = []
      return resp.data.access_token
    }
    clearTokens()
    pendingRequests.forEach((cb) => cb(null as any))
    pendingRequests = []
    return null
  } catch {
    clearTokens()
    pendingRequests.forEach((cb) => cb(null as any))
    pendingRequests = []
    return null
  } finally {
    isRefreshing = false
  }
}

client.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      const newToken = await tryRefresh()
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return client(originalRequest)
      }
    }
    return Promise.reject(error)
  },
)

export default client
