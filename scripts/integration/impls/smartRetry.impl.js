export async function executeWithSelfHealing(supabase, automation, taskFn, provider = '') {
  const backoffs = [10, 20, 50] // fast for tests
  let attempt = 0
  const maxAttempts = backoffs.length

  while (attempt <= maxAttempts) {
    try {
      const result = await taskFn()
      try {
        await supabase.from('workflow_runs').insert({ automation_id: automation.id, workflow_id: automation.id, user_id: automation.user_id || null, status: 'success', retry_count: attempt, created_at: new Date().toISOString() })
        await supabase.from('automations').update({ health_status: 'healthy', last_error: null, plain_english_error: null }).eq('id', automation.id)
      } catch (e) {}
      return result
    } catch (e) {
      attempt += 1
      const message = String(e instanceof Error ? e.message : e)
      const isAuth = /401|403|unauthori|invalid_grant|token expired/i.test(message)
      const isRate = /429|rate limit|too many requests/i.test(message)
      const isServer = /5\d{2}|502|503|504/i.test(message)

      try {
        await supabase.from('workflow_runs').insert({ automation_id: automation.id, workflow_id: automation.id, user_id: automation.user_id || null, status: attempt >= maxAttempts ? 'failed_needs_attention' : 'failed', error: message, plain_english_error: isAuth ? `Reconnect` : (isRate ? `Rate limited` : message), retry_count: attempt, created_at: new Date().toISOString() })
      } catch (er) {}

      if (isAuth || (!isRate && !isServer && attempt >= maxAttempts)) {
        try { await supabase.from('automations').update({ health_status: isAuth ? 'needs_reconnect' : 'needs_attention', last_error: message, plain_english_error: isAuth ? 'Reconnect' : message, status: 'paused' }).eq('id', automation.id) } catch (er) {}
        throw new Error(isAuth ? 'Reconnect required' : 'Needs attention')
      }

      if (attempt >= maxAttempts) {
        try { await supabase.from('automations').update({ health_status: 'needs_attention', last_error: message, plain_english_error: message }).eq('id', automation.id) } catch (er) {}
        throw new Error('Retry exhausted')
      }

      const wait = backoffs[Math.min(attempt - 1, backoffs.length - 1)] || 10
      await new Promise(r => setTimeout(r, wait))
    }
  }
}

export default executeWithSelfHealing
