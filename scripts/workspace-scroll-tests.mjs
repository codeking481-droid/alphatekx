import assert from 'node:assert/strict'
import fs from 'node:fs'

const layout = fs.readFileSync(new URL('../src/components/workspace/WorkspaceLayout.tsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

assert.match(layout, /h-\[100dvh\] min-h-0 flex-col overflow-hidden/, 'workspace must have a bounded viewport height')
assert.match(layout, /id="workspace-scroll-root"[\s\S]*overflow-y-auto[\s\S]*scroll-smooth/, 'workspace content must own a smooth vertical scroll area')
assert.match(layout, /-webkit-overflow-scrolling:touch/, 'mobile workspace scrolling must retain touch momentum')
assert.match(css, /html \{[\s\S]*scroll-behavior: smooth;[\s\S]*overflow-y: auto;/, 'public pages must scroll smoothly')
assert.doesNotMatch(css, /\* \{ transform: translateZ\(0\); \}/, 'global transforms must not break fixed and sticky layouts')

console.log('WORKSPACE_SCROLL_TESTS_OK')
