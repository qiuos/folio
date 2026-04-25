import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Grid3X3, List, Upload, BookOpen, ChevronDown, ChevronRight, ArrowLeft, SlidersHorizontal } from "lucide-react"
import { useBooksStore } from "@/store/books"
import { BookCard, ReadingProgressInline } from "@/components/book/BookCard"
import { Button } from "@/components/ui/button"
import { browseApi } from "@/api/browse"

type FilterTab = "all" | "authors" | "series" | "tags" | "publishers"

interface FilterItem {
  id: number
  name: string
  book_count: number
}

const filterTabs: { key: FilterTab; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "authors", label: "作者" },
  { key: "publishers", label: "出版社" },
  { key: "tags", label: "书签" },
  { key: "series", label: "丛书" },
]

const sortOptions = [
  { value: "created_at", order: "desc", label: "最近添加" },
  { value: "title", order: "asc", label: "书名 A-Z" },
  { value: "rating", order: "desc", label: "评分最高" },
]

export function Library() {
  const { books, loading, sortBy, sortOrder, viewMode, fetchBooks, setSort, setViewMode } =
    useBooksStore()
  const [sortOpen, setSortOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const navigate = useNavigate()

  const [activeFilterTab, setActiveFilterTab] = useState<FilterTab>("all")
  const [filterItems, setFilterItems] = useState<FilterItem[]>([])
  const [selectedFilterId, setSelectedFilterId] = useState<number | null>(null)
  const [filterBooks, setFilterBooks] = useState<any[]>([])

  useEffect(() => {
    if (selectedFilterId === null) {
      fetchBooks()
    }
  }, [selectedFilterId, fetchBooks])

  useEffect(() => {
    if (activeFilterTab === "all") {
      setFilterItems([])
      setSelectedFilterId(null)
      setFilterBooks([])
      return
    }

    setFilterItems([])
    setSelectedFilterId(null)
    setFilterBooks([])

    const apiMap: Record<string, () => Promise<any>> = {
      authors: browseApi.authors,
      series: browseApi.series,
      tags: browseApi.tags,
      publishers: browseApi.publishers,
    }

    apiMap[activeFilterTab]?.()
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.items || [])
        setFilterItems(list)
      })
      .catch(() => setFilterItems([]))
  }, [activeFilterTab])

  useEffect(() => {
    if (!selectedFilterId) {
      setFilterBooks([])
      return
    }

    const detailApiMap: Record<string, (id: number) => Promise<any>> = {
      authors: browseApi.author,
      series: browseApi.serie,
      tags: browseApi.tag,
      publishers: browseApi.publisher,
    }

    setFilterBooks([])
    detailApiMap[activeFilterTab]?.(selectedFilterId)
      .then((data) => {
        const books = (data?.books || []).map((b: any) => ({
          ...b,
          authors: b.authors || [],
          formats: b.formats || [],
          tags: b.tags || [],
        }))
        setFilterBooks(books)
      })
      .catch(() => setFilterBooks([]))
  }, [activeFilterTab, selectedFilterId])

  const currentSortLabel = sortOptions.find((o) => o.value === sortBy && o.order === sortOrder)?.label || "排序"
  const displayBooks = selectedFilterId !== null ? filterBooks : books

  const viewToggle = (
    <div className="flex items-center rounded-lg p-1 bg-[var(--secondary)]">
      <button
        className={`h-7 w-7 rounded-md flex items-center justify-center transition-all ${
          viewMode === "grid" ? "bg-[var(--card)] text-[var(--primary)] shadow-sm" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        }`}
        onClick={() => setViewMode("grid")}
      >
        <Grid3X3 className="h-3.5 w-3.5" />
      </button>
      <button
        className={`h-7 w-7 rounded-md flex items-center justify-center transition-all ${
          viewMode === "list" ? "bg-[var(--card)] text-[var(--primary)] shadow-sm" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        }`}
        onClick={() => setViewMode("list")}
      >
        <List className="h-3.5 w-3.5" />
      </button>
    </div>
  )

  const sortDropdown = (
    <div className="relative">
      <button
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-all"
        onClick={() => setSortOpen(!sortOpen)}
      >
        {currentSortLabel}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {sortOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-44 rounded-xl z-50 bg-[var(--popover)] border border-[var(--border)] shadow-xl animate-in fade-in zoom-in-95 duration-150 py-1">
            {sortOptions.map((option) => (
              <button
                key={option.value + option.order}
                className={`w-full text-left px-4 py-2.5 text-[13px] transition-all flex items-center justify-between ${
                  sortBy === option.value && sortOrder === option.order
                    ? "text-[var(--primary)]"
                    : "text-[var(--foreground)] hover:bg-[var(--secondary)]"
                }`}
                onClick={() => { setSort(option.value, option.order); setSortOpen(false) }}
              >
                {option.label}
                {sortBy === option.value && sortOrder === option.order && (
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )

  const mobileSortDropdown = (
    <div className="relative flex-1">
      <button
        onClick={() => setSortOpen(!sortOpen)}
        className="w-full flex items-center justify-between h-11 rounded-2xl px-4 text-[15px] bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] active:scale-[0.99] transition-transform"
      >
        {currentSortLabel}
        <ChevronDown className="h-4 w-4 text-[var(--muted-foreground)]" />
      </button>
      {sortOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 rounded-2xl z-50 bg-[var(--popover)] border border-[var(--border)] shadow-xl py-1 overflow-hidden">
            {sortOptions.map((option) => (
              <button
                key={option.value + option.order}
                className={`w-full text-left px-4 py-3.5 text-[16px] transition-all flex items-center justify-between ${
                  sortBy === option.value && sortOrder === option.order
                    ? "text-[var(--primary)] font-[500]"
                    : "text-[var(--foreground)] active:bg-[var(--secondary)]"
                }`}
                onClick={() => { setSort(option.value, option.order); setSortOpen(false) }}
              >
                {option.label}
                {sortBy === option.value && sortOrder === option.order && (
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )

  const emptyState = (message: string, subtitle: string, showUpload?: boolean) => (
    <div className="flex flex-col items-center justify-center py-32 gap-5">
      <div className="w-20 h-20 rounded-full bg-[var(--secondary)] flex items-center justify-center">
        <BookOpen className="h-10 w-10 text-[var(--muted-foreground)] opacity-40" />
      </div>
      <div className="text-center space-y-1.5">
        <p className="text-[17px] font-[600] text-[var(--foreground)]">{message}</p>
        <p className="text-[14px] text-[var(--muted-foreground)]">{subtitle}</p>
      </div>
      {showUpload && (
        <Button onClick={() => navigate("/upload")} className="rounded-lg">立即上传</Button>
      )}
    </div>
  )

  const bookGrid = (cols: string) => (
    <div className={`grid ${cols} gap-4 lg:gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500`}>
      {displayBooks.map((book) => <BookCard key={book.id} book={book} />)}
    </div>
  )

  const bookList = (
    <div className="space-y-0">
      {displayBooks.map((book, index) => {
        return (
          <Link
            key={book.id}
            to={`/books/${book.id}`}
            className="flex items-center gap-6 py-5 px-2 hover:bg-[var(--secondary)]/50 transition-all group"
            style={{ borderBottom: index < displayBooks.length - 1 ? "1px solid var(--border)" : undefined }}
          >
            <div
              className="w-16 h-[88px] rounded-md overflow-hidden shrink-0 bg-[var(--secondary)]"
              style={{ boxShadow: "rgba(0, 0, 0, 0.12) 2px 3px 12px 0px" }}
            >
              {book.cover_path ? (
                <img src={`/api/v1/books/${book.id}/cover`} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-[14px] font-[700] text-[var(--muted-foreground)] opacity-40">{book.title.slice(0, 1)}</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-3">
                <p className="text-[15px] font-[600] truncate tracking-[-0.01em] text-[var(--foreground)]">{book.title}</p>
                {book.rating && (
                  <span className="text-[12px] font-[600] text-[#ff9f0a] shrink-0">★ {book.rating}</span>
                )}
              </div>
              <ReadingProgressInline progress={book.progress} className="mt-2 max-w-[190px]" />
              {book.description && (
                <p className="text-[12px] line-clamp-1 tracking-[-0.01em] mt-1 text-[var(--muted-foreground)] opacity-60 group-hover:opacity-100 transition-opacity">
                  {book.description}
                </p>
              )}
            </div>
            <div className="hidden sm:flex items-center gap-1.5">
              {book.formats?.map((f: any) => (
                <span key={f.format} className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[var(--secondary)] text-[var(--muted-foreground)]">
                  {f.format}
                </span>
              ))}
            </div>
          </Link>
        )
      })}
    </div>
  )

  const loadingSkeleton = (cols: string) => (
    <div className={`grid ${cols} gap-4 lg:gap-5`}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="space-y-2.5">
          <div className="aspect-[2/3] rounded-lg bg-[var(--secondary)] animate-pulse" />
          <div className="space-y-1.5 px-0.5">
            <div className="h-3 rounded-full bg-[var(--secondary)] animate-pulse" />
            <div className="h-2.5 w-2/3 rounded-full bg-[var(--secondary)] animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop */}
      <div className="hidden md:flex h-full w-full">
        {/* Sidebar */}
        <div className="w-72 lg:w-80 shrink-0 flex flex-col bg-[var(--card)] border-r border-[var(--border)]">
          <div className="p-6 pb-4">
            <h1 className="text-[28px] font-[600] leading-[1.14] text-[var(--foreground)] mb-1">书库</h1>
            <p className="text-[13px] text-[var(--muted-foreground)]">浏览您的全部藏书</p>

            <div className="flex items-center gap-0.5 p-1 rounded-xl bg-[var(--secondary)] mt-4">
              {filterTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveFilterTab(t.key)}
                  className={`flex-1 min-w-0 px-1.5 py-2 text-[11px] font-[500] rounded-lg transition-all truncate ${
                    activeFilterTab === t.key
                      ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
            {activeFilterTab === "all" ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--secondary)] flex items-center justify-center">
                  <BookOpen className="h-4 w-4 text-[var(--muted-foreground)]" />
                </div>
                <p className="text-[12px] text-[var(--muted-foreground)] text-center">选择分类以筛选书籍</p>
              </div>
            ) : selectedFilterId === null ? (
              <div className="space-y-1">
                {filterItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 opacity-40">
                    <p className="text-[13px] text-[var(--muted-foreground)]">暂无内容</p>
                  </div>
                ) : (
                  filterItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedFilterId(item.id)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all text-[var(--foreground)] hover:bg-[var(--secondary)] group"
                    >
                      <span className="text-[13px] font-[500] truncate tracking-[-0.01em] flex-1 min-w-0">{item.name}</span>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-[11px] tabular-nums text-[var(--muted-foreground)] px-1.5 py-0.5 rounded-md bg-[var(--secondary)]">{item.book_count}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-60 transition-opacity" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={() => setSelectedFilterId(null)}
                  className="flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors px-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  返回{filterTabs.find(t => t.key === activeFilterTab)?.label}
                </button>
                {filterItems.find(i => i.id === selectedFilterId) && (
                  <div className="px-4 py-3 rounded-xl border" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 8%, transparent)", borderColor: "color-mix(in srgb, var(--primary) 15%, transparent)" }}>
                    <span className="text-[14px] font-[600] text-[var(--primary)] truncate block">{filterItems.find(i => i.id === selectedFilterId)?.name}</span>
                    <span className="text-[11px] text-[var(--primary)] opacity-70 mt-0.5 block">{filterBooks.length} 本书</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scroll-smooth bg-[var(--background)]">
          <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8 lg:py-10 space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-[32px] lg:text-[40px] font-[600] leading-[1.10] text-[var(--foreground)]">
                  {selectedFilterId !== null ? filterItems.find(i => i.id === selectedFilterId)?.name || "筛选结果" : "全部藏书"}
                </h1>
                <p className="text-[15px] text-[var(--muted-foreground)] mt-1">{displayBooks.length} 本书</p>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="gap-2 text-[var(--muted-foreground)] lg:hidden" onClick={() => navigate("/upload")}>
                  <Upload className="h-4 w-4" />上传
                </Button>
                {sortDropdown}
                {viewToggle}
              </div>
            </div>

            <div className="pt-2">
              {loading ? (
                loadingSkeleton("grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7")
              ) : viewMode === "grid" ? (
                displayBooks.length === 0 ? (
                  emptyState(
                    selectedFilterId !== null ? "暂无相关书籍" : "书库空空如也",
                    selectedFilterId !== null ? "尝试选择其他筛选条件" : "从上传开始，建立您的私人图书馆",
                    selectedFilterId === null
                  )
                ) : (
                  bookGrid("grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7")
                )
              ) : (
                bookList
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="md:hidden h-full overflow-y-auto bg-[var(--background)] pb-24">
        <div className="sticky top-0 z-10 bg-[var(--background)]/88 backdrop-blur-xl px-5 pt-4 pb-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-[28px] font-[600] leading-[1.14] text-[var(--foreground)]">书库</h1>
              <p className="text-[13px] text-[var(--muted-foreground)] mt-0.5">{displayBooks.length} 本书</p>
            </div>
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className={`h-10 w-10 flex items-center justify-center rounded-full active:scale-95 transition-all ${filterOpen ? "bg-[var(--primary)] text-white" : "bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)]"}`}
            >
              <SlidersHorizontal className="h-[18px] w-[18px]" />
            </button>
          </div>

          {selectedFilterId !== null && (
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => { setSelectedFilterId(null); setFilterOpen(false) }}
                className="flex items-center gap-1 text-[15px] text-[var(--muted-foreground)]"
              >
                <ArrowLeft className="h-4 w-4" />返回
              </button>
              <div className="flex-1 min-w-0 px-3 py-1.5 rounded-full text-[15px] font-[500] text-[var(--primary)] truncate" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)" }}>
                {filterItems.find(i => i.id === selectedFilterId)?.name}
              </div>
            </div>
          )}

          {filterOpen && (
            <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide animate-in fade-in slide-in-from-top-2 duration-200">
              {filterTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setActiveFilterTab(t.key); if (t.key === "all") setSelectedFilterId(null) }}
                  className={`shrink-0 px-4 py-2 rounded-full text-[15px] font-[500] transition-all ${
                    activeFilterTab === t.key ? "bg-[var(--primary)] text-white" : "bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {filterOpen && activeFilterTab !== "all" && selectedFilterId === null && (
            <div className="space-y-1 mb-4 max-h-[40vh] overflow-y-auto animate-in fade-in">
              {filterItems.length === 0 ? (
                <p className="text-center py-8 text-[15px] text-[var(--muted-foreground)]">暂无内容</p>
              ) : (
                filterItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setSelectedFilterId(item.id); setFilterOpen(false) }}
                    className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left bg-[var(--card)] active:bg-[var(--secondary)] transition-all"
                  >
                    <span className="text-[15px] font-[500] truncate text-[var(--foreground)]">{item.name}</span>
                    <span className="text-[14px] text-[var(--muted-foreground)] tabular-nums">{item.book_count}</span>
                  </button>
                ))
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            {mobileSortDropdown}
            {viewToggle}
          </div>
        </div>

        <div className="px-5 pb-6">
          {loading ? (
            loadingSkeleton("grid-cols-3")
          ) : viewMode === "grid" ? (
            displayBooks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-16 h-16 rounded-2xl border border-[var(--border)] bg-[var(--card)] flex items-center justify-center">
                  <BookOpen className="h-7 w-7 text-[var(--muted-foreground)] opacity-40" />
                </div>
                <p className="text-[15px] text-[var(--muted-foreground)]">{selectedFilterId !== null ? "暂无相关书籍" : "书库空空如也"}</p>
              </div>
            ) : (
              bookGrid("grid-cols-3")
            )
          ) : (
            <div className="space-y-3">
              {displayBooks.map((book) => {
                return (
                  <Link key={book.id} to={`/books/${book.id}`} className="block bg-[var(--card)] rounded-2xl p-3.5 border border-[var(--border)] active:scale-[0.99] active:bg-[var(--secondary)] transition-all">
                    <div className="flex gap-4">
                      <div className="w-16 h-[88px] rounded-md overflow-hidden shrink-0 bg-[var(--secondary)]" style={{ boxShadow: "rgba(0, 0, 0, 0.12) 2px 3px 12px 0px" }}>
                        {book.cover_path ? (
                          <img src={`/api/v1/books/${book.id}/cover`} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-[14px] font-[600] text-[var(--muted-foreground)] opacity-40">{book.title.slice(0, 1)}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-[600] truncate text-[var(--foreground)]">{book.title}</p>
                        <ReadingProgressInline progress={book.progress} className="mt-2 max-w-[170px]" />
                        {book.formats?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {book.formats.slice(0, 2).map((f: any) => (
                              <span key={f.format} className="px-2 py-0.5 rounded-md text-[10px] font-[700] uppercase bg-[var(--secondary)] text-[var(--muted-foreground)]">
                                {f.format}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
