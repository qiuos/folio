import client from "./client"

interface ApiResponse<T> { success: boolean; message: string; data: T }

export interface FontItem {
  id: number
  name: string
  filename: string
  format: string
}

export const fontsApi = {
  list: async () => {
    const { data: resp } = await client.get<ApiResponse<FontItem[]>>("/fonts")
    return resp.data
  },
  upload: async (name: string, file: File) => {
    const form = new FormData()
    form.append("file", file)
    const { data: resp } = await client.post<ApiResponse<FontItem>>(
      `/fonts?name=${encodeURIComponent(name)}`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    )
    return resp.data
  },
  delete: async (id: number) => {
    await client.delete(`/fonts/${id}`)
  },
  fontUrl: (fontId: number) =>
    `${client.defaults.baseURL}/fonts/${fontId}/file`,
}
