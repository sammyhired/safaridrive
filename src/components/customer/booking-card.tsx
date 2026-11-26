'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  Info,
  Loader2,
  Radar,
  Star,
  UserRound,
} from 'lucide-react'
import { StatusBadge } from '@/components/shared/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { apiPatch } from '@/lib/api'
import { formatDateTime, formatKes } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import type { Booking } from '@/lib/types'
import { cn } from '@/lib/utils'
import { MODE_ICONS, VehicleImage, errorMessage } from './ui-bits'

export interface BookingCardProps {
  booking: Booking
  onPay: (booking: Booking) => void
  onTrack: (booking: Booking) => void
  onReview: (booking: Booking) => void
}

export default function BookingCard({ booking, onPay, onTrack, onReview }: BookingCardProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const setCustomerTab = useAppStore((s) => s.setCustomerTab)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const v = booking.vehicle
  const ModeIcon = MODE_ICONS[booking.mode]

  async function doCancel() {
    setCancelling(true)
    try {
      await apiPatch(`/api/bookings/${booking.id}`, { action: 'cancel' })
      toast({
        title: 'Booking cancelled',
        description: `${booking.reference} — paid amounts are refunded automatically.`,
      })
      setConfirmOpen(false)
      void queryClient.invalidateQueries()
    } catch (e) {
      toast({ title: 'Could not cancel', description: errorMessage(e), variant: 'destructive' })
    } finally {
      setCancelling(false)
    }
  }

  // Contextual info line under the header.
  let info: string | null = null
  if (booking.status === 'PENDING_PAYMENT') info = 'Complete payment to secure this booking.'
  else if (booking.status === 'PAID') info = 'Awaiting owner confirmation.'
  else if (booking.status === 'RETURNED') info = 'Vehicle returned — awaiting final inspection.'
  else if (booking.status === 'CANCELLED' && booking.cancelReason)
    info = `Cancelled: ${booking.cancelReason}`
  else if (booking.status === 'REJECTED' && booking.cancelReason) info = booking.cancelReason
  else if (booking.status === 'ACCEPTED' && booking.mode !== 'PICKUP') {
    const hoursToStart = (new Date(booking.startDate).getTime() - Date.now()) / 3_600_000
    if (hoursToStart >= -1 && hoursToStart <= 48) info = 'Tracking activates when your car is dispatched.'
  }

  const canCancel =
    booking.status === 'PENDING_PAYMENT' || booking.status === 'PAID' || booking.status === 'ACCEPTED'
  const canTrack = booking.status === 'OUT_FOR_DELIVERY' || booking.status === 'ACTIVE'

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex h-full flex-col overflow-hidden rounded-lg border bg-card shadow-sm"
    >
      <div className="flex flex-1 gap-4 p-4">
        <div className="relative hidden h-20 w-28 shrink-0 overflow-hidden rounded-md border sm:block">
          <VehicleImage src={v.imageUrl} alt={v.label} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate font-semibold leading-tight">{v.label}</h3>
            <StatusBadge status={booking.status} />
          </div>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{booking.reference}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDateTime(booking.startDate)} → {formatDateTime(booking.endDate)} ·{' '}
            {booking.days} day{booking.days === 1 ? '' : 's'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="max-w-full gap-1 font-normal">
              <ModeIcon aria-hidden className="h-3 w-3" />
              <span className="truncate">
                {booking.mode === 'PICKUP'
                  ? `Pickup · ${booking.pickupYardName ?? 'yard'}`
                  : booking.mode === 'DELIVERY'
                    ? `Delivery · ${booking.deliveryAddress ?? 'address'}`
                    : 'Chauffeur'}
              </span>
            </Badge>
            <StatusBadge status={booking.paymentStatus} />
          </div>
          {info ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {info}
            </p>
          ) : null}
          {booking.driver ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserRound aria-hidden className="h-3.5 w-3.5" /> Chauffeur: {booking.driver.name}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-4 py-3">
        <p className="text-sm font-bold tabular-nums">{formatKes(booking.total)}</p>
        <div className="flex flex-wrap items-center gap-2">
          {booking.status === 'PENDING_PAYMENT' ? (
            <Button size="sm" className="h-10" onClick={() => onPay(booking)}>
              Pay now
            </Button>
          ) : null}
          {canTrack ? (
            <Button size="sm" className="h-10" onClick={() => onTrack(booking)}>
              <Radar aria-hidden className="h-4 w-4" /> Track live
            </Button>
          ) : null}
          {booking.status === 'COMPLETED' ? (
            booking.reviewed ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                <CheckCircle2 aria-hidden className="h-4 w-4" /> Reviewed
              </span>
            ) : (
              <Button variant="outline" size="sm" className="h-10" onClick={() => onReview(booking)}>
                <Star aria-hidden className="h-4 w-4" /> Leave review
              </Button>
            )
          ) : null}
          {canCancel ? (
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-10 text-destructive hover:text-destructive')}
              onClick={() => setConfirmOpen(true)}
            >
              Cancel
            </Button>
          ) : null}
          {booking.status === 'COMPLETED' || booking.status === 'RETURNED' ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-10 text-primary hover:text-primary"
              onClick={() => setCustomerTab('browse')}
            >
              Book again
            </Button>
          ) : null}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              {booking.reference} — {v.label}. Free cancellation up to 48 hours before start; later
              cancellations incur a 20% fee. Paid amounts are refunded automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Keep booking</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-destructive text-white hover:bg-destructive/90"
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault()
                void doCancel()
              }}
            >
              {cancelling ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
              Yes, cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.article>
  )
}
