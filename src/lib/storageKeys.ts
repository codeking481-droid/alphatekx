// ============================================================
// ALPHATEKX STORAGE KEYS — ALL KEYS USED BY THE APP
// Scorched-earth logout: clears every alphatekx key on logout
// so a new Gmail never sees stale data from previous user.
// Leaves non-alphatekx keys untouched.
// ============================================================

export const ALPHATEKX_STORAGE_KEYS = [
  // Auth
  'alphatekx:local-user',
  'alphatekx:current-user-id',
  'alphatekx:connected-platforms',
  'alphatekx:running-automation',
  'alphatekx:mature-wizard',
  'alphatekx:mature-wizard-done',
  'alphatekx:pending-google-signup',
  'alphatekx:pending-google-signup-plan',
  'alphatekx:local-user',
  'alphatekx:user',
  'alphatekx:token',
  'alphatekx:refreshToken',
  'alphatekx:session',
  'alphatekx:lastActivity',
  // Onboarding
  'alphatekx:has_seen_onboarding',
  // Chat & History
  'alphatekx:lastSiteUrl',
  'alphatekx:chat-history',
  'alphatekx:lastThread',
  'alphatekx:chatThreads',
  'alphatekx_chat_threads',
  'alphatekx_chat_threads:current',
  'alphatekx:chat-history',
  'alphatekx:hint-dismissed',
  // Payments / trial
  'alphatekx:pending-payment',
  'alphatekx:pending-payment:reference',
  'lastRef',
  'alphatekx:last-ref',
  'pendingPayment',
  'pendingPaymentUser',
  'alphatekx_freeCount',
  'alphatekx_plan',
  'alphatekx:plan',
  'alphatekx:lastSiteUrl',
  // Preferences
  'alphatekx:theme',
  'alphatekx:preferences',
  // Misc
  'alphatekx:connected-platforms',
]

/**
 * Clears ALL AlphaTekx-specific localStorage keys.
 * - Removes every exact key in ALPHATEKX_STORAGE_KEYS
 * - Removes any key that starts with alphatekx / sb- (Supabase auth)
 * - Removes per-user suffix keys like alphatekx:has_seen_onboarding:<uid>
 * - Removes legacy variants (with colon, underscore, hyphen)
 * Leaves keys from other apps untouched.
 */
export function clearAlphaTekxCache() {
  try {
    // 1. Exact list
    for (const key of ALPHATEKX_STORAGE_KEYS) {
      try { localStorage.removeItem(key) } catch {}
    }
    // 2. Prefix sweep — catch dynamic keys not in exact list
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key) continue
      const lower = key.toLowerCase()
      if (
        lower.startsWith('alphatekx') ||
        lower.startsWith('sb-') ||
        lower.startsWith('pendingpayment') ||
        lower.startsWith('lastref')
      ) {
        // sb- are Supabase auth for this app — safe to clear on logout
        toRemove.push(key)
      }
      // Also catch per-user onboarding suffix
      if (lower.startsWith('alphatekx:has_seen_onboarding')) toRemove.push(key)
      if (lower.startsWith('alphatekx:connected-platforms:')) toRemove.push(key)
    }
    for (const k of [...new Set(toRemove)]) {
      try { localStorage.removeItem(k) } catch {}
    }
  } catch {}
  try {
    // Clear session-scoped alphatekx keys
    const sessPrefixes = ['alphatekx', 'sb-']
    const sessRemove: string[] = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i)
      if (!key) continue
      const lower = key.toLowerCase()
      if (lower.startsWith('alphatekx') || lower.startsWith('sb-')) sessRemove.push(key)
    }
    for (const k of [...new Set(sessRemove)]) {
      try { sessionStorage.removeItem(k) } catch {}
    }
  } catch {}
}
