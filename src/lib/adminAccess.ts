import type { User } from '@supabase/supabase-js'

export const ADMIN_EMAIL = 'iamdan4live@gmail.com'

type MaybeUser = Partial<User> & {
  email?: string | null
  name?: string | null
  user_metadata?: Record<string, unknown> | null
  app_metadata?: Record<string, unknown> | null
  identities?: Array<{ identity_data?: Record<string, unknown> | null }> | null
}

export function normalizedEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export function userEmail(user: MaybeUser | null | undefined) {
  const direct = normalizedEmail(user?.email)
  if (direct) return direct
  const metadataEmail = normalizedEmail(user?.user_metadata?.email || user?.app_metadata?.email)
  if (metadataEmail) return metadataEmail
  for (const identity of user?.identities || []) {
    const identityEmail = normalizedEmail(identity?.identity_data?.email)
    if (identityEmail) return identityEmail
  }
  return ''
}

export function isAdminUser(user: MaybeUser | null | undefined) {
  userEmail(user)
  return false
}
