import assert from 'node:assert/strict'
import fs from 'node:fs'
import { scheduleDistanceMultiplier, scheduledCreditCost } from '../server/schedulePricing.mjs'

const read = file => fs.readFileSync(file, 'utf8')
const connectors = read('src/pages/Connectors.tsx')
const layout = read('src/components/workspace/WorkspaceLayout.tsx')
const css = read('src/index.css')
const billing = read('server/billing.mjs')
const server = read('server.mjs')
const engine = read('server/alpha/conversationEngine.mjs')
const now = new Date('2026-01-01T00:00:00Z')
const after = days => new Date(now.getTime() + days * 86_400_000)

const checks = [
  ['only six production connector cards are defined', (connectors.match(/id: '(linkedin|instagram|facebook|x|youtube|whatsapp)'/g) || []).length === 6],
  ['LinkedIn stays native', connectors.includes("id === 'linkedin'") && connectors.includes('startLinkedInAuth')],
  ['connection cache is five minutes', connectors.includes('alphatekx_connections_cache') && connectors.includes('5 * 60_000')],
  ['connection UI bounds slow-network waiting', connectors.includes('10_000') && connectors.includes('Network slow?') && connectors.includes('Retry connection')],
  ['WhatsApp explains WABA and permits skipping', connectors.includes('15-digit WABA ID') && connectors.includes('I don’t have one — Skip')],
  ['living indigo theme has three auroras and no pure-black X card', css.includes('#0A0F1E') && css.includes('#06FFA5') && css.includes('#3B82F6') && css.includes('#8B5CF6') && !connectors.includes('#000000')],
  ['mobile active navigation uses purple pill', layout.includes("bg-[#7C3AED] text-white")],
  ['pricing tiers and packs are unchanged', billing.includes("name: 'Starter'") && billing.includes('priceKobo: 1500') && billing.includes('priceKobo: 2900') && billing.includes('priceKobo: 7900') && billing.includes("id: 'spark_5'") && billing.includes("id: 'scale_100'")],
  ['distance multipliers match boundaries', scheduleDistanceMultiplier(after(30), now) === 1 && scheduleDistanceMultiplier(after(60), now) === 1.5 && scheduleDistanceMultiplier(after(365), now) === 2 && scheduleDistanceMultiplier(after(700), now) === 3 && scheduleDistanceMultiplier(after(1825), now) === 5],
  ['fractional costs round up safely', scheduledCreditCost(1, after(60), now) === 2],
  ['server and conversation engine enforce pricing', server.includes('scheduledCreditCost') && engine.includes('scheduledCreditCost')],
  ['offline queue and Sites value are visible', connectors.includes('phone is off') && connectors.includes('Paste HTML to host a site')],
]

for (const [name, ok] of checks) {
  assert.equal(ok, true, name)
  console.log(`PASS ${name}`)
}
console.log(`${checks.length}/${checks.length} Home Edition checks passed.`)
