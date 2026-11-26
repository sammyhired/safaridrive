'use client'

// Bookings section shared by the owner dashboard (own vehicles) and the
// admin dashboard (platform-wide, with cancel powers).

import { useMemo, useState } from 'react'
import { CalendarX } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { cn } from '@/lib/utils'
import type { Booking } from '@/lib/types'
import { useBookingsGroup, useBookingAction } from './api'
import {
  FILTER_GROUPS,
  filterBookings,
  type BookingActionKey,
  type FilterGroup,
} from './booking-helpers'
import { BookingRow } from './booking-row'
import {
  BookingDetailDialog,
  CancelBookingDialog,
  RejectBookingDialog,
} from './booking-dialogs'
import { ErrorState } from './states'
import { ListSkeleton } from './skeletons'
import { SectionHeader } from './section-header'

export function BookingsSection({ variant }: { variant: 'owner' | 'admin' }) {
  const [group, setGroup] = useState<FilterGroup>(variant === 'owner' ? 'PAID' : 'ALL')
  const [detail, setDetail] = useState<Booking | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Booking | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null)

  const role = variant === 'admin' ? 'ADMIN' : 'OWNER'
  const query = useBookingsGroup(group)
  const action = useBookingAction()

  const bookings = query.data?.bookings ?? []
  const filtered = useMemo(() => filterBookings(bookings, group), [bookings, group])

  /** Prefer the freshest copy of a dialog booking from the current list. */
  const resolve = (target: Booking | null): Booking | null =>
    target ? (bookings.find((b) => b.id === target.id) ?? target) : null

  const handleAction = (booking: Booking, act: BookingActionKey) => {
    if (act === 'reject') {
      setRejectTarget(booking)
      return
    }
    if (act === 'cancel') {
      setCancelTarget(booking)
      return
    }
    action.mutate({ booking, action: act })
  }

  const busyBookingId = action.isPending ? action.variables?.booking.id : undefined
  const busyAction = action.isPending ? action.variables?.action : undefined

  return (
    <section aria-label="Bookings">
      <SectionHeader
        title={variant === 'admin' ? 'All bookings' : 'Bookings'}
        description={
          variant === 'admin'
            ? 'Every booking on the platform. You can act on any booking on the customer or owner behalf.'
            : 'Rentals across your fleet. Accept paid requests, dispatch deliveries and close out returns.'
        }
      />

      {/* Filter chips */}
      <div
        role="tablist"
        aria-label="Filter bookings"
        className="mb-4 flex gap-2 overflow-x-auto pb-1"
      >
        {FILTER_GROUPS.map((filter) => {
          const isActive = filter.key === group
          const count = isActive && filtered.length > 0 ? filtered.length : null
          return (
            <button
              key={filter.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setGroup(filter.key)}
              className={cn(
                'h-11 shrink-0 rounded-full border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {filter.label}
              {count ? (
                <span className={cn('ml-1.5 tabular-nums', isActive && 'opacity-80')}>
                  &middot; {count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {query.isLoading ? (
        <ListSkeleton rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title={group === 'PAID' ? 'No bookings waiting' : 'No bookings here'}
          description={
            group === 'PAID'
              ? 'You are all caught up. New paid bookings will appear for your approval.'
              : 'Nothing matches this filter right now. Try another category.'
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((booking) => (
            <BookingRow
              key={booking.id}
              booking={booking}
              role={role}
              busyAction={busyBookingId === booking.id ? busyAction : null}
              onAction={handleAction}
              onOpenDetail={setDetail}
            />
          ))}
        </div>
      )}

      <BookingDetailDialog
        booking={resolve(detail)}
        open={detail != null}
        onOpenChange={(open) => {
          if (!open) setDetail(null)
        }}
      />
      <RejectBookingDialog
        booking={resolve(rejectTarget)}
        open={rejectTarget != null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null)
        }}
      />
      <CancelBookingDialog
        booking={resolve(cancelTarget)}
        open={cancelTarget != null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null)
        }}
      />
    </section>
  )
}
