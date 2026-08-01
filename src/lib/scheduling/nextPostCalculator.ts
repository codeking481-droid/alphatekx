const DAY_NAME_TO_NUMBER: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
}

function parseDayToken(value: string | number | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) return ((value % 7) + 7) % 7
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    if (!trimmed) return NaN
    if (trimmed in DAY_NAME_TO_NUMBER) return DAY_NAME_TO_NUMBER[trimmed]
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric)) return ((numeric % 7) + 7) % 7
  }
  return NaN
}

export function parsePostDays(postDays: number | number[] | string | string[] | undefined) {
  if (Array.isArray(postDays)) return postDays.map(value => parseDayToken(value)).filter(Number.isFinite)
  if (typeof postDays === 'number') return [parseDayToken(postDays)].filter(Number.isFinite)
  if (typeof postDays === 'string') {
    const trimmed = postDays.trim()
    if (!trimmed) return []
    const parts = trimmed.includes(',') ? trimmed.split(',').map(value => value.trim()) : [trimmed]
    return parts.map(value => parseDayToken(value)).filter(Number.isFinite)
  }
  return []
}

function parseTime(value: string) {
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i)
  if (!match) return { hour: 9, minute: 0 }
  let hour = Number(match[1])
  const minute = Number(match[2] || '0')
  const modifier = (match[3] || '').toUpperCase()
  if (modifier === 'PM' && hour < 12) hour += 12
  if (modifier === 'AM' && hour === 12) hour = 0
  return { hour: Math.min(23, Math.max(0, hour)), minute: Math.min(59, Math.max(0, minute)) }
}

export function getPartsInTimeZone(date: Date, timeZone: string) {
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

function localDateTimeToUtc(date: string, time: string, timeZone = 'UTC') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^\d{2}:\d{2}$/.test(String(time))) {
    throw new Error('Choose a valid date and exact time')
  }
  const [year, month, day] = String(date).split('-').map(Number)
  const [hour, minute] = String(time).split(':').map(Number)
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0)
  if (timeZone === 'UTC') return new Date(desired)
  let candidate = desired
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(candidate)).map(part => [part.type, part.value]))
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), 0)
    candidate += desired - represented
  }
  const finalParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(candidate)).map(part => [part.type, part.value]))
  const finalLocal = Date.UTC(Number(finalParts.year), Number(finalParts.month) - 1, Number(finalParts.day), Number(finalParts.hour), Number(finalParts.minute), 0)
  if (finalLocal !== desired) throw new Error('That local time does not exist in the selected timezone. Choose another exact time.')
  return new Date(candidate)
}

function normalizeDays(postDays: number | number[] | string | string[] | undefined) {
  const values = parsePostDays(postDays)
  if (!values.length) return [1, 2, 3, 4, 5]
  const normalized = values.map(value => ((value % 7) + 7) % 7)
  return Array.from(new Set(normalized))
}

export function calculateNextPost(postDays: number | number[] | string | string[] | undefined, postTime: string, timezone = 'Africa/Lagos', fromDate = new Date()): Date {
  const days = normalizeDays(postDays)
  const { hour, minute } = parseTime(postTime)
  const now = new Date(fromDate)
  if (Number.isNaN(now.getTime())) throw new Error('A valid starting date is required')
  const baseParts = getPartsInTimeZone(now, timezone)
  const targetDate = `${baseParts.year}-${String(baseParts.month).padStart(2, '0')}-${String(baseParts.day).padStart(2, '0')}`
  const targetTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

  for (let offset = 0; offset <= 14; offset += 1) {
    const cursor = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000)
    const parts = getPartsInTimeZone(cursor, timezone)
    const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
    if (!days.includes(weekday)) continue
    const candidate = localDateTimeToUtc(`${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`, targetTime, timezone)
    if (candidate.getTime() > now.getTime()) return candidate
  }

  const fallback = localDateTimeToUtc(targetDate, targetTime, timezone)
  return new Date(fallback.getTime() + 24 * 60 * 60 * 1000)
}

