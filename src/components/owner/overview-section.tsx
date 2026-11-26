'use client'

// Owner overview — KPIs, revenue vs expenses chart, top vehicles, fleet
// utilization and paid bookings awaiting approval.

import { useState } from 'react'
import {
  CalendarClock,
  CarFront,
  CheckCircle2,
  Clock,
  Loader2,
  Route,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/shared/stat-card'
import { formatDate, formatKes, formatKesShort } from '@/lib/format'
import type { Booking } from '@/lib/types'
import { useBookingAction, useBookingsGroup, useOwnerStats } from './_shared/api'
import { RejectBookingDialog } from './_shared/booking-dialogs'
import { TrendChart, TopVehiclesChart } from './_shared/charts'
import { ErrorState } from './_shared/states'
import { ChartSkeleton, StatGridSkeleton } from './_shared/skeletons'
import { SectionHeader } from './_shared/section-header'
import { VehicleThumb } from './_shared/ui-bits'

export function OverviewSection() {
  const statsQuery = useOwnerStats()
  const pendingQuery = useBookingsGroup('PAID')
  const action = useBookingAction()
  const [rejectTarget, setRejectTarget] = useState<Booking | null>(null)

  if (statsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Overview" description="How your fleet is doing right now." />
        <StatGridSkeleton count={6} />
        <div className="grid gap-4 lg:grid-cols-5">
          <ChartSkeleton className="lg:col-span-3" />
          <ChartSkeleton className="lg:col-span-2" />
        </div>
      </div>
    )
  }

  if (statsQuery.isError || !statsQuery.data) {
    return (
      <ErrorState
        error={statsQuery.error}
        onRetry={() => {
          void statsQuery.refetch()
        }}
      />
    )
  }

  const stats = statsQuery.data.stats
  const pendingBookings = (pendingQuery.data?.bookings ?? [])
    .filter((b) => b.status === 'PAID')
    .slice(0, 4)

  // `utilization` may arrive as a 0..1 ratio or a 0..100 percent — normalise.
  const utilizationPct = Math.round(
    stats.utilization <= 1 ? stats.utilization * 100 : stats.utilization,
  )
  const possibleDays = stats.fleetSize * 30
  const bookedDays = Math.round((utilizationPct / 100) * possibleDays)

  const busyBookingId = action.isPending ? action.variables?.booking.id : undefined

  return (
    <div className="space-y-6">
      <SectionHeader title="Overview" description="How your fleet is doing right now." />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Fleet size" value={String(stats.fleetSize)} icon={CarFront} hint="Vehicles you own" />
        <StatCard title="Active rentals" value={String(stats.activeRentals)} icon={Route} hint="On the road now" />
        <StatCard title="Pending" value={String(stats.pendingBookings)} icon={Clock} hint="Awaiting your action" />
        <StatCard title="Upcoming" value={String(stats.upcomingBookings)} icon={CalendarClock} hint="Confirmed, starting soon" />
        <StatCard title="Revenue" value={formatKesShort(stats.revenueTotal)} icon={Wallet} hint="Completed bookings" />
        <StatCard
          title="Net revenue"
          value={formatKesShort(stats.netRevenue)}
          icon={TrendingUp}
          hint={`After ${formatKesShort(stats.expensesTotal)} expenses`}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="gap-3 p-4 sm:p-6 lg:col-span-3">
          <div>
            <CardTitle className="text-base">Revenue vs expenses</CardTitle>
            <CardDescription className="mt-1 text-xs">Last 6 months</CardDescription>
          </div>
          <div className="h-[280px] w-full">
            <TrendChart
              data={stats.monthly}
              series={[
                { key: 'revenue', name: 'Revenue', color: 'var(--chart-1)', kind: 'area', currency: true },
                { key: 'expenses', name: 'Expenses', color: 'var(--chart-2)', kind: 'area', currency: true },
              ]}
            />
          </div>
        </Card>
        <Card className="gap-3 p-4 sm:p-6 lg:col-span-2">
          <div>
            <CardTitle className="text-base">Top vehicles by revenue</CardTitle>
            <CardDescription className="mt-1 text-xs">Completed bookings, all time</CardDescription>
          </div>
          <div className="min-h-[280px] w-full py-2">
            <TopVehiclesChart data={stats.topVehicles} />
          </div>
        </Card>
      </div>

      {/* Utilization + pending approvals */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="gap-4 p-4 sm:p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Fleet utilization</CardTitle>
              <CardDescription className="mt-1 text-xs">Booked days last 30d</CardDescription>
            </div>
            <span className="text-2xl font-bold tabular-nums text-primary">
              {utilizationPct}%
            </span>
          </div>
          <Progress value={utilizationPct} className="h-3" aria-label={`Fleet utilization ${utilizationPct} percent`} />
          <p className="text-xs text-muted-foreground">
            {possibleDays > 0
              ? `${bookedDays} of ${possibleDays} possible vehicle-days on rent.`
              : 'Add vehicles to start tracking utilization.'}
          </p>
        </Card>

        <Card className="gap-3 p-4 sm:p-6 lg:col-span-3">
          <CardTitle className="text-base">Bookings awaiting your action</CardTitle>
          {pendingQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-14 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </div>
                  <Skeleton className="h-9 w-32 rounded-md" />
                </div>
              ))}
            </div>
          ) : pendingQuery.isError ? (
            <p className="py-4 text-sm text-muted-foreground">
              Could not load pending bookings. They are still listed under the Bookings tab.
            </p>
          ) : pendingBookings.length === 0 ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto size-8 text-primary" aria-hidden />
              <p className="mt-2 text-sm font-medium">All caught up</p>
              <p className="text-xs text-muted-foreground">
                No paid bookings are waiting for your approval.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {pendingBookings.map((booking) => (
                <li key={booking.id} className="flex flex-wrap items-center gap-3 py-3">
                  <VehicleThumb
                    vehicle={{
                      imageUrl: booking.vehicle?.imageUrl ?? '',
                      label: booking.vehicle?.label ?? 'Vehicle',
                    }}
                    className="h-10 w-14 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {booking.vehicle?.label ?? 'Vehicle'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {booking.customerName} &middot; {formatDate(booking.startDate)} &middot;{' '}
                      {booking.days} {booking.days === 1 ? 'day' : 'days'} &middot;{' '}
                      <span className="font-semibold text-foreground">
                        {formatKes(booking.total)}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className="h-10 px-3"
                      disabled={action.isPending}
                      onClick={() => action.mutate({ booking, action: 'accept' })}
                    >
                      {busyBookingId === booking.id ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : null}
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 border-destructive/40 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setRejectTarget(booking)}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <RejectBookingDialog
        booking={rejectTarget}
        open={rejectTarget != null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null)
        }}
      />
    </div>
  )
}
