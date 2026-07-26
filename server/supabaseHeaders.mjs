export function isModernSupabaseSecret(value) {
  return String(value || '').trim().startsWith('sb_secret_')
}

export function supabaseServiceHeaders(serviceKey, extra = {}) {
  const key = String(serviceKey || '').trim()
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    ...extra,
  }

  // Legacy service-role keys are JWTs and must also be sent as Bearer tokens.
  // Supabase's modern sb_secret_* keys are API keys, not JWTs; sending one in
  // Authorization makes Auth and PostgREST reject otherwise valid requests.
  if (key && !isModernSupabaseSecret(key)) {
    headers.Authorization = `Bearer ${key}`
  }

  return headers
}