export function generateSchedule(postDays: number | number[] | string | string[] | undefined, postTime: string, count: number, timezone = 'Africa/Lagos', fromDate = new Date()) {
  const results: Date[] = []
  const days = normalizeDays(postDays)
  const { hour, minute } = parseTime(postTime)
  let cursor = calculateNextPost(postDays, postTime, timezone, fromDate)
  for (let index = 0; index < count; index += 1) {
    results.push(new Date(cursor))
    const nextDate = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    let found = false
    for (let offset = 0; offset <= 14; offset += 1) {
      const candidateDate = new Date(nextDate.getTime() + offset * 24 * 60 * 60 * 1000)
      const parts = getPartsInTimeZone(candidateDate, timezone)
      const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
      if (!days.includes(weekday)) continue
      cursor = localDateTimeToUtc(`${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`, `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, timezone)
      found = true
      break
    }
    if (!found) {
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    }
  }
  return results
}

export function buildCampaignSchedulePlan({
  postTime,
  postDays,
  timezone = 'Africa/Lagos',
  totalRuns = 1,
  now = new Date(),
}: {
  postTime: string
  postDays: number | number[] | string | string[] | undefined
  timezone?: string
  totalRuns?: number
  now?: Date
}) {
  const days = normalizeDays(postDays)
  const { hour, minute } = parseTime(postTime)
  const timeValue = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const firstLocalParts = getPartsInTimeZone(now, timezone)
  const firstDateValue = `${firstLocalParts.year}-${String(firstLocalParts.month).padStart(2, '0')}-${String(firstLocalParts.day).padStart(2, '0')}`
  let cursor = localDateTimeToUtc(firstDateValue, timeValue, timezone)

  for (let offset = 0; offset <= 14; offset += 1) {
    const candidateDate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000)
    const parts = getPartsInTimeZone(candidateDate, timezone)
    const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
    if (!days.includes(weekday)) continue
    cursor = localDateTimeToUtc(`${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`, timeValue, timezone)
    if (cursor.getTime() > now.getTime()) break
  }

  const scheduledDates: string[] = []
  let current = cursor
  for (let index = 0; index < Math.max(1, totalRuns); index += 1) {
    scheduledDates.push(current.toISOString())
    const nextDate = new Date(current.getTime() + 24 * 60 * 60 * 1000)
    let found = false
    for (let offset = 0; offset <= 14; offset += 1) {
      const candidateDate = new Date(nextDate.getTime() + offset * 24 * 60 * 60 * 1000)
      const parts = getPartsInTimeZone(candidateDate, timezone)
      const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
      if (!days.includes(weekday)) continue
      current = localDateTimeToUtc(`${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`, timeValue, timezone)
      found = true
      break
    }
    if (!found) {
      current = new Date(current.getTime() + 24 * 60 * 60 * 1000)
    }
  }

  const firstParts = getPartsInTimeZone(cursor, timezone)
  return {
    firstDate: cursor,
    firstLocalDate: `${firstParts.year}-${String(firstParts.month).padStart(2, '0')}-${String(firstParts.day).padStart(2, '0')}`,
    firstLocalTime: `${String(firstParts.hour).padStart(2, '0')}:${String(firstParts.minute).padStart(2, '0')}`,
    scheduledDates,
  }
}

export function generateFullSchedule(postDays: number | number[] | string | string[] | undefined, postTime: string, totalPosts: number, timezone = 'Africa/Lagos', fromDate = new Date()) {
  return generateSchedule(postDays, postTime, Math.max(0, Math.floor(totalPosts)), timezone, fromDate)
}

export function getLiveCountdown(target: string | Date, _timezone = 'Africa/Lagos', fromDate = new Date()) {
  const remainingMs = Math.max(0, new Date(target).getTime() - new Date(fromDate).getTime())
  const totalSeconds = Math.floor(remainingMs / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  const text = [days ? `${days}d` : '', hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', `${seconds}s`].filter(Boolean).join(' ')
  return {
    remainingMs,
    diff: new Date(target).getTime() - new Date(fromDate).getTime(),
    text,
    days,
    hours,
    minutes,
    seconds,
    isDue: new Date(target).getTime() <= new Date(fromDate).getTime(),
    due: remainingMs === 0,
  }
}
