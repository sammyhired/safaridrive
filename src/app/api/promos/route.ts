import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { ApiError, handle, optionalInt, readJson, requireString } from '@/app/api/_lib/api'
import { serializePromo } from '@/app/api/_lib/serialize'

export async function GET() {
  return handle(async () => {
    await requireUser(['ADMIN'])
    const promos = await db.promoCode.findMany({ orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ promos: promos.map(serializePromo) })
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireUser(['ADMIN'])
    const body = await readJson(req)

    const code = requireString(body.code, 'Code', { min: 3, max: 20 }).toUpperCase()
    if (!/^[A-Z0-9]+$/.test(code)) throw new ApiError(400, 'Code may only contain letters and numbers')
    const description = requireString(body.description, 'Description', { min: 3, max: 200 })
    const percentOff = optionalInt(body.percentOff, 'percentOff', { min: 1, max: 100 })
    const amountOff = optionalInt(body.amountOff, 'amountOff', { min: 1, max: 1_000_000 })
    if ((percentOff === undefined) === (amountOff === undefined)) {
      throw new ApiError(400, 'Provide exactly one of percentOff or amountOff')
    }
    const expiresAt = typeof body.expiresAt === 'string' && body.expiresAt ? new Date(body.expiresAt) : null
    if (expiresAt && isNaN(expiresAt.getTime())) throw new ApiError(400, 'expiresAt is not a valid date')
    // Optional total-usage cap (anti-abuse: public codes can't be farmed)
    const maxUses = optionalInt(body.maxUses, 'maxUses', { min: 1, max: 1_000_000 })

    const existing = await db.promoCode.findUnique({ where: { code } })
    if (existing) throw new ApiError(400, `Promo code ${code} already exists`)

    const promo = await db.promoCode.create({
      data: { code, description, percentOff: percentOff ?? null, amountOff: amountOff ?? null, active: true, expiresAt, maxUses },
    })
    return NextResponse.json({ promo: serializePromo(promo) })
  })
}
