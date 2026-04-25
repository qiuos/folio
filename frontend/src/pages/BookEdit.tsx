import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { ArrowLeft, Save, Search, Upload, Loader2, ImageIcon, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import client from "@/api/client"

interface MetadataCandidate {
  title: string | null
  authors: string[]
  publisher: string | null
  pubdate: string | null
  isbn: string | null
  description: string | null
  cover_url: string | null
  rating: number | null
  page_count: number | null
  tags: string[]
  source: string
  confidence: number
}

export function BookEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchDone, setSearchDone] = useState(false)
  const [candidates, setCandidates] = useState<MetadataCandidate[]>([])
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [form, setForm] = useState({
    title: "", subtitle: "", description: "",
    publisher_name: "", published_date: "",
    isbn: "", language: "zh", page_count: "",
  })
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")

  useEffect(() => {
    if (!id) return
    client.get(`/books/${id}`).then(({ data: resp }) => {
      const b = resp.data
      setForm({
        title: b.title || "",
        subtitle: b.subtitle || "",
        description: b.description || "",
        publisher_name: b.publisher?.name || "",
        published_date: b.published_date || "",
        isbn: b.identifiers?.find((i: any) => i.type === "isbn13" || i.type === "isbn10")?.value || "",
        language: b.language || "zh",
        page_count: b.page_count?.toString() || "",
      })
      setTags(b.tags?.map((t: any) => t.name) || [])
      setCoverUrl(b.cover_path ? `/api/v1/books/${id}/cover` : null)
      setSearchQuery(b.title || "")
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  const addTag = () => {
    const tag = tagInput.trim()
    if (tag && !tags.includes(tag)) setTags([...tags, tag])
    setTagInput("")
  }
  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag))

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id) return
    const fd = new FormData()
    fd.append("file", file)
    try {
      await client.post(`/metadata/cover/${id}`, fd, { headers: { "Content-Type": "multipart/form-data" } })
      setCoverUrl(`/api/v1/books/${id}/cover?t=${Date.now()}`)
    } catch { alert("封面上传失败") }
  }

  const searchMetadata = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchDone(false)
    setCandidates([])
    try {
      const { data: resp } = await client.post("/metadata/search", { query: searchQuery.trim() })
      setCandidates(resp.data || [])
    } catch (err) {
      console.error("Metadata search failed:", err)
      alert("搜索失败，请检查网络连接")
    }
    setSearching(false)
    setSearchDone(true)
  }

  const applyCandidate = async (idx: number) => {
    const c = candidates[idx]
    if (!c || !id) return
    setApplyingIdx(idx)
    try {
      await client.post(`/metadata/apply/${id}`, {
        title: c.title,
        authors: c.authors,
        publisher: c.publisher,
        pubdate: c.pubdate,
        isbn: c.isbn,
        description: c.description,
        cover_url: c.cover_url,
        rating: c.rating,
        page_count: c.page_count,
        tags: c.tags,
        source: c.source,
      })
      // Refresh form from server
      const { data: resp } = await client.get(`/books/${id}`)
      const b = resp.data
      setForm({
        title: b.title || "",
        subtitle: b.subtitle || "",
        description: b.description || "",
        publisher_name: b.publisher?.name || "",
        published_date: b.published_date || "",
        isbn: b.identifiers?.find((i: any) => i.type === "isbn13" || i.type === "isbn10")?.value || "",
        language: b.language || "zh",
        page_count: b.page_count?.toString() || "",
      })
      setTags(b.tags?.map((t: any) => t.name) || [])
      setCoverUrl(b.cover_path ? `/api/v1/books/${id}/cover?t=${Date.now()}` : null)
      setCandidates([])
    } catch { alert("应用元数据失败") }
    setApplyingIdx(null)
  }

  const save = async () => {
    setSaving(true)
    try {
      await client.put(`/upload/books/${id}`, {
        title: form.title,
        subtitle: form.subtitle || null,
        description: form.description || null,
        language: form.language || null,
        page_count: form.page_count ? parseInt(form.page_count) : null,
        published_date: form.published_date || null,
        tags,
      })
      navigate(`/books/${id}`)
    } catch {
      alert("保存失败，请检查是否已登录")
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto pb-20 lg:pb-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> 返回
      </button>

      <h1 className="text-[20px] font-[510] text-[var(--foreground)] mb-6">编辑图书</h1>

      {/* Cover Section */}
      <div className="flex gap-6 mb-6">
        <div className="shrink-0">
          <div className="w-32 aspect-[2/3] rounded-lg border border-border overflow-hidden bg-gradient-to-br from-[var(--primary)]/30 to-[var(--primary)]/10 flex items-center justify-center relative group">
            {coverUrl ? (
              <img src={coverUrl} alt="cover" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="h-8 w-8 text-[var(--muted-foreground)]" />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                 onClick={() => coverInputRef.current?.click()}>
              <Upload className="h-5 w-5 text-white" />
            </div>
          </div>
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
          <Button variant="ghost" size="sm" className="mt-2 text-[11px] w-full" onClick={() => coverInputRef.current?.click()}>
            更换封面
          </Button>
        </div>

        {/* Metadata Search */}
        <div className="flex-1 space-y-3">
          <label className="block text-[12px] font-[510] text-[var(--muted-foreground)]">在线获取元数据</label>
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="输入书名或ISBN搜索"
              className="h-9 bg-[var(--card)] border-border text-[14px]"
              onKeyDown={(e) => e.key === "Enter" && searchMetadata()}
            />
            <Button
              className="h-9 gap-1.5 text-[13px] font-[510] bg-[var(--primary)] text-white shrink-0"
              onClick={searchMetadata}
              disabled={searching}
            >
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              搜索
            </Button>
          </div>

          {/* Search Results */}
          {searching && (
            <div className="flex items-center gap-2 text-[12px] text-[var(--muted-foreground)] py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 搜索中，请稍候...
            </div>
          )}
          {!searching && searchDone && candidates.length === 0 && (
            <div className="text-[12px] text-[var(--muted-foreground)] py-2">
              未找到匹配结果，请尝试用英文书名或 ISBN 搜索
            </div>
          )}
          {candidates.length > 0 && (
            <div className="border border-border rounded-lg divide-y divide-border max-h-64 overflow-y-auto">
              {candidates.map((c, i) => (
                <div key={i} className="flex items-center gap-3 p-3 hover:bg-[var(--secondary)] transition-colors">
                  {c.cover_url && (
                    <img src={c.cover_url} alt="" className="h-14 w-10 rounded object-cover border border-border shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-[510] text-[var(--foreground)] truncate">{c.title}</p>
                    <p className="text-[11px] text-[var(--muted-foreground)] truncate">
                      {c.authors?.join("、") || "未知作者"}
                      {c.publisher && ` · ${c.publisher}`}
                      {c.pubdate && ` · ${c.pubdate.slice(0, 4)}`}
                    </p>
                    <p className="text-[10px] text-[var(--muted-foreground)]">
                      {c.source} · {Math.round(c.confidence * 100)}% 匹配
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-[11px] gap-1 shrink-0 bg-[var(--primary)] text-white"
                    onClick={() => applyCandidate(i)}
                    disabled={applyingIdx !== null}
                  >
                    {applyingIdx === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    应用
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border mb-6" />

      {/* Form Fields */}
      <div className="space-y-4">
        {[
          { label: "书名", key: "title", required: true },
          { label: "副标题", key: "subtitle" },
          { label: "出版社", key: "publisher_name" },
          { label: "出版日期", key: "published_date", type: "date" },
          { label: "ISBN", key: "isbn" },
          { label: "语言", key: "language" },
          { label: "页数", key: "page_count", type: "number" },
        ].map(({ label, key, required, type }) => (
          <div key={key}>
            <label className="block text-[12px] font-[510] text-[var(--muted-foreground)] mb-1.5">
              {label}{required && " *"}
            </label>
            <Input
              type={type || "text"}
              value={(form as any)[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="h-9 bg-[var(--card)] border-border text-[14px]"
            />
          </div>
        ))}

        <div>
          <label className="block text-[12px] font-[510] text-[var(--muted-foreground)] mb-1.5">简介</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={5}
            className="w-full rounded-md border border-border bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--ring)] resize-y"
          />
        </div>

        <div>
          <label className="block text-[12px] font-[510] text-[var(--muted-foreground)] mb-1.5">标签</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[11px] rounded-full px-2.5 py-0.5 bg-transparent border border-border cursor-pointer hover:border-red-400 hover:text-red-400" onClick={() => removeTag(tag)}>
                {tag} ×
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="添加标签"
              className="h-8 bg-[var(--card)] border-border text-[13px]"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            />
            <Button variant="ghost" size="sm" className="h-8 text-[12px]" onClick={addTag}>添加</Button>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            className="h-9 gap-1.5 text-[13px] font-[510] bg-[var(--primary)] text-white"
            onClick={save}
            disabled={saving}
          >
            <Save className="h-4 w-4" />
            {saving ? "保存中..." : "保存"}
          </Button>
          <Button variant="ghost" className="h-9 text-[13px]" onClick={() => navigate(-1)}>
            取消
          </Button>
        </div>
      </div>
    </div>
  )
}
