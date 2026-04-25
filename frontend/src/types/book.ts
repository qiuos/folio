export interface AuthorBrief {
  id: number
  name: string
  role?: string
}

export interface FormatBrief {
  id: number
  format: string
  file_size: number | null
  mime_type: string | null
}

export interface TagBrief {
  id: number
  name: string
  color?: string
}

export interface Book {
  id: number
  title: string
  subtitle?: string
  sort_title?: string
  description?: string
  cover_path?: string
  language?: string
  page_count?: number
  published_date?: string
  rating?: number
  progress?: number | null
  rating_source?: string
  metadata_source?: string
  series_index?: number
  // These come from backend as arrays of objects
  authors: AuthorBrief[]
  formats: FormatBrief[]
  tags: TagBrief[]
  // Optional nested
  publisher?: { id: number; name: string }
  series?: { id: number; name: string }
  categories?: Array<{ id: number; name: string }>
  identifiers?: Array<{ id: number; type: string; value: string }>
  // Legacy compat for mock data
  isbn?: string
  has_cover?: boolean
  created_at: string
  updated_at: string
}

export interface PaginationInfo {
  total_items: number
  total_pages: number
  page: number
  page_size: number
}

export interface BookListResponse {
  items: Book[]
  pagination: PaginationInfo
}

export interface Stats {
  total_books: number
  total_authors: number
  total_tags: number
  total_series: number
  total_categories: number
  total_publishers: number
  total_shelves: number
}
