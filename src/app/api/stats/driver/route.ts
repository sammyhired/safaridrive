import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { ApiError, handle } from '@/app/api/_lib/api'
import { bookingInclude, serializeBooking } from '@/app/api/_lib/serialize'

export async function GET() {
  return handle(async () => {
    const user = await requireUser(['DRIVER'])

    const driver = await db.driver.findUnique({ where: { userId: user.id } })
    if (!driver) throw new ApiError(404, 'No driver profile found for this account')

    const bookings = await db.booking.findMany({
      where: { driverId: driver.id },
      include: bookingInclude,
      orderBy: { startDate: 'asc' },
    })

    const activeJob =
      bookings.find((b) => b.status === 'OUT_FOR_DELIVERY' || b.status === 'ACTIVE') ?? null
    const upcomingJobs = bookings.filter(
      (b) => (b.status === 'PAID' || b.status === 'ACCEPTED') && b.startDate.getTime() > Date.now(),
    )

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const earningsThisMonth = bookings
      .filter(
        (b) => b.status === 'COMPLETED' && b.startDate >= monthStart && b.startDate < monthEnd,
      )
      .reduce((sum, b) => sum + b.driverTotal, 0)

    return NextResponse.json({
      stats: {
        activeJob: activeJob ? serializeBooking(activeJob) : null,
        upcomingJobs: upcomingJobs.map(serializeBooking),
        completedTrips: driver.tripsCompleted,
        earningsThisMonth,
        rating: driver.rating,
        status: driver.status,
      },
    })
  })
}
