import { useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Upload, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import client from "@/api/client"

interface UploadItem {
  file: File
  status: "pending" | "uploading" | "done" | "error"
  progress: number
  bookId?: number
  title?: string
  error?: string
}

export function BookUpload() {
  const navigate = useNavigate()
  const [items, setItems] = useState<UploadItem[]>([])
  const [dragOver, setDragOver] = useState(false)

  const addFiles = (files: FileList | File[]) => {
    const newItems: UploadItem[] = Array.from(files).map((file) => ({
      file,
      status: "pending",
      progress: 0,
    }))
    setItems((prev) => [...prev, ...newItems])
  }

  const uploadFile = async (index: number) => {
    const item = items[index]
    if (!item || item.status === "uploading" || item.status === "done") return

    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, status: "uploading", progress: 0 } : it))
    )

    const formData = new FormData()
    formData.append("file", item.file)

    try {
      const { data } = await client.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          const progress = e.total ? Math.round((e.loaded / e.total) * 100) : 0
          setItems((prev) =>
            prev.map((it, i) => (i === index ? { ...it, progress } : it))
          )
        },
      })

      setItems((prev) =>
        prev.map((it, i) =>
          i === index
            ? {
                ...it,
                status: "done",
                progress: 100,
                bookId: data.data?.book_id,
                title: data.data?.title || it.file.name,
              }
            : it
        )
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "上传失败"
      setItems((prev) =>
        prev.map((it, i) => (i === index ? { ...it, status: "error", error: message } : it))
      )
    }
  }

  const uploadAll = () => {
    items.forEach((_, i) => uploadFile(i))
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) addFiles(e.target.files)
  }

  return (
    <div className="p-6 lg:p-8 max-w-[640px] mx-auto pb-24 lg:pb-8 space-y-8">
      <h1 className="text-[28px] font-[700] tracking-[-0.02em] text-[var(--foreground)]">
        上传图书
      </h1>

      <div
        className={`rounded-2xl p-10 text-center transition-colors cursor-pointer border-2 border-dashed ${
          dragOver
            ? "bg-[#0071e3]/5 border-[#0071e3]"
            : "bg-[var(--card)] border-[var(--border)] hover:border-[var(--muted-foreground)]"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <div className="w-14 h-14 rounded-2xl bg-[#0071e3]/10 flex items-center justify-center mx-auto mb-4">
          <Upload className="h-6 w-6 text-[#0071e3]" />
        </div>
        <p className="text-[17px] font-[600] text-[var(--foreground)] mb-1 tracking-[-0.01em]">
          拖拽文件到此处，或点击选择
        </p>
        <p className="text-[13px] text-[var(--muted-foreground)] tracking-[-0.01em]">
          支持 EPUB / PDF / MOBI / AZW3 / TXT
        </p>
        <input
          type="file"
          multiple
          accept=".epub,.pdf,.mobi,.azw3,.txt,.djvu,.cbz"
          onChange={handleFileInput}
          className="hidden"
          id="file-input"
        />
      </div>

      {items.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[14px] text-[var(--muted-foreground)] tracking-[-0.01em]">
              上传队列 ({items.filter((i) => i.status === "done").length}/{items.length})
            </span>
            {items.some((i) => i.status === "pending") && (
              <Button
                size="sm"
                className="h-9 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white text-[14px] font-[600] px-4"
                onClick={uploadAll}
              >
                全部上传
              </Button>
            )}
          </div>

          <div className="rounded-2xl bg-[var(--card)] overflow-hidden">
            {items.map((item, i) => (
              <div key={i}>
                {i > 0 && <div className="mx-4 h-px bg-[var(--border)]" />}
                <div className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 rounded-xl bg-[var(--secondary)] flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5 text-[var(--muted-foreground)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-[500] text-[var(--foreground)] truncate tracking-[-0.01em]">
                      {item.file.name}
                    </p>
                    <p className="text-[12px] text-[var(--muted-foreground)] tracking-[-0.01em] mt-0.5">
                      {(item.file.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  </div>
                  {item.status === "uploading" && (
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-24 h-1.5 rounded-full bg-[var(--muted)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#0071e3] transition-all"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <span className="text-[12px] text-[var(--muted-foreground)] tabular-nums w-8 text-right">{item.progress}%</span>
                    </div>
                  )}
                  {item.status === "done" && (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[13px] font-[600] text-[#30d158]">已完成</span>
                      {item.bookId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[13px] text-[#0071e3] hover:text-[#0071e3] rounded-lg px-2"
                          onClick={() => navigate(`/books/${item.bookId}/edit`)}
                        >
                          编辑
                        </Button>
                      )}
                    </div>
                  )}
                  {item.status === "error" && (
                    <span className="text-[13px] text-[#ff453a] shrink-0">{item.error || "上传失败"}</span>
                  )}
                  {item.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-[14px] shrink-0 rounded-xl text-[#0071e3] font-[600]"
                      onClick={() => uploadFile(i)}
                    >
                      上传
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
