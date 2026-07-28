import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [app, help, layout, connectors, connectorApi, home, css] = await Promise.all([
  read('src/App.tsx'),
  read('src/pages/ContentPage.tsx'),
  read('src/components/workspace/WorkspaceLayout.tsx'),
  read('src/pages/Connectors.tsx'),
  read('src/lib/connectors/connectorApi.ts'),
  read('src/pages/Home.tsx'),
  read('src/index.css'),
])

const checks = [
  ['Help stays inside the authenticated workspace', app.includes('protectedPage(<ContentPage slug="help" workspace />)')],
  ['Help has a mobile-safe embedded layout', help.includes("workspace ? 'pb-28 pt-8 sm:py-12'")],
  ['mobile navigation uses five equal columns without fixed item widths', layout.includes('grid-cols-5') && layout.includes('min-w-0 flex-col')],
  ['workspace content prevents horizontal overflow', layout.includes('overflow-x-hidden')],
  ['dashboard Connect starts OAuth in one click', home.includes('autostart=1')],
  ['native and Composio status failures are isolated', connectors.includes('Promise.allSettled')],
  ['connector status has a bounded deadline', connectors.includes('withDeadline(getIntegrationStatus') && connectorApi.includes('timeoutMs: 12_000')],
  ['connection cache includes native and Composio state', connectors.includes('native: nativeValue')],
  ['mobile form controls avoid iOS zoom', css.includes(':where(input, textarea, select) { font-size: 16px; }')],
]

for (const [name, passed] of checks) {
  assert.equal(passed, true, name)
  console.log(`PASS ${name}`)
}
console.log(`${checks.length}/${checks.length} mobile/help/connector checks passed.`)
