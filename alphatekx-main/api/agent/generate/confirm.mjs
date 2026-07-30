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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { planId, userId } = body
    if (!planId) return res.status(400).json({ error: 'planId required' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Get plan
    const { data: plan, error: planError } = await supabase
      .from('automation_plans')
      .select('*')
      .eq('id', planId)
      .single()

    if (planError || !plan) return res.status(404).json({ error: 'Plan not found' })

    const totalRuns = plan.total_runs
    const posts = plan.posts || []

    // Create automation_runs
    const runs = []
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i]
      runs.push({
        plan_id: planId,
        run_number: post.runNumber,
        scheduled_at: post.date,
        per_platform_content: post.perPlatformContent,
        status: 'pending',
      })
    }

    if (runs.length > 0) {
      const { error: runsError } = await supabase.from('automation_runs').insert(runs)
      if (runsError) console.error('[Confirm] Error creating runs:', runsError)
    }

    // Update plan to active
    await supabase
      .from('automation_plans')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', planId)

    return res.status(200).json({
      success: true,
      planId,
      totalRuns,
      status: 'active',
    })
  } catch (error) {
    console.error('[Confirm] Error:', error)
    return res.status(500).json({ error: error.message })
  }
}