import { supabase } from '../../../../src/lib/supabase'

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const automationId = params.id
  if (!automationId) return Response.json({ ok: false, error: 'Missing automation id' }, { status: 400 })

  if (!supabase) return Response.json({ ok: true, progress: 0, posts: [] })

  const { data: automation, error: automationError } = await supabase.from('automations').select('id, progress, status').eq('id', automationId).single()
  if (automationError || !automation) return Response.json({ ok: false, error: 'Automation not found' }, { status: 404 })

  const { data: posts, error: postsError } = await supabase.from('posts').select('id, content, image_url, scheduled_for, status').eq('automation_id', automationId).order('scheduled_for', { ascending: true })
  if (postsError) return Response.json({ ok: false, error: postsError.message }, { status: 500 })

  return Response.json({ ok: true, progress: automation.progress || 0, status: automation.status || 'active', posts: posts || [] })
}
