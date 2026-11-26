import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { CATEGORY_META, CATEGORY_ORDER } from '@/lib/constants'
import { handle } from '@/app/api/_lib/api'

export async function GET() {
  return handle(async () => {
    const vehicles = await db.vehicle.findMany({
      where: { status: { in: ['AVAILABLE', 'BOOKED'] } },
      select: { category: true, dailyRate: true },
    })
    const categories = CATEGORY_ORDER.map((key) => {
      const rows = vehicles.filter((v) => v.category === key)
      return {
        key,
        label: CATEGORY_META[key].label,
        count: rows.length,
        minRate: rows.length ? Math.min(...rows.map((v) => v.dailyRate)) : 0,
      }
    })
    return NextResponse.json({ categories })
  })
}
