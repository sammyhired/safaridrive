import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { fetchTripState } from '@/lib/tracking-client'
import { ApiError, handle, vehicleLabel } from '@/app/api/_lib/api'

type Ctx = { params: Promise<{ bookingId: string }> }

const JOIN_TOKEN_TTL_S = 600 // 10 minutes

/**
 * Per-booking HMAC token (signed with TRACKING_INTERNAL_KEY) that the
 * customer's map presents to the tracking service's socket to subscribe to
 * this booking's live GPS. Issued only after the ownership check below —
 * an unrelated visitor can never obtain one.
 */
function issueJoinToken(bookingId: string): string | null {
  const key = process.env.TRACKING_INTERNAL_KEY
  if (!key) return null
  const payload = Buffer.from(
    JSON.stringify({ b: bookingId, exp: Math.floor(Date.now() / 1000) + JOIN_TOKEN_TTL_S }),
  ).toString('base64url')
  const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

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
    const joinToken = issueJoinToken(booking.id)

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
      joinToken,
    })
  })
}
