export function calculateNextPost(postDays: string[], postTime: string, timezone = 'Africa/Lagos'): Date {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
  const [time, modifier] = postTime.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;

  const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  const wanted = postDays.map(d => dayMap[d]);

  for (let i = 0; i <= 7; i++) {
    const check = new Date(now);
    check.setDate(now.getDate() + i);
    if (wanted.includes(check.getDay())) {
      check.setHours(hours, minutes, 0, 0);
      if (check > now) return check;
    }
  }

  const fallback = new Date(now);
  fallback.setDate(now.getDate() + 1);
  fallback.setHours(hours, minutes, 0, 0);
  return fallback;
}