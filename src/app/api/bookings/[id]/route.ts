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
import { bookingInclude, serializeBookingFor, type BookingRow } from '@/app/api/_lib/serialize'

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

type Tx = Prisma.TransactionClient

async function releaseVehicleIfFree(tx: Tx, vehicleId: string, excludeBookingId: string): Promise<void> {
  const blocking = await tx.booking.findFirst({
    where: {
      vehicleId,
      id: { not: excludeBookingId },
      status: { in: [...BLOCKING_BOOKING_STATUSES] },
    },
    select: { id: true },
  })
  if (!blocking) {
    await tx.vehicle.update({ where: { id: vehicleId }, data: { status: 'AVAILABLE' } })
  }
}

async function refundCompletedPayments(tx: Tx, bookingId: string, retainedFee = 0): Promise<void> {
  // Mark completed payments refunded, recording how much of each amount is
  // actually returned (retainedFee — e.g. a late-cancellation penalty — is
  // withheld from the rental payment, never exceeding its amount).
  const completed = await tx.payment.findMany({
    where: { bookingId, status: 'COMPLETED' },
    orderBy: { createdAt: 'asc' },
  })
  let feeLeft = retainedFee
  for (const p of completed) {
    const retain = Math.min(feeLeft, p.amount)
    feeLeft -= retain
    await tx.payment.update({
      where: { id: p.id },
      data: { status: 'REFUNDED', refundedAmount: p.amount - retain },
    })
  }
}

