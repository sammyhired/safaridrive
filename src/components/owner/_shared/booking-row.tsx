'use client'

// A single rich booking row, used by both the owner and admin dashboards.

import { UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
import { cn } from '@/lib/utils'
import { formatDate, formatKes } from '@/lib/format'
import type { Booking } from '@/lib/types'
import { bookingActionsFor, type BookingActionKey } from './booking-helpers'
import { ModeChip, VehicleThumb } from './ui-bits'
import { Loader2 } from 'lucide-react'

function PaymentMark({ status }: { status: string }) {
  const meta: Record<string, { label: string; dot: string }> = {
    PAID: { label: 'Paid', dot: 'bg-primary' },
    UNPAID: { label: 'Unpaid', dot: 'bg-amber-500' },
    REFUNDED: { label: 'Refunded', dot: 'bg-muted-foreground' },
  }
  const m = meta[status] ?? { label: status, dot: 'bg-muted-foreground' }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className={cn('size-1.5 rounded-full', m.dot)} aria-hidden />
      {m.label}
    </span>
  )
}

export function BookingRow({
  booking,
  role,
  busyAction,
  onAction,
  onOpenDetail,
}: {
  booking: Booking
  role: 'OWNER' | 'ADMIN'
  busyAction?: BookingActionKey | null
  onAction: (booking: Booking, action: BookingActionKey) => void
  onOpenDetail: (booking: Booking) => void
}) {
  const actions = bookingActionsFor(booking, role)
  const busy = busyAction != null
  const label = booking.vehicle?.label ?? 'Vehicle'
  const plate = booking.vehicle?.plate

  return (
    <article className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-5">
        {/* Clickable summary */}
        <button
          type="button"
          onClick={() => onOpenDetail(booking)}
          aria-label={`View details for booking ${booking.reference}`}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <VehicleThumb
            vehicle={{ imageUrl: booking.vehicle?.imageUrl ?? '', label }}
            className="h-14 w-[88px] shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold leading-tight">{label}</span>
              <ModeChip mode={booking.mode} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{booking.customerName}</span>
              {booking.customerPhone ? (
                <>
                  <span aria-hidden>&middot;</span>
                  <span>{booking.customerPhone}</span>
                </>
              ) : null}
              <span aria-hidden>&middot;</span>
              <span className="font-mono">{booking.reference}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(booking.startDate)} &rarr; {formatDate(booking.endDate)} &middot;{' '}
              {booking.days} {booking.days === 1 ? 'day' : 'days'}
              {plate ? (
                <>
                  {' '}
                  &middot; <span className="font-mono">{plate}</span>
                </>
              ) : null}
            </p>
            {booking.driver ? (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <UserCheck className="size-3" aria-hidden />
                Chauffeur: {booking.driver.name}
              </p>
            ) : null}
          </div>
        </button>

        {/* Status, total and actions */}
        <div className="flex flex-col gap-2 md:w-56 md:shrink-0 md:items-end">
          <div className="flex flex-wrap items-center justify-between gap-2 md:flex-col md:items-end">
            <StatusBadge status={booking.status} />
            <span className="text-sm font-semibold tabular-nums md:text-base">
              {formatKes(booking.total)}
            </span>
          </div>
          <PaymentMark status={booking.paymentStatus} />
          {actions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 md:justify-end">
              {actions.map((def) => {
                const isBusy = busy && busyAction === def.action
                return (
                  <Button
                    key={def.action}
                    size="sm"
                    variant={
                      def.destructive
                        ? 'outline'
                        : def.action === 'accept' || def.action === 'complete'
                          ? 'default'
                          : 'outline'
                    }
                    className={cn(
                      'h-11 px-3 text-xs md:h-9',
                      def.destructive &&
                        'border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive',
                    )}
                    disabled={busy}
                    onClick={() => onAction(booking, def.action)}
                  >
                    {isBusy ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <def.icon className="size-3.5" aria-hidden />
                    )}
                    {def.shortLabel ?? def.label}
                  </Button>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}
