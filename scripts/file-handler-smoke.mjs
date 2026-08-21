import { FileHandler, sanitizeEncoding, validateHtml } from '../server/scanEngine/fileUtils.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let pass = 0, fail = 0
const check = (label, ok, extra = '') => { if (ok) { pass++; console.log('PASS', label) } else { fail++; console.log('FAIL', label, extra) } }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-test-'))
const file = path.join(dir, 'index.html')

// 1. Write + read roundtrip is UTF-8 clean
FileHandler.writeFile(file, '<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>Restored Site</title></head>\n<body><h1>Welcome</h1></body>\n</html>')
const back = FileHandler.readFile(file)
check('roundtrip valid', FileHandler.validateHTML(back))
check('roundtrip english', FileHandler.isEnglish(back))

// 2. BOM stripped on write and read
FileHandler.writeFile(file, '\uFEFF<!DOCTYPE html><html><body>BOM</body></html>')
const raw = fs.readFileSync(file, 'utf8')
check('BOM stripped on write', raw.charCodeAt(0) !== 0xFEFF)
check('readValidHtml accepts clean', FileHandler.readValidHtml(file, 'FALLBACK').includes('BOM'))

// 3. Null bytes (UTF-16 artifact) removed
const nul = sanitizeEncoding('<\u0000h\u0000tml\u0000>')
check('null bytes removed', !nul.includes('\u0000'))

// 4. CJK mojibake detected and rejected
const mojibake = '䭐Ѓ 엗点ߗ 湩敤⹸瑨汭ℼ佄呃偙⁅瑨汭'
check('isEnglish rejects CJK', !FileHandler.isEnglish(mojibake))
check('validateHTML rejects CJK', validateHtml(mojibake).valid === false)

// 5. readValidHtml falls back instead of serving garbage
fs.writeFileSync(file, mojibake, 'utf8')
check('readValidHtml fallback on garbage', FileHandler.readValidHtml(file, 'CLEAN_FALLBACK') === 'CLEAN_FALLBACK')

// 6. Valid English HTML passes validation
check('valid html accepted', validateHtml('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head><body>Hi</body></html>').valid === true)

fs.rmSync(dir, { recursive: true, force: true })
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
