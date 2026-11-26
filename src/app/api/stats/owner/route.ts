import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { handle, vehicleLabel } from '@/app/api/_lib/api'
import { bookingInclude } from '@/app/api/_lib/serialize'
import { bucketMonthly, lastSixMonths, utilizationPercent } from '@/app/api/_lib/stats'

export async function GET() {
  return handle(async () => {
    const user = await requireUser(['OWNER'])
    const now = new Date()

    const [vehicles, bookings, expenses] = await Promise.all([
      db.vehicle.findMany({ where: { ownerId: user.id }, select: { id: true } }),
      db.booking.findMany({
        where: { vehicle: { ownerId: user.id } },
        include: bookingInclude,
      }),
      db.expense.findMany({
        where: { vehicle: { ownerId: user.id } },
        select: { date: true, amount: true },
      }),
    ])

    const completed = bookings.filter((b) => b.status === 'COMPLETED')
    const revenueTotal = completed.reduce((sum, b) => sum + b.total, 0)
    const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0)

    const onRent = bookings.filter((b) => b.status !== 'REJECTED' && b.status !== 'CANCELLED' && b.status !== 'PENDING_PAYMENT')
    const utilization = utilizationPercent(
      vehicles.length,
      onRent.map((b) => ({ startDate: b.startDate, endDate: b.endDate })),
      now,
    )

    const monthly = bucketMonthly(
      lastSixMonths(now),
      completed.map((b) => ({ startDate: b.startDate, total: b.total })),
      expenses.map((e) => ({ date: e.date, amount: e.amount })),
    )

    const byVehicle = new Map<string, { label: string; revenue: number; bookings: number }>()
    for (const b of completed) {
      const key = b.vehicleId
      const entry = byVehicle.get(key) ?? {
        label: vehicleLabel(b.vehicle),
        revenue: 0,
        bookings: 0,
      }
      entry.revenue += b.total
      entry.bookings += 1
      byVehicle.set(key, entry)
    }
    const topVehicles = [...byVehicle.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5)

    return NextResponse.json({
      stats: {
        fleetSize: vehicles.length,
        activeRentals: bookings.filter((b) => b.status === 'ACTIVE').length,
        pendingBookings: bookings.filter((b) => b.status === 'PENDING_PAYMENT' || b.status === 'PAID').length,
        upcomingBookings: bookings.filter((b) => b.status === 'ACCEPTED').length,
        revenueTotal,
        expensesTotal,
        netRevenue: revenueTotal - expensesTotal,
        utilization,
        monthly,
        topVehicles,
      },
    })
  })
}
