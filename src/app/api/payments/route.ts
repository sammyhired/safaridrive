import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { ApiError, handle } from '@/app/api/_lib/api'
import { serializePayment } from '@/app/api/_lib/serialize'

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    const bookingId = req.nextUrl.searchParams.get('bookingId')?.trim()
    if (!bookingId) throw new ApiError(400, 'bookingId query parameter is required')

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: { vehicle: true, driver: true },
    })
    if (!booking) throw new ApiError(404, 'Booking not found')

    const isCustomer = booking.customerId === user.id
    const isOwner = booking.vehicle.ownerId === user.id
    const isDriver = !!booking.driver && booking.driver.userId === user.id
    if (!isCustomer && !isOwner && !isDriver && user.role !== 'ADMIN') {
      throw new ApiError(403, 'You do not have access to these payments')
    }

    const payments = await db.payment.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ payments: payments.map(serializePayment) })
  })
}
