// ============================================================
// SafariDrive API — shared quote/booking-input pipeline
// Used by POST /api/bookings/quote and POST /api/bookings
// ============================================================
import { db } from '@/lib/db'
import { computeQuote, computeExtrasItems, type QuoteDriver, type QuotePromo } from '@/lib/pricing'
import { ApiError, parseDate } from './api'
import { driverInclude, vehicleInclude } from './serialize'
import type { Prisma } from '@prisma/client'
import type { ExtraSelection, Quote } from '@/lib/types'

const BOOKING_MODES = ['PICKUP', 'DELIVERY', 'CHAUFFEUR'] as const
const START_GRACE_MIN = 5

export interface ParsedQuoteInput {
  vehicleId: string
  startDate: Date
  endDate: Date
  mode: (typeof BOOKING_MODES)[number]
  deliveryAddress: string | null
  deliveryLat: number | null
  deliveryLng: number | null
  extras: ExtraSelection[]
  promoCode: string | null
  driverId: string | null
}

export interface QuoteContext {
  input: ParsedQuoteInput
  vehicle: Prisma.VehicleGetPayload<{ include: { owner: true; yard: true } }>
  driver: QuoteDriver | null
  driverRow: Prisma.DriverGetPayload<{ include: { user: true } }> | null
  promo: QuotePromo | null
  quote: Quote
  extrasItems: ReturnType<typeof computeExtrasItems>
}

export function parseQuoteInput(body: Record<string, unknown>): ParsedQuoteInput {
  const vehicleId = typeof body.vehicleId === 'string' ? body.vehicleId.trim() : ''
  if (!vehicleId) throw new ApiError(400, 'vehicleId is required')

  const startDate = parseDate(body.startDate, 'startDate')
  const endDate = parseDate(body.endDate, 'endDate')
  if (endDate.getTime() <= startDate.getTime()) throw new ApiError(400, 'End date must be after the start date')
  const grace = Date.now() - START_GRACE_MIN * 60 * 1000
  if (startDate.getTime() < grace) throw new ApiError(400, 'Start date cannot be in the past')

  const mode = body.mode
  if (typeof mode !== 'string' || !BOOKING_MODES.includes(mode as never)) {
    throw new ApiError(400, 'mode must be one of: PICKUP, DELIVERY, CHAUFFEUR')
  }

  const deliveryAddress =
    typeof body.deliveryAddress === 'string' && body.deliveryAddress.trim() ? body.deliveryAddress.trim() : null
  const deliveryLat = typeof body.deliveryLat === 'number' && Number.isFinite(body.deliveryLat) ? body.deliveryLat : null
  const deliveryLng = typeof body.deliveryLng === 'number' && Number.isFinite(body.deliveryLng) ? body.deliveryLng : null
  if (mode !== 'PICKUP' && !deliveryAddress && deliveryLat === null) {
    throw new ApiError(400, 'A delivery address or location is required for delivery and chauffeur bookings')
  }

  let extras: ExtraSelection[] = []
  if (Array.isArray(body.extras)) {
    extras = body.extras
      .filter(
        (e): e is ExtraSelection =>
          !!e && typeof e === 'object' && typeof (e as ExtraSelection).key === 'string',
      )
      .map((e) => ({ key: e.key, qty: Number(e.qty) || 1 }))
  }

  const promoCode =
    typeof body.promoCode === 'string' && body.promoCode.trim() ? body.promoCode.trim().toUpperCase() : null
  const driverId = typeof body.driverId === 'string' && body.driverId.trim() ? body.driverId.trim() : null

  return {
    vehicleId,
    startDate,
    endDate,
    mode: mode as ParsedQuoteInput['mode'],
    deliveryAddress,
    deliveryLat,
    deliveryLng,
    extras,
    promoCode,
    driverId,
  }
}

/** Validate input, load vehicle/driver/promo and compute the quote server-side. */
export async function buildQuoteContext(body: Record<string, unknown>): Promise<QuoteContext> {
  const input = parseQuoteInput(body)

  const vehicle = await db.vehicle.findUnique({ where: { id: input.vehicleId }, include: vehicleInclude })
  if (!vehicle) throw new ApiError(404, 'Vehicle not found')
  if (vehicle.status === 'MAINTENANCE' || vehicle.status === 'RETIRED') {
    throw new ApiError(400, 'This vehicle is currently not available for booking')
  }

  let driverRow: QuoteContext['driverRow'] = null
  if (input.mode === 'CHAUFFEUR') {
    if (!input.driverId) throw new ApiError(400, 'A driver is required for chauffeur bookings')
    driverRow = await db.driver.findUnique({ where: { id: input.driverId }, include: driverInclude })
    if (!driverRow) throw new ApiError(404, 'Driver not found')
    if (driverRow.status === 'OFFLINE') throw new ApiError(400, 'This driver is currently offline')
  }

  const driver: QuoteDriver | null = driverRow
    ? { name: driverRow.user.name, dailyRate: driverRow.dailyRate }
    : null

  let promo: QuotePromo | null = null
  if (input.promoCode) {
    promo = await db.promoCode.findUnique({ where: { code: input.promoCode } })
  }

  const quote = computeQuote(
    {
      startDate: input.startDate.toISOString(),
      endDate: input.endDate.toISOString(),
      mode: input.mode,
      deliveryLat: input.deliveryLat ?? undefined,
      deliveryLng: input.deliveryLng ?? undefined,
      extras: input.extras,
      promoCode: input.promoCode ?? undefined,
    },
    {
      dailyRate: vehicle.dailyRate,
      securityDeposit: vehicle.securityDeposit,
      yardLat: vehicle.yard?.lat ?? null,
      yardLng: vehicle.yard?.lng ?? null,
    },
    driver,
    promo,
  )

  const extrasItems = computeExtrasItems(input.extras, quote.days)

  return { input, vehicle, driver, driverRow, promo, quote, extrasItems }
}
