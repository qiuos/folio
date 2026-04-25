import { useEffect, useRef, useState, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  ArrowLeft, Bookmark, Settings, ChevronLeft, ChevronRight,
  Loader2, BookOpen, Columns2, LayoutGrid, X, List,
  Type, Maximize, Minimize, BookText
} from "lucide-react"
import client from "@/api/client"
import { fontsApi, type FontItem } from "@/api/fonts"

type ReadMode = "single" | "spread"
type ReaderTheme = "light" | "dark" | "sepia"

interface TocItem {
  id: string
  href: string
  label: string
  level: number
  subitems?: TocItem[]
}

interface MarginSettings {
  top: number
  right: number
  bottom: number
  left: number
}

function defaultMargins(): MarginSettings {
  try {
    const uid = JSON.parse(atob((localStorage.getItem("folio_token") || "").split(".")[1] || "e30")).sub || "0"
    const raw = localStorage.getItem(`folio_margins_${uid}`)
    return raw ? JSON.parse(raw) : { top: 0, right: 12, bottom: 0, left: 12 }
  } catch { return { top: 0, right: 12, bottom: 0, left: 12 } }
}

function settingsKey(key: string): string {
  try {
    const uid = JSON.parse(atob((localStorage.getItem("folio_token") || "").split(".")[1] || "e30")).sub || "0"
    return `folio_${key}_${uid}`
  } catch { return `folio_${key}` }
}

