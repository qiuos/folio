import { useEffect, useState } from "react"
import { Link, useParams, useNavigate } from "react-router-dom"
import { Plus, Trash2, BookOpen, ChevronRight, ChevronLeft, MoreHorizontal, FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { shelvesApi } from "@/api/shelves"
import { ReadingProgressInline } from "@/components/book/BookCard"

interface Shelf {
  id: number
  name: string
  description: string | null
  is_public: boolean
  book_count: number
}

interface ShelfBook {
  book_id: number
  title: string | null
  cover_path: string | null
  progress?: number | null
}

const shelfIcons = ["📚", "📖", "📕", "📗", "📘", "📙", "📓", "📔", "📒", "🔖"]

function getShelfIcon(id: number) {
  return shelfIcons[id % shelfIcons.length]
}

function ShelfBookCard({ item }: { item: ShelfBook }) {
  return (
    <Link
      to={`/books/${item.book_id}`}
      className="group flex flex-col gap-2 transition-all duration-200 hover:-translate-y-0.5"
    >
      <div
        className="aspect-[2/3] overflow-hidden rounded-lg bg-[var(--secondary)]"
        style={{ boxShadow: "rgba(0, 0, 0, 0.12) 2px 4px 16px 0px" }}
      >
        {item.cover_path ? (
          <img
            src={`/api/v1/books/${item.book_id}/cover`}
            alt={item.title || ""}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[var(--secondary)]">
            <span className="text-[13px] font-[600] text-[var(--muted-foreground)] opacity-50">
              {(item.title || "书").slice(0, 2)}
            </span>
          </div>
        )}
      </div>
      <div className="min-w-0 px-0.5">
        <h3 className="text-[13px] font-[500] text-[var(--foreground)] leading-[1.3] truncate tracking-[-0.01em]">
          {item.title || `图书 #${item.book_id}`}
        </h3>
        <ReadingProgressInline progress={item.progress} className="mt-2" />
      </div>
    </Link>
  )
}

export function Shelves() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [shelfDetail, setShelfDetail] = useState<any>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [loading, setLoading] = useState(false)
  const [menuShelfId, setMenuShelfId] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    shelvesApi.list()
      .then(setShelves)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (id) {
      setShelfDetail(null)
      shelvesApi.get(Number(id)).then(setShelfDetail).catch(() => {})
    } else {
      setShelfDetail(null)
    }
  }, [id])

  useEffect(() => {
    if (menuShelfId === null) return
    const handler = () => setMenuShelfId(null)
    document.addEventListener("click", handler)
    return () => document.removeEventListener("click", handler)
  }, [menuShelfId])

  const createShelf = async () => {
    if (!newName.trim()) return
    try {
      await shelvesApi.create({ name: newName.trim() })
      setNewName("")
      setShowCreate(false)
      const data = await shelvesApi.list()
      setShelves(data)
    } catch {
      alert("创建失败")
    }
  }

  const deleteShelf = async (e: React.MouseEvent, shelfId: number, shelfName: string) => {
    e.stopPropagation()
    setMenuShelfId(null)
    if (!window.confirm(`确定要删除书架「${shelfName}」吗？`)) return
    try {
      await shelvesApi.delete(shelfId)
      const data = await shelvesApi.list()
      setShelves(data)
      if (Number(id) === shelfId) navigate("/shelves")
    } catch {
      alert("删除失败")
    }
  }

  const selectedId = id ? Number(id) : null

  // ── Desktop: shelf sidebar list ──
  const shelfListDesktop = (
    <div className="space-y-1">
      {loading ? (
        Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-[var(--secondary)] animate-pulse" />
        ))
      ) : shelves.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-12 h-12 rounded-full bg-[var(--secondary)] flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-[var(--muted-foreground)]" />
          </div>
          <p className="text-[14px] text-[var(--muted-foreground)]">暂无书架</p>
          <button onClick={() => setShowCreate(true)} className="text-[13px] text-[var(--primary)] hover:underline">
            创建第一个书架
          </button>
        </div>
      ) : (
        shelves.map((shelf) => (
          <div key={shelf.id} className="group relative">
            <button
              onClick={() => navigate(`/shelves/${shelf.id}`)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all ${
                selectedId === shelf.id
                  ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                  : "text-[var(--foreground)] hover:bg-[var(--secondary)]"
              }`}
            >
              <div className="flex-1 min-w-0 pr-6">
                <span className={`text-[14px] truncate block tracking-[-0.01em] ${selectedId === shelf.id ? "font-[600]" : "font-[500]"}`}>
                  {shelf.name}
                </span>
                <span className="text-[11px] text-[var(--muted-foreground)] tabular-nums">
                  {shelf.book_count} 本
                </span>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 transition-opacity ${selectedId === shelf.id ? "opacity-60" : "opacity-0 group-hover:opacity-40"}`} />
            </button>
            <button
              onClick={(e) => deleteShelf(e, shelf.id, shelf.name)}
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:text-[var(--destructive)] hover:bg-[var(--secondary)] transition-all z-10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))
      )}
    </div>
  )

  // ── Desktop: shelf content area ──
  const shelfContent = !id ? (
    <div className="flex flex-col items-center justify-center h-full gap-5">
      <div className="w-20 h-20 rounded-full bg-[var(--secondary)] flex items-center justify-center">
        <BookOpen className="h-10 w-10 text-[var(--muted-foreground)] opacity-40" />
      </div>
      <div className="text-center space-y-1.5">
        <p className="text-[17px] font-[600] text-[var(--foreground)]">珍藏您的阅读清单</p>
        <p className="text-[14px] text-[var(--muted-foreground)]">选择左侧书架查看内容</p>
      </div>
    </div>
  ) : (
    <div className="p-6 lg:p-10 max-w-[1200px] mx-auto min-h-full">
      <div className="mb-8">
        <span className="text-[12px] font-[600] uppercase tracking-wider text-[var(--primary)]">书架收藏</span>
        <h2 className="text-[32px] lg:text-[40px] font-[600] leading-[1.10] text-[var(--foreground)] mt-1">
          {shelfDetail?.name || ""}
        </h2>
        {shelfDetail?.books?.length > 0 && (
          <p className="text-[15px] text-[var(--muted-foreground)] mt-1">{shelfDetail.books.length} 本书</p>
        )}
      </div>

      {!shelfDetail ? (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-4 lg:gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2.5">
              <div className="aspect-[2/3] rounded-lg bg-[var(--secondary)] animate-pulse" />
              <div className="space-y-1.5 px-0.5">
                <div className="h-3 rounded-full bg-[var(--secondary)] animate-pulse" />
                <div className="h-2.5 w-2/3 rounded-full bg-[var(--secondary)] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : shelfDetail.books?.length > 0 ? (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-4 lg:gap-5">
          {shelfDetail.books.map((item: any) => (
            <ShelfBookCard key={item.book_id} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 gap-5">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-[var(--border)] flex items-center justify-center">
            <Plus className="h-6 w-6 text-[var(--muted-foreground)]" />
          </div>
          <div className="text-center space-y-1.5">
            <p className="text-[17px] font-[600] text-[var(--foreground)]">书架还是空的</p>
            <p className="text-[14px] text-[var(--muted-foreground)]">去书库把喜欢的书加进来吧</p>
          </div>
          <Button variant="outline" className="rounded-lg px-6" onClick={() => navigate("/library")}>前往书库</Button>
        </div>
      )}
    </div>
  )

  // ── Mobile: create shelf bottom sheet ──
  const mobileCreateSheet = showCreate && (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
      <div className="relative w-full max-w-lg bg-[var(--card)] rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom duration-300">
        <div className="w-10 h-1 rounded-full bg-[var(--muted-foreground)]/30 mx-auto mb-6" />
        <h3 className="text-[20px] font-[600] text-[var(--foreground)] mb-1">新建书架</h3>
        <p className="text-[14px] text-[var(--muted-foreground)] mb-5">为您的书籍创建一个新的收藏夹</p>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="输入书架名称..."
          className="w-full h-12 rounded-2xl px-4 text-[16px] bg-[var(--secondary)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none border border-[var(--border)] focus:border-[var(--primary)] transition-colors"
          onKeyDown={(e) => e.key === "Enter" && createShelf()}
          autoFocus
        />
        <div className="flex gap-3 mt-5">
          <Button
            onClick={() => setShowCreate(false)}
            variant="ghost"
            className="flex-1 h-12 rounded-2xl text-[16px] text-[var(--muted-foreground)] bg-[var(--secondary)]"
          >
            取消
          </Button>
          <Button
            onClick={createShelf}
            className="flex-1 h-12 rounded-2xl text-[16px] font-[500]"
          >
            创建
          </Button>
        </div>
      </div>
    </div>
  )

  // ── Mobile: shelf context menu ──
  const mobileContextMenu = menuShelfId !== null && (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={() => setMenuShelfId(null)} />
      <div className="relative bg-[var(--card)] rounded-2xl w-[260px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
        {(() => {
          const shelf = shelves.find(s => s.id === menuShelfId)
          if (!shelf) return null
          return (
            <>
              <div className="px-5 py-4 border-b border-[var(--border)]">
                <p className="text-[15px] font-[600] text-[var(--foreground)] truncate">{shelf.name}</p>
                <p className="text-[13px] text-[var(--muted-foreground)] mt-0.5">{shelf.book_count} 本书</p>
              </div>
              <button
                onClick={(e) => deleteShelf(e, shelf.id, shelf.name)}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-[var(--destructive)] active:bg-[var(--secondary)] transition-colors"
              >
                <Trash2 className="h-[18px] w-[18px]" />
                <span className="text-[16px]">删除书架</span>
              </button>
              <button
                onClick={() => setMenuShelfId(null)}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-[var(--foreground)] active:bg-[var(--secondary)] transition-colors border-t border-[var(--border)]"
              >
                <span className="text-[16px]">取消</span>
              </button>
            </>
          )
        })()}
      </div>
    </div>
  )

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Desktop ── */}
      <div className="hidden md:flex h-full w-full">
        <div className="w-72 lg:w-80 shrink-0 flex flex-col bg-[var(--card)] border-r border-[var(--border)]">
          <div className="p-6 pb-4">
            <div className="flex items-center justify-between mb-1">
              <h1 className="text-[28px] font-[600] leading-[1.14] text-[var(--foreground)]">我的书架</h1>
              <button
                onClick={() => setShowCreate(!showCreate)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  showCreate ? "bg-[var(--primary)] text-white rotate-45" : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[13px] text-[var(--muted-foreground)]">管理您的阅读收藏</p>
          </div>

          {showCreate && (
            <div className="px-6 pb-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="输入书架名称..."
                className="w-full h-10 rounded-lg px-4 text-[14px] bg-[var(--secondary)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                onKeyDown={(e) => e.key === "Enter" && createShelf()}
                autoFocus
              />
              <div className="flex gap-2">
                <Button onClick={createShelf} className="flex-1 h-9 rounded-lg text-[13px]">确认创建</Button>
                <Button onClick={() => setShowCreate(false)} variant="ghost" className="h-9 rounded-lg text-[13px]">取消</Button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
            {shelfListDesktop}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scroll-smooth bg-[var(--background)]">
          {shelfContent}
        </div>
      </div>

      {/* ── Mobile ── */}
      <div className="md:hidden h-full w-full min-w-0 overflow-y-auto bg-[var(--background)] pb-24">
        {!id ? (
          /* ── Mobile: shelf list ── */
          <div className="pt-3">
            {/* Header */}
            <div className="sticky top-0 z-10 px-5 pt-3 pb-4 bg-[var(--background)]/88 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-[30px] font-[700] leading-[1.1] text-[var(--foreground)]">我的书架</h1>
                <p className="text-[14px] text-[var(--muted-foreground)] mt-1">
                  {shelves.length > 0 ? `共 ${shelves.length} 个书架` : "管理您的阅读收藏"}
                </p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="w-10 h-10 rounded-full bg-[var(--primary)] flex items-center justify-center active:scale-95 transition-transform shadow-lg shadow-primary/20"
              >
                <Plus className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
              </button>
            </div>
            </div>

            {/* Loading */}
            {loading ? (
              <div className="space-y-2 px-5 mt-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 h-[72px] px-4 rounded-2xl bg-[var(--card)]">
                    <div className="w-12 h-12 rounded-xl bg-[var(--secondary)] animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-24 rounded-full bg-[var(--secondary)] animate-pulse" />
                      <div className="h-3 w-16 rounded-full bg-[var(--secondary)] animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : shelves.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-24 gap-4 px-5">
                <div className="w-20 h-20 rounded-3xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-center">
                  <FolderOpen className="h-9 w-9 text-[var(--muted-foreground)] opacity-40" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-[17px] font-[600] text-[var(--foreground)]">还没有书架</p>
                  <p className="text-[14px] text-[var(--muted-foreground)]">创建一个书架来整理您的书籍</p>
                </div>
                <Button
                  onClick={() => setShowCreate(true)}
                  className="mt-2 rounded-full px-6 h-11 text-[15px] font-[500]"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  创建书架
                </Button>
              </div>
            ) : (
              /* Shelf cards */
              <div className="mx-5 mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                {shelves.map((shelf) => (
                  <button
                    key={shelf.id}
                    onClick={() => navigate(`/shelves/${shelf.id}`)}
                    className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left active:bg-[var(--secondary)] transition-colors group border-b border-[var(--border)] last:border-b-0"
                  >
                    {/* Shelf icon */}
                    <div className="w-11 h-11 rounded-xl bg-[var(--secondary)] flex items-center justify-center shrink-0">
                      <span className="text-[19px]">{getShelfIcon(shelf.id)}</span>
                    </div>

                    {/* Shelf info */}
                    <div className="flex-1 min-w-0">
                      <span className="text-[16px] font-[600] truncate block text-[var(--foreground)] tracking-[-0.01em]">
                        {shelf.name}
                      </span>
                      <span className="text-[13px] text-[var(--muted-foreground)] tabular-nums truncate block mt-0.5">
                        {shelf.book_count} 本书{shelf.description ? ` · ${shelf.description}` : ""}
                      </span>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* More menu trigger */}
                      <div
                        onClick={(e) => { e.stopPropagation(); setMenuShelfId(menuShelfId === shelf.id ? null : shelf.id) }}
                        className="w-9 h-9 flex items-center justify-center rounded-full active:bg-[var(--background)] transition-colors"
                      >
                        <MoreHorizontal className="h-[18px] w-[18px] text-[var(--muted-foreground)]" />
                      </div>
                      <ChevronRight className="h-4 w-4 text-[var(--muted-foreground)] opacity-30" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── Mobile: shelf detail ── */
          <div className="px-5 pt-3">
            {/* Header with back button */}
            <div className="sticky top-0 z-10 -mx-5 px-5 pt-3 pb-3 bg-[var(--background)]/88 backdrop-blur-xl flex items-center gap-3 mb-4">
              <button
                onClick={() => navigate("/shelves")}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--card)] border border-[var(--border)] active:scale-95 transition-transform"
              >
                <ChevronLeft className="h-[18px] w-[18px] text-[var(--foreground)]" />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="text-[22px] font-[600] text-[var(--foreground)] truncate">{shelfDetail?.name || "..."}</h2>
                <p className="text-[13px] text-[var(--muted-foreground)] tabular-nums">
                  {shelfDetail ? `${shelfDetail.books?.length || 0} 本书` : "加载中"}
                </p>
              </div>
            </div>

            {/* Shelf info bar */}
            {shelfDetail?.description && (
              <div className="flex items-center gap-3 mb-5">
                <span className="text-[13px] text-[var(--muted-foreground)] truncate">{shelfDetail.description}</span>
              </div>
            )}

            {/* Content */}
            {!shelfDetail ? (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="aspect-[2/3] rounded-xl bg-[var(--secondary)] animate-pulse" />
                    <div className="space-y-1.5 px-0.5">
                      <div className="h-3 rounded-full bg-[var(--secondary)] animate-pulse" />
                      <div className="h-2 w-2/3 rounded-full bg-[var(--secondary)] animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : shelfDetail.books?.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {shelfDetail.books.map((item: any) => (
                  <ShelfBookCard key={item.book_id} item={item} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-28 gap-4">
                <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-[var(--border)] flex items-center justify-center">
                  <Plus className="h-6 w-6 text-[var(--muted-foreground)] opacity-50" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-[16px] font-[600] text-[var(--foreground)]">书架还是空的</p>
                  <p className="text-[14px] text-[var(--muted-foreground)]">去书库把喜欢的书加进来吧</p>
                </div>
                <Button
                  variant="outline"
                  className="mt-2 rounded-full px-6 h-11 text-[15px] border-[var(--border)]"
                  onClick={() => navigate("/library")}
                >
                  前往书库
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile overlays */}
      {mobileCreateSheet}
      {mobileContextMenu}
    </div>
  )
}
