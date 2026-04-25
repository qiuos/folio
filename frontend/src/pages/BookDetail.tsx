import { useEffect, useState } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  Download,
  Edit3,
  Hash,
  Languages,
  Library,
  Plus,
  Star,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import client from "@/api/client"
import { shelvesApi } from "@/api/shelves"

interface BookDetailData {
  id: number
  title: string
  subtitle?: string | null
  description?: string | null
  cover_path?: string | null
  language?: string | null
  page_count?: number | null
  published_date?: string | null
  rating?: number | null
  series_index?: number | null
  authors: Array<{ id: number; name: string; role?: string | null }>
  formats: Array<{ id: number; format: string; file_size: number | null; mime_type?: string | null }>
  tags: Array<{ id: number; name: string; color?: string | null }>
  identifiers?: Array<{ id: number; type: string; value: string }>
  publisher?: { id: number; name: string } | null
  series?: { id: number; name: string } | null
}

export function BookDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [book, setBook] = useState<BookDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shelves, setShelves] = useState<any[]>([])
  const [showShelfMenu, setShowShelfMenu] = useState(false)
  const [addedToShelves, setAddedToShelves] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    client.get(`/books/${id}`)
      .then(({ data: resp }) => setBook(resp.data))
      .catch((err) => setError(err.response?.status === 404 ? "图书未找到" : "加载失败"))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    const token = localStorage.getItem("folio_token")
    if (!token) return

    shelvesApi.list().then(setShelves).catch(() => {})

    // Check which shelves already contain this book
    if (!id) return
    client.get(`/shelves`)
      .then(({ data: resp }: any) => {
        const shelfIds = resp.data || []
        const promises = shelfIds.map((shelf: any) =>
          client.get(`/shelves/${shelf.id}/books`)
            .then(({ data: bookResp }: any) => ({
              shelfId: shelf.id,
              hasBook: (bookResp.data || []).some((b: any) => b.id === Number(id))
            }))
            .catch(() => ({ shelfId: shelf.id, hasBook: false }))
        )
        return Promise.all(promises)
      })
      .then((results) => {
        const added = new Set(results.filter(r => r.hasBook).map(r => r.shelfId))
        setAddedToShelves(added)
      })
      .catch(() => {})
  }, [id])

  // Close shelf menu when clicking outside
  useEffect(() => {
    if (!showShelfMenu) return
    const handleClickOutside = () => setShowShelfMenu(false)
    document.addEventListener("click", handleClickOutside)
    return () => document.removeEventListener("click", handleClickOutside)
  }, [showShelfMenu])

  const addToShelf = async (shelfId: number) => {
    if (!id) return
    try {
      await shelvesApi.addBook(shelfId, Number(id))
      setAddedToShelves(prev => new Set(prev).add(shelfId))
      setShowShelfMenu(false)
    } catch (err) {
      console.error("Failed to add to shelf:", err)
      alert("添加失败")
    }
  }

  const handleDelete = async () => {
    if (!id || !window.confirm(`确定要删除《${book?.title}》吗？`)) return
    try {
      await client.delete(`/upload/books/${id}`)
      navigate("/")
    } catch {
      alert("删除失败")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !book) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
        <p className="text-[16px] text-[var(--muted-foreground)]">{error || "图书未找到"}</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/")}>返回主页</Button>
      </div>
    )
  }

  const isbn = book.identifiers?.find((i) => i.type === "isbn13" || i.type === "isbn10")?.value
  const publisherInfo = [book.publisher?.name, book.published_date?.slice(0, 4)].filter(Boolean).join(" · ")
  const primaryFormat = book.formats[0]
  const metaItems = [
    book.page_count ? { icon: BookOpen, label: `${book.page_count} 页` } : null,
    book.language ? { icon: Languages, label: book.language === 'zh' ? '中文' : book.language.toUpperCase() } : null,
    book.published_date ? { icon: CalendarDays, label: book.published_date.slice(0, 4) } : null,
    isbn ? { icon: Hash, label: isbn } : null,
  ].filter(Boolean) as Array<{ icon: typeof BookOpen; label: string }>

  return (
    <div className="min-h-full pb-28 md:pb-32">
      {/* Top Nav */}
      <div className="sticky top-0 z-20 md:static flex items-center justify-between px-4 py-3 md:px-0 md:py-0 md:mb-10 bg-[var(--background)]/86 backdrop-blur-xl md:bg-transparent md:backdrop-blur-0 max-w-[1200px] mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 h-9 px-2 md:px-0 rounded-full text-[14px] font-[500] text-[var(--muted-foreground)] hover:text-[var(--foreground)] active:bg-[var(--secondary)] md:active:bg-transparent transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          <span>返回</span>
        </button>
      </div>

      <div className="px-5 md:px-10 lg:px-12 max-w-[1200px] mx-auto">
      <div className="flex flex-col md:flex-row gap-7 md:gap-16">
        {/* Left: Cover */}
        <div className="w-full md:w-64 lg:w-80 shrink-0 flex justify-center md:block">
          <div
            className="w-[min(58vw,220px)] md:w-full aspect-[2/3] rounded-[18px] md:rounded-2xl overflow-hidden bg-[var(--card)] shadow-2xl relative"
            style={{ border: "1px solid var(--border)" }}
          >
            {book.cover_path ? (
              <img
                src={`/api/v1/books/${book.id}/cover`}
                alt={book.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] to-[#0d2137] flex items-center justify-center text-white/20 font-bold">
                NO COVER
              </div>
            )}
          </div>
        </div>

        {/* Right: Info */}
        <div className="flex-1 space-y-6 md:space-y-8 min-w-0">
          <div className="space-y-4 text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
              {book.rating && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#ff9f0a]/10 text-[#ff9f0a] text-[12px] font-[700]">
                  <Star className="h-3 w-3 fill-current" />
                  {book.rating}
                </div>
              )}
              {book.series && (
                <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[12px] font-[700]">
                  {book.series.name} {book.series_index ? `#${book.series_index}` : ""}
                </span>
              )}
            </div>

            <h1 className="text-[28px] md:text-[44px] font-[800] tracking-[-0.03em] text-[var(--foreground)] leading-[1.12] break-words">
              {book.title}
            </h1>
            {book.subtitle && (
              <p className="text-[16px] md:text-[18px] text-[var(--muted-foreground)] font-[400] leading-snug">{book.subtitle}</p>
            )}

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-3 gap-y-1">
              {book.authors.map((a, i) => (
                <Link key={a.id} to={`/browse/authors/${a.id}`} className="text-[16px] md:text-[18px] font-[600] text-primary hover:underline">
                  {a.name}{i < book.authors.length - 1 ? "、" : ""}
                </Link>
              ))}
            </div>

            <div className="pt-1 text-[14px] md:text-[15px] text-[var(--muted-foreground)] font-[500] space-y-3">
              {publisherInfo && <p>{publisherInfo}</p>}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-stretch justify-center md:justify-start gap-2">
                 {metaItems.map(({ icon: Icon, label }) => (
                  <span key={label} className="flex items-center justify-center sm:justify-start gap-1.5 rounded-xl bg-[var(--card)] border border-[var(--border)] px-3 py-2 text-[13px] tabular-nums">
                    <Icon className="h-3.5 w-3.5 opacity-60" />
                    <span className="truncate">{label}</span>
                  </span>
                 ))}
              </div>
            </div>
          </div>

          {/* Action Row 1: Primary */}
          <div className="flex flex-wrap items-center gap-3 pt-2 md:pt-4">
             {primaryFormat && (
               <Link to={`/read/${book.id}/${primaryFormat.format.toLowerCase()}`} className="w-full sm:w-auto">
                 <Button className="w-full sm:w-[170px] h-12 rounded-2xl md:rounded-xl text-[16px] font-[650] bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
                   <BookOpen className="h-4 w-4 mr-1.5" />
                   即刻阅读
                 </Button>
               </Link>
             )}
          </div>

          {/* Action Row 2: Management (Shelf, Download, Edit, Delete) */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 pt-5 md:pt-6 border-t border-[var(--border)]">
             {/* Shelf */}
             <div className="relative group/shelf">
               <Button 
                variant="ghost" 
                size="sm"
                className="w-full sm:w-auto h-10 px-4 rounded-xl bg-[var(--secondary)] font-[600] text-[13px] border border-transparent hover:border-[var(--border)]"
                onClick={(e) => { e.stopPropagation(); setShowShelfMenu(!showShelfMenu) }}
               >
                 <Plus className="h-3.5 w-3.5 mr-1.5" />
                 加入书架
               </Button>
               {showShelfMenu && (
                 <div className="absolute top-full left-0 mt-2 w-[min(260px,80vw)] rounded-2xl bg-[var(--popover)] border border-[var(--border)] shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-200">
                    {shelves.map((shelf) => {
                      const isAdded = addedToShelves.has(shelf.id)
                      return (
                        <button
                          key={shelf.id}
                          onClick={(e) => { e.stopPropagation(); if (!isAdded) addToShelf(shelf.id) }}
                          disabled={isAdded}
                          className={`w-full text-left px-3 py-3 text-[14px] font-[500] rounded-xl flex items-center justify-between ${
                            isAdded ? 'text-primary' : 'hover:bg-[var(--secondary)]'
                          }`}
                        >
                          <span className="truncate">{shelf.name}</span>
                          {isAdded && <Check className="h-3.5 w-3.5" />}
                        </button>
                      )
                    })}
                 </div>
               )}
             </div>

             {/* Download */}
             {book.formats.map((fmt) => (
               <a key={fmt.id} href={`/api/v1/books/${book.id}/files/${fmt.format.toLowerCase()}`} download>
                 <Button variant="ghost" size="sm" className="w-full sm:w-auto h-10 px-4 rounded-xl bg-[var(--secondary)] font-[600] text-[13px] border border-transparent hover:border-[var(--border)]">
                   <Download className="h-3.5 w-3.5 mr-1.5" />
                   下载 {fmt.format.toUpperCase()}
                 </Button>
               </a>
             ))}

             {/* Edit */}
             <Link to={`/books/${book.id}/edit`}>
               <Button variant="ghost" size="sm" className="w-full sm:w-auto h-10 px-4 rounded-xl bg-[var(--secondary)] font-[600] text-[13px] border border-transparent hover:border-[var(--border)]">
                 <Edit3 className="h-3.5 w-3.5 mr-1.5" />
                 编辑
               </Button>
             </Link>

             {/* Delete */}
             <Button 
               variant="ghost" 
               size="sm" 
               onClick={handleDelete}
               className="w-full sm:w-auto h-10 px-4 rounded-xl bg-destructive/10 font-[600] text-[13px] text-destructive hover:bg-destructive/20"
             >
               <Trash2 className="h-3.5 w-3.5 mr-1.5" />
               删除
             </Button>
          </div>

          {/* Description */}
          {book.description && (
            <div className="pt-4 md:pt-8 space-y-4">
              <h3 className="text-[12px] font-[800] uppercase tracking-widest text-[var(--muted-foreground)] opacity-60 flex items-center gap-2">
                <Library className="h-3.5 w-3.5" />
                简介
              </h3>
              <p className="text-[15px] md:text-[17px] leading-[1.75] text-[var(--foreground)] whitespace-pre-line opacity-90 max-w-[800px]">
                {book.description}
              </p>
            </div>
          )}

          {/* Tags */}
          {book.tags.length > 0 && (
            <div className="pt-2 md:pt-4 flex flex-wrap gap-2">
              {book.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="text-[13px] font-[500] rounded-lg px-3 py-1 bg-[var(--secondary)] text-[var(--foreground)]"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
