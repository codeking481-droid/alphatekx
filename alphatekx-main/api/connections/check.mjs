import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  const allowedOrigins = ['https://alphatekx.name.ng', 'https://www.alphatekx.name.ng', 'http://localhost:5173', 'http://localhost:3001']
  if (allowedOrigins.includes(origin) || origin.endsWith('.alphatekx.name.ng')) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const userId = url.searchParams.get('userId')
      const platformsParam = url.searchParams.get('platforms')
      if (!userId) return res.status(400).json({ error: 'userId required' })

      const platforms = platformsParam ? platformsParam.split(',') : []
      const results = {}

      for (const platform of platforms) {
        const { data: integration } = await supabase
          .from('user_integrations')
          .select('id, provider, email, updated_at')
          .eq('user_id', userId)
          .eq('provider', platform)
          .maybeSingle()

        results[platform] = {
          connected: !!integration,
          email: integration?.email || null,
          updatedAt: integration?.updated_at || null,
        }
      }

      return res.status(200).json({ results })
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const { platforms, userId } = body
      if (!userId || !platforms) return res.status(400).json({ error: 'userId and platforms required' })

      const results = {}
      for (const platform of platforms) {
        const { data: integration } = await supabase
          .from('user_integrations')
          .select('id, provider, email, access_token, updated_at')
          .eq('user_id', userId)
          .eq('provider', platform)
          .maybeSingle()

        results[platform] = {
          connected: !!integration,
          tokenValid: integration?.access_token ? integration.access_token.length > 10 : false,
          email: integration?.email || null,
        }
      }

      return res.status(200).json({ results })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}