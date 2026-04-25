import { Outlet, useNavigate } from "react-router-dom"
import { AppHeader } from "./AppHeader"
import { AppTabBar } from "./AppTabBar"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { BookOpen } from "lucide-react"

export function AppLayout() {
  const { isLoggedIn } = useAuth()
  const navigate = useNavigate()

  if (!isLoggedIn) {
    return (
      <div className="flex h-screen flex-col bg-[var(--background)]">
        <AppHeader />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
          <div className="w-16 h-16 rounded-2xl bg-[var(--card)] flex items-center justify-center">
            <BookOpen className="h-8 w-8 text-[var(--muted-foreground)]" />
          </div>
          <p className="text-[17px] text-[var(--muted-foreground)] tracking-[-0.02em]">
            请先登录以访问你的书库
          </p>
          <Button
            className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white font-[400] text-[17px] px-6 h-9"
            onClick={() => navigate("/login")}
          >
            前往登录
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--background)]">
      <AppHeader />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <AppTabBar />
    </div>
  )
}
