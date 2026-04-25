import client from "./client"

interface ApiResponse<T> { success: boolean; message: string; data: T }

export interface MetadataCandidate {
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

export const metadataApi = {
  fetch: async (params: { isbn?: string; title?: string; author?: string; book_id?: number }) => {
    const { data } = await client.post<ApiResponse<MetadataCandidate>>("/metadata/fetch", params)
    return data.data
  },
  search: async (query: string) => {
    const { data } = await client.post<ApiResponse<MetadataCandidate[]>>("/metadata/search", { query })
    return data.data
  },
  apply: async (bookId: number, metadata: Record<string, unknown>) => {
    const { data } = await client.post<ApiResponse<any>>(`/metadata/apply/${bookId}`, metadata)
    return data.data
  },
}
