'use client'

// Admin overview — platform KPIs, revenue trend, bookings by status,
// top vehicles and the latest bookings.

import {
  CarFront,
  Download,
  Percent,
  Route,
  Smartphone,
  Users as UsersIcon,
  Wallet,
} from 'lucide-react'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { StatCard } from '@/components/shared/stat-card'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatDate, formatKes, formatKesShort } from '@/lib/format'
import { useAdminStats } from '@/components/owner/_shared/api'
import { ModeChip } from '@/components/owner/_shared/ui-bits'
import { StatusCountChart, TopVehiclesChart, TrendChart } from '@/components/owner/_shared/charts'
import { ErrorState } from '@/components/owner/_shared/states'
import { ChartSkeleton, StatGridSkeleton } from '@/components/owner/_shared/skeletons'
import { SectionHeader } from '@/components/owner/_shared/section-header'

const APK_VERSION = 'v1.0.0'
const APK_DOWNLOADS = [
  {
    name: 'SafariDrive',
    href: `/apk/SafariDrive-Customer-${APK_VERSION}.apk`,
    blurb: 'Customer app — search, book, pay, track',
  },
  {
    name: 'SafariDrive Owner',
    href: `/apk/SafariDrive-Owner-${APK_VERSION}.apk`,
    blurb: 'Fleet, yards & payouts console',
  },
  {
    name: 'SafariDrive Driver',
    href: `/apk/SafariDrive-Driver-${APK_VERSION}.apk`,
    blurb: 'Chauffeur jobs & navigation',
  },
  {
    name: 'SafariDrive Admin',
    href: `/apk/SafariDrive-Admin-${APK_VERSION}.apk`,
    blurb: 'Platform control centre',
  },
]

export function OverviewSection() {
  const statsQuery = useAdminStats()

  if (statsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Overview" description="Platform health at a glance." />
        <StatGridSkeleton count={5} />
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
  const recentBookings = stats.recentBookings ?? []

  return (
    <div className="space-y-6">
      <SectionHeader title="Overview" description="Platform health at a glance." />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          title="Total users"
          value={String(stats.totalUsers)}
          icon={UsersIcon}
          hint={`${stats.customers} customers \u00b7 ${stats.owners} owners \u00b7 ${stats.drivers} drivers`}
        />
        <StatCard
          title="Vehicles"
          value={String(stats.totalVehicles)}
          icon={CarFront}
          hint="Listed across all owners"
        />
        <StatCard
          title="Active rentals"
          value={String(stats.activeRentals)}
          icon={Route}
          hint="On the road now"
        />
        <StatCard
          title="Total revenue"
          value={formatKesShort(stats.totalRevenue)}
          icon={Wallet}
          hint="Completed bookings"
        />
        <StatCard
          title="Platform commission"
          value={formatKes(stats.platformCommission)}
          icon={Percent}
          hint="10% of completed revenue"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="gap-3 p-4 sm:p-6 lg:col-span-3">
          <div>
            <CardTitle className="text-base">Revenue &amp; bookings</CardTitle>
            <CardDescription className="mt-1 text-xs">
              Completed revenue with booking volume, last 6 months
            </CardDescription>
          </div>
          <div className="h-[280px] w-full">
            <TrendChart
              data={stats.monthly}
              series={[
                {
                  key: 'revenue',
                  name: 'Revenue',
                  color: 'var(--chart-1)',
                  kind: 'area',
                  currency: true,
                },
                {
                  key: 'bookings',
                  name: 'Bookings',
                  color: 'var(--chart-3)',
                  kind: 'line',
                },
              ]}
            />
          </div>
        </Card>
        <Card className="gap-3 p-4 sm:p-6 lg:col-span-2">
          <div>
            <CardTitle className="text-base">Bookings by status</CardTitle>
            <CardDescription className="mt-1 text-xs">All bookings, current state</CardDescription>
          </div>
          <div className="min-h-[280px] w-full py-2">
            <StatusCountChart data={stats.bookingsByStatus} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="gap-3 p-4 sm:p-6 lg:col-span-2">
          <div>
            <CardTitle className="text-base">Top vehicles by revenue</CardTitle>
            <CardDescription className="mt-1 text-xs">Completed bookings, all time</CardDescription>
          </div>
          <div className="min-h-[200px] w-full py-2">
            <TopVehiclesChart data={stats.topVehicles} />
          </div>
        </Card>

        <Card className="gap-3 p-4 sm:p-6 lg:col-span-3">
          <CardTitle className="text-base">Recent bookings</CardTitle>
          {recentBookings.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No bookings on the platform yet.
            </p>
          ) : (
            <ul className="max-h-80 divide-y overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
              {recentBookings.map((booking) => (
                <li key={booking.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {booking.vehicle?.label ?? 'Vehicle'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {booking.customerName} &middot;{' '}
                      <span className="font-mono">{booking.reference}</span> &middot;{' '}
                      {formatDate(booking.startDate)} &rarr; {formatDate(booking.endDate)}
                    </p>
                  </div>
                  <ModeChip mode={booking.mode} />
                  <StatusBadge status={booking.status} />
                  <span className="w-24 text-right text-sm font-semibold tabular-nums">
                    {formatKes(booking.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Mobile apps */}
      <Card className="gap-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Mobile apps</CardTitle>
            <CardDescription className="mt-1 text-xs">
              Installable Android apps for every side of the platform. Each app asks for this
              server&rsquo;s address on first launch, then opens straight into its side.
            </CardDescription>
          </div>
          <Smartphone className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {APK_DOWNLOADS.map((app) => (
            <a
              key={app.name}
              href={app.href}
              download
              className="group flex flex-col gap-1 rounded-xl border p-3 transition-colors hover:border-primary/40 hover:bg-muted/50"
            >
              <span className="text-sm font-semibold group-hover:text-primary">{app.name}</span>
              <span className="text-xs text-muted-foreground">{app.blurb}</span>
              <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
                <Download className="h-3.5 w-3.5" aria-hidden /> Download APK
              </span>
            </a>
          ))}
        </div>
      </Card>
    </div>
  )
}
