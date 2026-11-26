import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { evaluatePromo } from '@/lib/pricing'
import { ApiError, handle, readJson, requireNumber, requireString } from '@/app/api/_lib/api'

/** Public: used by the booking flow to preview a promo against a subtotal. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req)
    const code = requireString(body.code, 'Code', { min: 1, max: 20 })
    const subtotal = requireNumber(body.subtotal, 'subtotal')
    if (subtotal < 0) throw new ApiError(400, 'subtotal cannot be negative')

    const promo = await db.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } })
    const result = evaluatePromo(code, promo, Math.round(subtotal))
    return NextResponse.json(result)
  })
}
