import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const brainPath = fileURLToPath(new URL('../../docs/brain/alphatekx-brain.md', import.meta.url))

export const ALPHATEKX_BRAIN = readFileSync(brainPath, 'utf8')

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8,
  sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
}

function startOfUtcDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function calculateDaysUntilQuestion(message, now = new Date()) {
  const text = String(message || '').trim()
  if (!/\b(?:how many days|days (?:to|until|before|between))\b/i.test(text)) return null
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  const named = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i)
  let target
  if (iso) target = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))
  if (named) {
    const month = MONTHS[named[1].toLowerCase()]
    let year = named[3] ? Number(named[3]) : now.getUTCFullYear()
    target = new Date(Date.UTC(year, month, Number(named[2])))
    if (!named[3] && startOfUtcDay(target) < startOfUtcDay(now)) {
      year += 1
      target = new Date(Date.UTC(year, month, Number(named[2])))
    }
  }
  if (!target || Number.isNaN(target.getTime())) return null
  const days = Math.ceil((startOfUtcDay(target) - startOfUtcDay(now)) / 86_400_000)
  const label = target.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  return `There ${days === 1 ? 'is' : 'are'} **${days} day${days === 1 ? '' : 's'}** until ${label}.`
}

export function answerFromBrain(message, now = new Date()) {
  const text = String(message || '').trim()
  const dateAnswer = calculateDaysUntilQuestion(text, now)
  if (dateAnswer) return dateAnswer
  if (/\bwhat (?:does|is|do you mean by)\s+capture\b|\bmeaning of capture\b/i.test(text)) {
    return '“Capture” generally means to take or record a photo. In fashion, “capture this style” means to photograph or save a visual record of that style.'
  }
  if (/\bwhat (?:does|is)\s+tonebi\b|\bmeaning of tonebi\b/i.test(text)) {
    return '“Tonebi” is a founder-defined term, but its exact meaning has not been documented yet. Tell me the intended meaning once and I’ll use it accurately.'
  }
  if (/\b(?:what is|tell me about|explain)\s+alphatekx\b/i.test(text)) {
    return 'AlphaTekx is an AI Employee platform built by King Code. It understands the result you want, asks for missing details, prepares content and a plan, then executes approved work through connected tools and reports verified outcomes. “Tell AlphaTekx the result you want. Watch Alpha get it done.”'
  }
  return ''
}
