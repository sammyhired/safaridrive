'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, Car, RefreshCw } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import LoginDialog from '@/components/shared/login-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/hooks/use-session'
import { apiGet } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { Booking, BookingStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import BookingCard from './booking-card'
import PaymentDialog from './payment-dialog'
import ReviewDialog from './review-dialog'
import TrackingPanel from './tracking-panel'

type Group = 'all' | 'upcoming' | 'active' | 'past' | 'cancelled'

const GROUPS: Record<Exclude<Group, 'all'>, BookingStatus[]> = {
  upcoming: ['PENDING_PAYMENT', 'PAID', 'ACCEPTED'],
  active: ['OUT_FOR_DELIVERY', 'ACTIVE', 'RETURNED'],
  past: ['COMPLETED', 'REJECTED'],
  cancelled: ['CANCELLED'],
}

const GROUP_TABS: { key: Group; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'active', label: 'Active' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
]

export default function MyBookings() {
  const { user, isLoading: sessionLoading } = useSession()
  const setCustomerTab = useAppStore((s) => s.setCustomerTab)

  const [group, setGroup] = useState<Group>('all')
  const [payBooking, setPayBooking] = useState<Booking | null>(null)
  const [trackBooking, setTrackBooking] = useState<Booking | null>(null)
  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)

  const bookingsQuery = useQuery({
    queryKey: ['bookings'],
    queryFn: () => apiGet<{ bookings: Booking[] }>('/api/bookings'),
    enabled: !!user,
  })

  const bookings = useMemo(() => bookingsQuery.data?.bookings ?? [], [bookingsQuery.data])
  const filtered = useMemo(
    () => (group === 'all' ? bookings : bookings.filter((b) => GROUPS[group].includes(b.status))),
    [bookings, group],
  )

  const counts = useMemo(() => {
    const map: Record<Group, number> = {
      all: bookings.length,
      upcoming: 0,
      active: 0,
      past: 0,
      cancelled: 0,
    }
    for (const b of bookings) {
      for (const g of GROUP_TABS) {
        if (g.key !== 'all' && GROUPS[g.key].includes(b.status)) map[g.key] += 1
      }
    }
    return map
  }, [bookings])

  // ---- Signed-out prompt ----
  if (!sessionLoading && !user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={CalendarCheck}
          title="Sign in to see your bookings"
          description="Your trips, payments and live tracking all live here. Sign in as a customer to continue."
          action={
            <Button className="h-11 px-6" onClick={() => setLoginOpen(true)}>
              Sign in
            </Button>
          }
        />
        <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">My bookings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Track trips, settle payments and leave reviews.
        </p>
      </header>

      {/* Status group chips */}
      <div
        role="tablist"
        aria-label="Filter bookings by status"
        className="sd-scroll -mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {GROUP_TABS.map((t) => {
          const active = group === t.key
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setGroup(t.key)}
              className={cn(
                'flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground',
              )}
            >
              {t.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                  active ? 'bg-primary-foreground/20' : 'bg-muted',
                )}
              >
                {counts[t.key]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      {bookingsQuery.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      ) : bookingsQuery.isError ? (
        <EmptyState
          icon={Car}
          title="Couldn't load your bookings"
          description="Something went wrong while fetching your trips. Please try again."
          action={
            <Button variant="outline" className="h-11" onClick={() => bookingsQuery.refetch()}>
              <RefreshCw aria-hidden className="h-4 w-4" /> Retry
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Car}
          title={bookings.length === 0 ? 'No bookings yet' : 'Nothing in this tab'}
          description={
            bookings.length === 0
              ? 'Find a car, pick your dates and pay with M-Pesa — your trips will show up here.'
              : 'Check the other tabs to see the rest of your trips.'
          }
          action={
            bookings.length === 0 ? (
              <Button className="h-11" onClick={() => setCustomerTab('browse')}>
                Find a car
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:gap-5">
          {filtered.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              onPay={setPayBooking}
              onTrack={setTrackBooking}
              onReview={setReviewBooking}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      {payBooking ? (
        <PaymentDialog
          booking={payBooking}
          open={!!payBooking}
          onOpenChange={(o) => {
            if (!o) setPayBooking(null)
          }}
        />
      ) : null}
      {trackBooking ? (
        <TrackingPanel
          booking={trackBooking}
          open={!!trackBooking}
          onOpenChange={(o) => {
            if (!o) setTrackBooking(null)
          }}
        />
      ) : null}
      {reviewBooking ? (
        <ReviewDialog
          booking={reviewBooking}
          open={!!reviewBooking}
          onOpenChange={(o) => {
            if (!o) setReviewBooking(null)
          }}
        />
      ) : null}
    </div>
  )
}
