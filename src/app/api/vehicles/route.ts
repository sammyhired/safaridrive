import { NextResponse, type NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { CATEGORY_ORDER } from '@/lib/constants'
import {
  ApiError,
  BLOCKING_BOOKING_STATUSES,
  handle,
  oneOf,
  optionalInt,
  readJson,
  requireInt,
  requireString,
  optionalString,
} from '@/app/api/_lib/api'
import { serializeVehicle, vehicleInclude } from '@/app/api/_lib/serialize'

const LIST_STATUSES = ['AVAILABLE', 'BOOKED']

export async function GET(req: NextRequest) {
  return handle(async () => {
    const sp = req.nextUrl.searchParams
    const q = sp.get('q')?.trim()
    const category = sp.get('category')?.trim()
    const city = sp.get('city')?.trim()
    const yardId = sp.get('yardId')?.trim()
    const minRate = sp.get('minRate')
    const maxRate = sp.get('maxRate')
    const transmission = sp.get('transmission')?.trim()
    const seats = sp.get('seats')
    const sort = sp.get('sort')?.trim() || 'price_asc'
    const startDate = sp.get('startDate')
    const endDate = sp.get('endDate')

    const where: Prisma.VehicleWhereInput = { status: { in: LIST_STATUSES } }

    if (q) {
      where.OR = [
        { make: { contains: q } },
        { model: { contains: q } },
        { plate: { contains: q } },
      ]
    }
    if (category) {
      if (!CATEGORY_ORDER.includes(category as never)) throw new ApiError(400, 'Unknown category')
      where.category = category
    }
    if (city) where.yard = { city }
    if (yardId) where.yardId = yardId
    if (minRate || maxRate) {
      where.dailyRate = {
        ...(minRate ? { gte: requireInt(Number(minRate), 'minRate', { min: 0 }) } : {}),
        ...(maxRate ? { lte: requireInt(Number(maxRate), 'maxRate', { min: 0 }) } : {}),
      }
    }
    if (transmission) where.transmission = transmission
    if (seats) where.seats = { gte: requireInt(Number(seats), 'seats', { min: 1, max: 60 }) }

    // Availability: exclude vehicles with a blocking booking overlapping the window
    if (startDate && endDate) {
      const start = new Date(startDate)
      const end = new Date(endDate)
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
        where.bookings = {
          none: {
            startDate: { lt: end },
            endDate: { gt: start },
            status: { notIn: [...BLOCKING_BOOKING_STATUSES] },
          },
        }
      }
    }

    const orderBy =
      sort === 'price_desc'
        ? [{ dailyRate: 'desc' as const }, { createdAt: 'desc' as const }]
        : sort === 'rating'
          ? [{ rating: 'desc' as const }, { dailyRate: 'asc' as const }]
          : sort === 'newest'
            ? [{ createdAt: 'desc' as const }]
            : [{ dailyRate: 'asc' as const }, { createdAt: 'desc' as const }]

    // Hard cap — the anonymous catalog can never be used to pull the whole
    // fleet (with owner + yard joins) as one unbounded response.
    const vehicles = await db.vehicle.findMany({ where, include: vehicleInclude, orderBy, take: 200 })
    return NextResponse.json({ vehicles: vehicles.map(serializeVehicle) })
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const owner = await requireUser(['OWNER'])
    const body = await readJson(req)

    const make = requireString(body.make, 'Make', { min: 2, max: 40 })
    const model = requireString(body.model, 'Model', { min: 1, max: 40 })
    const year = requireInt(body.year, 'Year', { min: 1980, max: new Date().getFullYear() + 1 })
    const category = oneOf(body.category, 'Category', CATEGORY_ORDER)
    const plate = requireString(body.plate, 'Plate', { min: 4, max: 12 }).toUpperCase()
    const seats = requireInt(body.seats, 'Seats', { min: 2, max: 60 })
    const dailyRate = requireInt(body.dailyRate, 'Daily rate', { min: 500, max: 500000 })
    const securityDeposit = requireInt(body.securityDeposit, 'Security deposit', { min: 0, max: 500000 })
    const transmission = oneOf(body.transmission ?? 'Automatic', 'Transmission', ['Manual', 'Automatic'] as const)
    const fuelType = requireString(body.fuelType ?? 'Petrol', 'Fuel type', { max: 20 })
    const yardId = optionalString(body.yardId, 'Yard')
    const imageUrl = optionalString(body.imageUrl, 'Image URL', { max: 500 }) ?? ''
    const description = optionalString(body.description, 'Description', { max: 1000 }) ?? null
    const mileageLimitKmPerDay = optionalInt(body.mileageLimitKmPerDay, 'Mileage limit', { min: 20, max: 2000 })
    const excessPerKm = optionalInt(body.excessPerKm, 'Excess per km', { min: 0, max: 1000 }) ?? 50
    const doors = optionalInt(body.doors, 'Doors', { min: 2, max: 8 }) ?? 4
    const features = Array.isArray(body.features)
      ? body.features.filter((f): f is string => typeof f === 'string').join(', ')
      : typeof body.features === 'string'
        ? body.features
        : ''

    if (yardId) {
      const yard = await db.rentalYard.findUnique({ where: { id: yardId }, select: { id: true } })
      if (!yard) throw new ApiError(400, 'Rental yard not found')
    }

    const plateTaken = await db.vehicle.findUnique({ where: { plate }, select: { id: true } })
    if (plateTaken) throw new ApiError(400, `Plate ${plate} is already registered`)

    const vehicle = await db.vehicle.create({
      data: {
        ownerId: owner.id,
        yardId: yardId ?? null,
        make,
        model,
        year,
        category,
        plate,
        seats,
        doors,
        transmission,
        fuelType,
        dailyRate,
        securityDeposit,
        mileageLimitKmPerDay: mileageLimitKmPerDay ?? null,
        excessPerKm,
        imageUrl,
        features,
        description,
        status: 'AVAILABLE',
      },
      include: vehicleInclude,
    })
    return NextResponse.json({ vehicle: serializeVehicle(vehicle) })
  })
}
