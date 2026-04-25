import client from "./client"

interface ApiResponse<T> { success: boolean; message: string; data: T }

export const browseApi = {
  authors: async (params?: { search?: string }) => {
    const { data } = await client.get<ApiResponse<any[]>>("/authors", { params })
    return data.data
  },
  author: async (id: number) => {
    const { data } = await client.get<ApiResponse<any>>(`/authors/${id}`)
    return data.data
  },
  tags: async (params?: { search?: string }) => {
    const { data } = await client.get<ApiResponse<any[]>>("/tags", { params })
    return data.data
  },
  tag: async (id: number) => {
    const { data } = await client.get<ApiResponse<any>>(`/tags/${id}`)
    return data.data
  },
  series: async () => {
    const { data } = await client.get<ApiResponse<any[]>>("/series")
    return data.data
  },
  serie: async (id: number) => {
    const { data } = await client.get<ApiResponse<any>>(`/series/${id}`)
    return data.data
  },
  publishers: async () => {
    const { data } = await client.get<ApiResponse<any[]>>("/publishers")
    return data.data
  },
  publisher: async (id: number) => {
    const { data } = await client.get<ApiResponse<any>>(`/publishers/${id}`)
    return data.data
  },
  categories: async () => {
    const { data } = await client.get<ApiResponse<any[]>>("/categories")
    return data.data
  },
  search: async (q: string) => {
    const { data } = await client.get<ApiResponse<any>>("/search", { params: { q } })
    return data.data
  },
}
