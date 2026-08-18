import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const viteEnv = (import.meta as ImportMeta & { env?: Record<string,string|undefined> }).env ?? {}
const url = viteEnv.VITE_SUPABASE_URL?.trim()
const anonKey = viteEnv.VITE_SUPABASE_ANON_KEY?.trim()

export const isSupabaseConfigured = Boolean(url && anonKey)
export const supabase: SupabaseClient | null = url && anonKey
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        storageKey: 'sb-alphatekx-auth',
        flowType: 'pkce',
      },
    })
  : null
