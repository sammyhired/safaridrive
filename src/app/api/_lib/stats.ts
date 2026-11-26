// ============================================================
// SafariDrive API — stats helpers (CONTRACTS §7)
// ============================================================
import type { MonthlyPoint } from '@/lib/types'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface MonthWindow {
  label: string
  start: Date
  end: Date
}

/** The last 6 calendar months, oldest first (includes the current month). */
export function lastSixMonths(now = new Date()): MonthWindow[] {
  const windows: MonthWindow[] = []
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    windows.push({ label: MONTH_LABELS[start.getMonth()], start, end })
  }
  return windows
}

/**
 * Bucket completed-booking revenue (by start date) and expenses (by date)
 * into the last 6 calendar months.
 */
export function bucketMonthly(
  windows: MonthWindow[],
  bookings: { startDate: Date; total: number }[],
  expenses: { date: Date; amount: number }[] = [],
): MonthlyPoint[] {
  return windows.map((w) => {
    const monthBookings = bookings.filter(
      (b) => b.startDate >= w.start && b.startDate < w.end,
    )
    const revenue = monthBookings.reduce((sum, b) => sum + b.total, 0)
    const monthExpenses = expenses
      .filter((e) => e.date >= w.start && e.date < w.end)
      .reduce((sum, e) => sum + e.amount, 0)
    return {
      month: w.label,
      revenue,
      expenses: monthExpenses,
      bookings: monthBookings.length,
    }
  })
}

/** Percentage of the last 30 days that the fleet was on rent. */
export function utilizationPercent(
  fleetSize: number,
  bookings: { startDate: Date; endDate: Date }[],
  now = new Date(),
): number {
  if (fleetSize <= 0) return 0
  const windowStart = new Date(now.getTime() - 30 * 24 * 3_600_000)
  let bookedDays = 0
  for (const b of bookings) {
    const start = b.startDate > windowStart ? b.startDate : windowStart
    const end = b.endDate < now ? b.endDate : now
    if (end <= start) continue
    bookedDays += (end.getTime() - start.getTime()) / 3_600_000 / 24
  }
  const pct = (bookedDays / (fleetSize * 30)) * 100
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10
}
