import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { handle } from '@/app/api/_lib/api'

export async function POST() {
  return handle(async () => {
    const user = await requireUser()
    await db.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    })
    return NextResponse.json({ ok: true })
  })
}
