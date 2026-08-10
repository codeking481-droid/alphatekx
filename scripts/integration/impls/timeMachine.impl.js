export async function saveVersion(supabase, automationId, data) {
  try {
    await supabase.from('automations_versions').insert({ automation_id: automationId, data, created_at: new Date().toISOString() })
    return { ok: true }
  } catch (e) { return { ok: false, error: String(e) } }
}

export async function rollbackToVersion(supabase, automationId, versionId) {
  const rows = await supabase.from('automations_versions').select?.('*').eq?.('id', versionId) || []
  const row = rows[0]
  if (!row) throw new Error('version not found')
  // simulate restoring
  await supabase.from('automations').update?.(row.data).eq?.('id', automationId)
  return { ok: true, restored: row.data }
}

export default { saveVersion, rollbackToVersion }
