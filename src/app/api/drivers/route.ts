import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { handle } from '@/app/api/_lib/api'
import { driverInclude, serializeDriver } from '@/app/api/_lib/serialize'
import type { DriverProfile } from '@/lib/types'

/**
 * Driver directory (chauffeur picker + owner roster).
 * Requires a session; phone numbers and licence numbers are only included
 * for OWNER / ADMIN (fleet managers). Customers and drivers picking a
 * chauffeur get a PII-stripped list — enough to choose, nothing more.
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser()
    const drivers = await db.driver.findMany({
      include: driverInclude,
      orderBy: [{ status: 'asc' }, { rating: 'desc' }],
    })

    const full = user.role === 'OWNER' || user.role === 'ADMIN'
    const rows: DriverProfile[] = drivers.map((d) => {
      const base = serializeDriver(d)
      return full ? base : { ...base, phone: null, licenseNo: null }
    })
    return NextResponse.json({ drivers: rows })
  })
}
