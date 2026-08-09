import { SupabaseClient } from '@supabase/supabase-js'
import { checkLoopGuard, pauseForLoop } from './loopGuard'
import { translateError } from './errorTranslator'

export async function executeWithSelfHealing(
  supabase: SupabaseClient,
  automation: any,
  taskFn: () => Promise<any>,
  provider = '',
): Promise<any> {
  const backoffs = [5000, 30000, 300000] // 5s, 30s, 5min
  let attempt = 0
  const maxAttempts = backoffs.length

  while (attempt <= maxAttempts) {
    try {
      // Loop guard
      try {
        const loop = await checkLoopGuard(supabase, automation.id)
        if (loop.isLoop) {
          await pauseForLoop(supabase, automation.id, loop.count)
          throw new Error(loop.message || 'Loop detected')
        }
      } catch (e) {
        // ignore loop guard failures
      }

      const result = await taskFn()
      // Log success
      try {
        await supabase.from('workflow_runs').insert({ automation_id: automation.id, workflow_id: automation.id, user_id: automation.user_id || null, status: 'success', retry_count: attempt, created_at: new Date().toISOString() })
        await supabase.from('automations').update({ health_status: 'healthy', last_error: null, plain_english_error: null }).eq('id', automation.id)
      } catch (e) {
        // ignore logging errors
      }
      return result
    } catch (e: any) {
      attempt += 1
      const translated = translateError(e, provider)
      // Record run
      try {
        await supabase.from('workflow_runs').insert({ automation_id: automation.id, workflow_id: automation.id, user_id: automation.user_id || null, status: attempt >= maxAttempts ? 'failed_needs_attention' : 'failed', error: String(e?.message || e), plain_english_error: translated.plainEnglish, retry_count: attempt, created_at: new Date().toISOString() })
      } catch (er) {
        // ignore
      }

      if (!translated.shouldRetry || attempt >= maxAttempts) {
        // Pause and surface to user
        await supabase.from('automations').update({ health_status: translated.action === 'needs_reconnect' ? 'needs_reconnect' : 'needs_attention', last_error: String(e?.message || e), plain_english_error: translated.plainEnglish, status: translated.action === 'needs_reconnect' ? 'paused' : 'paused' }).eq('id', automation.id)
        throw new Error(translated.plainEnglish)
      }

      // Wait backoff then retry
      const wait = backoffs[Math.min(attempt - 1, backoffs.length - 1)]
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, wait))
      // continue
    }
  }
}
