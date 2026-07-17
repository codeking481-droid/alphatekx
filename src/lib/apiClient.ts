export async function postJson<T>(url: string, body: unknown, options: { token?: string; timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const raw = await response.text()
    let payload: Record<string, unknown> = {}
    try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {} } catch {}
    if (!response.ok) throw new Error(String(payload.error || raw || `Alpha returned HTTP ${response.status}.`))
    return payload as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Alpha took too long to respond. Try again.')
    if (error instanceof TypeError) throw new Error('Could not reach Alpha. Confirm the Render service is running with `npm start`.')
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}
