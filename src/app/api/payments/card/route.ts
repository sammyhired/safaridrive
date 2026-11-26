import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { ApiError, handle, readJson, requireString } from '@/app/api/_lib/api'
import { cardExpiryValid, completePayment, luhnValid } from '@/app/api/_lib/payments'

const CARD_ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function cardReceipt(): string {
  let out = 'CARD-'
  for (let i = 0; i < 10; i++) out += CARD_ALNUM[Math.floor(Math.random() * CARD_ALNUM.length)]
  return out
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(['CUSTOMER'])
    const body = await readJson(req)

    const bookingId = typeof body.bookingId === 'string' ? body.bookingId.trim() : ''
    if (!bookingId) throw new ApiError(400, 'bookingId is required')
    const cardName = requireString(body.cardName, 'Card holder name', { min: 2, max: 60 })
    const cardNumber = String(body.cardNumber ?? '').replace(/[\s-]/g, '')
    const expiry = String(body.expiry ?? '')
    const cvv = String(body.cvv ?? '')

    if (!/^\d{12,19}$/.test(cardNumber)) throw new ApiError(400, 'Card number must be 12-19 digits')
    if (!luhnValid(cardNumber)) throw new ApiError(400, 'Card number is invalid — check the digits and try again')
    if (!cardExpiryValid(expiry)) throw new ApiError(400, 'Expiry must be a future date in MM/YY format')
    if (!/^\d{3}$/.test(cvv)) throw new ApiError(400, 'CVV must be 3 digits')

    const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { vehicle: true } })
    if (!booking) throw new ApiError(404, 'Booking not found')
    if (booking.customerId !== user.id) throw new ApiError(403, 'You can only pay for your own bookings')
    if (booking.status !== 'PENDING_PAYMENT') throw new ApiError(400, 'This booking is not awaiting payment')

    const payment = await db.payment.create({
      data: {
        bookingId: booking.id,
        method: 'CARD',
        type: 'RENTAL',
        amount: booking.total,
        status: 'PENDING',
      },
    })

    const completed = await completePayment(payment.id, cardReceipt())
    return NextResponse.json({
      payment: {
        id: completed.id,
        method: completed.method,
        type: completed.type,
        amount: completed.amount,
        status: completed.status,
        phone: completed.phone,
        receiptNo: completed.receiptNo,
        checkoutRequestId: completed.checkoutRequestId,
        createdAt: completed.createdAt.toISOString(),
      },
    })
  })
}
