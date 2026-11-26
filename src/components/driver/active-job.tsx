'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays,
  CheckCircle2,
  Loader2,
  MapPin,
  PackageCheck,
  Phone,
  Play,
  RotateCcw,
  User,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardAction, CardHeader, CardTitle } from '@/components/ui/card'
import { ModeBadge, StatusBadge } from '@/components/shared/status-badge'
import { useToast } from '@/hooks/use-toast'
import { TripTracking } from '@/components/driver/trip-tracking'
import { apiPatch } from '@/lib/api'
import { formatDate } from '@/lib/format'
import type { Booking } from '@/lib/types'

type DriverAction = 'start' | 'deliver' | 'return'

const ACTION_META: Record<DriverAction, { label: string; icon: typeof Play; toast: string }> = {
  start: { label: 'Start rental', icon: Play, toast: 'Rental started' },
  deliver: { label: 'Mark delivered', icon: PackageCheck, toast: 'Vehicle marked as delivered' },
  return: { label: 'Mark returned', icon: RotateCcw, toast: 'Vehicle marked as returned' },
}

/** The driver's current assignment: details, contract §4 actions, live tracking. */
export function ActiveJobCard({ booking }: { booking: Booking }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const actionMutation = useMutation({
    mutationFn: (vars: { id: string; action: DriverAction }) =>
      apiPatch<{ booking: Booking }>(`/api/bookings/${vars.id}`, { action: vars.action }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries()
      toast({ title: ACTION_META[vars.action].toast })
    },
    onError: (err: Error) => {
      toast({ title: err.message || 'Action failed', variant: 'destructive' })
    },
  })

  let action: DriverAction | null = null
  if (booking.status === 'ACCEPTED' && booking.mode === 'PICKUP') action = 'start'
  else if (booking.status === 'OUT_FOR_DELIVERY') action = 'deliver'
  else if (booking.status === 'ACTIVE') action = 'return'

  const ActionIcon = action ? ACTION_META[action].icon : null

  return (
    <Card className="gap-4 p-4 sm:p-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Current assignment
          <StatusBadge status={booking.status} />
        </CardTitle>
        <CardAction>
          <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
            {booking.reference}
          </span>
        </CardAction>
      </CardHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Vehicle</p>
            <p className="text-sm font-semibold">{booking.vehicle.label}</p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {booking.vehicle.plate}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Customer</p>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <User className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {booking.customerName}
            </p>
            {booking.customerPhone ? (
              <a
                href={`tel:${booking.customerPhone}`}
                className="mt-0.5 inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Phone className="size-3.5" aria-hidden="true" />
                {booking.customerPhone}
              </a>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ModeBadge mode={booking.mode} />
            {booking.driverTotal > 0 ? (
              <span className="rounded-full bg-emerald-600/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {booking.days} day driver fee
              </span>
            ) : null}
          </div>

          <div className="flex items-start gap-1.5">
            <CalendarDays
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-sm">
              {formatDate(booking.startDate)} → {formatDate(booking.endDate)}
              <span className="text-muted-foreground"> ({booking.days} day{booking.days > 1 ? 's' : ''})</span>
            </p>
          </div>

          {booking.deliveryAddress ? (
            <div className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm">{booking.deliveryAddress}</p>
            </div>
          ) : booking.pickupYardName ? (
            <div className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm">Pick up at {booking.pickupYardName}</p>
            </div>
          ) : null}
        </div>
      </div>

      {booking.status === 'ACCEPTED' && !action ? (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Waiting for the owner to dispatch this vehicle before it hits the road.
        </p>
      ) : null}

      {action && ActionIcon ? (
        <div>
          <Button
            className="h-11 w-full sm:w-auto"
            disabled={actionMutation.isPending}
            onClick={() => actionMutation.mutate({ id: booking.id, action })}
          >
            {actionMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ActionIcon aria-hidden="true" />
            )}
            {actionMutation.isPending ? 'Updating…' : ACTION_META[action].label}
          </Button>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
            {booking.status === 'ACCEPTED'
              ? 'Confirms handover and starts the rental clock.'
              : booking.status === 'OUT_FOR_DELIVERY'
                ? 'Confirms the customer received the vehicle at the delivery address.'
                : 'Hands the vehicle back and ends this trip.'}
          </p>
        </div>
      ) : null}

      {booking.status === 'OUT_FOR_DELIVERY' ? <TripTracking booking={booking} /> : null}
    </Card>
  )
}
