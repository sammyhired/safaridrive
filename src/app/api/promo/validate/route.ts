import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { evaluatePromo } from '@/lib/pricing'
import { ApiError, handle, readJson, requireNumber, requireString } from '@/app/api/_lib/api'

/**
 * Authenticated: used by the booking flow to preview a promo against a
 * subtotal. Kept session-gated so anonymous callers cannot probe the promo
 * catalogue (valid / expired / exhausted) as an enumeration oracle.
 */
export async function POST(req: Request) {
  return handle(async () => {
    await requireUser()
    const body = await readJson(req)
    const code = requireString(body.code, 'Code', { min: 1, max: 20 })
    const subtotal = requireNumber(body.subtotal, 'subtotal')
    if (subtotal < 0) throw new ApiError(400, 'subtotal cannot be negative')

    const promo = await db.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } })
    const result = evaluatePromo(code, promo, Math.round(subtotal))
    return NextResponse.json(result)
  })
}
