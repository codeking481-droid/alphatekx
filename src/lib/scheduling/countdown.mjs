export function formatCountdown(target, now = Date.now()) {
  if (!target) return 'No upcoming run'
  const diff = new Date(target).getTime() - now
  if (diff <= 0) return 'Live now'
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  const remainingSeconds = seconds % 60
  if (hours > 0) return `Starts in ${hours}h ${remainingMinutes}m ${remainingSeconds}s`
  if (minutes > 0) return `Starts in ${minutes}m ${remainingSeconds}s`
  return `Starts in ${Math.max(1, seconds)}s`
}
