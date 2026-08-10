import { supabase } from '../../../../src/lib/supabase'
import { rollbackToVersion } from '../../../../src/lib/selfHealing/timeMachine'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}))
  const automationId = params.id || body.id
  const version = Number(body.version)
  if (!automationId || !version) return Response.json({ ok: false, error: 'missing_params' }, { status: 400 })
  try {
    const res = await rollbackToVersion(supabase, automationId, version)
    if (!res.ok) return Response.json({ ok: false, error: res.error }, { status: 400 })
    await supabase.from('workflow_runs').insert({ automation_id: automationId, workflow_id: automationId, status: 'success', plain_english_error: `Rolled back to version ${version}`, created_at: new Date().toISOString() })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
