import { SupabaseClient } from '@supabase/supabase-js'

export async function ensureValidToken(supabase: SupabaseClient, connectionId: string): Promise<{ access_token?: string; status: string }> {
  const { data: connRows } = await supabase.from('connections').select('*').eq('id', connectionId).limit(1).single()
  const connection: any = connRows as any
  if (!connection) return { status: 'missing' }
  const now = new Date()
  const expiresAt = connection.expires_at ? new Date(connection.expires_at) : null
  if (expiresAt && expiresAt.getTime() > now.getTime() + 5 * 60 * 1000) {
    return { access_token: connection.access_token, status: 'active' }
  }

  // Attempt refresh for providers that expose refresh_token
  if (connection.refresh_token) {
    try {
      // Example: gmail/google oauth refresh
      if (connection.provider === 'gmail' || connection.provider === 'google_sheets' || connection.provider === 'googledocs') {
        const params = new URLSearchParams()
        params.set('grant_type', 'refresh_token')
        params.set('refresh_token', connection.refresh_token)
        params.set('client_id', process.env.GOOGLE_CLIENT_ID || '')
        params.set('client_secret', process.env.GOOGLE_CLIENT_SECRET || '')

        const resp = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: params })
        if (resp.ok) {
          const j = await resp.json()
          const newToken = j.access_token
          const expiresIn = Number(j.expires_in || 3600)
          const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString()
          await supabase.from('connections').update({ access_token: newToken, expires_at: newExpiry, status: 'active', last_refreshed_at: new Date().toISOString() }).eq('id', connectionId)
          return { access_token: newToken, status: 'active' }
        }
        // non-ok -> treat as revoked
        await supabase.from('connections').update({ status: 'needs_reconnect' }).eq('id', connectionId)
        await supabase.from('automations').update({ health_status: 'needs_reconnect', paused_reason: 'Connection expired', plain_english_error: `Your ${connection.provider} connection needs reconnect. Click here to reconnect.` }).eq('user_id', connection.user_id)
        return { status: 'needs_reconnect' }
      }
      // Add other providers refresh logic here
    } catch (e) {
      await supabase.from('connections').update({ status: 'needs_reconnect' }).eq('id', connectionId)
      return { status: 'needs_reconnect' }
    }
  }

  // No refresh token available - require reconnect
  await supabase.from('connections').update({ status: 'needs_reconnect' }).eq('id', connectionId)
  return { status: 'needs_reconnect' }
}
