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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const planId = url.searchParams.get('planId')
    if (!planId) return res.status(400).json({ error: 'planId required' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: plan, error } = await supabase
      .from('automation_plans')
      .select('id, progress, current_run, total_runs, status')
      .eq('id', planId)
      .single()

    if (error) return res.status(404).json({ error: 'Plan not found' })

    return res.status(200).json({
      percent: plan.progress,
      currentRun: plan.current_run,
      totalRuns: plan.total_runs,
      status: plan.status,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}