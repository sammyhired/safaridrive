import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { PLATFORM_COMMISSION_RATE } from '@/lib/constants'
import { handle, vehicleLabel } from '@/app/api/_lib/api'
import { bookingInclude, serializeBooking } from '@/app/api/_lib/serialize'
import { bucketMonthly, lastSixMonths } from '@/app/api/_lib/stats'
import type { BookingStatus } from '@/lib/types'

const STATUS_ORDER: BookingStatus[] = [
  'PENDING_PAYMENT',
  'PAID',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
  'OUT_FOR_DELIVERY',
  'ACTIVE',
  'RETURNED',
  'COMPLETED',
]

export async function GET() {
  return handle(async () => {
    await requireUser(['ADMIN'])
    const now = new Date()

    const [users, vehicles, bookings, expenses] = await Promise.all([
      db.user.findMany({ select: { role: true } }),
      db.vehicle.findMany({ select: { id: true } }),
      db.booking.findMany({ include: bookingInclude, orderBy: { createdAt: 'desc' } }),
      db.expense.findMany({ select: { date: true, amount: true } }),
    ])

    const completed = bookings.filter((b) => b.status === 'COMPLETED')
    const totalRevenue = completed.reduce((sum, b) => sum + b.total, 0)
    const platformCommission = Math.round(totalRevenue * PLATFORM_COMMISSION_RATE)

    const monthly = bucketMonthly(
      lastSixMonths(now),
      completed.map((b) => ({ startDate: b.startDate, total: b.total })),
      expenses.map((e) => ({ date: e.date, amount: e.amount })),
    )

    const statusCounts = new Map<string, number>()
    for (const b of bookings) statusCounts.set(b.status, (statusCounts.get(b.status) ?? 0) + 1)
    const bookingsByStatus = STATUS_ORDER.filter((s) => statusCounts.has(s)).map((status) => ({
      status,
      count: statusCounts.get(status) as number,
    }))

    const byVehicle = new Map<string, { label: string; revenue: number; bookings: number }>()
    for (const b of completed) {
      const entry = byVehicle.get(b.vehicleId) ?? {
        label: vehicleLabel(b.vehicle),
        revenue: 0,
        bookings: 0,
      }
      entry.revenue += b.total
      entry.bookings += 1
      byVehicle.set(b.vehicleId, entry)
    }
    const topVehicles = [...byVehicle.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5)

    return NextResponse.json({
      stats: {
        totalUsers: users.length,
        customers: users.filter((u) => u.role === 'CUSTOMER').length,
        owners: users.filter((u) => u.role === 'OWNER').length,
        drivers: users.filter((u) => u.role === 'DRIVER').length,
        totalVehicles: vehicles.length,
        activeRentals: bookings.filter((b) => b.status === 'ACTIVE').length,
        totalRevenue,
        platformCommission,
        monthly,
        bookingsByStatus,
        recentBookings: bookings.slice(0, 8).map(serializeBooking),
        topVehicles,
      },
    })
  })
}
