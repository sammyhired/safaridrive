'use client'

import { useState, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  LogIn,
  Navigation,
  Route,
  Star,
  Wallet,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { StatCard } from '@/components/shared/stat-card'
import { StatusBadge } from '@/components/shared/status-badge'
import LoginDialog from '@/components/shared/login-dialog'
import { useSession } from '@/hooks/use-session'
import { ActiveJobCard } from '@/components/driver/active-job'
import { TripHistory, UpcomingJobs } from '@/components/driver/job-lists'
import { apiGet } from '@/lib/api'
import { formatKes } from '@/lib/format'
import type { Booking, DriverStats } from '@/lib/types'

function DriverGuard() {
  const [open, setOpen] = useState(false)

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <Card className="items-center p-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-emerald-600/10">
          <Navigation className="size-7 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
        </div>
        <CardTitle className="text-lg">Driver workspace</CardTitle>
        <CardDescription>
          Sign in with a driver account to see today&apos;s assignments, navigate deliveries with
          live GPS, and manage your trips.
        </CardDescription>
        <div className="w-full rounded-lg bg-muted p-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Demo driver account
          </p>
          <p className="mt-1 text-sm font-medium">driver@safaridrive.co.ke</p>
          <p className="text-xs text-muted-foreground">password: demo123</p>
        </div>
        <Button className="h-11 w-full" onClick={() => setOpen(true)}>
          <LogIn aria-hidden="true" />
          Sign in as driver
        </Button>
      </Card>
      <LoginDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}

// Hydration-safe, hour-based greeting: the server snapshot is neutral and the
// client switches to the time-of-day value after hydration (no setState in an
// effect, no hydration mismatch).
const subscribeGreeting = () => () => {}
const getGreetingSnapshot = (): string => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}
const getServerGreeting = (): string => 'Welcome back'

function DriverWorkspace() {
  const { user } = useSession()
  const greeting = useSyncExternalStore(
    subscribeGreeting,
    getGreetingSnapshot,
    getServerGreeting,
  )

  const statsQuery = useQuery({
    queryKey: ['driver-stats'],
    queryFn: () => apiGet<{ stats: DriverStats }>('/api/stats/driver'),
    retry: 1,
  })
  const bookingsQuery = useQuery({
    queryKey: ['bookings'],
    queryFn: () => apiGet<{ bookings: Booking[] }>('/api/bookings'),
    retry: 1,
  })

  const stats = statsQuery.data?.stats ?? null
  const bookings = bookingsQuery.data?.bookings ?? []

  const activeJob =
    stats?.activeJob ??
    bookings.find((b) => b.status === 'OUT_FOR_DELIVERY' || b.status === 'ACTIVE') ??
    null
  const upcomingJobs = stats?.upcomingJobs ?? bookings.filter((b) => b.status === 'ACCEPTED')
  const history = bookings.filter((b) => b.status === 'COMPLETED')
  const activeJobsCount = bookings.filter(
    (b) => b.status === 'OUT_FOR_DELIVERY' || b.status === 'ACTIVE',
  ).length

  const loading = statsQuery.isLoading || bookingsQuery.isLoading
  const firstName = user?.name.split(' ')[0] ?? 'Driver'

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
      {/* Greeting + driver profile summary */}
      <section aria-label="Driver summary" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {greeting}, {firstName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Here is what your day on the road looks like.
            </p>
          </div>
          {stats ? (
            <Card className="gap-2 p-4">
              <p className="text-xs text-muted-foreground">Driver status</p>
              <div className="flex items-center gap-2">
                <StatusBadge status={stats.status} />
                <span className="flex items-center gap-1 text-sm font-medium">
                  <Star
                    className="size-4 fill-amber-400 text-amber-400"
                    aria-hidden="true"
                  />
                  {stats.rating.toFixed(1)}
                </span>
                <span className="text-xs text-muted-foreground">
                  · {stats.completedTrips} trips completed
                </span>
              </div>
            </Card>
          ) : null}
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {loading ? (
            <>
              <Skeleton className="h-32 w-full" aria-hidden="true" />
              <Skeleton className="h-32 w-full" aria-hidden="true" />
              <Skeleton className="h-32 w-full" aria-hidden="true" />
              <Skeleton className="h-32 w-full" aria-hidden="true" />
            </>
          ) : (
            <>
              <StatCard
                title="Earnings this month"
                value={formatKes(stats?.earningsThisMonth ?? 0)}
                icon={Wallet}
                hint="Chauffeur assignments"
              />
              <StatCard
                title="Completed trips"
                value={String(stats?.completedTrips ?? history.length)}
                icon={Route}
                hint="All time"
              />
              <StatCard
                title="Rating"
                value={(stats?.rating ?? 0).toFixed(1)}
                icon={Star}
                hint="Out of 5"
              />
              <StatCard
                title="Active jobs"
                value={String(activeJobsCount)}
                icon={Navigation}
                hint={activeJob ? 'In progress now' : 'Nothing on the road'}
              />
            </>
          )}
        </div>
      </section>

      {/* Active assignment */}
      <section aria-label="Current assignment">
        {loading ? (
          <Skeleton className="h-64 w-full" aria-hidden="true" />
        ) : activeJob ? (
          <ActiveJobCard booking={activeJob} />
        ) : (
          <EmptyState
            icon={Navigation}
            title="No active assignment"
            description="When an owner dispatches a vehicle to you, it will show up here with live navigation."
          />
        )}
      </section>

      {/* Upcoming jobs + history */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Upcoming jobs">
          {loading ? (
            <Skeleton className="h-64 w-full" aria-hidden="true" />
          ) : (
            <UpcomingJobs jobs={upcomingJobs} />
          )}
        </section>
        <section aria-label="Trip history">
          {loading ? (
            <Skeleton className="h-64 w-full" aria-hidden="true" />
          ) : (
            <TripHistory bookings={history} />
          )}
        </section>
      </div>

      {!loading && bookingsQuery.isError && statsQuery.isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Could not load your jobs"
          description="Please try again in a moment."
          className="text-destructive/60"
        />
      ) : null}
    </div>
  )
}

export default function DriverApp() {
  const { user, isLoading } = useSession()

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
        <Skeleton className="h-10 w-72" aria-hidden="true" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Skeleton className="h-32 w-full" aria-hidden="true" />
          <Skeleton className="h-32 w-full" aria-hidden="true" />
          <Skeleton className="h-32 w-full" aria-hidden="true" />
          <Skeleton className="h-32 w-full" aria-hidden="true" />
        </div>
        <Skeleton className="h-64 w-full" aria-hidden="true" />
      </div>
    )
  }

  if (!user || (user.role !== 'DRIVER' && user.role !== 'ADMIN')) {
    return <DriverGuard />
  }

  return <DriverWorkspace />
}
