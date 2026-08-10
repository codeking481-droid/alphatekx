import { supabase } from '../../../src/lib/supabase'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const connectionId = String(body.connectionId || '')
  if (!connectionId) return Response.json({ ok: false, error: 'missing_connectionId' }, { status: 400 })

  // In a real flow this would redirect to provider OAuth; here we mark as reconnected for demo
  try {
    await supabase.from('connections').update({ status: 'active', last_refreshed_at: new Date().toISOString() }).eq('id', connectionId)
    await supabase.from('automations').update({ status: 'active', health_status: 'healthy', paused_reason: null, plain_english_error: null }).eq('user_id', (await supabase.from('connections').select('user_id').eq('id', connectionId).single()).data?.user_id)
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
