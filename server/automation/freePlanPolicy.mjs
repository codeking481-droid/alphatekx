import { calendarHasDuplicates } from './contentMemory.mjs'

const HOUR_MS = 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * HOUR_MS

export function validateFreeCampaign(posts = [], contentMemory = [], now = new Date()) {
  const scheduled = posts
    .map(post => ({ post, at: new Date(post.scheduledAt).getTime() }))
    .filter(item => Number.isFinite(item.at))
    .sort((left, right) => left.at - right.at)

  if (scheduled.some(item => item.at > now.getTime() + SEVEN_DAYS_MS)) {
    return { ok: false, code: 'FREE_SCHEDULE_WINDOW', error: 'Free plans can schedule posts up to 7 days ahead.' }
  }
  for (let index = 1; index < scheduled.length; index++) {
    if (scheduled[index].at - scheduled[index - 1].at < HOUR_MS) {
      return { ok: false, code: 'FREE_HOURLY_LIMIT', error: 'Free plans can publish at most one post per hour.' }
    }
  }
  const duplicate = calendarHasDuplicates(posts, Array.isArray(contentMemory) ? contentMemory.slice(0, 10) : [])
  if (duplicate.duplicate) {
    return { ok: false, code: 'DUPLICATE_CONTENT', error: 'This caption repeats recent content. Edit or regenerate it before approval.' }
  }
  return { ok: true }
}
