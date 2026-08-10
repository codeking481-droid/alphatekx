export async function ensureValidToken(supabase, connectionId) {
  // test shim: read connection row and simulate refresh
  const conn = (await supabase.from('connections').select?.('*').eq?.('id', connectionId)) || null
  if (!conn) return { status: 'missing' }
  const row = conn[0] || {}
  if (!row.refresh_token) {
    // mark needs_reconnect
    try { await supabase.from('connections').update({ status: 'needs_reconnect' }).eq('id', connectionId) } catch (e) {}
    return { status: 'needs_reconnect' }
  }
  // simulate refresh success
  const newAccess = `access-${Date.now()}`
  try { await supabase.from('connections').update({ access_token: newAccess, expires_at: Date.now() + 3600 * 1000 }).eq('id', connectionId) } catch (e) {}
  return { access_token: newAccess, status: 'ok' }
}

export default ensureValidToken