function getStoredProgress(bookId: string, fmt: string) {
  try {
    const raw = localStorage.getItem(`folio_progress_${bookId}_${fmt}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function setStoredProgress(bookId: string, fmt: string, data: { cfi: string; pct: number }) {
  try {
    localStorage.setItem(`folio_progress_${bookId}_${fmt}`, JSON.stringify(data))
  } catch {}
}

interface BookmarkItem {
  cfi: string
  label: string
  pct: number
  time: number
}

function getBookmarks(bookId: string): BookmarkItem[] {
  try {
    const raw = localStorage.getItem(`folio_bookmarks_${bookId}`)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveBookmarks(bookId: string, marks: BookmarkItem[]) {
  try {
    localStorage.setItem(`folio_bookmarks_${bookId}`, JSON.stringify(marks))
  } catch {}
}

function flattenToc(items: any[], level = 0): TocItem[] {
  const result: TocItem[] = []
  for (const item of items) {
    result.push({
      id: item.id,
      href: item.href,
      label: item.label?.trim() || "(无标题)",
      level,
    })
    if (item.subitems?.length) {
      result.push(...flattenToc(item.subitems, level + 1))
    }
  }
  return result
}

function formatReadingTime(minutes: number): string {
  if (minutes <= 0) return ""
  if (minutes < 1) return "不到 1 分钟"
  if (minutes < 60) return `约 ${Math.round(minutes)} 分钟`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `约 ${h} 小时 ${m} 分钟` : `约 ${h} 小时`
}

interface PdfTocItem {
  title: string
  page: number | null
  items?: PdfTocItem[]
}

function PdfReader({
  containerRef,
  bookTitle,
  fileUrl,
  bookId,
  isFullscreen,
  toggleFullscreen,
  navigate,
  margins,
  showTime,
  currentTime,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  bookTitle: string
  fileUrl: string
  bookId: string
  isFullscreen: boolean
  toggleFullscreen: () => void
  navigate: (path: number) => void
  margins: MarginSettings
  showTime: boolean
  currentTime: string
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const pdfDocRef = useRef<any>(null)
  const renderedPagesRef = useRef<Set<number>>(new Set())
  const [totalPages, setTotalPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pdfLoading, setPdfLoading] = useState(true)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [pdfScale, setPdfScale] = useState(() => {
    const stored = localStorage.getItem(settingsKey("pdf_scale"))
    return stored ? parseFloat(stored) : 1.0
  })
  const [showJump, setShowJump] = useState(false)
  const [jumpInput, setJumpInput] = useState("")
  const [pdfToc, setPdfToc] = useState<PdfTocItem[]>([])
  const [showPdfToc, setShowPdfToc] = useState(false)
  const currentPageRef = useRef(1)
  const totalPagesRef = useRef(0)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveProgressToBackend = useCallback((page: number, total: number) => {
    if (!bookId || total <= 0) return
    const pct = Math.min(page / total, 1.0)
    setStoredProgress(bookId, "pdf", { cfi: String(page), pct })
    const token = localStorage.getItem("folio_token")
    if (token) {
      client.put(`/reading/${bookId}`, {
        progress: Math.max(pct, 0.001),
        current_position: String(page),
        format_id: 2,
      }).catch(() => {})
    }
  }, [bookId])

  const debouncedSave = useCallback((page: number, total: number) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveProgressToBackend(page, total)
    }, 1500)
  }, [saveProgressToBackend])

  useEffect(() => {
    if (!bookId) return
    let cancelled = false

    const loadPdf = async () => {
      try {
        setPdfLoading(true)
        setPdfError(null)

        const pdfjsLib = await import("pdfjs-dist")
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString()

        const resp = await fetch(fileUrl)
        if (!resp.ok) throw new Error(`下载失败 (${resp.status})`)
        const data = new Uint8Array(await resp.arrayBuffer())

        const pdf = await pdfjsLib.getDocument({ data }).promise
        if (cancelled) return

        pdfDocRef.current = pdf
        const numPages = pdf.numPages
        setTotalPages(numPages)
        totalPagesRef.current = numPages

        // Load PDF outline/TOC
        try {
          const outline = await pdf.getOutline()
          if (outline?.length) {
            const resolvePages = async (items: any[]): Promise<PdfTocItem[]> => {
              const result: PdfTocItem[] = []
              for (const item of items) {
                let pageNum: number | null = null
                try {
                  let dest = item.dest
                  if (typeof dest === "string") dest = await pdf.getDestination(dest)
                  if (dest) {
                    const idx = await pdf.getPageIndex(dest[0])
                    pageNum = idx + 1
                  }
                } catch {}
                result.push({
                  title: item.title || "(无标题)",
                  page: pageNum,
                  items: item.items?.length ? await resolvePages(item.items) : undefined,
                })
              }
              return result
            }
            setPdfToc(await resolvePages(outline))
          }
        } catch {}

        let startPage = 1
        try {
          const { data: resp } = await client.get(`/reading/${bookId}`)
          const savedPos = resp.data?.current_position
          if (savedPos && Number(savedPos) > 0) {
            startPage = Math.min(Number(savedPos), numPages)
          }
        } catch {
          const stored = getStoredProgress(bookId, "pdf")
          if (stored?.cfi && Number(stored.cfi) > 0) {
            startPage = Math.min(Number(stored.cfi), numPages)
          }
        }

        const container = canvasContainerRef.current
        if (!container || cancelled) return
        container.innerHTML = ""
        renderedPagesRef.current = new Set()

        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 1.0 })
          const wrapper = document.createElement("div")
          wrapper.className = "pdf-page-wrapper"
          wrapper.dataset.pageNum = String(i)
          wrapper.style.width = "100%"
          wrapper.style.maxWidth = `${viewport.width * pdfScale}px`
          wrapper.style.aspectRatio = `${viewport.width} / ${viewport.height}`
          wrapper.style.margin = "0 auto 16px"
          wrapper.style.position = "relative"
          wrapper.style.borderRadius = "4px"
          wrapper.style.overflow = "hidden"
          wrapper.style.background = "#2c2c2e"

          const label = document.createElement("div")
          label.className = "pdf-page-label"
          label.textContent = String(i)
          label.style.cssText = "position:absolute;bottom:8px;right:8px;font-size:11px;color:rgba(255,255,255,0.4);z-index:2;pointer-events:none;"
          wrapper.appendChild(label)
          container.appendChild(wrapper)
        }

        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              const pageNum = Number((entry.target as HTMLElement).dataset.pageNum)
              if (entry.isIntersecting && !renderedPagesRef.current.has(pageNum)) {
                renderedPagesRef.current.add(pageNum)
                renderPage(pdf, pageNum, entry.target as HTMLElement, pdfScale)
              }
            })
          },
          { root: scrollContainerRef.current, rootMargin: "200px 0px" }
        )

        container.querySelectorAll<HTMLElement>(".pdf-page-wrapper").forEach((el) => observer.observe(el))

        // Set ref BEFORE scroll so the scroll handler won't overwrite saved progress
        currentPageRef.current = startPage
        setCurrentPage(startPage)
        totalPagesRef.current = numPages
        setPdfLoading(false)

        if (startPage > 1) {
          requestAnimationFrame(() => {
            const targetEl = container.querySelector(`[data-page-num="${startPage}"]`)
            if (targetEl) targetEl.scrollIntoView({ block: "start" })
          })
        }

        // Save initial reading record
        saveProgressToBackend(startPage, numPages)

        return () => observer.disconnect()
      } catch (err: any) {
        if (!cancelled) {
          setPdfError(err?.message || "加载 PDF 失败")
          setPdfLoading(false)
        }
      }
    }

    loadPdf()

    return () => {
      cancelled = true
      pdfDocRef.current = null
      renderedPagesRef.current = new Set()
    }
  }, [bookId, fileUrl, pdfScale, saveProgressToBackend])

  useEffect(() => {
    const scrollEl = scrollContainerRef.current
    if (!scrollEl) return

    const handleScroll = () => {
      const wrappers = scrollEl.querySelectorAll<HTMLElement>(".pdf-page-wrapper")
      const containerTop = scrollEl.getBoundingClientRect().top
      let closestPage = 1
      let closestDistance = Infinity

      wrappers.forEach((el) => {
        const rect = el.getBoundingClientRect()
        const distance = Math.abs(rect.top - containerTop)
        if (distance < closestDistance) {
          closestDistance = distance
          closestPage = Number(el.dataset.pageNum)
        }
      })

      if (closestPage !== currentPageRef.current) {
        currentPageRef.current = closestPage
        setCurrentPage(closestPage)
        debouncedSave(closestPage, totalPagesRef.current)
      }
    }

    scrollEl.addEventListener("scroll", handleScroll, { passive: true })
    return () => scrollEl.removeEventListener("scroll", handleScroll)
  }, [debouncedSave])

  useEffect(() => {
    const handleLeave = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveProgressToBackend(currentPageRef.current, totalPagesRef.current)
    }
    window.addEventListener("beforeunload", handleLeave)
    const onVisChange = () => { if (document.hidden) handleLeave() }
    document.addEventListener("visibilitychange", onVisChange)
    return () => {
      window.removeEventListener("beforeunload", handleLeave)
      document.removeEventListener("visibilitychange", onVisChange)
      handleLeave()
    }
  }, [saveProgressToBackend])

  const goToPage = (page: number) => {
    const clamped = Math.max(1, Math.min(page, totalPages))
    const el = canvasContainerRef.current?.querySelector(`[data-page-num="${clamped}"]`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const handleJump = () => {
    const page = parseInt(jumpInput, 10)
    if (!isNaN(page)) goToPage(page)
    setShowJump(false)
    setJumpInput("")
  }

  const progressPct = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0
  const pdfRemaining = totalPages > 0 ? Math.max(0, totalPages - currentPage) : 0
  const pdfTimeEstimate = pdfRemaining > 0 ? formatReadingTime(pdfRemaining * 0.5) : ""

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex flex-col bg-[var(--background)]">
      {/* Header */}
      <div className="flex items-center h-12 px-3 border-b border-border shrink-0">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-[13px] font-[510] text-[var(--foreground)] truncate ml-2">
          {bookTitle || "PDF 阅读器"}
        </span>
        <div className="flex-1" />
        <div className="flex items-center shrink-0">
          <button onClick={() => { const v = Math.max(0.5, pdfScale - 0.25); setPdfScale(v); localStorage.setItem(settingsKey("pdf_scale"), String(v)) }}
            className="h-8 w-8 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors text-[14px] font-[600]"
            title="缩小"
          >A-</button>
          <span className="text-[11px] text-[var(--muted-foreground)] tabular-nums w-10 text-center">{Math.round(pdfScale * 100)}%</span>
          <button onClick={() => { const v = Math.min(3.0, pdfScale + 0.25); setPdfScale(v); localStorage.setItem(settingsKey("pdf_scale"), String(v)) }}
            className="h-8 w-8 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors text-[14px] font-[600]"
            title="放大"
          >A+</button>
          {pdfToc.length > 0 && (
            <button onClick={() => setShowPdfToc(!showPdfToc)}
              className="h-8 w-8 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              title="目录"
            ><BookText className="h-4 w-4" /></button>
          )}
          <button onClick={() => goToPage(currentPage - 1)}
            className="h-8 w-8 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            title="上一页"
          ><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => goToPage(currentPage + 1)}
            className="h-8 w-8 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            title="下一页"
          ><ChevronRight className="h-4 w-4" /></button>
          <button onClick={toggleFullscreen} className="h-8 w-8 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Jump popover */}
      {showJump && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 bg-[var(--popover)] rounded-xl px-4 py-3 shadow-xl border border-[var(--border)] flex items-center gap-2">
          <span className="text-[13px] text-[var(--foreground)]">跳转到</span>
          <input
            type="number" min={1} max={totalPages}
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJump()}
            className="w-16 h-8 rounded-lg bg-[var(--input)] text-[var(--foreground)] text-center text-[13px] outline-none border border-[var(--border)] focus:ring-1 focus:ring-[#0071e3]"
            placeholder={String(currentPage)} autoFocus
          />
          <span className="text-[13px] text-[var(--muted-foreground)]">/ {totalPages} 页</span>
          <button onClick={handleJump} className="h-8 px-3 rounded-lg bg-[#0071e3] text-white text-[12px] font-[500] hover:bg-[#0077ed] transition-colors">跳转</button>
        </div>
      )}

      {/* PDF TOC overlay */}
      {showPdfToc && (
        <div className="absolute inset-0 z-40 flex flex-col bg-[var(--background)]">
          <div className="flex items-center justify-between h-12 px-4 border-b border-border shrink-0">
            <span className="text-[15px] font-[500] text-[var(--foreground)]">目录</span>
            <button onClick={() => setShowPdfToc(false)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-[var(--secondary)]">
              <X className="h-5 w-5 text-[var(--foreground)]" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto max-w-2xl mx-auto w-full">
            {pdfToc.map((item, i) => (
              <div key={i}>
                <button
                  onClick={() => { if (item.page) { goToPage(item.page); setShowPdfToc(false) } }}
                  className="w-full text-left px-6 py-3 border-b hover:bg-[var(--secondary)] transition-colors border-[var(--border)]"
                >
                  <span className="text-[15px] leading-relaxed text-[var(--foreground)]">{item.title}</span>
                  {item.page && <span className="text-[12px] text-[var(--muted-foreground)] ml-2">{item.page}</span>}
                </button>
                {item.items?.map((sub, j) => (
                  <button
                    key={j}
                    onClick={() => { if (sub.page) { goToPage(sub.page); setShowPdfToc(false) } }}
                    className="w-full text-left px-6 py-2.5 border-b hover:bg-[var(--secondary)] transition-colors border-[var(--border)]"
                    style={{ paddingLeft: 48 }}
                  >
                    <span className="text-[14px] leading-relaxed text-[var(--foreground)]">{sub.title}</span>
                    {sub.page && <span className="text-[11px] text-[var(--muted-foreground)] ml-2">{sub.page}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PDF Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto" style={{ background: "#1a1a1c" }}>
        {pdfLoading && !pdfError && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 text-[#0071e3] animate-spin" />
              <p className="text-[13px] text-[var(--muted-foreground)]">正在加载 PDF...</p>
            </div>
          </div>
        )}
        {pdfError && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <BookOpen className="h-10 w-10 text-[var(--muted-foreground)]" />
              <p className="text-[13px] text-[#ff453a]">{pdfError}</p>
              <a href={fileUrl} download className="text-[#2997ff] hover:underline text-[13px]">下载文件</a>
            </div>
          </div>
        )}
        <div ref={canvasContainerRef} style={{ padding: `${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px` }} />
      </div>

      {/* Bottom bar: left=progress+estimate, right=time */}
      {totalPages > 0 && !pdfLoading && (
        <div className="h-7 flex items-center justify-between px-4 border-t border-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--muted-foreground)] tabular-nums">{progressPct}%</span>
            {pdfTimeEstimate && (
              <>
                <span className="text-[11px] text-[var(--muted-foreground)]">·</span>
                <span className="text-[11px] text-[var(--muted-foreground)]">预计还需 {pdfTimeEstimate}</span>
              </>
            )}
          </div>
          {showTime && <span className="text-[11px] text-[var(--muted-foreground)] tabular-nums">{currentTime}</span>}
        </div>
      )}
    </div>
  )
}

async function renderPage(pdf: any, pageNum: number, wrapper: HTMLElement, scale: number) {
  try {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) })
    const displayViewport = page.getViewport({ scale })

    const canvas = document.createElement("canvas")
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.style.width = `${displayViewport.width}px`
    canvas.style.height = `${displayViewport.height}px`
    canvas.style.display = "block"

    wrapper.style.aspectRatio = ""
    wrapper.style.maxWidth = `${displayViewport.width}px`

    const label = wrapper.querySelector(".pdf-page-label")
    wrapper.innerHTML = ""
    wrapper.appendChild(canvas)
    if (label) wrapper.appendChild(label)

    const ctx = canvas.getContext("2d")
    if (!ctx) return
    await page.render({ canvasContext: ctx, viewport }).promise
  } catch {}
}

export function Reader() {
  const { id, format } = useParams<{ id: string; format: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookTitle, setBookTitle] = useState("")
  const [toc, setToc] = useState<TocItem[]>([])
  const [showToc, setShowToc] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [readMode, setReadMode] = useState<ReadMode>(() => {
    const stored = localStorage.getItem(settingsKey("read_mode"))
    if (stored === "single" || stored === "spread") return stored
    return window.innerWidth >= 1024 ? "spread" : "single"
  })
  const [fontSize, setFontSize] = useState(() =>
    parseInt(localStorage.getItem(settingsKey("font_size")) || "100", 10)
  )
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>(() =>
    (localStorage.getItem(settingsKey("reader_theme")) as ReaderTheme) || "dark"
  )
  const [fontFamily, setFontFamily] = useState(() =>
    localStorage.getItem(settingsKey("reader_font")) || ""
  )
  const [availableFonts, setAvailableFonts] = useState<FontItem[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [fontOpen, setFontOpen] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [showTime, setShowTime] = useState(() => localStorage.getItem(settingsKey("show_time")) !== "false")
  const [currentTime, setCurrentTime] = useState("")
  const [currentCfi, setCurrentCfi] = useState("")
  const [currentPct, setCurrentPct] = useState(0)
  const currentCfiRef = useRef("")
  const [epubCurrentPage, setEpubCurrentPage] = useState(0)
  const [epubTotalPages, setEpubTotalPages] = useState(0)
  const [margins, setMargins] = useState<MarginSettings>(defaultMargins)
  const viewerRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<any>(null)
  const renditionRef = useRef<any>(null)
  const fmt = format?.toLowerCase() || "epub"
  const fileUrl = `/api/v1/books/${id}/files/${fmt}`

  const closeAllPanels = () => {
    setShowSettings(false)
    setShowBookmarks(false)
    setShowToc(false)
    setFontOpen(false)
  }

  // Debounced save to backend
  const saveProgressTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)

  const saveProgress = useCallback((cfi: string, pct: number) => {
    if (!id) return
    setStoredProgress(id, fmt, { cfi, pct })

    const token = localStorage.getItem("folio_token")
    if (!token) return

    // Clear existing timeout
    if (saveProgressTimeoutRef.current) {
      clearTimeout(saveProgressTimeoutRef.current)
    }

    // Debounce save to backend (2 seconds)
    saveProgressTimeoutRef.current = setTimeout(() => {
      console.log('[Reader] Saving progress to backend:', { id, cfi, pct, fmt })
      client.put(`/reading/${id}`, {
        progress: Math.max(pct, 0.001), // Ensure minimum progress
        current_position: cfi,
        format_id: fmt === "epub" ? 1 : undefined,
      }).then(() => console.log('[Reader] Progress saved'))
        .catch((err) => console.error('[Reader] Failed to save progress:', err))
    }, 2000)
  }, [id, fmt])

  const loadProgress = useCallback(async (): Promise<string | null> => {
    if (!id) return null
    const stored = getStoredProgress(id, fmt)
    if (stored?.cfi) return stored.cfi
    try {
      const { data: resp } = await client.get(`/reading/${id}`)
      const pos = resp.data?.current_position
      if (pos) {
        setStoredProgress(id, fmt, { cfi: pos, pct: resp.data.progress || 0 })
        return pos
      }
    } catch {}
    return null
  }, [id, fmt])

  useEffect(() => {
    if (!id) return
    client.get(`/books/${id}`)
      .then(({ data: resp }) => setBookTitle(resp.data?.title || ""))
      .catch(() => {})
  }, [id])

  useEffect(() => {
    if (id) setBookmarks(getBookmarks(id))
  }, [id])

  useEffect(() => {
    fontsApi.list().then(setAvailableFonts).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  // Clock
  useEffect(() => {
    const update = () => {
      const now = new Date()
      setCurrentTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
    }
    update()
    const timer = setInterval(update, 10000)
    return () => clearInterval(timer)
  }, [])

  // Active reading time heartbeat
  useEffect(() => {
    if (!id) return
    const interval = setInterval(() => {
      if (!document.hidden) {
        const stored = getStoredProgress(id, fmt)
        const token = localStorage.getItem("folio_token")
        if (token) {
          client.put(`/reading/${id}`, {
            progress: Math.max(stored?.pct || 0, 0.001),
            current_position: stored?.cfi || "0",
            format_id: fmt === "epub" ? 1 : 2,
          }).catch(() => {})
        }
      }
    }, 60000) // 1 minute
    return () => clearInterval(interval)
  }, [id, fmt])

  const toggleTimeDisplay = () => {
    const next = !showTime
    setShowTime(next)
    localStorage.setItem(settingsKey("show_time"), String(next))
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current.requestFullscreen()
    }
  }

  const fontCss = fontFamily
    ? ((fontFamily === "serif" || fontFamily === "sans-serif")
      ? fontFamily
      : `"${fontFamily}", serif`)
    : ""

  const applyRenditionStyles = useCallback((rendition: any, fs: number, theme: ReaderTheme, font: string, mg: MarginSettings, availableFonts: FontItem[]) => {
    const themes: Record<ReaderTheme, { bg: string; fg: string }> = {
      light: { bg: "#ffffff", fg: "#1d1d1f" },
      dark: { bg: "#1c1c1e", fg: "#f5f5f7" },
      sepia: { bg: "#f4ecd8", fg: "#5b4636" },
    }
    const fontFamilyCSS = font || "inherit"
    const paddingStr = `${mg.top}px ${mg.right}px ${mg.bottom}px ${mg.left}px`
    rendition.themes?.default({
      "body": {
        "background-color": themes[theme].bg,
        "color": themes[theme].fg,
        "font-size": `${fs}%`,
        "line-height": "1.8",
        "padding": `${paddingStr} !important`,
        "font-family": fontFamilyCSS,
      },
      "a": { "color": "#0071e3" },
      "p, div, span, h1, h2, h3, h4, h5, h6, li, blockquote, td, th": {
        "font-size": `${fs}%`,
        "font-family": fontFamilyCSS,
      },
    })
    try { rendition.themes?.override("font-family", fontFamilyCSS) } catch {}
    try {
      rendition.getContents?.().forEach((c: any) => {
        const doc = c?.document
        if (!doc) return
        const currentFontName = font?.replace(/^"|"$/, "").replace(/", serif$/, "")
        if (currentFontName && currentFontName !== "serif" && currentFontName !== "sans-serif") {
          const fontObj = availableFonts?.find((f: FontItem) => f.name === currentFontName)
          if (fontObj) {
            const formatMap: Record<string, string> = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" }
            let ff = doc.getElementById("folio-custom-font-face")
            if (!ff) { ff = doc.createElement("style"); ff.id = "folio-custom-font-face"; doc.head?.appendChild(ff) }
            ff.textContent = `@font-face { font-family: "${fontObj.name}"; src: url("/api/v1/fonts/${fontObj.id}/file") format("${formatMap[fontObj.format] || fontObj.format}"); }`
          }
        }
        let el = doc.getElementById("folio-font-override")
        if (!el) { el = doc.createElement("style"); el.id = "folio-font-override"; doc.head?.appendChild(el) }
        el.textContent = `* { font-family: ${fontFamilyCSS} !important; }`
      })
    } catch {}
  }, [])

  useEffect(() => {
    const rendition = renditionRef.current
    if (!rendition) return
    applyRenditionStyles(rendition, fontSize, readerTheme, fontCss, margins, availableFonts)
  }, [fontSize, readerTheme, fontCss, margins, applyRenditionStyles, availableFonts])

  useEffect(() => {
    if (fmt !== "epub" || !id) return
    const container = viewerRef.current
    if (!container) return
    let destroyed = false

    const load = async () => {
      try {
        const resp = await fetch(fileUrl)
        if (!resp.ok) throw new Error(`下载失败 (${resp.status})`)
        const buf = await resp.arrayBuffer()
        if (destroyed) return

        const ePub = (await import("epubjs")).default
        if (destroyed) return

        const book = ePub(buf)
        bookRef.current = book
        await book.ready
        if (destroyed) return

        const loaded = book.navigation?.toc || []
        if (loaded.length) setToc(flattenToc(loaded))

        const spread = readMode === "spread"
        const rendition = book.renderTo(container, {
          width: "100%",
          height: "100%",
          spread: spread ? "auto" : "none",
          flow: "paginated",
          minSpreadWidth: 800,
        })
        renditionRef.current = rendition

        const themes: Record<ReaderTheme, { bg: string; fg: string }> = {
          light: { bg: "#ffffff", fg: "#1d1d1f" },
          dark: { bg: "#1c1c1e", fg: "#f5f5f7" },
          sepia: { bg: "#f4ecd8", fg: "#5b4636" },
        }
        const storedFont = localStorage.getItem(settingsKey("reader_font")) || ""
        const storedFontCss = storedFont
          ? ((storedFont === "serif" || storedFont === "sans-serif")
            ? storedFont
            : `"${storedFont}", serif`)
          : ""
        const fontFamilyCSS = storedFontCss || "inherit"
        const mg = defaultMargins()
        const paddingStr = `${mg.top}px ${mg.right}px ${mg.bottom}px ${mg.left}px`
        rendition.themes.default({
          "body": {
            "background-color": themes[readerTheme].bg,
            "color": themes[readerTheme].fg,
            "font-size": `${fontSize}%`,
            "line-height": "1.8",
            "padding": `${paddingStr} !important`,
            "font-family": fontFamilyCSS,
          },
          "a": { "color": "#0071e3" },
          "p, div, span, h1, h2, h3, h4, h5, h6, li, blockquote, td, th": {
            "font-size": `${fontSize}%`,
            "font-family": fontFamilyCSS,
          },
        })

        rendition.hooks.content.register((contents: any) => {
          if (!destroyed) setLoading(false)
          try {
            const doc = contents?.document || contents?.content?.document
            if (doc?.head) {
              if (storedFont && storedFont !== "serif" && storedFont !== "sans-serif") {
                const allFontStyles = document.querySelectorAll('style[data-font-id]')
                const ff = doc.createElement("style")
                ff.id = "folio-custom-font-face"
                let faceCSS = ""
                allFontStyles.forEach(s => { faceCSS += s.textContent })
                if (faceCSS) {
                  ff.textContent = faceCSS
                  doc.head.appendChild(ff)
                }
              }
              if (storedFontCss) {
                const s = doc.createElement("style")
                s.id = "folio-font-override"
                s.textContent = `* { font-family: ${storedFontCss} !important; }`
                doc.head.appendChild(s)
              }
            }
          } catch {}
        })

        const lastCfi = await loadProgress()
        rendition.display(lastCfi || undefined).catch(() => {})

        // Save initial reading record immediately
        const initialCfi = lastCfi
        if (initialCfi) {
          currentCfiRef.current = initialCfi
          saveProgress(initialCfi, 0)
        } else {
          // If no saved position, try to get first chapter
          try {
            const spine = (book as any).spine
            if (spine && spine.items && spine.items.length > 0) {
              const firstCfi = spine.items[0].cfi
              currentCfiRef.current = firstCfi
              saveProgress(firstCfi, 0)
            }
          } catch {}
        }

        setTimeout(() => { if (!destroyed) setLoading(false) }, 8000)

        book.locations.generate(1600).then(() => {
          if (!destroyed && book.locations.length()) {
            setEpubTotalPages(book.locations.length())
            // Re-save progress with correct percentage once locations are ready
            if (currentCfiRef.current) {
              const pct = book.locations.percentageFromCfi(currentCfiRef.current)
              saveProgress(currentCfiRef.current, pct)
            }
          }
        }).catch((err) => {
          console.error('[Reader] Failed to generate locations:', err)
        })

        rendition.on("relocated", (location: any) => {
          try {
            const startCfi = location.start.cfi
            let pct = 0
            if (book.locations?.length()) {
              pct = book.locations.percentageFromCfi(startCfi)
              const page = Math.round(pct * book.locations.length()) + 1
              setEpubTotalPages(book.locations.length())
              setEpubCurrentPage(page)
            }
            setCurrentCfi(startCfi)
            setCurrentPct(pct)
            currentCfiRef.current = startCfi
            saveProgress(startCfi, pct)
          } catch {}
        })

      } catch (err: any) {
        if (!destroyed) {
          setError(err?.message || String(err))
          setLoading(false)
        }
      }
    }

    const rafId = requestAnimationFrame(() => requestAnimationFrame(() => { if (!destroyed) load() }))

    return () => {
      destroyed = true
      cancelAnimationFrame(rafId)
      try { renditionRef.current?.destroy() } catch {}
      try { bookRef.current?.destroy() } catch {}
      renditionRef.current = null
      bookRef.current = null
    }
  }, [id, fmt, readMode])

  const goPrev = () => renditionRef.current?.prev()
  const goNext = () => renditionRef.current?.next()

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev()
      if (e.key === "ArrowRight" || e.key === " ") goNext()
      if (e.key === "Escape") {
        closeAllPanels()
        if (document.fullscreenElement) document.exitFullscreen()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  const toggleMode = () => {
    const next: ReadMode = readMode === "single" ? "spread" : "single"
    setReadMode(next)
    localStorage.setItem(settingsKey("read_mode"), next)
  }

  const addBookmark = () => {
    if (!id || !currentCfi) return
    const marks = getBookmarks(id)
    const exists = marks.some(m => m.cfi === currentCfi)
    if (exists) {
      const filtered = marks.filter(m => m.cfi !== currentCfi)
      saveBookmarks(id, filtered)
      setBookmarks(filtered)
    } else {
      const newMark: BookmarkItem = { cfi: currentCfi, label: `${Math.round(currentPct * 100)}%`, pct: currentPct, time: Date.now() }
      const updated = [...marks, newMark]
      saveBookmarks(id, updated)
      setBookmarks(updated)
    }
  }

  const jumpToBookmark = (cfi: string) => { renditionRef.current?.display(cfi); closeAllPanels() }
  const jumpToToc = (href: string) => { renditionRef.current?.display(href); closeAllPanels() }

  const changeFontSize = (delta: number) => {
    const next = Math.max(80, Math.min(150, fontSize + delta))
    setFontSize(next)
    localStorage.setItem(settingsKey("font_size"), String(next))
  }

  const changeTheme = (t: ReaderTheme) => {
    setReaderTheme(t)
    localStorage.setItem(settingsKey("reader_theme"), t)
  }

  const changeFont = (name: string) => {
    setFontFamily(name)
    localStorage.setItem(settingsKey("reader_font"), name)
    if (name) {
      const font = availableFonts.find(f => f.name === name)
      if (font) {
        const formatMap: Record<string, string> = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" }
        const fontFaceCSS = `@font-face { font-family: "${name}"; src: url("/api/v1/fonts/${font.id}/file") format("${formatMap[font.format] || font.format}"); }`
        if (!document.querySelector(`style[data-font-id="${font.id}"]`)) {
          const style = document.createElement("style")
          style.setAttribute("data-font-id", String(font.id))
          style.textContent = fontFaceCSS
          document.head.appendChild(style)
        }
        const fontFamilyCSS = (name === "serif" || name === "sans-serif") ? name : `"${name}", serif`
        try {
          renditionRef.current?.getContents?.().forEach((c: any) => {
            const doc = c?.document
            if (!doc) return
            let s = doc.getElementById("folio-custom-font-face")
            if (!s) { s = doc.createElement("style"); s.id = "folio-custom-font-face"; doc.head?.appendChild(s) }
            s.textContent = fontFaceCSS
            let o = doc.getElementById("folio-font-override")
            if (!o) { o = doc.createElement("style"); o.id = "folio-font-override"; doc.head?.appendChild(o) }
            o.textContent = `* { font-family: ${fontFamilyCSS} !important; }`
          })
        } catch {}
      }
    }
  }

  const updateMargin = (key: keyof MarginSettings, delta: number) => {
    setMargins(prev => {
      const next = { ...prev, [key]: Math.max(0, Math.min(48, prev[key] + delta)) }
      localStorage.setItem(settingsKey("margins"), JSON.stringify(next))
      return next
    })
  }

  const isCurrentBookmarked = bookmarks.some(m => m.cfi === currentCfi)
  const themeBg: Record<ReaderTheme, string> = { light: "#ffffff", dark: "#1c1c1e", sepia: "#f4ecd8" }
  const fg = readerTheme === "dark" ? "#f5f5f7" : "#1d1d1f"
  const subtleFg = readerTheme === "dark" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.55)"
  const panelBg = readerTheme === "dark" ? "#2c2c2e" : "#ffffff"
  const panelFg = readerTheme === "dark" ? "#f5f5f7" : "#1d1d1f"
  const panelSubtle = readerTheme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"
  const borderClr = readerTheme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"

  const epubEstimate = (() => {
    const remaining = Math.max(0, epubTotalPages - epubCurrentPage)
    return formatReadingTime(remaining)
  })()

  if (fmt === "pdf") {
    return (
      <PdfReader
        containerRef={containerRef} bookTitle={bookTitle} fileUrl={fileUrl}
        bookId={id || ""} isFullscreen={isFullscreen} toggleFullscreen={toggleFullscreen}
        navigate={navigate} margins={margins} showTime={showTime} currentTime={currentTime}
      />
    )
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex flex-col" style={{ background: themeBg[readerTheme] }}>
      {/* Header - single row, no time */}
      <div className="flex items-center h-12 px-3 border-b shrink-0" style={{ borderColor: borderClr }}>
        <button onClick={() => navigate(-1)} className="flex items-center text-[13px] hover:opacity-80 shrink-0" style={{ color: subtleFg }}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-[13px] font-[500] truncate ml-2" style={{ color: fg }}>
          {bookTitle || "加载中..."}
        </span>
        <div className="flex-1" />
        <div className="flex items-center shrink-0">
          <button className="h-8 w-8 flex items-center justify-center hover:opacity-80" style={{ color: subtleFg }}
            onClick={() => { closeAllPanels(); setShowToc(!showToc) }} title="目录">
            <BookText className="h-[18px] w-[18px]" />
          </button>
          <button className="h-8 w-8 flex items-center justify-center hover:opacity-80" style={{ color: subtleFg }}
            onClick={toggleMode} title={readMode === "single" ? "双栏模式" : "单页模式"}>
            {readMode === "single" ? <Columns2 className="h-[18px] w-[18px]" /> : <LayoutGrid className="h-[18px] w-[18px]" />}
          </button>
          <button className="h-8 w-8 flex items-center justify-center hover:opacity-80"
            style={{ color: isCurrentBookmarked ? "#ff9f0a" : subtleFg }}
            onClick={addBookmark} title="书签">
            <Bookmark className="h-[18px] w-[18px]" fill={isCurrentBookmarked ? "currentColor" : "none"} />
          </button>
          <button className="h-8 w-8 flex items-center justify-center hover:opacity-80" style={{ color: subtleFg }}
            onClick={() => { closeAllPanels(); setShowSettings(!showSettings) }} title="设置">
            <Settings className="h-[18px] w-[18px]" />
          </button>
          <button className="h-8 w-8 flex items-center justify-center hover:opacity-80" style={{ color: subtleFg }}
            onClick={() => { closeAllPanels(); setShowBookmarks(!showBookmarks) }} title="书签列表">
            <List className="h-[18px] w-[18px]" />
          </button>
          <button className="h-8 w-8 flex items-center justify-center hover:opacity-80" style={{ color: subtleFg }}
            onClick={toggleFullscreen} title={isFullscreen ? "退出全屏" : "全屏"}>
            {isFullscreen ? <Minimize className="h-[18px] w-[18px]" /> : <Maximize className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>

      {/* TOC overlay */}
      {showToc && (
        <div className="absolute inset-0 z-40 flex flex-col" style={{ background: themeBg[readerTheme] }}>
          <div className="flex items-center justify-between h-12 px-4 border-b shrink-0" style={{ borderColor: borderClr }}>
            <span className="text-[15px] font-[500]" style={{ color: panelFg }}>目录</span>
            <button onClick={() => setShowToc(false)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-[rgba(0,0,0,0.06)]">
              <X className="h-5 w-5" style={{ color: panelFg }} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto max-w-2xl mx-auto w-full">
            {toc.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <BookText className="h-10 w-10 mb-3" style={{ color: subtleFg }} />
                <p className="text-[15px]" style={{ color: subtleFg }}>此书无目录</p>
              </div>
            ) : toc.map((item, i) => (
              <button key={i} onClick={() => jumpToToc(item.href)}
                className="w-full text-left px-6 py-3 border-b hover:bg-[rgba(0,0,0,0.04)] transition-colors"
                style={{ borderColor: readerTheme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", paddingLeft: `${24 + item.level * 24}px` }}>
                <span className="text-[15px] leading-relaxed" style={{ color: panelFg }}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <>
          <div className="absolute inset-0 z-[25]" onClick={() => setShowSettings(false)} />
          <div className="absolute right-4 top-14 z-30 w-64 rounded-xl p-4 space-y-4"
            style={{ background: panelBg, boxShadow: "rgba(0,0,0,0.22) 3px 5px 30px 0px", maxHeight: "80vh", overflowY: "auto" }}>
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-[600]" style={{ color: panelFg }}>阅读设置</span>
            <button onClick={() => setShowSettings(false)} className="hover:opacity-70"><X className="h-4 w-4" style={{ color: panelFg }} /></button>
          </div>

          {/* Font size */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[13px] font-[500]" style={{ color: panelFg }}>
              <Type className="h-4 w-4" style={{ color: "#0071e3" }} />
              <span>字号 {fontSize}%</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => changeFontSize(-10)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px] font-[600]" style={{ background: panelSubtle, color: panelFg, border: `1px solid ${readerTheme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}` }}>A-</button>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: panelSubtle }}>
                <div className="h-full rounded-full bg-[#0071e3] transition-all" style={{ width: `${((fontSize - 80) / 70) * 100}%` }} />
              </div>
              <button onClick={() => changeFontSize(10)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px] font-[600]" style={{ background: panelSubtle, color: panelFg, border: `1px solid ${readerTheme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}` }}>A+</button>
            </div>
          </div>

          {/* Theme */}
          <div className="space-y-2">
            <span className="text-[13px] font-[500]" style={{ color: panelFg }}>主题</span>
            <div className="flex gap-2">
              {([
                { key: "light" as ReaderTheme, label: "浅色", color: "#ffffff" },
                { key: "dark" as ReaderTheme, label: "深色", color: "#1c1c1e" },
                { key: "sepia" as ReaderTheme, label: "护眼", color: "#f4ecd8" },
              ]).map(t => (
                <button key={t.key} onClick={() => changeTheme(t.key)}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-2 rounded-lg transition-colors ${readerTheme === t.key ? "ring-2 ring-[#0071e3]" : ""}`}
                  style={{ background: panelSubtle }}>
                  <div className="w-6 h-6 rounded-full border border-[rgba(0,0,0,0.1)]" style={{ background: t.color }} />
                  <span className="text-[11px]" style={{ color: panelFg }}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Layout */}
          <div className="space-y-2">
            <span className="text-[13px] font-[500]" style={{ color: panelFg }}>版式</span>
            <div className="flex gap-2">
              <button onClick={() => { setReadMode("single"); localStorage.setItem(settingsKey("read_mode"), "single") }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] transition-colors ${readMode === "single" ? "ring-2 ring-[#0071e3]" : ""}`}
                style={{ background: panelSubtle, color: panelFg }}>
                <LayoutGrid className="h-3.5 w-3.5" /> 单页
              </button>
              <button onClick={() => { setReadMode("spread"); localStorage.setItem(settingsKey("read_mode"), "spread") }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] transition-colors ${readMode === "spread" ? "ring-2 ring-[#0071e3]" : ""}`}
                style={{ background: panelSubtle, color: panelFg }}>
                <Columns2 className="h-3.5 w-3.5" /> 双栏
              </button>
            </div>
          </div>

          {/* Font */}
          {availableFonts.length > 0 && (
            <div className="space-y-2">
              <span className="text-[13px] font-[500]" style={{ color: panelFg }}>字体</span>
              <div className="relative">
                <button onClick={() => setFontOpen(!fontOpen)}
                  className="w-full flex items-center justify-between h-9 rounded-lg px-3 text-[13px] outline-none"
                  style={{ background: panelSubtle, color: panelFg, border: `1px solid ${readerTheme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}` }}>
                  <span>{fontFamily || "系统默认"}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </button>
                {fontOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setFontOpen(false)} />
                    <div className="absolute left-0 right-0 top-full mt-1 rounded-xl z-50 py-1 max-h-[200px] overflow-y-auto"
                      style={{ background: panelBg, border: `1px solid ${readerTheme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`, boxShadow: "rgba(0,0,0,0.15) 0px 4px 12px" }}>
                      {([
                        { value: "", label: "系统默认" },
                        { value: "serif", label: "Serif" },
                        { value: "sans-serif", label: "Sans-serif" },
                        ...availableFonts.map((f) => ({ value: f.name, label: f.name })),
                      ]).map((opt) => (
                        <button key={opt.value} onClick={() => { changeFont(opt.value); setFontOpen(false) }}
                          className="w-full text-left px-3 py-2.5 text-[16px] flex items-center justify-between transition-colors"
                          style={{ color: fontFamily === opt.value ? "#0071e3" : panelFg }}>
                          <span style={opt.value ? { fontFamily: opt.value } : undefined}>{opt.label}</span>
                          {fontFamily === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-[#0071e3]" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Margins */}
          <div className="space-y-2">
            <span className="text-[13px] font-[500]" style={{ color: panelFg }}>边距</span>
            {([
              { key: "top" as const, label: "上" },
              { key: "bottom" as const, label: "下" },
              { key: "left" as const, label: "左" },
              { key: "right" as const, label: "右" },
            ]).map(m => (
              <div key={m.key} className="flex items-center gap-2">
                <span className="text-[12px] w-4 text-right" style={{ color: panelFg }}>{m.label}</span>
                <button onClick={() => updateMargin(m.key, -4)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px] font-[600]"
                  style={{ background: panelSubtle, color: panelFg, border: `1px solid ${readerTheme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}` }}>-</button>
                <span className="text-[12px] w-8 text-center tabular-nums" style={{ color: panelFg }}>{margins[m.key]}</span>
                <button onClick={() => updateMargin(m.key, 4)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px] font-[600]"
                  style={{ background: panelSubtle, color: panelFg, border: `1px solid ${readerTheme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}` }}>+</button>
              </div>
            ))}
          </div>

          {/* Show time toggle */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-[500]" style={{ color: panelFg }}>底部显示时间</span>
            <button onClick={toggleTimeDisplay}
              className="relative w-[42px] h-[26px] rounded-full transition-colors"
              style={{ background: showTime ? "#0071e3" : panelSubtle }}>
              <div className="absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
                style={{ left: showTime ? "20px" : "3px" }} />
            </button>
          </div>
        </div>
        </>
      )}
      {showBookmarks && (
        <div className="absolute right-4 top-14 z-30 w-64 rounded-xl overflow-hidden"
          style={{ background: panelBg, boxShadow: "rgba(0,0,0,0.22) 3px 5px 30px 0px", maxHeight: "60vh" }}>
          <div className="flex items-center justify-between p-4 pb-2">
            <span className="text-[13px] font-[500]" style={{ color: panelFg }}>书签</span>
            <button onClick={() => setShowBookmarks(false)}><X className="h-4 w-4" style={{ color: panelFg }} /></button>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: "calc(60vh - 48px)" }}>
            {bookmarks.length === 0 ? (
              <p className="text-[13px] p-4 pt-1 text-center" style={{ color: subtleFg }}>暂无书签</p>
            ) : (
              bookmarks.sort((a, b) => b.time - a.time).map((mark, i) => (
                <button key={i} onClick={() => jumpToBookmark(mark.cfi)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[rgba(0,0,0,0.04)] transition-colors">
                  <Bookmark className="h-3.5 w-3.5 text-[#ff9f0a] shrink-0" />
                  <span className="text-[13px] truncate" style={{ color: panelFg }}>位置 {mark.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Viewer */}
      <div className="flex-1 relative overflow-hidden">
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center z-20" style={{ background: themeBg[readerTheme] }}>
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 text-[#0071e3] animate-spin" />
              <p className="text-[13px]" style={{ color: subtleFg }}>正在加载图书...</p>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-20" style={{ background: themeBg[readerTheme] }}>
            <div className="flex flex-col items-center gap-3">
              <BookOpen className="h-10 w-10 text-[var(--muted-foreground)]" />
              <p className="text-[13px] text-[#ff453a]">{error}</p>
              <a href={fileUrl} download className="text-[#2997ff] hover:underline text-[13px]">下载文件</a>
            </div>
          </div>
        )}
        <div ref={viewerRef} className="w-full h-full" />
        {!loading && !error && (
          <>
            <button onClick={goPrev} className="absolute left-0 top-0 w-1/5 h-full cursor-pointer z-10 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-start pl-4">
              <div className="h-10 w-10 flex items-center justify-center rounded-full bg-black/40 border border-white/10">
                <ChevronLeft className="h-5 w-5 text-white" />
              </div>
            </button>
            <button onClick={goNext} className="absolute right-0 top-0 w-1/5 h-full cursor-pointer z-10 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-end pr-4">
              <div className="h-10 w-10 flex items-center justify-center rounded-full bg-black/40 border border-white/10">
                <ChevronRight className="h-5 w-5 text-white" />
              </div>
            </button>
          </>
        )}
      </div>

      {/* Bottom bar: left=progress+estimate, right=time */}
      {!loading && !error && (
        <div className="h-7 flex items-center justify-between px-4 border-t shrink-0" style={{ borderColor: borderClr }}>
          <div className="flex items-center gap-2">
            <span className="text-[11px] tabular-nums" style={{ color: subtleFg }}>{Math.round(currentPct * 100)}%</span>
            {epubEstimate && (
              <>
                <span className="text-[11px]" style={{ color: subtleFg }}>·</span>
                <span className="text-[11px]" style={{ color: subtleFg }}>预计还需 {epubEstimate}</span>
              </>
            )}
          </div>
          {showTime && <span className="text-[11px] tabular-nums" style={{ color: subtleFg }}>{currentTime}</span>}
        </div>
      )}
    </div>
  )
}
