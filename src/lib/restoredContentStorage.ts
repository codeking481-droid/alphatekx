// ============================================================
// RESTORED CONTENT STORAGE — PERSISTENT (fix #1)
// Survives refresh, tied to scanId. Server is durable, this is fast local mirror.
// ============================================================

const RESTORED_CONTENT_PREFIX = 'alphatekx:restored:'

export function storeRestoredContent(scanId: string, content: string): void {
  try {
    localStorage.setItem(`${RESTORED_CONTENT_PREFIX}${scanId}`, content)
  } catch (error) {
    console.warn('[AlphaTekx] Failed to store restored content:', error)
  }
}

export function getRestoredContent(scanId: string): string | null {
  try {
    return localStorage.getItem(`${RESTORED_CONTENT_PREFIX}${scanId}`)
  } catch (error) {
    console.warn('[AlphaTekx] Failed to retrieve restored content:', error)
    return null
  }
}

export function clearRestoredContent(scanId: string): void {
  try {
    localStorage.removeItem(`${RESTORED_CONTENT_PREFIX}${scanId}`)
  } catch (error) {
    console.warn('[AlphaTekx] Failed to clear restored content:', error)
  }
}

// Also expose raw helpers for binary/large content that lives server-side
export function storeRestoredMeta(scanId: string, meta: Record<string, unknown>): void {
  try {
    localStorage.setItem(`${RESTORED_CONTENT_PREFIX}${scanId}:meta`, JSON.stringify(meta))
  } catch {}
}

export function getRestoredMeta(scanId: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(`${RESTORED_CONTENT_PREFIX}${scanId}:meta`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
