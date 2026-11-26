import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { ApiError, handle, optionalInt, readJson } from '@/app/api/_lib/api'
import { driverInclude, serializeDriver } from '@/app/api/_lib/serialize'

type Ctx = { params: Promise<{ id: string }> }

const DRIVER_STATUSES = ['AVAILABLE', 'ON_TRIP', 'OFFLINE']

export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    await requireUser(['ADMIN'])
    const { id } = await ctx.params
    const body = await readJson(req)

    const driver = await db.driver.findUnique({ where: { id } })
    if (!driver) throw new ApiError(404, 'Driver not found')

    const data: Prisma.DriverUncheckedUpdateInput = {}
    if (body.status !== undefined) {
      if (!DRIVER_STATUSES.includes(String(body.status))) {
        throw new ApiError(400, 'Status must be one of: AVAILABLE, ON_TRIP, OFFLINE')
      }
      data.status = body.status
    }
    if (body.dailyRate !== undefined) {
      data.dailyRate = optionalInt(body.dailyRate, 'Daily rate', { min: 500, max: 20000 })
    }
    if (Object.keys(data).length === 0) throw new ApiError(400, 'Nothing to update')

    const updated = await db.driver.update({ where: { id }, data, include: driverInclude })
    return NextResponse.json({ driver: serializeDriver(updated) })
  })
}
