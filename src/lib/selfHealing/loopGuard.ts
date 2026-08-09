import { SupabaseClient } from '@supabase/supabase-js'

export async function checkLoopGuard(supabase: SupabaseClient, workflowId: string, threshold = 20, windowSec = 60): Promise<{ isLoop: boolean; count: number; message?: string }> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - windowSec * 1000)
  try {
    const res = await supabase
      .from('workflow_runs')
      .select('id', { count: 'exact', head: true })
      .eq('workflow_id', workflowId)
      .gte('created_at', windowStart.toISOString())

    // Supabase returns { count } on head query
    // @ts-ignore
    const count = (res as any)?.count || 0
    if (count >= threshold) {
      const message = `Loop detected! ${count} runs in ${windowSec}s. Paused to save credits.`
      return { isLoop: true, count, message }
    }
    return { isLoop: false, count }
  } catch (err) {
    return { isLoop: false, count: 0 }
  }
}

export async function pauseForLoop(supabase: SupabaseClient, automationId: string, count: number) {
  await supabase
    .from('automations')
    .update({
      status: 'paused',
      health_status: 'paused_loop',
      paused_reason: `Loop detected: ${count} runs in 60s - auto paused to save credits`,
      plain_english_error: `Omo this na loop? I pause am to save your money. You had ${count} runs in 60 seconds. Click Resume when fixed.`,
    })
    .eq('id', automationId)

  // Optional: create a notification row if notifications table exists, otherwise console.log
  try {
    await supabase.from('notifications').insert({ automation_id: automationId, message: `Loop detected: ${count} runs in 60s. Automation paused.`, created_at: new Date().toISOString() })
  } catch (e) {
    // fallback
    // eslint-disable-next-line no-console
    console.log('[loopGuard] paused automation', automationId, 'count', count)
  }
  return { paused: true }
}
