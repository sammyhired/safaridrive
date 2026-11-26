import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { CANCEL_FREE_HOURS, CANCEL_FEE_RATE } from '@/lib/constants'
import { startTripSim, stopTripSim } from '@/lib/tracking-client'
import {
  ApiError,
  BLOCKING_BOOKING_STATUSES,
  handle,
  notify,
  optionalString,
  readJson,
  requireString,
  vehicleLabel,
} from '@/app/api/_lib/api'
import { bookingInclude, serializeBooking, type BookingRow } from '@/app/api/_lib/serialize'

type Ctx = { params: Promise<{ id: string }> }

const BOOKING_ACTIONS = [
  'accept',
  'reject',
  'cancel',
  'dispatch',
  'start',
  'deliver',
  'return',
  'complete',
] as const
type BookingAction = (typeof BOOKING_ACTIONS)[number]

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
}

async function releaseVehicleIfFree(vehicleId: string, excludeBookingId: string): Promise<void> {
  const blocking = await db.booking.findFirst({
    where: {
      vehicleId,
      id: { not: excludeBookingId },
      status: { in: [...BLOCKING_BOOKING_STATUSES] },
    },
    select: { id: true },
  })
  if (!blocking) {
    await db.vehicle.update({ where: { id: vehicleId }, data: { status: 'AVAILABLE' } })
  }
}

async function refundCompletedPayments(bookingId: string): Promise<void> {
  await db.payment.updateMany({
    where: { bookingId, status: 'COMPLETED' },
    data: { status: 'REFUNDED' },
  })
}

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser()
    const { id } = await ctx.params
    const booking = await db.booking.findUnique({ where: { id }, include: bookingInclude })
    if (!booking) throw new ApiError(404, 'Booking not found')

    const isCustomer = booking.customerId === user.id
    const isOwner = booking.vehicle.ownerId === user.id
    const isDriver = !!booking.driver && booking.driver.userId === user.id
    if (!isCustomer && !isOwner && !isDriver && user.role !== 'ADMIN') {
      throw new ApiError(403, 'You do not have access to this booking')
    }
    return NextResponse.json({ booking: serializeBooking(booking) })
  })
}

