import { NextResponse, type NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  ApiError,
  BLOCKING_BOOKING_STATUSES,
  generateBookingReference,
  handle,
  notify,
  readJson,
  vehicleLabel,
} from '@/app/api/_lib/api'
import { bookingInclude, serializeBooking } from '@/app/api/_lib/serialize'
import { buildQuoteContext } from '@/app/api/_lib/quote-flow'

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    const status = req.nextUrl.searchParams.get('status')?.trim()

    const where: Prisma.BookingWhereInput = {}
    if (status) {
      const valid = [...BLOCKING_BOOKING_STATUSES, 'REJECTED', 'CANCELLED', 'COMPLETED']
      if (!valid.includes(status)) throw new ApiError(400, 'Unknown booking status filter')
      where.status = status
    }
    if (user.role === 'CUSTOMER') {
      where.customerId = user.id
    } else if (user.role === 'OWNER') {
      where.vehicle = { ownerId: user.id }
    } else if (user.role === 'DRIVER') {
      where.driver = { userId: user.id }
    } // ADMIN sees all

    const bookings = await db.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ bookings: bookings.map(serializeBooking) })
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(['CUSTOMER'])
    const body = await readJson(req)
    const ctx = await buildQuoteContext(body)
    const { input, vehicle, driverRow, quote, extrasItems } = ctx

    // Pickup yard = vehicle's yard
    if (!vehicle.yardId) throw new ApiError(400, 'This vehicle has no pickup yard configured')

    // Availability overlap (any booking that still occupies the vehicle)
    const overlap = await db.booking.findFirst({
      where: {
        vehicleId: vehicle.id,
        status: { notIn: ['REJECTED', 'CANCELLED', 'COMPLETED', 'RETURNED'] },
        startDate: { lt: input.endDate },
        endDate: { gt: input.startDate },
      },
      select: { reference: true },
    })
    if (overlap) {
      throw new ApiError(400, `${vehicleLabel(vehicle)} is already booked for those dates (booking ${overlap.reference})`)
    }

    const reference = await generateBookingReference()
    const booking = await db.booking.create({
      data: {
        reference,
        customerId: user.id,
        vehicleId: vehicle.id,
        driverId: input.mode === 'CHAUFFEUR' ? (driverRow?.id ?? null) : null,
        mode: input.mode,
        status: 'PENDING_PAYMENT',
        paymentStatus: 'UNPAID',
        startDate: input.startDate,
        endDate: input.endDate,
        days: quote.days,
        pickupYardId: vehicle.yardId,
        deliveryAddress: input.mode === 'PICKUP' ? null : input.deliveryAddress,
        deliveryLat: input.mode === 'PICKUP' ? null : input.deliveryLat,
        deliveryLng: input.mode === 'PICKUP' ? null : input.deliveryLng,
        distanceKm: quote.distanceKm,
        rentalTotal: quote.rentalTotal,
        deliveryFee: quote.deliveryFee,
        driverTotal: quote.driverTotal,
        extrasTotal: quote.extrasTotal,
        discount: quote.discount,
        deposit: quote.deposit,
        total: quote.total,
        extrasJson: JSON.stringify(extrasItems),
        promoCode: quote.promoValid && quote.discount > 0 && input.promoCode ? input.promoCode : null,
      },
      include: bookingInclude,
    })

    await notify(
      vehicle.ownerId,
      'New booking request',
      `${user.name} wants to book ${vehicleLabel(vehicle)} (${booking.reference}) for ${booking.days} day(s) — awaiting payment.`,
      'BOOKING',
    )
    if (driverRow) {
      await notify(
        driverRow.userId,
        'New trip assignment',
        `You are assigned as chauffeur for booking ${booking.reference} (${vehicleLabel(vehicle)}).`,
        'TRIP',
      )
    }

    return NextResponse.json({ booking: serializeBooking(booking) })
  })
}
