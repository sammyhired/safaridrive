import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { ApiError, handle, readJson } from '@/app/api/_lib/api'
import { serializePromo } from '@/app/api/_lib/serialize'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    await requireUser(['ADMIN'])
    const { id } = await ctx.params
    const body = await readJson(req)
    if (typeof body.active !== 'boolean') throw new ApiError(400, 'active must be true or false')

    const promo = await db.promoCode.findUnique({ where: { id } })
    if (!promo) throw new ApiError(404, 'Promo code not found')

    const updated = await db.promoCode.update({ where: { id }, data: { active: body.active } })
    return NextResponse.json({ promo: serializePromo(updated) })
  })
}
