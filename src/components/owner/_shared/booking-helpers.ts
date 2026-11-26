// Pure helpers for the shared bookings module (owner + admin dashboards).
// No React here — safe to import from anywhere.

import {
  Ban,
  Check,
  CheckCheck,
  KeyRound,
  PackageCheck,
  Truck,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { Booking } from '@/lib/types'
import { formatKes } from '@/lib/format'
import { isSameDay } from './form-utils'

// ---------------------------------------------------------------------------
// Filter groups
// ---------------------------------------------------------------------------

export type FilterGroup =
  | 'ALL'
  | 'PAID'
  | 'TODAY'
  | 'UPCOMING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CLOSED'

export const FILTER_GROUPS: { key: FilterGroup; label: string }[] = [
  { key: 'PAID', label: 'Action needed' },
  { key: 'TODAY', label: 'Today' },
  { key: 'UPCOMING', label: 'Upcoming' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CLOSED', label: 'Cancelled' },
  { key: 'ALL', label: 'All' },
]

/** Filter a role-scoped booking list down to a display group (client-side). */
export function filterBookings(bookings: Booking[], group: FilterGroup): Booking[] {
  const now = new Date()
  switch (group) {
    case 'ALL':
      return bookings
    case 'PAID':
      return bookings.filter((b) => b.status === 'PAID')
    case 'TODAY':
      return bookings.filter(
        (b) =>
          ['PENDING_PAYMENT', 'PAID', 'ACCEPTED', 'OUT_FOR_DELIVERY'].includes(b.status) &&
          isSameDay(b.startDate, now),
      )
    case 'UPCOMING':
      return bookings.filter(
        (b) =>
          ['PENDING_PAYMENT', 'PAID', 'ACCEPTED'].includes(b.status) &&
          new Date(b.startDate).getTime() > now.getTime(),
      )
    case 'IN_PROGRESS':
      return bookings.filter((b) => b.status === 'OUT_FOR_DELIVERY' || b.status === 'ACTIVE')
    case 'COMPLETED':
      return bookings.filter((b) => b.status === 'RETURNED' || b.status === 'COMPLETED')
    case 'CLOSED':
      return bookings.filter((b) => b.status === 'CANCELLED' || b.status === 'REJECTED')
  }
}

// ---------------------------------------------------------------------------
// Role-based actions (CONTRACT §4)
// ---------------------------------------------------------------------------

export type BookingActionKey =
  | 'accept'
  | 'reject'
  | 'cancel'
  | 'dispatch'
  | 'start'
  | 'deliver'
  | 'return'
  | 'complete'

export interface BookingActionDef {
  action: BookingActionKey
  label: string
  shortLabel?: string
  icon: LucideIcon
  destructive?: boolean
}

/** Which action buttons apply to a booking, per the acting role (CONTRACT §4).
 *  accept/reject are owner-of-vehicle only; cancel is customer/admin;
 *  dispatch/start/deliver/return/complete are owner/admin (start, deliver,
 *  return also driver). */
export function bookingActionsFor(booking: Booking, role: 'OWNER' | 'ADMIN'): BookingActionDef[] {
  const actions: BookingActionDef[] = []

  if (booking.status === 'PAID' && role === 'OWNER') {
    actions.push({ action: 'accept', label: 'Accept', icon: Check })
    actions.push({ action: 'reject', label: 'Reject', icon: X, destructive: true })
  }

  if (booking.status === 'ACCEPTED') {
    if (booking.mode === 'PICKUP') {
      actions.push({ action: 'start', label: 'Mark picked up', shortLabel: 'Pick up', icon: KeyRound })
    } else {
      actions.push({ action: 'dispatch', label: 'Dispatch', icon: Truck })
    }
  }

  if (booking.status === 'OUT_FOR_DELIVERY') {
    actions.push({
      action: 'deliver',
      label: 'Mark delivered',
      shortLabel: 'Delivered',
      icon: PackageCheck,
    })
  }

  if (booking.status === 'ACTIVE') {
    actions.push({ action: 'return', label: 'Mark returned', shortLabel: 'Returned', icon: Undo2 })
  }

  if (booking.status === 'RETURNED') {
    actions.push({ action: 'complete', label: 'Complete', icon: CheckCheck })
  }

  if (role === 'ADMIN' && ['PENDING_PAYMENT', 'PAID', 'ACCEPTED'].includes(booking.status)) {
    actions.push({ action: 'cancel', label: 'Cancel', icon: Ban, destructive: true })
  }

  return actions
}

export const ACTION_TOAST: Record<BookingActionKey, { title: string; description: string }> = {
  accept: { title: 'Booking accepted', description: 'The customer has been notified.' },
  reject: { title: 'Booking rejected', description: 'The payment will be refunded.' },
  cancel: { title: 'Booking cancelled', description: 'Refund processed where applicable.' },
  dispatch: { title: 'Tracking started', description: 'The vehicle is on its way to the customer.' },
  start: { title: 'Rental started', description: 'Pickup confirmed. Live tracking is on.' },
  deliver: { title: 'Vehicle delivered', description: 'The rental is now active.' },
  return: { title: 'Vehicle returned', description: 'Inspect it, then complete the booking.' },
  complete: { title: 'Booking completed', description: 'Vehicle is available again. Customer invited to review.' },
}

// ---------------------------------------------------------------------------
// Quote breakdown view model
// ---------------------------------------------------------------------------

export interface QuoteLineView {
  label: string
  amount: number
  note?: string
  negative?: boolean
}

/** Build the line-item breakdown shown in the booking detail dialog. */
export function quoteLines(booking: Booking): QuoteLineView[] {
  const dayWord = booking.days === 1 ? 'day' : 'days'
  const lines: QuoteLineView[] = [
    {
      label: 'Rental',
      amount: booking.rentalTotal,
      note: `${booking.days} ${dayWord} \u00d7 ${formatKes(booking.vehicle?.dailyRate ?? 0)}`,
    },
  ]

  if (booking.mode !== 'PICKUP' && (booking.deliveryFee > 0 || booking.deliveryAddress)) {
    lines.push({
      label: 'Delivery',
      amount: booking.deliveryFee,
      note:
        booking.distanceKm != null
          ? `${booking.distanceKm.toFixed(1)} km`
          : (booking.deliveryAddress ?? undefined),
    })
  }

  if (booking.driverTotal > 0) {
    lines.push({
      label: 'Chauffeur',
      amount: booking.driverTotal,
      note: booking.driver
        ? `${booking.days} ${dayWord} \u00d7 ${formatKes(booking.driver.dailyRate)}`
        : undefined,
    })
  }

  for (const extra of booking.extras) {
    lines.push({ label: extra.label, amount: extra.amount, note: `Qty ${extra.qty}` })
  }

  if (booking.discount > 0) {
    lines.push({
      label: 'Promo discount',
      amount: -booking.discount,
      note: booking.promoCode ?? undefined,
      negative: true,
    })
  }

  return lines
}
