import { Link, useLocation } from "react-router-dom"
import { Library, Tag, Users, Building2, Globe, FileText, Layers, UserCog } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

const sidebarItems = [
  { label: "书库", path: "/library", icon: Library },
  { type: "divider" as const, label: "浏览" },
  { label: "作者", path: "/browse/authors", icon: Users },
  { label: "丛书", path: "/browse/series", icon: Layers },
  { label: "标签", path: "/browse/tags", icon: Tag },
  { label: "出版社", path: "/browse/publishers", icon: Building2 },
  { type: "divider" as const, label: "筛选" },
  { label: "语言", path: "/browse/languages", icon: Globe },
  { label: "格式", path: "/browse/formats", icon: FileText },
  { type: "divider" as const, label: "管理" },
  { label: "用户管理", path: "/admin/users", icon: UserCog },
]

export function AppSidebar() {
  const location = useLocation()

  return (
    <aside className="hidden lg:flex w-52 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)]">
      <ScrollArea className="flex-1 py-3">
        <nav className="px-2 space-y-0.5">
          {sidebarItems.map((item, i) => {
            if ("type" in item && item.type === "divider") {
              return (
                <div key={i} className="pt-5 pb-1.5 px-3">
                  <span className="text-[11px] font-[600] uppercase tracking-wider text-[var(--muted-foreground)]">
                    {item.label}
                  </span>
                </div>
              )
            }

            const navItem = item as { label: string; path: string; icon: React.ComponentType<{ className?: string }> }
            const Icon = navItem.icon
            const isActive = location.pathname === navItem.path

            return (
              <Link
                key={navItem.path}
                to={navItem.path}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] font-[400] tracking-[-0.01em] transition-colors ${
                  isActive
                    ? "bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)]"
                    : "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]"
                }`}
              >
                {Icon && <Icon className="h-4 w-4 opacity-50" />}
                <span className="flex-1">{navItem.label}</span>
              </Link>
            )
          })}
        </nav>
      </ScrollArea>
    </aside>
  )
}
