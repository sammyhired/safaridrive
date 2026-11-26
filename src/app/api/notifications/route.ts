import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { handle } from '@/app/api/_lib/api'
import { serializeNotification } from '@/app/api/_lib/serialize'

export async function GET() {
  return handle(async () => {
    const user = await requireUser()
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      db.notification.count({ where: { userId: user.id, read: false } }),
    ])
    return NextResponse.json({
      notifications: notifications.map(serializeNotification),
      unreadCount,
    })
  })
}
