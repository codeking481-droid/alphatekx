#!/usr/bin/env node
/**
 * ALPHATEKX HTML RESURRECTOR — regression test against the exact "completely
 * broken website" fixture from the debugging session.
 *
 * Run with:  node scripts/resurrect-test.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { repairBrokenHtml, _internals } from '../server/htmlResurrector.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

let passed = 0
let failed = 0
const failures = []
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; failures.push(name); console.error(`  ✖ ${name}${detail ? ` :: ${detail}` : ''}`) }
}

const BROKEN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔥 Completely Broken Website for Testing</title>
    <link rel="stylesheet" href="https://this-stylesheet-does-not-exist-1234567890.com/style.css">
    <link rel="icon" href="https://this-domain-is-fake-1234567890.com/favicon.ico">
    <style>
        /* UNCLOSED COMMENT - breaks everything after */
        /* This comment is NEVER closed 
        body {
            background: #f0f0f0;
            font-family: 'Comic Sans MS', 'Chalkboard SE', sans-serif;
            margin: 0;
            padding: 0;
        }
        .header {
            background: #ff6b6b;
            color: white;
            padding: 2rem;
            text-align: center;
            font-size: 2rem
        }
        .content {
            max-width: 800px
            margin: 0 auto
            padding: 2rem
            background: white
        }
        .footer {
            background: #333;
            color: white;
            padding: 1rem;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>💥 This Site is Completely Broken</h1>
        <p style="color: #ffd93d; font-size: 1.5rem;">There are errors EVERYWHERE!</p>
    <div class="content">
        <img src="https://this-image-does-not-exist-1234567890.com/image.png" alt="Broken image" width="100%">
        <video controls width="100%">
            <source src="https://this-video-does-not-exist-1234567890.com/video.mp4" type="video/mp4">
            Your browser doesn't support video.
        </video>
        <audio controls>
            <source src="https://this-audio-does-not-exist-1234567890.com/audio.mp3" type="audio/mpeg">
        </audio>
        <iframe src="https://this-domain-is-completely-fake-1234567890.com" width="100%" height="300"></iframe>
        <script>
            console.log("This string is never closed);
            document.querySelector('.header').addEventListener('click', function() {
                alert('Header clicked!');
            undefinedFunction();
            for (let i = 0; i < 10; i++ {
                console.log(i)
            const obj = { 
                name: 'broken',
                value: 'test'
            console.log(obj.name)
            console.log(undefinedVariable);
        </script>
        <table style="width:100%; border:3px solid #ff6b6b;">
            <tr>
                <th>Error Type</th><th>Status</th>
            </tr>
            <tr>
                <td>HTML Validation<td>BROKEN</td>
            <tr>
                <td>CSS<td>Missing braces</td>
        </table>
        <form action="https://this-form-handler-is-fake.com" method="POST" novalidate>
            <input type="email" name="email" placeholder="Enter email" required invalid-attribute>
            <button type="submit" onclick="return false;">Submit</button>
        </form>
        <button onclick="brokenFunctionThatDoesNotExist()">Click Me - It Crashes!</button>
        <a href="https://this-link-does-not-exist-1234567890.com">Broken Link</a>
        <meta http-equiv="refresh" content="0; url=https://this-page-does-not-exist.com">
        <p>This paragraph is never closed
        <ul>
            <li>Item 1
            <li>Item 2
            <li>Item 3
        <img src="https://http.cat/404">
        <img src="https://this-image-does-not-exist-1234567890.com/second.png" alt="MISSING ALT ON ANOTHER">
        <iframe src="http://insecure-http-site.com" width="100%" height="200"></iframe>
        <div id="duplicate">First duplicate</div>
        <div id="duplicate">Second duplicate</div>
        <a href="">Empty link</a>
        <script src="https://this-script-does-not-exist-1234567890.com/script.js"></script>
        <script src="http://insecure-http-script.com/insecure.js"></script>
        <object data="https://this-object-does-not-exist.com/object.swf" width="100%" height="200"></object>
        <embed src="https://this-embed-does-not-exist.com/embed.swf" width="100%" height="200">
        <div aria-label="Label" aria-labelledby="nonexistent" aria-describedby="doesntexist"></div>
        <script src="https://example.com/script.js" />
        <script>
            webpackJsonp([]);
            undefinedVariable.some = 1;
        </script>
    <div class="footer">
        <p>© 2025 Broken Corp. All rights reserved? Not really.
</body>
</html>`

function stripStyleBlocks(html) {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])
}

function inlineScripts(html) {
  const out = []
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(m[1])) continue
    if (/application\/(?:ld\+json|json)/i.test(m[1])) continue
    out.push(m[2])
  }
  return out
}

function count(html, re) { return (html.match(re) || []).length }

const result = await repairBrokenHtml(BROKEN_HTML, {
  baseUrl: 'https://broken-site.example.test/',
  allowNetwork: false,
})
const { html: FIXED, tally } = result

console.log('--- Repair tally ---')
console.log(JSON.stringify(tally, null, 2))
console.log('--- Assertions ---')

// 1) It actually changed the document.
check('document was transformed', FIXED !== BROKEN_HTML)

// 2) CSS: every comment closed + balanced braces inside <style> blocks.
{
  const countCssUnclosed = (css) => {
    let n = 0
    const re = /\/\*/g
    let m
    while ((m = re.exec(css))) if (css.indexOf('*/', m.index + 2) === -1) n++
    return n
  }
  const bad = stripStyleBlocks(FIXED).filter((css) => countCssUnclosed(css))
  check('no unclosed /* in any <style> block', bad.length === 0)
  const first = stripStyleBlocks(FIXED)[0]
  if (first != null) check('CSS braces balanced', count(first, /\{/g) === count(first, /\}/g) && count(first, /\{/g) > 0)
}

