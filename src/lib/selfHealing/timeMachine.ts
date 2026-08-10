import { SupabaseClient } from '@supabase/supabase-js'

export async function saveVersion(supabase: SupabaseClient, automationId: string) {
  const { data: automation } = await supabase.from('automations').select('*').eq('id', automationId).limit(1).single()
  if (!automation) return null
  const snapshot = {
    version: automation.version || 1,
    data: {
      topic: automation.topic,
      goal: automation.goal,
      post_days: automation.post_days,
      post_time: automation.post_time,
      platforms: automation.platforms,
      tone: automation.tone,
    },
    saved_at: new Date().toISOString(),
  }
  const prev = Array.isArray(automation.previous_versions) ? automation.previous_versions : []
  prev.unshift(snapshot)
  const trimmed = prev.slice(0, 10)
  const newVersion = (automation.version || 1) + 1
  await supabase.from('automations').update({ previous_versions: trimmed, version: newVersion }).eq('id', automationId)
  return { saved: true }
}

export async function rollbackToVersion(supabase: SupabaseClient, automationId: string, versionNumber: number) {
  const { data: automation } = await supabase.from('automations').select('*').eq('id', automationId).limit(1).single()
  if (!automation) return { ok: false, error: 'not_found' }
  const prev = Array.isArray(automation.previous_versions) ? automation.previous_versions : []
  const found = prev.find((v: any) => v.version === versionNumber)
  if (!found) return { ok: false, error: 'version_not_found' }
  const data = found.data || {}
  await supabase.from('automations').update({ ...data, version: (automation.version || 1) + 1, previous_versions: prev }).eq('id', automationId)
  return { ok: true }
}
