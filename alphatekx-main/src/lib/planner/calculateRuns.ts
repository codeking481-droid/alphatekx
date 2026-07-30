import { addDays, addHours, differenceInDays, differenceInHours, parseISO, startOfDay } from 'date-fns'

export interface ScheduleInput {
  startDate: string // 'today' | 'tomorrow' | ISO date string
  time: string // 'HH:MM' format
  timezone: string
  frequency: 'daily' | 'every2hours' | 'every6hours' | 'weekly' | 'whenEvent' | 'custom'
  weeklyDays?: string[] // ['mon','tue',...]
  duration: '7days' | '14days' | '30days' | '60days' | '90days' | 'untilDate' | 'forever'
  untilDate?: string // ISO date string if duration is 'untilDate'
  customCron?: string
}

export interface PlatformCredits {
  [key: string]: number
}

export const PLATFORM_CREDITS: PlatformCredits = {
  linkedin: 5,
  gmail: 2,
  calendar: 1,
  instagram: 4,
  twitter: 3,
  youtube: 5,
  telegram: 2,
  outlook: 2,
  slack: 2,
  notion: 2,
}

export function calculateTotalRuns(schedule: ScheduleInput): number {
  const { startDate, time, frequency, duration, untilDate, weeklyDays } = schedule

  // Parse start date
  let start: Date
  if (startDate === 'today') {
    start = new Date()
  } else if (startDate === 'tomorrow') {
    start = addDays(new Date(), 1)
  } else {
    start = parseISO(startDate)
  }

  // Parse time
  const [hours, minutes] = time.split(':').map(Number)
  start.setHours(hours, minutes, 0, 0)

  // Calculate end date based on duration
  let end: Date
  if (duration === 'forever') {
    return 30 // monthly basis
  } else if (duration === 'untilDate' && untilDate) {
    end = parseISO(untilDate)
  } else {
    const daysMap: Record<string, number> = {
      '7days': 7,
      '14days': 14,
      '30days': 30,
      '60days': 60,
      '90days': 90,
    }
    const days = daysMap[duration] || 30
    end = addDays(start, days)
  }

  const totalDays = differenceInDays(end, start)
  if (totalDays <= 0) return 1

  switch (frequency) {
    case 'daily':
      return totalDays
    case 'every2hours': {
      const totalHours = differenceInHours(end, start)
      return Math.ceil(totalHours / 2)
    }
    case 'every6hours': {
      const totalHours = differenceInHours(end, start)
      return Math.ceil(totalHours / 6)
    }
    case 'weekly': {
      if (weeklyDays && weeklyDays.length > 0) {
        let count = 0
        let current = new Date(start)
        while (current < end) {
          const dayName = current.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase().slice(0, 3)
          if (weeklyDays.includes(dayName)) count++
          current = addDays(current, 1)
        }
        return count || Math.ceil(totalDays / 7)
      }
      return Math.ceil(totalDays / 7)
    }
    case 'whenEvent':
      return totalDays // 1 per day as base
    case 'custom':
      return totalDays
    default:
      return totalDays
  }
}

export function calculateTotalCredits(platforms: string[], runs: number): number {
  let perRun = 0
  for (const p of platforms) {
    perRun += PLATFORM_CREDITS[p.toLowerCase()] || 2
  }
  return perRun * runs
}

export function getPlatformCreditsBreakdown(platforms: string[]): { platform: string; credits: number }[] {
  return platforms.map(p => ({
    platform: p,
    credits: PLATFORM_CREDITS[p.toLowerCase()] || 2,
  }))
}

export function formatScheduleSummary(schedule: ScheduleInput): string {
  const parts: string[] = []
  const freqLabels: Record<string, string> = {
    daily: 'Daily',
    every2hours: 'Every 2 hours',
    every6hours: 'Every 6 hours',
    weekly: 'Weekly',
    whenEvent: 'When event happens',
    custom: 'Custom',
  }
  parts.push(freqLabels[schedule.frequency] || schedule.frequency)

  const durLabels: Record<string, string> = {
    '7days': '7 days',
    '14days': '14 days',
    '30days': '30 days',
    '60days': '60 days',
    '90days': '90 days',
    untilDate: `Until ${schedule.untilDate || 'selected date'}`,
    forever: 'Forever / Ongoing',
  }
  parts.push(durLabels[schedule.duration] || schedule.duration)

  return parts.join(' · ')
}

export function calculateEndDate(schedule: ScheduleInput): Date | null {
  const { startDate, time, duration, untilDate } = schedule
  let start: Date
  if (startDate === 'today') {
    start = new Date()
  } else if (startDate === 'tomorrow') {
    start = addDays(new Date(), 1)
  } else {
    start = parseISO(startDate)
  }
  const [hours, minutes] = time.split(':').map(Number)
  start.setHours(hours, minutes, 0, 0)

  if (duration === 'forever') return null
  if (duration === 'untilDate' && untilDate) return parseISO(untilDate)

  const daysMap: Record<string, number> = {
    '7days': 7, '14days': 14, '30days': 30, '60days': 60, '90days': 90,
  }
  return addDays(start, daysMap[duration] || 30)
}