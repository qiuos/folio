import { Link, useLocation, useNavigate } from "react-router-dom"
import { useTheme } from "@/hooks/useTheme"
import { useAuth } from "@/hooks/useAuth"

const navItems = [
  { label: "首页", path: "/" },
  { label: "书架", path: "/shelves" },
  { label: "书库", path: "/library" },
]

const iconBtnBase = "flex items-center justify-center w-9 h-9 text-white/85 border-none bg-transparent cursor-pointer"
const iconBtnStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.85)",
  WebkitTapHighlightColor: "transparent",
  textDecoration: "none",
}

export function AppHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const { theme, setTheme } = useTheme()
  const { isLoggedIn } = useAuth()

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path)

  return (
    <header
      className="sticky top-0 z-50 h-12 flex items-center px-3 shrink-0"
      style={{
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
      }}
    >
      <Link
        to="/"
        style={{ color: "#fff", fontSize: 17, fontWeight: 600, textDecoration: "none", marginRight: 24, whiteSpace: "nowrap" }}
      >
        Folio
      </Link>

      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-6">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            style={{
              fontSize: 12,
              color: isActive(item.path) ? "#fff" : "rgba(255,255,255,0.7)",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); navigate("/search") }} className={`${iconBtnBase} hidden md:flex`} style={iconBtnStyle}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </a>

        <a href="#" onClick={(e) => { e.preventDefault(); setTheme(theme === "dark" ? "light" : "dark") }} className={iconBtnBase} style={iconBtnStyle}>
          {theme === "dark"
            ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
            : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
          }
        </a>

        <Link
          to="/upload"
          className="hidden md:flex items-center h-7 rounded-full text-white text-[12px] px-3"
          style={{ background: "#0071e3", textDecoration: "none" }}
        >
          上传
        </Link>

        <a href="#" onClick={(e) => { e.preventDefault(); navigate(isLoggedIn ? "/settings" : "/login") }} className={`${iconBtnBase} hidden md:flex`} style={iconBtnStyle}>
          {isLoggedIn
            ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          }
        </a>
      </div>
    </header>
  )
}
