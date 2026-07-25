import { handleReality } from '../server.mjs'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const result = await handleReality(String(body.idea || body.prompt || ''))
    return res.status(200).json(result)
  } catch { return res.status(500).json({ error: 'Mission planning failed.' }) }
}
