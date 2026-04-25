import { Link } from "react-router-dom"
import type { Book } from "@/types/book"

interface BookCardProps {
  book: Book
}

const coverColors = [
  { bg: "#1a1a2e", text: "#e2e2e2" },
  { bg: "#0d2137", text: "#c8dbe8" },
  { bg: "#1e1e2e", text: "#d0c8db" },
  { bg: "#2d1b2e", text: "#dbd0e0" },
  { bg: "#1b2e1d", text: "#c8dbca" },
  { bg: "#2e2b1b", text: "#dbd8c8" },
  { bg: "#2e1b1b", text: "#dbc8c8" },
  { bg: "#1b2a2e", text: "#c8d5db" },
]

function getColor(title: string) {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash)
  return coverColors[Math.abs(hash) % coverColors.length]
}

export function readingProgressLabel(progress?: number | null) {
  if (!progress || progress <= 0) return null
  if (progress >= 0.99) return "已读完"
  return `${Math.max(1, Math.round(progress * 100))}%`
}

export function ReadingProgressInline({ progress, className = "" }: { progress?: number | null; className?: string }) {
  const label = readingProgressLabel(progress)
  if (!label) return null

  const progressPct = Math.min(100, Math.max(1, Math.round((progress || 0) * 100)))

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#0071e3] transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <span className="text-[11px] font-[500] text-[var(--muted-foreground)] shrink-0 tabular-nums">
        {label}
      </span>
    </div>
  )
}

export function BookCard({ book }: BookCardProps) {
  const color = getColor(book.title)

  return (
    <Link
      to={`/books/${book.id}`}
      className="group flex flex-col gap-2 transition-all duration-200 hover:-translate-y-0.5"
    >
      <div
        className="aspect-[2/3] overflow-hidden rounded-lg bg-[var(--secondary)]"
        style={{ boxShadow: "rgba(0, 0, 0, 0.12) 2px 4px 16px 0px" }}
      >
        {book.cover_path ? (
          <img
            src={`/api/v1/books/${book.id}/cover`}
            alt={book.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none"
              const parent = (e.target as HTMLImageElement).parentElement!
              parent.style.background = color.bg
              parent.classList.add("flex", "items-center", "justify-center")
              parent.innerHTML = `<span style="color:${color.text}" class="text-[13px] font-[500] opacity-60">${book.title.slice(0, 2)}</span>`
            }}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: color.bg }}
          >
            <span style={{ color: color.text }} className="text-[13px] font-[500] opacity-60">
              {book.title.slice(0, 2)}
            </span>
          </div>
        )}
      </div>
      <div className="min-w-0 px-0.5">
        <h3 className="text-[13px] font-[500] text-[var(--foreground)] leading-[1.3] truncate tracking-[-0.01em]">
          {book.title}
        </h3>
        <ReadingProgressInline progress={book.progress} className="mt-2" />
      </div>
    </Link>
  )
}
