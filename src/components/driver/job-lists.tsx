'use client'

import { CalendarClock, Car, History, UserRoundCheck } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { ModeBadge } from '@/components/shared/status-badge'
import { cn } from '@/lib/utils'
import { formatDate, formatKes } from '@/lib/format'
import type { Booking } from '@/lib/types'

/** Upcoming (confirmed) driver assignments, chauffeur jobs highlighted. */
export function UpcomingJobs({ jobs }: { jobs: Booking[] }) {
  return (
    <Card className="gap-4 p-4 sm:p-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
          Upcoming jobs
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {jobs.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {jobs.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No upcoming jobs"
            description="New confirmed assignments will appear here."
            className="mx-4"
          />
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {jobs.map((job) => {
              const chauffeur = job.mode === 'CHAUFFEUR'
              return (
                <li
                  key={job.id}
                  className={cn(
                    'flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
                    chauffeur && 'bg-amber-500/5',
                  )}
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {job.vehicle.label}
                      {chauffeur ? (
                        <UserRoundCheck
                          className="size-4 text-amber-600 dark:text-amber-400"
                          aria-label="Chauffeur job"
                        />
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {job.customerName}
                      {job.customerPhone ? ` · ${job.customerPhone}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(job.startDate)} → {formatDate(job.endDate)} · {job.days}{' '}
                      day{job.days > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                    <ModeBadge mode={job.mode} />
                    <p className="text-xs text-muted-foreground">
                      {job.deliveryAddress ?? job.pickupYardName ?? '—'}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** Completed trips with the driver's earnings per job. */
export function TripHistory({ bookings }: { bookings: Booking[] }) {
  return (
    <Card className="gap-4 p-4 sm:p-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-muted-foreground" aria-hidden="true" />
          Trip history
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {bookings.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {bookings.length === 0 ? (
          <EmptyState
            icon={Car}
            title="No completed trips yet"
            description="Finished trips and your earnings will be listed here."
            className="mx-4"
          />
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {bookings.map((job) => (
              <li
                key={job.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{job.vehicle.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(job.startDate)} → {formatDate(job.endDate)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatKes(job.driverTotal)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {job.mode === 'CHAUFFEUR' ? 'Chauffeur fee' : 'Assignment'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
