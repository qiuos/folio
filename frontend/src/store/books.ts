import { create } from "zustand"
import type { Book, PaginationInfo, Stats } from "@/types/book"
import { booksApi } from "@/api/books"

interface BooksState {
  books: Book[]
  allBooks: Book[]
  pagination: PaginationInfo
  stats: Stats | null
  loading: boolean
  sortBy: string
  sortOrder: string
  viewMode: "grid" | "list"
  searchQuery: string
  fetchBooks: (page?: number) => Promise<void>
  getBookById: (id: number) => Promise<Book | undefined>
  fetchStats: () => Promise<void>
  setSort: (sort: string, order?: string) => void
  setViewMode: (mode: "grid" | "list") => void
  setSearch: (query: string) => void
}

export const useBooksStore = create<BooksState>((set, get) => ({
  books: [],
  allBooks: [],
  pagination: { total_items: 0, page: 1, page_size: 20, total_pages: 0 },
  stats: null,
  loading: false,
  sortBy: "created_at",
  sortOrder: "desc",
  viewMode: "grid",
  searchQuery: "",

  fetchBooks: async (page = 1) => {
    set({ loading: true })
    try {
      const { sortBy, sortOrder, searchQuery } = get()
      const result = await booksApi.list({
        page,
        page_size: 20,
        sort: sortBy,
        order: sortOrder,
        search: searchQuery || undefined,
      })
      set({
        books: result.items,
        allBooks: result.items,
        pagination: result.pagination,
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },

  getBookById: async (id: number) => {
    try {
      return await booksApi.get(id)
    } catch {
      return undefined
    }
  },

  fetchStats: async () => {
    try {
      const stats = await booksApi.stats()
      set({ stats })
    } catch {}
  },

  setSort: (sort: string, order?: string) => {
    set({ sortBy: sort, sortOrder: order || get().sortOrder })
    get().fetchBooks(1)
  },

  setViewMode: (mode: "grid" | "list") => set({ viewMode: mode }),

  setSearch: (query: string) => {
    set({ searchQuery: query })
    get().fetchBooks(1)
  },
}))
