import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { initiateStkPush } from '@/lib/mpesa'
import { ApiError, handle, readJson } from '@/app/api/_lib/api'
import { normalizeMpesaPhone } from '@/app/api/_lib/payments'
import { serializePayment } from '@/app/api/_lib/serialize'

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(['CUSTOMER'])
    const body = await readJson(req)
    const bookingId = typeof body.bookingId === 'string' ? body.bookingId.trim() : ''
    if (!bookingId) throw new ApiError(400, 'bookingId is required')

    let phone: string
    try {
      phone = normalizeMpesaPhone(body.phone)
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : 'Invalid phone number')
    }

    const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { vehicle: true } })
    if (!booking) throw new ApiError(404, 'Booking not found')
    if (booking.customerId !== user.id) throw new ApiError(403, 'You can only pay for your own bookings')
    if (booking.status !== 'PENDING_PAYMENT') {
      throw new ApiError(400, 'This booking is not awaiting payment')
    }

    // Invalidate any previous pending STK attempts for this booking
    await db.payment.updateMany({
      where: { bookingId: booking.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    })

    const stk = await initiateStkPush(phone, booking.total, booking.reference)

    const payment = await db.payment.create({
      data: {
        bookingId: booking.id,
        method: 'MPESA',
        type: 'RENTAL',
        phone,
        amount: booking.total,
        status: 'PENDING',
        checkoutRequestId: stk.checkoutRequestId,
        merchantRequestId: stk.merchantRequestId ?? null,
      },
    })

    return NextResponse.json({ payment: serializePayment(payment) })
  })
}
