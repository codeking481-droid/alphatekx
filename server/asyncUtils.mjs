/** Bounded-concurrency worker pool. Results keep input order; worker throws become { error }. */
export async function pooled(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++
      try { results[idx] = await worker(items[idx], idx) } catch (err) { results[idx] = { error: err } }
    }
  }))
  return results
}
