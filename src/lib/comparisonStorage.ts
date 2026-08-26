// ============================================================
// BEFORE/AFTER COMPARISON STORAGE — PERSISTENT (fix #2)
// Stores full comparison so UI reads real numbers, never 0.
// ============================================================

const COMPARISON_PREFIX = 'alphatekx:comparison:'

export interface ComparisonData {
  before: {
    score: number | null
    issues: number | null
    details?: string[]
  }
  after: {
    score: number | null
    issues: number | null
    details?: string[]
  }
  scanId: string
  site?: string
  updatedAt: string
}

export function storeComparison(scanId: string, data: ComparisonData): void {
  try {
    localStorage.setItem(`${COMPARISON_PREFIX}${scanId}`, JSON.stringify(data))
  } catch (error) {
    console.warn('[AlphaTekx] Failed to store comparison:', error)
  }
}

export function getComparison(scanId: string): ComparisonData | null {
  try {
    const raw = localStorage.getItem(`${COMPARISON_PREFIX}${scanId}`)
    return raw ? (JSON.parse(raw) as ComparisonData) : null
  } catch (error) {
    console.warn('[AlphaTekx] Failed to retrieve comparison:', error)
    return null
  }
}

export function clearComparison(scanId: string): void {
  try {
    localStorage.removeItem(`${COMPARISON_PREFIX}${scanId}`)
  } catch {}
}
