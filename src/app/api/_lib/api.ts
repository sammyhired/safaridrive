// ============================================================
// SafariDrive API — shared helpers for route handlers
// (private folder: the underscore prefix keeps it out of routing)
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/** Thrown for expected, user-facing errors; converted to `{error}` JSON by `handle`. */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Wraps a route handler body. Expected failures (Response thrown by
 * requireUser, or ApiError) are returned verbatim; anything else is a 500.
 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof Response) return err
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api] unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Parse a JSON request body, 400 on invalid JSON, 413 when oversized. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    // Cap before parsing: readJson feeds every route, so no unbounded JSON
    // may reach Prisma or the pricing engine (proxy.ts also guards earlier).
    const raw = await req.text()
    if (raw.length > 262_144) {
      throw new ApiError(413, 'Request body too large')
    }
    const body = raw ? JSON.parse(raw) : {}
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError(400, 'Request body must be a JSON object')
    }
    return body as Record<string, unknown>
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(400, 'Invalid JSON body')
  }
}

// ---------- small validators ----------
export function requireString(value: unknown, field: string, opts?: { min?: number; max?: number }): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, `${field} is required`)
  }
  const v = value.trim()
  if (opts?.min && v.length < opts.min) throw new ApiError(400, `${field} must be at least ${opts.min} characters`)
  if (opts?.max && v.length > opts.max) throw new ApiError(400, `${field} must be at most ${opts.max} characters`)
  return v
}

export function optionalString(value: unknown, field: string, opts?: { max?: number }): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return requireString(value, field, opts)
}

export function requireInt(
  value: unknown,
  field: string,
  opts?: { min?: number; max?: number },
): number {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n)) {
    throw new ApiError(400, `${field} must be a whole number`)
  }
  if (opts?.min !== undefined && n < opts.min) throw new ApiError(400, `${field} must be at least ${opts.min}`)
  if (opts?.max !== undefined && n > opts.max) throw new ApiError(400, `${field} must be at most ${opts.max}`)
  return n
}

export function optionalInt(
  value: unknown,
  field: string,
  opts?: { min?: number; max?: number },
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return requireInt(value, field, opts)
}

export function requireNumber(value: unknown, field: string): number {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new ApiError(400, `${field} must be a number`)
  return n
}

export function parseDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new ApiError(400, `${field} is required (ISO date)`)
  }
  const d = new Date(value as string)
  if (isNaN(d.getTime())) throw new ApiError(400, `${field} is not a valid date`)
  return d
}

export function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ApiError(400, `${field} must be one of: ${allowed.join(', ')}`)
  }
  return value as T
}

// ---------- domain helpers ----------
const REF_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Unique booking reference, e.g. SD-7KX3QM. */
export async function generateBookingReference(): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt++) {
    let ref = 'SD-'
    for (let i = 0; i < 6; i++) ref += REF_CHARSET[Math.floor(Math.random() * REF_CHARSET.length)]
    const existing = await db.booking.findUnique({ where: { reference: ref }, select: { id: true } })
    if (!existing) return ref
  }
  throw new ApiError(500, 'Could not generate a booking reference')
}

/** Create a notification row (never blocks the main flow). */
export async function notify(
  userId: string,
  title: string,
  body: string,
  type: 'BOOKING' | 'PAYMENT' | 'TRIP' | 'SYSTEM' = 'BOOKING',
): Promise<void> {
  try {
    await db.notification.create({ data: { userId, title, body, type } })
  } catch (err) {
    console.error('[api] failed to create notification:', err)
  }
}

/** Vehicle label used across notifications and charts. */
export function vehicleLabel(v: { make: string; model: string; year: number }): string {
  return `${v.make} ${v.model} (${v.year})`
}

/** Bookings that still occupy the vehicle (block availability). */
export const BLOCKING_BOOKING_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'ACCEPTED',
  'OUT_FOR_DELIVERY',
  'ACTIVE',
  'RETURNED',
] as const
