import { useState } from "react"
import { Search as SearchIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useBooksStore } from "@/store/books"
import { BookCard } from "@/components/book/BookCard"
import { useEffect } from "react"

export function Search() {
  const [query, setQuery] = useState("")
  const { books, fetchBooks } = useBooksStore()

  useEffect(() => {
    fetchBooks()
  }, [fetchBooks])

  const filtered = query.trim()
    ? books.filter((b) => {
        const q = query.toLowerCase()
        const titleMatch = b.title.toLowerCase().includes(q)
        const authorMatch = b.authors?.some((a) =>
          a.name.toLowerCase().includes(q)
        )
        const tagMatch = b.tags?.some((t) =>
          t.name.toLowerCase().includes(q)
        )
        return titleMatch || authorMatch || tagMatch
      })
    : books

  return (
    <div className="p-6 lg:p-8 space-y-6 pb-24 lg:pb-8 max-w-[1200px] mx-auto">
      <div className="max-w-xl">
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted-foreground)]" />
          <Input
            placeholder="搜索书名、作者、标签..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-11 h-11 bg-[var(--card)] border-[var(--border)] rounded-xl text-[15px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] tracking-[-0.01em]"
          />
        </div>
        {query.trim() && (
          <p className="mt-3 text-[13px] text-[var(--muted-foreground)] tracking-[-0.01em]">
            找到 {filtered.length} 本相关图书
          </p>
        )}
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
          {filtered.map((book) => <BookCard key={book.id} book={book} />)}
        </div>
      ) : query.trim() ? (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--muted-foreground)]">
          <SearchIcon className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-[15px]">未找到相关图书</p>
        </div>
      ) : null}
    </div>
  )
}
