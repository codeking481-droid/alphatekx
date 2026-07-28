import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const css = fs.readFileSync('src/index.css', 'utf8')
const app = fs.readFileSync('src/App.tsx', 'utf8')
const billing = fs.readFileSync('src/lib/billing.ts', 'utf8')

const files = []
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) collect(target)
    else if (/\.(?:tsx?|css|m?js)$/.test(entry.name)) files.push(target)
  }
}
collect('src')
const source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n')

assert.match(css, /--bg-base:\s*#0A0F1E/)
for (const color of ['#06FFA5', '#3B82F6', '#8B5CF6', '#7C3AED']) assert.ok(css.includes(color))
assert.match(css, /body\s*\{[^}]*background:\s*var\(--bg-base\)\s*!important/s)
assert.equal((app.match(/aurora-blob aurora-blob-/g) || []).length, 3)
assert.match(css, /backdrop-filter:\s*blur\(20px\)/)
assert.match(css, /linear-gradient\(90deg,\s*transparent,\s*rgba\(6,255,165/)
assert.match(css, /scrollbar-color/)
assert.doesNotMatch(source, /#000000|bg-black|rgb\(0\s*,\s*0\s*,\s*0\s*\)/)
for (const price of ['1500', '2900', '7900']) assert.match(billing, new RegExp(`priceKobo:\\s*${price}`))

console.log('PLATFORM_RECOLOUR_TESTS_OK')
