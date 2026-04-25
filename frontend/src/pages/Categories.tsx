import { useEffect, useState } from "react"
import { ChevronRight, FolderOpen } from "lucide-react"
import { browseApi } from "@/api/browse"

interface CategoryNode {
  id: number
  name: string
  book_count: number
  children?: CategoryNode[]
}

function CategoryTreeItem({ node, depth = 0 }: { node: CategoryNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1)

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full py-3 px-4 rounded-xl hover:bg-[var(--secondary)] transition-colors text-left"
        style={{ paddingLeft: `${depth * 24 + 16}px` }}
      >
        <div className="flex items-center gap-2.5">
          {node.children?.length ? (
            <ChevronRight className={`h-3.5 w-3.5 text-[var(--muted-foreground)] transition-transform ${expanded ? "rotate-90" : ""}`} />
          ) : (
            <FolderOpen className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
          )}
          <span className="text-[15px] text-[var(--foreground)] tracking-[-0.01em]">{node.name}</span>
        </div>
        <span className="text-[13px] text-[var(--muted-foreground)] tabular-nums">{node.book_count}</span>
      </button>
      {expanded && node.children?.map((child) => (
        <CategoryTreeItem key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

export function Categories() {
  const [categories, setCategories] = useState<CategoryNode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    browseApi.categories().then((data) => {
      setCategories(Array.isArray(data) ? data : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 lg:p-8 space-y-6 pb-24 lg:pb-8 max-w-[1200px] mx-auto">
      <h1 className="text-[28px] font-[600] tracking-[-0.015em] text-[var(--foreground)]">
        分类
      </h1>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-[var(--card)] animate-pulse" />
          ))}
        </div>
      ) : categories.length > 0 ? (
        <div className="rounded-2xl bg-[var(--card)] overflow-hidden">
          {categories.map((cat) => (
            <CategoryTreeItem key={cat.id} node={cat} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-[var(--muted-foreground)]">
          <p className="text-[15px]">暂无分类数据</p>
        </div>
      )}
    </div>
  )
}
