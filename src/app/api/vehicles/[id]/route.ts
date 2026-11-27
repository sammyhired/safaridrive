import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { CATEGORY_ORDER } from '@/lib/constants'
import {
  ApiError,
  handle,
  optionalInt,
  optionalString,
  readJson,
  requireInt,
  requireString,
} from '@/app/api/_lib/api'
import { serializeVehicle, vehicleInclude } from '@/app/api/_lib/serialize'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params
    const vehicle = await db.vehicle.findUnique({ where: { id }, include: vehicleInclude })
    if (!vehicle) throw new ApiError(404, 'Vehicle not found')

    const reviews = await db.review.findMany({
      where: { booking: { vehicleId: id } },
      include: { author: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    return NextResponse.json({
      vehicle: serializeVehicle(vehicle),
      reviews: reviews.map((r) => ({
        id: r.id,
        bookingId: r.bookingId,
        authorName: r.author.name,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
      })),
    })
  })
}

export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser()
    const { id } = await ctx.params
    const body = await readJson(req)

    const vehicle = await db.vehicle.findUnique({ where: { id } })
    if (!vehicle) throw new ApiError(404, 'Vehicle not found')
    if (user.role !== 'ADMIN' && vehicle.ownerId !== user.id) {
      throw new ApiError(403, 'Only the vehicle owner or an admin can update this vehicle')
    }

    const data: Prisma.VehicleUncheckedUpdateInput = {}
    if (body.make !== undefined) data.make = requireString(body.make, 'Make', { min: 2, max: 40 })
    if (body.model !== undefined) data.model = requireString(body.model, 'Model', { min: 1, max: 40 })
    if (body.year !== undefined) data.year = requireInt(body.year, 'Year', { min: 1980, max: new Date().getFullYear() + 1 })
    if (body.category !== undefined) {
      if (!CATEGORY_ORDER.includes(body.category as never)) throw new ApiError(400, 'Unknown category')
      data.category = String(body.category)
    }
    if (body.plate !== undefined) {
      const plate = requireString(body.plate, 'Plate', { min: 4, max: 12 }).toUpperCase()
      // Pre-check so a duplicate plate returns a 400 instead of a raw 500
      const clash = await db.vehicle.findFirst({
        where: { plate, id: { not: id } },
        select: { id: true },
      })
      if (clash) throw new ApiError(400, `A vehicle with plate ${plate} already exists`)
      data.plate = plate
    }
    if (body.seats !== undefined) data.seats = requireInt(body.seats, 'Seats', { min: 2, max: 60 })
    if (body.doors !== undefined) data.doors = requireInt(body.doors, 'Doors', { min: 2, max: 8 })
    if (body.transmission !== undefined) {
      if (!['Manual', 'Automatic'].includes(String(body.transmission))) {
        throw new ApiError(400, 'Transmission must be Manual or Automatic')
      }
      data.transmission = String(body.transmission)
    }
    if (body.fuelType !== undefined) data.fuelType = requireString(body.fuelType, 'Fuel type', { max: 20 })
    if (body.dailyRate !== undefined) data.dailyRate = requireInt(body.dailyRate, 'Daily rate', { min: 500, max: 500000 })
    if (body.securityDeposit !== undefined) {
      data.securityDeposit = requireInt(body.securityDeposit, 'Security deposit', { min: 0, max: 500000 })
    }
    if (body.mileageLimitKmPerDay !== undefined) {
      data.mileageLimitKmPerDay = body.mileageLimitKmPerDay === null
        ? null
        : optionalInt(body.mileageLimitKmPerDay, 'Mileage limit', { min: 20, max: 2000 }) ?? null
    }
    if (body.excessPerKm !== undefined) data.excessPerKm = requireInt(body.excessPerKm, 'Excess per km', { min: 0, max: 1000 })
    if (body.imageUrl !== undefined) data.imageUrl = optionalString(body.imageUrl, 'Image URL', { max: 500 }) ?? ''
    if (body.description !== undefined) data.description = optionalString(body.description, 'Description', { max: 1000 }) ?? null
    if (body.yardId !== undefined) {
      if (body.yardId === null || body.yardId === '') {
        data.yardId = null
      } else {
        const yardId = requireString(body.yardId, 'Yard')
        const yard = await db.rentalYard.findUnique({ where: { id: yardId }, select: { id: true } })
        if (!yard) throw new ApiError(400, 'Rental yard not found')
        data.yardId = yardId
      }
    }
    if (body.features !== undefined) {
      data.features = Array.isArray(body.features)
        ? body.features.filter((f): f is string => typeof f === 'string').join(', ')
        : typeof body.features === 'string'
          ? body.features
          : ''
    }
    if (body.status !== undefined) {
      if (!['AVAILABLE', 'MAINTENANCE'].includes(String(body.status))) {
        throw new ApiError(400, 'Status can only be set to AVAILABLE or MAINTENANCE')
      }
      data.status = String(body.status)
    }

    const updated = await db.vehicle.update({ where: { id }, data, include: vehicleInclude })
    return NextResponse.json({ vehicle: serializeVehicle(updated) })
  })
}
