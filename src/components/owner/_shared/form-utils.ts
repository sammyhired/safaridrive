// Small form/format helpers shared by the owner and admin dashboards.

/** Parse a numeric input string to an integer. Returns null when empty or invalid. */
export function toInt(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isFinite(parsed) ? parsed : null
}

/** Truncate long labels (e.g. chart axis categories). */
export function truncateLabel(text: string, max = 20): string {
  return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text
}

/** Today as a yyyy-mm-dd string, for date inputs. */
export function todayInputValue(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** Is the ISO date the same calendar day as `ref`? */
export function isSameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  )
}
