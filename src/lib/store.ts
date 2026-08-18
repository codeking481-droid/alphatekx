import { getJson, postJson, putJson, deleteJson } from './apiClient'
import type { StoreItem } from './types'

export type { StoreItem }

export const STORE_TYPES: StoreItem['type'][] = ['snippet', 'prompt', 'image', 'link', 'idea', 'file']

function getToken() {
  try {
    const raw = localStorage.getItem('alphatekx:session')
    if (raw) return JSON.parse(raw)?.access_token
  } catch {}
  return undefined
}

function tokenOptions() {
  const token = getToken()
  return token ? { token } : {}
}

export async function fetchStoreItems(params?: { type?: string; q?: string; tag?: string; sort?: string }): Promise<{ items: StoreItem[] }> {
  const query = new URLSearchParams()
  if (params?.type && params.type !== 'All') query.set('type', params.type)
  if (params?.q) query.set('q', params.q)
  if (params?.tag) query.set('tag', params.tag)
  if (params?.sort) query.set('sort', params.sort)
  return getJson<{ items: StoreItem[] }>(`/api/store/items?${query.toString()}`, tokenOptions())
}

export async function createStoreItem(input: Partial<StoreItem>): Promise<{ item: StoreItem }> {
  return postJson<{ item: StoreItem }>('/api/store/items', input, tokenOptions())
}

export async function updateStoreItem(id: string, input: Partial<StoreItem>): Promise<{ item: StoreItem }> {
  return putJson<{ item: StoreItem }>(`/api/store/items/${id}`, input, tokenOptions())
}

export async function deleteStoreItem(id: string): Promise<{ ok: boolean }> {
  return deleteJson<{ ok: boolean }>(`/api/store/items/${id}`, tokenOptions())
}

export async function useStoreItem(id: string): Promise<{ item: StoreItem }> {
  return postJson<{ item: StoreItem }>(`/api/store/items/${id}/use`, {}, tokenOptions())
}

export async function uploadStoreFile(file: File): Promise<{ id: string; url: string; name: string; mime: string; size: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result || '')
        const result = await postJson<{ id: string; url: string; name: string; mime: string; size: number }>('/api/store/upload', { file: dataUrl, name: file.name, mime: file.type }, tokenOptions())
        resolve(result)
      } catch (error) { reject(error) }
    }
    reader.readAsDataURL(file)
  })
}

export function itemIcon(type: StoreItem['type']) {
  const map: Record<StoreItem['type'], string> = { snippet: '</>', prompt: '✨', image: '🖼️', link: '🔗', idea: '💡', file: '📄' }
  return map[type] || '📦'
}
