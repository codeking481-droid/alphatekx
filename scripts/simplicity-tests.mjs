import assert from 'node:assert/strict'
import fs from 'node:fs'
import { calendarHasDuplicates, contentFingerprint, contentSimilarity, createContentMemoryRecord, findDuplicate } from '../server/automation/contentMemory.mjs'
import { buildImagePrompt, generateImage, listImageProviders } from '../server/automation/imageGateway.mjs'

const results = []
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }) }
  catch (error) { results.push({ name, ok: false, error: error.message }) }
}
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

await test('Automate workspace has a focused empty state and persistent planning state', () => {
  const source = read('src/pages/Agents.tsx')
  assert.match(source, /What would you like Alpha to automate/)
  assert.match(source, /alphatekx:planning-conversation/)
  assert.doesNotMatch(source, /Success rate/)
})

await test('Creation success persists and View Automation targets the exact record', () => {
  const source = read('src/pages/Agents.tsx')
  assert.match(source, /Automation created successfully/)
  assert.match(source, /active-automations\/\$\{success\.id\}/)
  assert.match(source, /Visit Automation/)
  assert.doesNotMatch(source, /Start another automation/)
})

await test('Official Active Automations routes and retired aliases are registered', () => {
  const source = read('src/App.tsx')
  assert.match(source, /path="\/active-automations"/)
  assert.match(source, /path="\/active-automations\/:id"/)
  assert.match(source, /path="\/builder" element=\{toDashboard\}/)
})

await test('Navigation uses the required simplicity-first wording', () => {
  const source = read('src/components/workspace/WorkspaceLayout.tsx')
  for (const label of ['Automate', 'Active Automations', 'History', 'Connected Apps', 'Settings', 'Help', 'Logout']) assert.match(source, new RegExp(label))
  assert.doesNotMatch(source, /\['Dashboard'/)
})

await test('Active Automations maps empty history honestly', () => {
  const source = read('src/pages/ActiveAutomations.tsx')
  assert.match(source, /No runs yet/)
  assert.match(source, /Needs Attention/)
  assert.match(source, /server/)
})

await test('Connected Apps has searchable selection and honest unsupported labels', () => {
  const source = read('src/pages/Connectors.tsx')
  assert.match(source, /Search platforms/)
  assert.match(source, /Coming Soon/)
  assert.match(source, /already|Connected/i)
  assert.match(source, /Disconnect/)
})

await test('Exact content duplicates are prevented', () => {
  const content = 'A useful post about reliable automation. What would you automate? #AI'
  const memory = [{ content, contentFingerprint: contentFingerprint(content), hook: 'A useful post about reliable automation.' }]
  assert.equal(findDuplicate(content, memory).reason, 'exact_content')
})

await test('Near duplicate content is detected', () => {
  const original = 'Founders can save time with reliable business automation and clear approval controls.'
  const similar = 'Reliable business automation with clear approval controls can save founders valuable time.'
  assert.ok(contentSimilarity(original, similar) >= 0.7)
  assert.equal(findDuplicate(similar, [{ content: original, contentFingerprint: contentFingerprint(original) }], 0.7).duplicate, true)
})

await test('Different topics remain allowed', () => {
  const memory = [{ content: 'Python variables store values for later use.', contentFingerprint: contentFingerprint('Python variables store values for later use.') }]
  assert.equal(findDuplicate('Debugging Python starts by reading the traceback from the bottom.', memory).duplicate, false)
})

await test('Repeated hooks are detected across otherwise different posts', () => {
  const previous = 'Manual work should not control your day.\n\nUse a clear weekly plan.'
  const next = 'Manual work should not control your day.\n\nHere is a different lesson about scheduling.'
  assert.equal(findDuplicate(next, [{ content: previous, contentFingerprint: contentFingerprint(previous) }]).reason, 'repeated_hook')
})

await test('A generated calendar rejects duplicates but accepts distinct entries', () => {
  const duplicate = calendarHasDuplicates([{ captions: { linkedin: 'Same hook\n\nSame body' } }, { captions: { linkedin: 'Same hook\n\nSame body' } }])
  assert.equal(duplicate.duplicate, true)
  const distinct = calendarHasDuplicates([{ captions: { linkedin: 'Variables make values reusable.' } }, { captions: { linkedin: 'Tracebacks guide Python debugging.' } }])
  assert.equal(distinct.duplicate, false)
})

await test('Published memory includes provider and automation scope', () => {
  const record = createContentMemoryRecord({ automationId: 'automation-a', platform: 'linkedin', content: 'A confirmed post #Automation', post: { providerPostId: 'urn:li:share:1', postedAt: '2026-07-23T20:30:00.000Z' }, creditsUsed: 3 })
  assert.equal(record.automationId, 'automation-a')
  assert.equal(record.providerPostId, 'urn:li:share:1')
  assert.equal(record.creditsUsed, 3)
  assert.ok(record.contentFingerprint)
})

await test('Image prompt uses mission, brand and previous concepts safely', () => {
  const prompt = buildImagePrompt({ mission: 'Teach Python', audience: 'Beginners', tone: 'Calm', brand: { preferredColors: 'purple' }, previousConcepts: ['laptop on a desk'] })
  assert.match(prompt, /Teach Python/)
  assert.match(prompt, /purple/)
  assert.match(prompt, /Avoid these previous concepts/)
})

await test('Unconfigured image provider fails without becoming chargeable', async () => {
  assert.deepEqual(listImageProviders(), [])
  await assert.rejects(async () => generateImage({ mission: 'Test' }), error => error.code === 'IMAGE_PROVIDER_UNAVAILABLE' && error.chargeable === false)
})

await test('History says No runs yet and only describes provider-confirmed activity', () => {
  const source = read('src/pages/History.tsx')
  assert.match(source, /No runs yet/)
  assert.match(source, /provider confirms/)
  assert.doesNotMatch(source, /100%/)
})

const failed = results.filter(result => !result.ok)
console.log('SIMPLICITY_TESTS:')
for (const result of results) console.log(`- ${result.ok ? 'PASS' : 'FAIL'}: ${result.name}${result.error ? ` — ${result.error}` : ''}`)
console.log(`- Total: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}`)
if (failed.length) process.exit(1)
console.log('SIMPLICITY_TESTS_OK')
