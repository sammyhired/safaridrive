import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { fetchTripState } from '@/lib/tracking-client'
import { ApiError, handle, vehicleLabel } from '@/app/api/_lib/api'

type Ctx = { params: Promise<{ bookingId: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser()
    const { bookingId } = await ctx.params

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: { vehicle: true, driver: { include: { user: true } } },
    })
    if (!booking) throw new ApiError(404, 'Booking not found')

    const isCustomer = booking.customerId === user.id
    const isOwner = booking.vehicle.ownerId === user.id
    const isDriver = !!booking.driver && booking.driver.userId === user.id
    if (!isCustomer && !isOwner && !isDriver && user.role !== 'ADMIN') {
      throw new ApiError(403, 'You do not have access to this booking')
    }

    const trip = await fetchTripState(booking.id)

    return NextResponse.json({
      booking: {
        id: booking.id,
        reference: booking.reference,
        mode: booking.mode,
        status: booking.status,
        vehicleLabel: vehicleLabel(booking.vehicle),
        driverName: booking.driver ? booking.driver.user.name : null,
        driverPhone: booking.driver ? booking.driver.user.phone : null,
        deliveryAddress: booking.deliveryAddress,
      },
      trip,
    })
  })
}
