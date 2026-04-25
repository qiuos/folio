import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/useAuth"

export function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    const ok = await login(username, password)
    if (ok) {
      navigate("/")
    } else {
      setError("用户名或密码错误")
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-[var(--background)] p-6">
      <div className="w-full max-w-[400px] space-y-10">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-[#0071e3] flex items-center justify-center mx-auto">
            <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
          </div>
          <h1 className="text-[28px] font-[700] tracking-[-0.02em] text-[var(--foreground)]">
            登录 Folio
          </h1>
          <p className="text-[15px] text-[var(--muted-foreground)] tracking-[-0.01em]">
            你的私人在线图书馆
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[13px] font-[600] text-[var(--foreground)]">
              用户名
            </label>
            <Input
              placeholder="请输入用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-11 bg-[var(--card)] border-[var(--border)] rounded-xl text-[16px] tracking-[-0.01em] px-4"
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[13px] font-[600] text-[var(--foreground)]">
              密码
            </label>
            <Input
              type="password"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 bg-[var(--card)] border-[var(--border)] rounded-xl text-[16px] tracking-[-0.01em] px-4"
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p className="text-[13px] text-[#ff453a] pl-1">{error}</p>
          )}
          <Button
            type="submit"
            className="w-full h-11 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white font-[600] text-[17px] tracking-[-0.01em] mt-2"
            disabled={loading || !username || !password}
          >
            {loading ? "登录中..." : "登录"}
          </Button>
        </form>
      </div>
    </div>
  )
}
