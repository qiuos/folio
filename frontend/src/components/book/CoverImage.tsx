import { useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"

interface CoverImageProps {
  bookId: number
  title: string
  hasCover: boolean
  className?: string
}

const coverColors = [
  "from-indigo-900 to-purple-900",
  "from-emerald-900 to-teal-900",
  "from-orange-900 to-red-900",
  "from-blue-900 to-cyan-900",
  "from-rose-900 to-pink-900",
  "from-violet-900 to-fuchsia-900",
  "from-slate-800 to-zinc-900",
  "from-amber-900 to-yellow-900",
]

function getColor(title: string) {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash)
  }
  return coverColors[Math.abs(hash) % coverColors.length]
}

export function CoverImage({ bookId, title, hasCover, className = "" }: CoverImageProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  const gradient = getColor(title)
  const initials = title.slice(0, 2)

  if (!hasCover || error) {
    return (
      <div
        className={`relative flex items-center justify-center bg-gradient-to-br ${gradient} ${className}`}
      >
        <span className="text-white/70 text-sm font-[510]">{initials}</span>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      {!loaded && (
        <Skeleton className="absolute inset-0 rounded-none" />
      )}
      <img
        src={`/api/v1/books/${bookId}/cover`}
        alt={title}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        loading="lazy"
      />
    </div>
  )
}
