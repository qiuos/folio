import { Link, useLocation } from "react-router-dom"
import { Home, Library, Search, BookOpen, User } from "lucide-react"

const tabs = [
  { label: "首页", path: "/", icon: Home },
  { label: "书架", path: "/shelves", icon: BookOpen },
  { label: "搜索", path: "/search", icon: Search },
  { label: "书库", path: "/library", icon: Library },
  { label: "我的", path: "/settings", icon: User },
]

export function AppTabBar() {
  const location = useLocation()

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-14 border-t border-[var(--border)]"
      style={{
        background: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
      }}
    >
      <div className="flex items-center justify-around h-full px-2">
        {tabs.map((tab) => {
          const isActive =
            tab.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(tab.path)
          const Icon = tab.icon

          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${
                isActive
                  ? "text-[#0071e3]"
                  : "text-[rgba(255,255,255,0.45)]"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-[500]">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