/** Return a burned promo use when an UNPAID booking is cancelled. */
async function releasePromoUse(tx: Tx, promoCode: string | null): Promise<void> {
  if (!promoCode) return
  // Conditional decrement: never drops below zero
  await tx.promoCode.updateMany({
    where: { code: promoCode, usedCount: { gt: 0 } },
    data: { usedCount: { decrement: 1 } },
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
    return NextResponse.json({ booking: serializeBookingFor(booking, user.role) })
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

    // Side effects that must only run AFTER the transition commits: the
    // transaction below makes the read-check-write of the state machine
    // atomic, while notifications and tracking-service calls (external HTTP)
    // are queued and executed once the new status is durable.
    const notifyQueue: Array<{ userId: string; title: string; body: string; type?: 'BOOKING' | 'PAYMENT' | 'TRIP' | 'SYSTEM' }> = []
    const queueNotify = (userId: string, title: string, text: string, type: 'BOOKING' | 'PAYMENT' | 'TRIP' | 'SYSTEM' = 'BOOKING') => {
      notifyQueue.push({ userId, title, body: text, type })
    }
    const simQueue: Array<{ kind: 'start'; payload: Parameters<typeof startTripSim>[0] } | { kind: 'stop'; bookingId: string }> = []

    const updated = await db.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id }, include: bookingInclude })
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
          queueNotify(
            booking.customerId,
            'Booking confirmed',
            `Booking ${booking.reference} confirmed — ${label} from ${fmtDate(booking.startDate)} to ${fmtDate(booking.endDate)}.${
              booking.driver ? ` Your chauffeur is ${booking.driver.user.name}.` : ''
            }`,
          )
          if (booking.driver) {
            queueNotify(
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
          await refundCompletedPayments(tx, booking.id)
          await releaseVehicleIfFree(tx, booking.vehicleId, booking.id)
          queueNotify(
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
          const withinFeeWindow = hoursToStart < CANCEL_FREE_HOURS
          if (paid) {
            data.paymentStatus = 'REFUNDED'
            // The late-cancellation fee is actually withheld (not just
            // announced): the rental payment is refunded minus the fee.
            const fee = withinFeeWindow ? Math.round(booking.total * CANCEL_FEE_RATE) : 0
            await refundCompletedPayments(tx, booking.id, fee)
          } else {
            // Never-paid booking: give the burned promo use back so unpaid
            // create-then-cancel cycles cannot exhaust a campaign's quota.
            await releasePromoUse(tx, booking.promoCode)
          }
          if (withinFeeWindow) {
            const fee = Math.round(booking.total * CANCEL_FEE_RATE)
            data.cancelReason =
              `Cancelled ${Math.max(0, Math.round(hoursToStart))}h before start — 20% fee applies ` +
              `(KSh ${fee.toLocaleString('en-KE')} retained)${reason ? ` — ${reason}` : ''}`
          } else {
            data.cancelReason = `Cancelled ${Math.round(hoursToStart)}h before start — free cancellation${reason ? ` — ${reason}` : ''}`
          }
          await releaseVehicleIfFree(tx, booking.vehicleId, booking.id)
          simQueue.push({ kind: 'stop', bookingId: booking.id })
          queueNotify(
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
            const spare = await tx.driver.findFirst({ where: { status: 'AVAILABLE' }, orderBy: { rating: 'desc' } })
            if (!spare) throw new ApiError(400, 'No available chauffeur to assign — try again later')
            driverId = spare.id
            data.driverId = spare.id
            await tx.driver.update({ where: { id: spare.id }, data: { status: 'ON_TRIP' } })
            queueNotify(
              spare.userId,
              'New trip assignment',
              `You are assigned to booking ${booking.reference} — drive ${label} to ${booking.deliveryAddress ?? 'the customer'}.`,
              'TRIP',
            )
          } else if (driverId) {
            await tx.driver.update({ where: { id: driverId }, data: { status: 'ON_TRIP' } })
          }

          data.status = 'OUT_FOR_DELIVERY'

          const yardLat = booking.vehicle.yard?.lat ?? null
          const yardLng = booking.vehicle.yard?.lng ?? null
          if (yardLat !== null && yardLng !== null && booking.deliveryLat !== null && booking.deliveryLng !== null) {
            simQueue.push({
              kind: 'start',
              payload: {
                bookingId: booking.id,
                vehicleId: booking.vehicleId,
                from: { lat: yardLat, lng: yardLng },
                to: { lat: booking.deliveryLat, lng: booking.deliveryLng },
                mode: 'DELIVERY',
                label,
              },
            })
          }
          queueNotify(
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
            simQueue.push({
              kind: 'start',
              payload: {
                bookingId: booking.id,
                vehicleId: booking.vehicleId,
                from: { lat: yardLat, lng: yardLng },
                to: { lat: yardLat, lng: yardLng },
                mode: 'RENTAL',
                label,
              },
            })
          }
          queueNotify(
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
            simQueue.push({
              kind: 'start',
              payload: {
                bookingId: booking.id,
                vehicleId: booking.vehicleId,
                from: { lat: booking.deliveryLat, lng: booking.deliveryLng },
                to: { lat: booking.deliveryLat, lng: booking.deliveryLng },
                mode: 'RENTAL',
                label,
              },
            })
          }
          queueNotify(
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
          queueNotify(
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
          // Only free the vehicle when no other booking still occupies it
          await releaseVehicleIfFree(tx, booking.vehicleId, booking.id)
          if (booking.driverId) {
            await tx.driver.update({
              where: { id: booking.driverId },
              data: { status: 'AVAILABLE', tripsCompleted: { increment: 1 } },
            })
          }
          simQueue.push({ kind: 'stop', bookingId: booking.id })
          queueNotify(
            booking.customerId,
            'Trip completed',
            `Your rental of ${label} is complete — thank you for choosing SafariDrive. Leave a review to help other travellers!`,
          )
          break
        }
      }

      await tx.booking.update({ where: { id: booking.id }, data })

      return (await tx.booking.findUnique({
        where: { id: booking.id },
        include: bookingInclude,
      })) as BookingRow
    })

    // ---- Post-commit side effects (never inside the transaction) ----
    for (const n of notifyQueue) {
      await notify(n.userId, n.title, n.body, n.type ?? 'BOOKING')
    }
    for (const op of simQueue) {
      if (op.kind === 'stop') await stopTripSim(op.bookingId)
      else await startTripSim(op.payload)
    }

    return NextResponse.json({ booking: serializeBookingFor(updated, user.role) })
  })
}
