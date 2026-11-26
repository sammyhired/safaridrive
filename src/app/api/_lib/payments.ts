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
 */
export async function completePayment(
  paymentId: string,
  receiptNo: string,
): Promise<PaymentRow> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { booking: { include: { vehicle: true, customer: true } } },
  })
  if (!payment) throw new Error('Payment not found')

  const updated = await db.payment.update({
    where: { id: paymentId },
    data: { status: 'COMPLETED', receiptNo },
    include: { booking: { include: { vehicle: true, customer: true } } },
  })

  const booking = updated.booking
  if (booking.status === 'PENDING_PAYMENT') {
    await db.booking.update({
      where: { id: booking.id },
      data: { status: 'PAID', paymentStatus: 'PAID' },
    })
    await db.vehicle.update({
      where: { id: booking.vehicleId },
      data: { status: 'BOOKED' },
    })
    await notify(
      booking.customerId,
      'Payment received',
      `KSh ${booking.total.toLocaleString('en-KE')} received for booking ${booking.reference} (${vehicleLabel(booking.vehicle)}).`,
      'PAYMENT',
    )
    await notify(
      booking.vehicle.ownerId,
      'New paid booking',
      `Booking ${booking.reference} for ${vehicleLabel(booking.vehicle)} has been paid by ${booking.customer.name} — awaiting your acceptance.`,
      'PAYMENT',
    )
  }

  return db.payment.findUnique({
    where: { id: paymentId },
    include: { booking: { include: { vehicle: true, customer: true } } },
  }) as Promise<PaymentRow>
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
