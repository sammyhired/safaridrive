import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handle } from '@/app/api/_lib/api'
import { driverInclude, serializeDriver } from '@/app/api/_lib/serialize'

export async function GET() {
  return handle(async () => {
    const drivers = await db.driver.findMany({
      include: driverInclude,
      orderBy: [{ status: 'asc' }, { rating: 'desc' }],
    })
    return NextResponse.json({ drivers: drivers.map(serializeDriver) })
  })
}
