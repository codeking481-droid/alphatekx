import { supabase } from './supabase'

let repairInFlight: Promise<string | undefined> | null = null

export async function repairOversizedSession(accessToken: string): Promise<string | undefined> {
  if (!supabase || !accessToken) return undefined
  if (repairInFlight) return repairInFlight

  repairInFlight = (async () => {
    const response = await fetch('/api/auth/repair-oversized-session', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken }),
    })
    if (!response.ok) return undefined
    const refreshed = await supabase.auth.refreshSession().catch(() => null)
    return refreshed?.data?.session?.access_token || undefined
  })().finally(() => { repairInFlight = null })

  return repairInFlight
}
