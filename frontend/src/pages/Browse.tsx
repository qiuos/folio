import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { BookOpen } from "lucide-react"
import { BookCard } from "@/components/book/BookCard"
import { browseApi } from "@/api/browse"

type BrowseTab = "authors" | "series" | "tags" | "publishers"

interface BrowseItem {
  id: number
  name: string
  book_count: number
}

const tabs: { key: BrowseTab; label: string }[] = [
  { key: "authors", label: "作者" },
  { key: "series", label: "丛书" },
  { key: "tags", label: "标签" },
  { key: "publishers", label: "出版社" },
]

const apiMap: Record<string, () => Promise<any>> = {
  authors: browseApi.authors,
  series: browseApi.series,
  tags: browseApi.tags,
  publishers: browseApi.publishers,
}

const detailApiMap: Record<string, (id: number) => Promise<any>> = {
  authors: browseApi.author,
  series: browseApi.serie,
  tags: browseApi.tag,
  publishers: browseApi.publisher,
}

export function Browse() {
  const { tab, itemId } = useParams<{ tab?: BrowseTab; itemId?: string }>()
  const navigate = useNavigate()
  const activeTab = tab || "authors"

  const [items, setItems] = useState<BrowseItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    setItems([])
    setDetail(null)
    setListLoading(true)
    apiMap[activeTab]?.()
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.items || [])
        setItems(list)
      })
      .catch(() => setItems([]))
      .finally(() => setListLoading(false))
  }, [activeTab])

  useEffect(() => {
    if (!itemId) { setDetail(null); return }
    setDetailLoading(true)
    detailApiMap[activeTab]?.(Number(itemId))
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false))
  }, [activeTab, itemId])

  const selectedId = itemId ? Number(itemId) : null
  const books = (detail?.books || []).map((b: any) => ({
    ...b,
    authors: b.authors || [],
    formats: b.formats || [],
    tags: b.tags || [],
  }))

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Left Sidebar */}
      <div className="w-72 md:w-80 shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--background)] animate-in slide-in-from-left duration-300">
        <div className="p-6 pb-2 space-y-6">
          <h1 className="text-[28px] font-[700] tracking-[-0.03em] text-[var(--foreground)]">
            浏览库
          </h1>
          
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--secondary)]/50 border border-[var(--border)]">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => navigate(`/browse/${t.key}`)}
                className={`flex-1 min-w-0 px-2 py-2 text-[13px] font-[600] rounded-lg transition-all tracking-tight truncate ${
                  activeTab === t.key
                    ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 scrollbar-hide mt-4">
          <div className="space-y-1">
            {listLoading ? (
              Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-[46px] rounded-xl bg-[var(--card)]/50 animate-pulse border border-transparent" />
              ))
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-40">
                <p className="text-[14px]">暂无内容</p>
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(`/browse/${activeTab}/${item.id}`)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all border ${
                    selectedId === item.id
                      ? "bg-primary/10 border-primary/20 text-primary"
                      : "text-[var(--foreground)] border-transparent hover:bg-[var(--secondary)]/70"
                  }`}
                >
                  <span className={`text-[14px] font-[500] truncate tracking-tight ${selectedId === item.id ? "font-[600]" : ""}`}>
                    {item.name}
                  </span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-md tabular-nums transition-colors ${
                    selectedId === item.id ? "bg-primary text-white" : "bg-[var(--secondary)] text-[var(--muted-foreground)]"
                  }`}>
                    {item.book_count}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-[var(--background)] relative scroll-smooth">
        {!itemId ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] gap-4 animate-in fade-in duration-500">
            <div className="w-20 h-20 rounded-full bg-[var(--secondary)] flex items-center justify-center border border-[var(--border)] shadow-inner">
              <BookOpen className="h-8 w-8 opacity-20" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-[17px] font-[600] text-[var(--foreground)]">欢迎浏览藏书</p>
              <p className="text-[14px] opacity-70">从左侧选择一个分类项开始探索</p>
            </div>
          </div>
        ) : (
          <div className="p-8 lg:p-12 max-w-[980px] mx-auto min-h-full">
            <div className="mb-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-2 mb-2">
                 <span className="text-[12px] font-[700] uppercase tracking-widest text-[#2997ff]">
                   {tabs.find(t => t.key === activeTab)?.label}
                 </span>
                 <div className="h-px flex-1 bg-gradient-to-r from-[var(--border)] to-transparent" />
              </div>
              <h2 className="text-[36px] font-[700] tracking-[-0.03em] text-[var(--foreground)]">
                {detail?.name || ""}
              </h2>
            </div>
            
            {detailLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="space-y-3">
                    <div className="aspect-[2/3] rounded-lg animate-pulse" style={{ backgroundColor: "var(--secondary)" }} />
                  </div>
                ))}
              </div>
            ) : books.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                {books.map((book: any) => <BookCard key={book.id} book={book} />)}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 text-[var(--muted-foreground)] gap-3 opacity-40">
                <BookOpen className="h-10 w-10" />
                <p className="text-[15px]">该目录下暂无图书</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
