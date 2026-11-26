'use client'

// Booking dialogs shared by the owner and admin dashboards:
// full detail view, reject-with-reason and cancel confirmation.

import { useState } from 'react'
import { CreditCard, Loader2, Smartphone, UserCheck } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/shared/status-badge'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatDateTime, formatKes } from '@/lib/format'
import type { Booking } from '@/lib/types'
import { useBookingAction } from './api'
import { quoteLines } from './booking-helpers'
import { CategoryBadge, InitialsAvatar, ModeChip, VehicleThumb } from './ui-bits'

// ---------------------------------------------------------------------------
// Detail dialog — full quote breakdown, payments, timeline
// ---------------------------------------------------------------------------

export function BookingDetailDialog({
  booking,
  open,
  onOpenChange,
}: {
  booking: Booking | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-xl">
        {booking ? <BookingDetailBody booking={booking} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function BookingDetailBody({ booking }: { booking: Booking }) {
  const label = booking.vehicle?.label ?? 'Vehicle'
  const lines = quoteLines(booking)

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          <span className="font-mono">{booking.reference}</span>
          <StatusBadge status={booking.status} />
        </DialogTitle>
        <DialogDescription className="flex items-center gap-2">
          {label} <ModeChip mode={booking.mode} />
        </DialogDescription>
      </DialogHeader>

      {/* Vehicle + customer + schedule */}
      <div className="flex items-start gap-3">
        <VehicleThumb
          vehicle={{ imageUrl: booking.vehicle?.imageUrl ?? '', label }}
          className="h-16 w-24 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {booking.vehicle?.plate ? (
              <span className="font-mono">{booking.vehicle.plate}</span>
            ) : null}
            {booking.vehicle ? <CategoryBadge category={booking.vehicle.category} /> : null}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {booking.vehicle?.yardName ?? 'No yard assigned'}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Customer
          </p>
          <div className="mt-2 flex items-center gap-2.5">
            <InitialsAvatar name={booking.customerName} className="size-9" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{booking.customerName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {booking.customerPhone ?? 'No phone on file'}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Schedule
          </p>
          <p className="mt-2 text-sm font-medium">{formatDateTime(booking.startDate)}</p>
          <p className="text-xs text-muted-foreground">
            to {formatDateTime(booking.endDate)} &middot; {booking.days}{' '}
            {booking.days === 1 ? 'day' : 'days'}
          </p>
        </div>
        {booking.mode === 'PICKUP' ? (
          <div className="rounded-lg border p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Pickup
            </p>
            <p className="mt-2 text-sm">{booking.pickupYardName ?? 'Yard to be confirmed'}</p>
          </div>
        ) : (
          <div className="rounded-lg border p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Delivery
            </p>
            <p className="mt-2 text-sm">{booking.deliveryAddress ?? 'Address to be confirmed'}</p>
            {booking.distanceKm != null ? (
              <p className="text-xs text-muted-foreground">
                {booking.distanceKm.toFixed(1)} km from the yard
              </p>
            ) : null}
          </div>
        )}
        {booking.driver ? (
          <div className="rounded-lg border p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Chauffeur
            </p>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <UserCheck className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="font-medium">{booking.driver.name}</span>
              {booking.driver.phone ? (
                <span className="text-xs text-muted-foreground">{booking.driver.phone}</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Quote breakdown */}
      <section aria-label="Quote breakdown">
        <h3 className="text-sm font-semibold">Quote breakdown</h3>
        <ul className="mt-2 space-y-1.5">
          {lines.map((line, index) => (
            <li key={`${line.label}-${index}`} className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                {line.label}
                {line.note ? (
                  <span className="ml-1.5 text-[11px] opacity-75">{line.note}</span>
                ) : null}
              </span>
              <span
                className={`text-sm tabular-nums ${line.negative ? 'font-medium text-primary' : ''}`}
              >
                {line.amount < 0
                  ? `\u2212 ${formatKes(Math.abs(line.amount))}`
                  : formatKes(line.amount)}
              </span>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              Security deposit
              <span className="ml-1.5 text-[11px] opacity-75">refundable</span>
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {formatKes(booking.deposit)}
            </span>
          </li>
        </ul>
        <Separator className="my-3" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-base font-bold tabular-nums">{formatKes(booking.total)}</span>
        </div>
      </section>

      {/* Payments */}
      <section aria-label="Payments">
        <h3 className="text-sm font-semibold">Payments</h3>
        {booking.payments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {booking.payments.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border p-2.5"
              >
                <span className="flex items-center gap-2 text-sm">
                  {payment.method === 'MPESA' ? (
                    <Smartphone className="size-4 text-primary" aria-hidden />
                  ) : (
                    <CreditCard className="size-4 text-primary" aria-hidden />
                  )}
                  <span className="font-medium">
                    {payment.method === 'MPESA' ? 'M-Pesa' : 'Card'}
                  </span>
                  <StatusBadge status={payment.status} />
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {formatKes(payment.amount)}
                </span>
                <span className="w-full text-[11px] text-muted-foreground sm:w-auto">
                  {payment.receiptNo ? `Receipt ${payment.receiptNo} \u00b7 ` : ''}
                  {formatDateTime(payment.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Timeline */}
      <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
        <p>Booked on {formatDateTime(booking.createdAt)}</p>
        {booking.cancelReason ? (
          <p className="mt-1 text-destructive">Reason: {booking.cancelReason}</p>
        ) : null}
        {booking.paymentStatus === 'REFUNDED' ? (
          <p className="mt-1">Payments for this booking were refunded.</p>
        ) : null}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Reject dialog (reason required)
// ---------------------------------------------------------------------------

export function RejectBookingDialog({
  booking,
  open,
  onOpenChange,
}: {
  booking: Booking | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open && booking ? (
          <RejectForm booking={booking} onOpenChange={onOpenChange} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RejectForm({
  booking,
  onOpenChange,
}: {
  booking: Booking
  onOpenChange: (open: boolean) => void
}) {
  const [reason, setReason] = useState('')
  const action = useBookingAction()

  const trimmed = reason.trim()
  const canSubmit = trimmed.length >= 3

  const submit = () => {
    if (!canSubmit) return
    action.mutate(
      { booking, action: 'reject', reason: trimmed },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Reject {booking.reference}</DialogTitle>
        <DialogDescription>
          The customer will be notified with your reason and the payment refunded.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="reject-reason">Reason</Label>
        <Textarea
          id="reject-reason"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Vehicle already committed for those dates"
        />
        {trimmed.length > 0 && trimmed.length < 3 ? (
          <p className="text-xs text-destructive">Please give a short reason (min 3 characters).</p>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
          Keep booking
        </Button>
        <Button
          variant="destructive"
          className="h-11"
          onClick={submit}
          disabled={!canSubmit || action.isPending}
        >
          {action.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Reject booking
        </Button>
      </DialogFooter>
    </>
  )
}

// ---------------------------------------------------------------------------
// Cancel dialog (admin, destructive confirm)
// ---------------------------------------------------------------------------

export function CancelBookingDialog({
  booking,
  open,
  onOpenChange,
}: {
  booking: Booking | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const action = useBookingAction()

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel {booking?.reference ?? 'booking'}?</AlertDialogTitle>
          <AlertDialogDescription>
            The customer will be notified and any completed payment refunded. Cancellations within
            48 hours of pickup may incur a 20% fee.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">Keep booking</AlertDialogCancel>
          <AlertDialogAction
            className="h-11 bg-destructive text-white hover:bg-destructive/90"
            onClick={() => {
              if (!booking) return
              action.mutate({ booking, action: 'cancel' }, { onSuccess: () => onOpenChange(false) })
            }}
          >
            Cancel booking
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
