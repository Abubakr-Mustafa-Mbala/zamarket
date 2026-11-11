// Pure, timezone-aware goal calculations. All money is kwacha, never gross product sales.
const lusakaParts = (when = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lusaka', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(when))
  return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]))
}

export const lusakaMonth = (when = new Date()) => {
  const { year, month } = lusakaParts(when)
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function goalPlan({ target = 0, earned = 0, pending = 0, averagePerSale = 0, now = new Date() } = {}) {
  const goal = Math.max(0, Number(target) || 0)
  const verified = Math.max(0, Number(earned) || 0)
  const inReview = Math.max(0, Number(pending) || 0)
  const remaining = Math.max(0, goal - verified)
  const percent = goal ? Math.min(100, Math.round((verified / goal) * 100)) : 0
  const { year, month, day } = lusakaParts(now)
  const daysLeft = Math.max(1, new Date(Date.UTC(year, month, 0)).getUTCDate() - day + 1)
  const average = Math.max(0, Number(averagePerSale) || 0)
  const salesNeeded = goal && remaining > 0 && average > 0 ? Math.ceil(remaining / average) : 0
  return {
    goal, earned: verified, pending: inReview, remaining, percent, daysLeft,
    averagePerSale: average, salesNeeded,
    dailySales: salesNeeded ? Math.ceil(salesNeeded / daysLeft) : 0,
    weeklySales: salesNeeded ? Math.ceil(salesNeeded * 7 / daysLeft) : 0,
    complete: goal > 0 && remaining === 0,
  }
}
