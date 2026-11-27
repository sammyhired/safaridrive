// ============================================================
// SafariDrive API — payment flow helpers (CONTRACTS §5)
// ============================================================
import { db } from '@/lib/db'
import { notify, vehicleLabel } from './api'
import { serializePayment } from './serialize'
import type { Prisma } from '@prisma/client'

type PaymentRow = Prisma.PaymentGetPayload<{ include: { booking: { include: { vehicle: true; customer: true } } } }>

/**
 * Mark a payment COMPLETED with a receipt and (when the booking is still
 * awaiting payment) transition booking → PAID, vehicle → BOOKED and notify
 * the customer + vehicle owner.
 *
 * Atomic: the PENDING → COMPLETED flip is a conditional updateMany, so two
 * racing callers (e.g. card POST + STK callback) can never both transition
 * the booking — the loser returns the already-completed payment unchanged.
 */
export async function completePayment(
  paymentId: string,
  receiptNo: string,
): Promise<PaymentRow> {
  const notifyQueue: Array<{ userId: string; title: string; body: string }> = []

  const payment = await db.$transaction(async (tx) => {
    const existing = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { booking: { include: { vehicle: true, customer: true } } },
    })
    if (!existing) throw new Error('Payment not found')

    // Idempotent: another caller already finished this payment
    if (existing.status === 'COMPLETED' || existing.status === 'REFUNDED') {
      return existing
    }

    // The single atomic claim: only a PENDING payment flips to COMPLETED
    const claimed = await tx.payment.updateMany({
      where: { id: paymentId, status: 'PENDING' },
      data: { status: 'COMPLETED', receiptNo },
    })
    if (claimed.count === 0) {
      const raced = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { booking: { include: { vehicle: true, customer: true } } },
      })
      return raced ?? existing
    }

    const booking = existing.booking
    // Only the first completion flips the booking (conditional update guard)
    const bookingClaimed = await tx.booking.updateMany({
      where: { id: booking.id, status: 'PENDING_PAYMENT' },
      data: { status: 'PAID', paymentStatus: 'PAID' },
    })
    if (bookingClaimed.count > 0) {
      await tx.vehicle.update({
        where: { id: booking.vehicleId },
        data: { status: 'BOOKED' },
      })
      notifyQueue.push({
        userId: booking.customerId,
        title: 'Payment received',
        body: `KSh ${booking.total.toLocaleString('en-KE')} received for booking ${booking.reference} (${vehicleLabel(booking.vehicle)}).`,
      })
      notifyQueue.push({
        userId: booking.vehicle.ownerId,
        title: 'New paid booking',
        body: `Booking ${booking.reference} for ${vehicleLabel(booking.vehicle)} has been paid by ${booking.customer.name} — awaiting your acceptance.`,
      })
    }

    return tx.payment.findUnique({
      where: { id: paymentId },
      include: { booking: { include: { vehicle: true, customer: true } } },
    })
  })

  if (!payment) throw new Error('Payment not found')

  // Notifications only after the transition is durable
  for (const n of notifyQueue) {
    await notify(n.userId, n.title, n.body, 'PAYMENT')
  }

  return payment as PaymentRow
}

// ---------- M-Pesa phone handling ----------
// Kenyan mobile: 07xx (classic) or 01xx (new) prefixes, optional +254/254 form.
const MPESA_PHONE_RE = /^(?:254|\+254|0)[17][0-9]{8}$/

/** Validate + normalize a Kenyan mobile number to 254XXXXXXXXX. */
export function normalizeMpesaPhone(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Phone number is required')
  const trimmed = raw.replace(/[\s-]/g, '')
  if (!MPESA_PHONE_RE.test(trimmed)) {
    throw new Error('Enter a valid Safaricom number, e.g. 0722000001 or 254722000001')
  }
  let normalized = trimmed.replace(/^\+/, '')
  if (normalized.startsWith('0')) normalized = `254${normalized.slice(1)}`
  return normalized
}

// ---------- Card helpers ----------
export function luhnValid(cardNumber: string): boolean {
  let sum = 0
  let double = false
  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = cardNumber.charCodeAt(i) - 48
    if (digit < 0 || digit > 9) return false
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return sum % 10 === 0
}

/** Expiry must be MM/YY (or MMYY) and strictly in the future. */
export function cardExpiryValid(expiry: string): boolean {
  const match = /^(0[1-9]|1[0-2])\s*\/?\s*(\d{2})$/.exec(expiry.trim())
  if (!match) return false
  const month = Number(match[1])
  const year = 2000 + Number(match[2])
  // Valid until the end of the expiry month
  const endOfMonth = new Date(year, month, 1).getTime() // first day of next month
  return Date.now() < endOfMonth
}

export { serializePayment }
