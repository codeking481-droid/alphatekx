// Inspect GROQ-related env lines without printing full secrets.
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(join(root, '.env'), 'utf8')
const m = env.match(/^GROQ_API_KEY\s*=\s*(.+)$/m)
const key = m ? m[1].trim().replace(/^['"]|['"]$/g, '') : ''
if (!key) { console.log('NO KEY'); process.exit(1) }
console.log('key family:', key.startsWith('xai-') ? 'xAI' : key.startsWith('gsk_') ? 'Groq' : key.startsWith('sk-') ? 'OpenAI?' : 'unknown')

const base = key.startsWith('xai-') ? 'https://api.x.ai/v1' : 'https://api.groq.com/openai/v1'
console.log('listing models from:', base)
const res = await fetch(base + '/models', { headers: { Authorization: `Bearer ${key}` } })
console.log('status:', res.status)
const text = await res.text()
let data = {}
try { data = JSON.parse(text) } catch {}
const ids = (data.data || []).map((x) => x.id).sort()
if (!ids.length) console.log('body head:', text.slice(0, 300))
console.log(ids.length ? ids.join('\n') : '(no models listed)')