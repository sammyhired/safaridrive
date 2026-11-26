import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { handle } from '@/app/api/_lib/api'

export async function GET() {
  return handle(async () => {
    await requireUser(['ADMIN'])
    const users = await db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({
      users: users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    })
  })
}