// 3) Every inline <script> now parses.
{
  const list = inlineScripts(FIXED)
  let allOk = list.length > 0
  for (const code of list) {
    try { new Function(code) } catch { allOk = false }
  }
  check(`all ${list.length} inline scripts parse`, allOk)
}

// 4) The crashing / dead calls are GONE.
check('undefinedFunction() removed', !/undefinedFunction\s*\(/.test(FIXED))
check('brokenFunctionThatDoesNotExist removed', !/brokenFunctionThatDoesNotExist\s*\(/.test(FIXED))
check('webpackJsonp call removed', !/webpackJsonp\s*\(/.test(FIXED))
check('undefinedVariable removed', !/\bundefinedVariable\b/.test(FIXED))

// 5) Dead external assets removed.
for (const host of [
  'this-stylesheet-does-not-exist', 'this-domain-is-fake', 'this-image-does-not-exist',
  'this-video-does-not-exist', 'this-audio-does-not-exist', 'this-domain-is-completely-fake',
  'this-script-does-not-exist', 'this-object-does-not-exist', 'this-embed-does-not-exist',
]) {
  check(`no dead asset reference (${host})`, !FIXED.includes(host))
}

// 6) The off-site redirect meta is gone.
check('off-site <meta refresh> removed', !/<meta[^>]+http-equiv\s*=\s*["']refresh["']/i.test(FIXED))

// 7) Duplicate id repaired.
check('duplicate id fixed', count(FIXED, /\bid="duplicate"/g) === 1 && /id="duplicate-2"/.test(FIXED))

// 8) Empty href gone.
check('no empty <a href="">', !/<a\b[^>]*href\s*=\s*["']\s*["']/i.test(FIXED))

// 9) ARIA refs to missing ids removed.
check('aria refs to missing ids removed', !/(aria-labelledby|aria-describedby)\s*=\s*["'](nonexistent|doesntexist)["']/i.test(FIXED))

// 10) Structural balance — open/close tags.
for (const [name, oRe, cRe] of [
  ['<div>', /<div\b/gi, /<\/div>/gi],
  ['<table>', /<table\b/gi, /<\/table>/gi],
  ['<tr>', /<tr\b/gi, /<\/tr>/gi],
  ['<li>', /<li\b/gi, /<\/li>/gi],
  ['<p>', /<p\b/gi, /<\/p>/gi],
]) {
  const o = count(FIXED, oRe); const c = count(FIXED, cRe)
  check(`${name} balanced`, o === c, `open=${o} close=${c}`)
}

// 11) Self-closing script corrected to a real (paired) tag.
check('self-closing <script/> repaired', !/<script[^>]*\/\s*>/.test(FIXED))

// 12) tally proves repair work happened.
check('tally: CSS repairs', tally.css_repaired >= 1, `css_repaired=${tally.css_repaired}`)
check('tally: JS repairs', tally.js_sanitized + tally.js_reconstructed + tally.js_guarded + tally.js_removed >= 1)
check('tally: dead assets removed', tally.dead_assets_removed >= 3, `removed=${tally.dead_assets_removed}`)
check('tally: normalization happened', tally.html_normalized === true)

writeFileSync(join(__dirname, '..', 'data', 'resurrect-verified.html'), FIXED)
console.log('')
console.log('RESULT:', `${passed} passed, ${failed} failed`)
if (failed) {
  console.log('FAILED:', failures.join(', '))
  process.exit(1)
}