import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Search, Loader2, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { metadataApi, type MetadataCandidate } from "@/api/metadata"

export function MetadataMatch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<MetadataCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [applying, setApplying] = useState<number | null>(null)

  const search = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const candidates = await metadataApi.search(query)
      setResults(candidates)
    } catch {
      setResults([])
    }
    setSearching(false)
  }

  const apply = async (idx: number) => {
    setApplying(idx)
    // This would normally apply to a specific book_id
    // For now just show success
    setTimeout(() => {
      setApplying(null)
      navigate(-1)
    }, 500)
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto pb-20 lg:pb-6">
      <h1 className="text-[20px] font-[510] text-[var(--foreground)] mb-6">搜索元数据</h1>

      <div className="flex gap-2 mb-6">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入书名、作者或 ISBN..."
          className="h-10 bg-[var(--card)] border-border"
          onKeyDown={(e) => e.key === "Enter" && search()}
          autoFocus
        />
        <Button
          className="h-10 gap-1.5 bg-[var(--primary)] text-white"
          onClick={search}
          disabled={searching}
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          搜索
        </Button>
      </div>

      {results.length === 0 && !searching && query && (
        <p className="text-[13px] text-[var(--muted-foreground)] text-center py-8">
          未找到匹配结果
        </p>
      )}

      <div className="space-y-3">
        {results.map((r, i) => (
          <div
            key={i}
            className="flex gap-4 p-4 rounded-lg border border-border bg-[var(--card)] hover:bg-[var(--secondary)] transition-colors"
          >
            {r.cover_url ? (
              <img
                src={r.cover_url}
                alt=""
                className="w-16 h-24 object-cover rounded border border-border shrink-0"
              />
            ) : (
              <div className="w-16 h-24 rounded border border-border bg-gradient-to-br from-[var(--primary)]/20 to-[var(--primary)]/5 flex items-center justify-center shrink-0">
                <span className="text-[10px] text-[var(--foreground)]/30">
                  {r.title?.slice(0, 2)}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1">
              <h3 className="text-[14px] font-[510] text-[var(--foreground)]">{r.title}</h3>
              <p className="text-[12px] text-[var(--muted-foreground)]">
                {r.authors?.join("、")}
                {r.publisher && ` · ${r.publisher}`}
                {r.pubdate && ` · ${r.pubdate.slice(0, 4)}`}
              </p>
              {r.rating && (
                <p className="text-[12px] text-amber-400">★ {r.rating}</p>
              )}
              <p className="text-[11px] text-[var(--muted-foreground)]">
                来源: {r.source} · 置信度: {Math.round(r.confidence * 100)}%
              </p>
            </div>
            <Button
              size="sm"
              className="h-7 text-[11px] bg-[var(--primary)] text-white shrink-0"
              onClick={() => apply(i)}
              disabled={applying !== null}
            >
              {applying === i ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle className="h-3 w-3" />
              )}
              应用
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
