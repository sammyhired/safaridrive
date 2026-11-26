import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handle } from '@/app/api/_lib/api'
import { serializeYard } from '@/app/api/_lib/serialize'

export async function GET() {
  return handle(async () => {
    const yards = await db.rentalYard.findMany({
      include: { vehicles: { select: { status: true } } },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ yards: yards.map(serializeYard) })
  })
}
