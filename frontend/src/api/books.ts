import client, { setToken, getToken } from "./client"
import type { Book, BookListResponse, Stats } from "@/types/book"

interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
}

export const booksApi = {
  list: async (params: {
    page?: number
    page_size?: number
    sort?: string
    order?: string
    search?: string
    tag_id?: number
  } = {}): Promise<BookListResponse> => {
    const { data } = await client.get<ApiResponse<BookListResponse>>("/books", { params })
    return data.data
  },

  get: async (id: number): Promise<Book> => {
    const { data } = await client.get<ApiResponse<Book>>(`/books/${id}`)
    return data.data
  },

  stats: async (): Promise<Stats> => {
    const { data } = await client.get<ApiResponse<Stats>>("/stats")
    return data.data
  },
}

export const authApi = {
  login: async (username: string, password: string) => {
    const { data } = await client.post<ApiResponse<{ access_token: string; token_type: string }>>(
      "/auth/login",
      { username, password }
    )
    setToken(data.data.access_token)
    return data.data
  },

  logout: () => {
    setToken(null)
  },

  isAuthenticated: () => !!getToken(),
}
