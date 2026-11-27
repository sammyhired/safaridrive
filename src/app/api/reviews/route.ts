import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { ApiError, handle, optionalString, readJson, requireInt } from '@/app/api/_lib/api'
import { serializeReview } from '@/app/api/_lib/serialize'

export async function GET(req: NextRequest) {
  return handle(async () => {
    const vehicleId = req.nextUrl.searchParams.get('vehicleId')?.trim()
    const reviews = await db.review.findMany({
      where: vehicleId ? { booking: { vehicleId } } : undefined,
      include: { author: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ reviews: reviews.map(serializeReview) })
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(['CUSTOMER'])
    const body = await readJson(req)

    const bookingId = typeof body.bookingId === 'string' ? body.bookingId.trim() : ''
    if (!bookingId) throw new ApiError(400, 'bookingId is required')
    const rating = requireInt(body.rating, 'Rating', { min: 1, max: 5 })
    const comment = optionalString(body.comment, 'Comment', { max: 600 }) ?? null

    const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { vehicle: true } })
    if (!booking) throw new ApiError(404, 'Booking not found')
    if (booking.customerId !== user.id) throw new ApiError(403, 'You can only review your own bookings')
    if (booking.status !== 'COMPLETED') throw new ApiError(400, 'You can review a booking once it is completed')

    const existing = await db.review.findUnique({ where: { bookingId } })
    if (existing) throw new ApiError(400, 'You have already reviewed this booking')

    let review
    try {
      review = await db.review.create({
        data: { bookingId, authorId: user.id, rating, comment },
        include: { author: true },
      })
    } catch (err) {
      // Racing duplicate create (unique bookingId) — same friendly 400
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ApiError(400, 'You have already reviewed this booking')
      }
      throw err
    }

    // Recompute vehicle rating as the mean of all its reviews
    const agg = await db.review.aggregate({
      where: { booking: { vehicleId: booking.vehicleId } },
      _avg: { rating: true },
      _count: { _all: true },
    })
    await db.vehicle.update({
      where: { id: booking.vehicleId },
      data: {
        rating: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : 0,
        reviewCount: agg._count._all,
      },
    })

    return NextResponse.json({ review: serializeReview(review) })
  })
}
