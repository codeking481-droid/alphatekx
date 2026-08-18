import { classifyIntent, describeCapabilityMatch, detectCapability } from '../../../lib/platforms/capabilities'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const message = String(body.message || body.text || '')
  const context = typeof body.context === 'object' && body.context !== null ? body.context : {}

  if (!message.trim()) {
    return Response.json({ error: 'Missing message in request body' }, { status: 400 })
  }

  const classification = classifyIntent(message, context)
  const capability = detectCapability(message)
  const capabilityMatch = describeCapabilityMatch(message)
  const response = {
    message,
    classification,
    capability: capability
      ? {
          id: capability.id,
          name: capability.name,
          description: capability.description,
          supported: capability.supported,
          requiredConnectors: capability.requiredConnectors,
        }
      : null,
    capabilityMatch: capabilityMatch
      ? {
          score: capabilityMatch.score,
          matchedPatterns: capabilityMatch.matchedPatterns,
        }
      : null,
  }

  return Response.json(response)
}
