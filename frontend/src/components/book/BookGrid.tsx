import type { Book } from "@/types/book"
import { BookCard } from "./BookCard"

interface BookGridProps {
  books: Book[]
  columns?: number
}

export function BookGrid({ books, columns = 7 }: BookGridProps) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {books.map((book) => (
        <BookCard key={book.id} book={book} />
      ))}
    </div>
  )
}
