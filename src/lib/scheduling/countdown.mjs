export function formatCountdown(target, now = Date.now()) {
  if (!target) return 'No upcoming run'
  const diff = new Date(target).getTime() - now
  if (diff <= 0) return 'Live now'
  const minutes = Math.max(1, Math.floor(diff / 60000))
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours > 0) return `Starts in ${hours}h ${remainingMinutes}m`
  return `Starts in ${minutes}m`
}
