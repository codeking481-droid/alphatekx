import { createClient } from '@supabase/supabase-js'
import { createBackgroundGenerationOutcome } from '../../../../src/lib/automation/backgroundGeneration.ts'
import { generateSchedule } from '../../../../src/lib/scheduling/nextPostCalculator'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

function getSupabase() {
  if (!url || !anonKey) return null
  return createClient(url, anonKey)
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const automationId = String(body.automationId || body.id || '')
  if (!automationId) return Response.json({ error: 'Missing automation id' }, { status: 400 })

  void (async () => {
    const supabase = getSupabase()
    const { data: automation, error: automationError } = await supabase?.from('automations').select('*').eq('id', automationId).single() ?? { data: null, error: new Error('No supabase client') }
    if (automationError || !automation) return

    const days = Array.isArray(automation.post_days) ? automation.post_days : [automation.post_days]
    const schedule = generateSchedule(days, automation.post_time || '09:00', 28, automation.timezone || 'Africa/Lagos')

    const postsTable = supabase?.from('posts')
    const automationTable = supabase?.from('automations')
    for (let index = 0; index < schedule.length; index += 1) {
      const scheduledFor = schedule[index]
      const topic = automation.topic || 'your business growth'
      const goal = automation.goal || 'Grow reach and trust'
      const audience = automation.audience || 'ideal audience'
      const tone = automation.tone || 'confident and professional'
      const length = (automation.post_length || 'medium') as 'short' | 'medium' | 'long'
      const outcome = await createBackgroundGenerationOutcome({
        topic,
        goal,
        audience,
        tone,
        length,
        platform: 'linkedin',
        index: index + 1,
        scheduledFor: scheduledFor,
      })
      const payload = {
        automation_id: automation.id,
        content: outcome.content,
        image_url: outcome.imageUrl,
        scheduled_for: outcome.scheduledFor,
        status: outcome.status,
        created_at: outcome.createdAt,
      }
      const insertResult = await postsTable?.insert(payload)
      if (insertResult?.error) continue
      await automationTable?.update({ progress: Math.round(((index + 1) / 28) * 100), updated_at: new Date().toISOString() }).eq('id', automation.id)
      await sleep(2000)
    }
  })()

  return Response.json({ ok: true, started: true })
}
