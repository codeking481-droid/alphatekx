const storageKey = (slug, entity) => `alpha-preview:${slug}:${entity}`

const mockApi = (slug) => ({
  async get(entity) {
    try {
      const raw = localStorage.getItem(storageKey(slug, entity))
      return { records: raw ? JSON.parse(raw) : [] }
    } catch { return { records: [] } }
  },
  async post(entity, data) {
    try {
      const key = storageKey(slug, entity)
      const list = JSON.parse(localStorage.getItem(key) || '[]')
      list.push({ ...data, id: data.id || crypto.randomUUID() })
      localStorage.setItem(key, JSON.stringify(list))
      return { records: list }
    } catch { return { records: [] } }
  },
  async put(entity, id, data) {
    try {
      const key = storageKey(slug, entity)
      const list = JSON.parse(localStorage.getItem(key) || '[]')
      const idx = list.findIndex((r) => r.id === id)
      if (idx >= 0) list[idx] = { ...list[idx], ...data, id }
      else list.push({ ...data, id })
      localStorage.setItem(key, JSON.stringify(list))
      return { records: list }
    } catch { return { records: [] } }
  },
  async del(entity, id) {
    try {
      const key = storageKey(slug, entity)
      const list = JSON.parse(localStorage.getItem(key) || '[]').filter((r) => r.id !== id)
      localStorage.setItem(key, JSON.stringify(list))
      return { records: list }
    } catch { return { records: [] } }
  },
  url(entity, id) { return `/api/apps/${slug}/${entity}${id ? '/' + id : ''}` },
  headers() { return {} }
})

function init() {
  const slug = window.ALPHA_APP_SLUG || 'preview'
  window.AlphaAPI = mockApi(slug)
}

if (typeof window !== 'undefined') init()

export default {}
