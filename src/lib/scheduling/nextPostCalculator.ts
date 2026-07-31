export function parsePostDays(postDays: number | number[] | string | string[] | undefined) {
  if (Array.isArray(postDays)) return postDays.map(value => Number(value)).filter(Number.isFinite)
  if (typeof postDays === 'number') return [postDays]
  if (typeof postDays === 'string') {
    const trimmed = postDays.trim()
    if (!trimmed) return []
    if (trimmed.includes(',')) return trimmed.split(',').map(value => Number(value.trim())).filter(Number.isFinite)
    const single = Number(trimmed)
    return Number.isFinite(single) ? [single] : []
  }
  return []
}

function parseTime(value: string) {
  const match = value.trim().match(/(\d{1,2})(?::(\d{2}))?/)
  if (!match) return { hour: 9, minute: 0 }
  const hour = Number(match[1])
  const minute = Number(match[2] || '0')
  return { hour: Math.min(23, Math.max(0, hour)), minute: Math.min(59, Math.max(0, minute)) }
}

function getPartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function normalizeDays(postDays: number | number[] | string | string[] | undefined) {
  const values = parsePostDays(postDays)
  if (!values.length) return [1, 2, 3, 4, 5]
  const normalized = values.map(value => ((value % 7) + 7) % 7)
  return Array.from(new Set(normalized))
}

export function calculateNextPost(postDays: number | number[] | string | string[] | undefined, postTime: string, timezone = 'Africa/Lagos'): Date {
  const days = normalizeDays(postDays)
  const { hour, minute } = parseTime(postTime)
  const now = new Date()
  const baseParts = getPartsInTimeZone(now, timezone)
  const candidateBase = new Date(Date.UTC(baseParts.year, baseParts.month - 1, baseParts.day, hour, minute, 0))
  const currentDay = (new Date(now).getUTCDay() + 6) % 7
  const target = new Date(candidateBase)

  for (let offset = 0; offset <= 14; offset += 1) {
    const cursor = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000)
    const parts = getPartsInTimeZone(cursor, timezone)
    const weekday = (new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() + 6) % 7
    if (!days.includes(weekday)) continue
    const candidate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, 0))
    if (candidate.getTime() >= now.getTime()) return candidate
  }

  const fallback = new Date(target)
  fallback.setUTCDate(fallback.getUTCDate() + 1)
  return fallback
}

export function generateSchedule(postDays: number | number[] | string | string[] | undefined, postTime: string, count: number, timezone = 'Africa/Lagos') {
  const results: Date[] = []
  const days = normalizeDays(postDays)
  const { hour, minute } = parseTime(postTime)
  let cursor = calculateNextPost(postDays, postTime, timezone)
  for (let index = 0; index < count; index += 1) {
    results.push(new Date(cursor))
    const nextDate = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    let found = false
    for (let offset = 0; offset <= 14; offset += 1) {
      const candidateDate = new Date(nextDate.getTime() + offset * 24 * 60 * 60 * 1000)
      const parts = getPartsInTimeZone(candidateDate, timezone)
      const weekday = (new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() + 6) % 7
      if (!days.includes(weekday)) continue
      cursor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, 0))
      found = true
      break
    }
    if (!found) {
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    }
  }
  return results
}