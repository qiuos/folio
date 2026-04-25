import client from "./client"

interface ApiResponse<T> { success: boolean; message: string; data: T }

export const shelvesApi = {
  list: async () => {
    const { data } = await client.get<ApiResponse<any[]>>("/shelves")
    return data.data
  },
  get: async (id: number) => {
    const { data } = await client.get<ApiResponse<any>>(`/shelves/${id}`)
    return data.data
  },
  create: async (body: { name: string; description?: string; is_public?: boolean }) => {
    const { data } = await client.post<ApiResponse<any>>("/shelves", body)
    return data.data
  },
  update: async (id: number, body: { name?: string; description?: string; is_public?: boolean }) => {
    const { data } = await client.put<ApiResponse<any>>(`/shelves/${id}`, body)
    return data.data
  },
  delete: async (id: number) => {
    await client.delete(`/shelves/${id}`)
  },
  addBook: async (shelfId: number, bookId: number) => {
    await client.post(`/shelves/${shelfId}/books`, { book_id: bookId })
  },
  removeBook: async (shelfId: number, bookId: number) => {
    await client.delete(`/shelves/${shelfId}/books/${bookId}`)
  },
}
