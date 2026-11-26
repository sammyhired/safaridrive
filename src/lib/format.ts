import type { BookingStatus } from './types'

// ---------- Money ----------
export function formatKes(amount: number): string {
  return `KSh ${new Intl.NumberFormat('en-KE').format(Math.round(amount))}`
}

export function formatKesShort(amount: number): string {
  if (amount >= 1_000_000) return `KSh ${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `KSh ${(amount / 1_000).toFixed(0)}K`
  return `KSh ${amount}`
}

// ---------- Dates ----------
export function formatDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
}

export function rentalDays(start: string | Date, end: string | Date): number {
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  const diffH = (e - s) / (1000 * 60 * 60)
  return Math.max(1, Math.ceil(diffH / 24))
}

// ---------- Status labels ----------
export const BOOKING_STATUS_META: Record<
  BookingStatus,
  { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }
> = {
  PENDING_PAYMENT: { label: 'Pending payment', tone: 'warning' },
  PAID: { label: 'Paid — awaiting owner', tone: 'info' },
  ACCEPTED: { label: 'Confirmed', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', tone: 'info' },
  ACTIVE: { label: 'Active rental', tone: 'success' },
  RETURNED: { label: 'Returned — inspection', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
}

export function statusTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  const map: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
    // booking
    PENDING_PAYMENT: 'warning',
    PAID: 'info',
    ACCEPTED: 'success',
    REJECTED: 'danger',
    CANCELLED: 'danger',
    OUT_FOR_DELIVERY: 'info',
    ACTIVE: 'success',
    RETURNED: 'warning',
    COMPLETED: 'neutral',
    // payments
    PENDING: 'warning',
    COMPLETED: 'success',
    FAILED: 'danger',
    REFUNDED: 'info',
    UNPAID: 'warning',
    // vehicles
    AVAILABLE: 'success',
    BOOKED: 'info',
    MAINTENANCE: 'warning',
    RETIRED: 'neutral',
    // drivers
    ON_TRIP: 'info',
    OFFLINE: 'neutral',
    // users
    ACTIVE: 'success',
    SUSPENDED: 'danger',
  }
  return map[status] ?? 'neutral'
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING_PAYMENT: 'Pending payment',
    PAID: 'Paid',
    ACCEPTED: 'Confirmed',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled',
    OUT_FOR_DELIVERY: 'Out for delivery',
    ACTIVE: 'Active',
    RETURNED: 'Returned',
    COMPLETED: 'Completed',
    PENDING: 'Pending',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
    REFUNDED: 'Refunded',
    UNPAID: 'Unpaid',
    AVAILABLE: 'Available',
    BOOKED: 'Booked',
    MAINTENANCE: 'Maintenance',
    RETIRED: 'Retired',
    ON_TRIP: 'On trip',
    OFFLINE: 'Offline',
    SUSPENDED: 'Suspended',
  }
  return labels[status] ?? status
}

// ---------- Misc ----------
export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function classNames(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(' ')
}
