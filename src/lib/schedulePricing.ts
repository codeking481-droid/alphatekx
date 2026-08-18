export function scheduleDistanceMultiplier(scheduledAt: string | Date, now = new Date()) {
  const target = new Date(scheduledAt)
  if (Number.isNaN(target.getTime())) return 1
  const diffDays = Math.max(0, (target.getTime() - now.getTime()) / 86_400_000)
  if (diffDays <= 30) return 1
  if (diffDays <= 90) return 1.5
  if (diffDays <= 365) return 2
  if (diffDays <= 730) return 3
  return 5
}
