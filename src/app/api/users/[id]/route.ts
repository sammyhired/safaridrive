import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { ApiError, handle, oneOf, readJson } from '@/app/api/_lib/api'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const admin = await requireUser(['ADMIN'])
    const { id } = await ctx.params
    const body = await readJson(req)
    const status = oneOf(body.status, 'status', ['ACTIVE', 'SUSPENDED'] as const)

    if (id === admin.id && status === 'SUSPENDED') {
      throw new ApiError(400, 'You cannot suspend your own account')
    }

    const target = await db.user.findUnique({ where: { id } })
    if (!target) throw new ApiError(404, 'User not found')

    const updated = await db.user.update({ where: { id }, data: { status } })
    return NextResponse.json({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        role: updated.role,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
      },
    })
  })
}