export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser()
    const { id } = await ctx.params
    const body = await readJson(req)
    const action = requireString(body.action, 'action') as BookingAction
    if (!BOOKING_ACTIONS.includes(action)) {
      throw new ApiError(400, `action must be one of: ${BOOKING_ACTIONS.join(', ')}`)
    }
    const reason = optionalString(body.reason, 'Reason', { max: 300 })

    const booking = await db.booking.findUnique({ where: { id }, include: bookingInclude })
    if (!booking) throw new ApiError(404, 'Booking not found')

    const label = vehicleLabel(booking.vehicle)
    const isCustomer = booking.customerId === user.id
    const isOwner = booking.vehicle.ownerId === user.id
    const isDriver = !!booking.driver && booking.driver.userId === user.id
    const isAdmin = user.role === 'ADMIN'

    const requireStatus = (...statuses: string[]): void => {
      if (!statuses.includes(booking.status)) {
        throw new ApiError(
          400,
          `Cannot ${action} a booking with status ${booking.status} (expected ${statuses.join(' or ')})`,
        )
      }
    }

    const data: Prisma.BookingUncheckedUpdateInput = {}

    switch (action) {
      case 'accept': {
        if (!isOwner) throw new ApiError(403, 'Only the vehicle owner can accept this booking')
        requireStatus('PAID')
        data.status = 'ACCEPTED'
        await notify(
          booking.customerId,
          'Booking confirmed',
          `Booking ${booking.reference} confirmed — ${label} from ${fmtDate(booking.startDate)} to ${fmtDate(booking.endDate)}.${
            booking.driver ? ` Your chauffeur is ${booking.driver.user.name}.` : ''
          }`,
        )
        if (booking.driver) {
          await notify(
            booking.driver.userId,
            'Chauffeur job confirmed',
            `Booking ${booking.reference} (${label}) was confirmed — you are the assigned chauffeur.`,
            'TRIP',
          )
        }
        break
      }

      case 'reject': {
        if (!isOwner) throw new ApiError(403, 'Only the vehicle owner can reject this booking')
        requireStatus('PAID')
        data.status = 'REJECTED'
        data.paymentStatus = 'REFUNDED'
        await refundCompletedPayments(booking.id)
        await releaseVehicleIfFree(booking.vehicleId, booking.id)
        await notify(
          booking.customerId,
          'Booking declined',
          `Booking ${booking.reference} (${label}) was declined by the owner${reason ? `: ${reason}` : ''}. Your payment of KSh ${booking.total.toLocaleString('en-KE')} will be refunded.`,
        )
        break
      }

      case 'cancel': {
        if (!isCustomer && !isAdmin) {
          throw new ApiError(403, 'Only the customer or an admin can cancel this booking')
        }
        requireStatus('PENDING_PAYMENT', 'PAID', 'ACCEPTED')
        data.status = 'CANCELLED'

        const hoursToStart = (booking.startDate.getTime() - Date.now()) / 3_600_000
        const paid = booking.paymentStatus === 'PAID'
        if (paid) {
          data.paymentStatus = 'REFUNDED'
          await refundCompletedPayments(booking.id)
        }
        if (hoursToStart >= CANCEL_FREE_HOURS) {
          data.cancelReason = `Cancelled ${Math.round(hoursToStart)}h before start — free cancellation${reason ? ` — ${reason}` : ''}`
        } else {
          const fee = Math.round(booking.total * CANCEL_FEE_RATE)
          data.cancelReason =
            `Cancelled ${Math.max(0, Math.round(hoursToStart))}h before start — 20% fee applies ` +
            `(KSh ${fee.toLocaleString('en-KE')} retained)${reason ? ` — ${reason}` : ''}`
        }
        await releaseVehicleIfFree(booking.vehicleId, booking.id)
        await stopTripSim(booking.id)
        await notify(
          booking.vehicle.ownerId,
          'Booking cancelled',
          `Booking ${booking.reference} (${label}) was cancelled by ${isCustomer ? booking.customer.name : 'an admin'}${reason ? ` — ${reason}` : ''}.`,
        )
        break
      }

      case 'dispatch': {
        if (!isOwner && !isAdmin) throw new ApiError(403, 'Only the vehicle owner or an admin can dispatch this booking')
        requireStatus('ACCEPTED')
        if (booking.mode === 'PICKUP') {
          throw new ApiError(400, 'Pickup bookings are started with the "start" action, not "dispatch"')
        }

        let driverId = booking.driverId
        if (booking.mode === 'CHAUFFEUR' && !driverId) {
          const spare = await db.driver.findFirst({ where: { status: 'AVAILABLE' }, orderBy: { rating: 'desc' } })
          if (!spare) throw new ApiError(400, 'No available chauffeur to assign — try again later')
          driverId = spare.id
          data.driverId = spare.id
          await db.driver.update({ where: { id: spare.id }, data: { status: 'ON_TRIP' } })
          await notify(
            spare.userId,
            'New trip assignment',
            `You are assigned to booking ${booking.reference} — drive ${label} to ${booking.deliveryAddress ?? 'the customer'}.`,
            'TRIP',
          )
        } else if (driverId) {
          await db.driver.update({ where: { id: driverId }, data: { status: 'ON_TRIP' } })
        }

        data.status = 'OUT_FOR_DELIVERY'

        const yardLat = booking.vehicle.yard?.lat ?? null
        const yardLng = booking.vehicle.yard?.lng ?? null
        if (yardLat !== null && yardLng !== null && booking.deliveryLat !== null && booking.deliveryLng !== null) {
          void startTripSim({
            bookingId: booking.id,
            vehicleId: booking.vehicleId,
            from: { lat: yardLat, lng: yardLng },
            to: { lat: booking.deliveryLat, lng: booking.deliveryLng },
            mode: 'DELIVERY',
            label,
          })
        }
        await notify(
          booking.customerId,
          'Out for delivery',
          `Your ${label} is out for delivery${booking.deliveryAddress ? ` to ${booking.deliveryAddress}` : ''} — track it live on your booking.`,
          'TRIP',
        )
        break
      }

      case 'start': {
        if (!isOwner && !isAdmin && !isDriver) {
          throw new ApiError(403, 'Only the vehicle owner, the assigned driver or an admin can start this booking')
        }
        requireStatus('ACCEPTED')
        if (booking.mode !== 'PICKUP') {
          throw new ApiError(400, 'Delivery and chauffeur bookings are dispatched with the "dispatch" action')
        }
        data.status = 'ACTIVE'

        const yardLat = booking.vehicle.yard?.lat ?? null
        const yardLng = booking.vehicle.yard?.lng ?? null
        if (yardLat !== null && yardLng !== null) {
          void startTripSim({
            bookingId: booking.id,
            vehicleId: booking.vehicleId,
            from: { lat: yardLat, lng: yardLng },
            to: { lat: yardLat, lng: yardLng },
            mode: 'RENTAL',
            label,
          })
        }
        await notify(
          booking.customerId,
          'Rental started',
          `Your rental of ${label} has started — picked up at ${booking.pickupYard?.name ?? 'the yard'}. Enjoy the drive!`,
          'TRIP',
        )
        break
      }

      case 'deliver': {
        if (!isDriver && !isOwner && !isAdmin) {
          throw new ApiError(403, 'Only the assigned driver, the vehicle owner or an admin can complete delivery')
        }
        requireStatus('OUT_FOR_DELIVERY')
        data.status = 'ACTIVE'

        if (booking.deliveryLat !== null && booking.deliveryLng !== null) {
          void startTripSim({
            bookingId: booking.id,
            vehicleId: booking.vehicleId,
            from: { lat: booking.deliveryLat, lng: booking.deliveryLng },
            to: { lat: booking.deliveryLat, lng: booking.deliveryLng },
            mode: 'RENTAL',
            label,
          })
        }
        await notify(
          booking.customerId,
          'Car delivered',
          `${label} has been delivered${booking.deliveryAddress ? ` to ${booking.deliveryAddress}` : ''} — your rental is now active.`,
          'TRIP',
        )
        break
      }

      case 'return': {
        if (!isOwner && !isDriver && !isAdmin) {
          throw new ApiError(403, 'Only the vehicle owner, the assigned driver or an admin can mark a return')
        }
        requireStatus('ACTIVE')
        data.status = 'RETURNED'
        await notify(
          booking.customerId,
          'Car returned',
          `${label} has been returned — we are inspecting it and will release your KSh ${booking.deposit.toLocaleString('en-KE')} deposit shortly.`,
          'TRIP',
        )
        break
      }

      case 'complete': {
        if (!isOwner && !isAdmin) throw new ApiError(403, 'Only the vehicle owner or an admin can complete this booking')
        requireStatus('RETURNED')
        data.status = 'COMPLETED'
        await db.vehicle.update({ where: { id: booking.vehicleId }, data: { status: 'AVAILABLE' } })
        if (booking.driverId) {
          await db.driver.update({
            where: { id: booking.driverId },
            data: { status: 'AVAILABLE', tripsCompleted: { increment: 1 } },
          })
        }
        await stopTripSim(booking.id)
        await notify(
          booking.customerId,
          'Trip completed',
          `Your rental of ${label} is complete — thank you for choosing SafariDrive. Leave a review to help other travellers!`,
        )
        break
      }
    }

    await db.booking.update({ where: { id: booking.id }, data })

    const updated = (await db.booking.findUnique({
      where: { id: booking.id },
      include: bookingInclude,
    })) as BookingRow
    return NextResponse.json({ booking: serializeBooking(updated) })
  })
}
