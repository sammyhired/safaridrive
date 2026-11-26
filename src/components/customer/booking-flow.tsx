'use client'

import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  Minus,
  Plus,
  ShieldCheck,
  Tag,
  XCircle,
} from 'lucide-react'
import LoginDialog from '@/components/shared/login-dialog'
import { StatusBadge } from '@/components/shared/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/hooks/use-session'
import { useToast } from '@/hooks/use-toast'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { DESTINATIONS, EXTRAS_CATALOG, MODE_META, findExtra } from '@/lib/constants'
import { formatDateTime, formatKes, initials, rentalDays } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import type {
  Booking,
  BookingMode,
  DriverProfile,
  PaymentSummary,
  Quote,
  QuoteInput,
  QuoteLine,
  Vehicle,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { defaultBookingDates } from './filters'
import { PaymentStep } from './payment-dialog'
import { useDebouncedValue } from './use-debounce'
import { MODE_ICONS, StarRating, VehicleImage, errorMessage } from './ui-bits'

type Step = 1 | 2 | 3

const CITIES = Array.from(new Set(DESTINATIONS.map((d) => d.city)))

// ============================================================
// Outer dialog bound to the store's `bookingVehicle`
// ============================================================

export default function BookingFlow({
  defaultDates,
}: {
  defaultDates: { start: string; end: string }
}) {
  const vehicle = useAppStore((s) => s.bookingVehicle)
  const closeBooking = useAppStore((s) => s.closeBooking)
  const queryClient = useQueryClient()

  function handleOpenChange(open: boolean) {
    if (open) return
    closeBooking()
    // A PENDING_PAYMENT booking may have been created while the dialog was open.
    void queryClient.invalidateQueries({ queryKey: ['bookings'] })
  }

  return (
    <Dialog open={!!vehicle} onOpenChange={handleOpenChange}>
      <DialogContent className="sd-scroll max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-3xl lg:max-w-4xl">
        {vehicle ? (
          <BookingFlowInner key={vehicle.id} vehicle={vehicle} defaultDates={defaultDates} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Inner flow (remounts per vehicle)
// ============================================================

function BookingFlowInner({
  vehicle,
  defaultDates,
}: {
  vehicle: Vehicle
  defaultDates: { start: string; end: string }
}) {
  const { user, isLoading: sessionLoading } = useSession()
  const { toast } = useToast()
  const setCustomerTab = useAppStore((s) => s.setCustomerTab)
  const closeBooking = useAppStore((s) => s.closeBooking)
  const draftMode = useAppStore((s) => s.draftMode)
  const setDraftMode = useAppStore((s) => s.setDraftMode)

  const [step, setStep] = useState<Step>(1)
  const [loginOpen, setLoginOpen] = useState(false)

  const initialDates = useMemo(() => defaultBookingDates(defaultDates.start, defaultDates.end), [defaultDates.start, defaultDates.end])
  const [startDate, setStartDate] = useState(initialDates.start)
  const [endDate, setEndDate] = useState(initialDates.end)
  const [mode, setMode] = useState<BookingMode>(draftMode)
  const [destination, setDestination] = useState('')
  const [addressDetails, setAddressDetails] = useState('')
  const [driverId, setDriverId] = useState('')
  const [extras, setExtras] = useState<Record<string, number>>({})
  const [promoCode, setPromoCode] = useState('')

  const [booking, setBooking] = useState<Booking | null>(null)
  const [paidPayment, setPaidPayment] = useState<PaymentSummary | null>(null)
  const [creating, setCreating] = useState(false)
  const lastCreatedKeyRef = useRef<string | null>(null)

  const authOk = !!user && user.role === 'CUSTOMER'

  // ---- validity ----
  const startMs = startDate ? new Date(startDate).getTime() : NaN
  const endMs = endDate ? new Date(endDate).getTime() : NaN
  const datesValid =
    Number.isFinite(startMs) && Number.isFinite(endMs) && startMs > Date.now() - 60_000 && endMs > startMs

  const needsDestination = mode !== 'PICKUP'
  const dest = useMemo(() => DESTINATIONS.find((d) => d.name === destination), [destination])
  const destinationOk = !needsDestination || !!dest
  const needsDriver = mode === 'CHAUFFEUR'
  const driverOk = !needsDriver || !!driverId
  const formValid = datesValid && destinationOk && driverOk

  const startISO = datesValid ? new Date(startMs).toISOString() : ''
  const endISO = datesValid ? new Date(endMs).toISOString() : ''
  const days = datesValid ? rentalDays(startISO, endISO) : 0

  // ---- quote (debounced 400ms) ----
  const quoteInput = useMemo<QuoteInput | null>(() => {
    if (!datesValid) return null
    const input: QuoteInput = {
      vehicleId: vehicle.id,
      startDate: startISO,
      endDate: endISO,
      mode,
      extras: Object.entries(extras)
        .filter(([, qty]) => qty > 0)
        .map(([key, qty]) => ({ key, qty })),
    }
    if (needsDestination && dest) {
      input.deliveryAddress = [dest.name, addressDetails.trim()].filter(Boolean).join(' — ')
      input.deliveryLat = dest.lat
      input.deliveryLng = dest.lng
    }
    if (needsDriver && driverId) input.driverId = driverId
    if (promoCode.trim()) input.promoCode = promoCode.trim().toUpperCase()
    return input
  }, [vehicle.id, startISO, endISO, mode, extras, dest, addressDetails, driverId, promoCode, datesValid, needsDestination, needsDriver])

  const debouncedQuoteInput = useDebouncedValue(quoteInput, 400)

  const quoteQuery = useQuery({
    queryKey: ['quote', debouncedQuoteInput],
    queryFn: () => apiPost<{ quote: Quote }>('/api/bookings/quote', debouncedQuoteInput),
    enabled: step === 1 && !!debouncedQuoteInput,
    retry: false,
  })
  const quote = quoteQuery.data?.quote

  // ---- promo validation (debounced) ----
  const extrasTotalApprox = useMemo(
    () =>
      Object.entries(extras).reduce((sum, [key, qty]) => {
        const def = findExtra(key)
        return sum + (def ? (def.perDay ? def.perDay * qty * days : def.flat * qty) : 0)
      }, 0),
    [extras, days],
  )
  const subtotalApprox = vehicle.dailyRate * days + extrasTotalApprox
  const debouncedPromo = useDebouncedValue(promoCode.trim().toUpperCase(), 500)

  const promoQuery = useQuery({
    queryKey: ['promo', debouncedPromo, subtotalApprox],
    queryFn: () =>
      apiPost<{ valid: boolean; discount: number; message: string }>('/api/promo/validate', {
        code: debouncedPromo,
        subtotal: subtotalApprox,
      }),
    enabled: step === 1 && debouncedPromo.length >= 3 && datesValid,
    retry: false,
    staleTime: 30_000,
  })

  // ---- drivers (only for chauffeur) ----
  const driversQuery = useQuery({
    queryKey: ['drivers'],
    queryFn: () => apiGet<{ drivers: DriverProfile[] }>('/api/drivers'),
    enabled: step === 1 && needsDriver,
  })
  const availableDrivers = (driversQuery.data?.drivers ?? []).filter((d) => d.status === 'AVAILABLE')

  // ---- create booking when entering step 2 ----
  async function handleContinue() {
    if (!formValid || !quoteInput || !quote) return
    setCreating(true)
    try {
      const key = JSON.stringify(quoteInput)
      // If the user edited details after a booking was already created,
      // cancel the stale pending booking before re-booking.
      if (booking && lastCreatedKeyRef.current && lastCreatedKeyRef.current !== key) {
        await apiPatch(`/api/bookings/${booking.id}`, {
          action: 'cancel',
          reason: 'Rebooked with updated details',
        }).catch(() => undefined)
        setBooking(null)
      }
      if (!booking || lastCreatedKeyRef.current !== key) {
        const { booking: created } = await apiPost<{ booking: Booking }>('/api/bookings', quoteInput)
        lastCreatedKeyRef.current = key
        setBooking(created)
      }
      setStep(2)
    } catch (e) {
      toast({ title: 'Could not continue', description: errorMessage(e), variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  const invalidReason = !formValid
    ? !datesValid
      ? 'Pick a start date in the future and a later end date.'
      : !destinationOk
        ? 'Choose a delivery destination.'
        : 'Select a chauffeur for this mode.'
    : null

  // ============================================================

  return (
    <div className="pb-6">
      <DialogHeader className="space-y-3 bg-muted/40 px-4 pb-4 pt-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
          <div className="flex items-center gap-3">
            <div className="relative hidden h-14 w-20 shrink-0 overflow-hidden rounded-md border sm:block">
              <VehicleImage src={vehicle.imageUrl} alt={vehicle.label} />
            </div>
            <div>
              <DialogTitle className="text-left text-base sm:text-lg">
                Book {vehicle.label}
              </DialogTitle>
              <DialogDescription className="text-left">
                {formatKes(vehicle.dailyRate)}/day · {vehicle.yardName ?? 'Yard to be confirmed'}
              </DialogDescription>
            </div>
          </div>
          {step < 3 ? <Stepper step={step} /> : null}
        </div>
      </DialogHeader>

      <div className="px-4 pt-5 sm:px-6">
        {/* ---- Auth gate ---- */}
        {sessionLoading ? (
          <div className="space-y-4 py-8">
            <Skeleton className="mx-auto h-12 w-12 rounded-full" />
            <Skeleton className="mx-auto h-4 w-48" />
            <Skeleton className="mx-auto h-11 w-40" />
          </div>
        ) : !authOk ? (
          <div className="flex flex-col items-center py-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <LockKeyhole aria-hidden className="h-6 w-6 text-primary" />
            </span>
            <h3 className="mt-4 text-lg font-semibold">Sign in to book</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Sign in as a customer to continue with {vehicle.label}. Use the demo customer account
              for a quick tour.
            </p>
            <Button className="mt-5 h-11 px-6" onClick={() => setLoginOpen(true)}>
              Sign in
            </Button>
            <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
          </div>
        ) : step === 1 ? (
          /* ---------------- Step 1 — trip details ---------------- */
          <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
            <div className="space-y-6">
              {/* Dates */}
              <section className="space-y-3" aria-labelledby="bf-dates">
                <h3 id="bf-dates" className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarClock aria-hidden className="h-4 w-4 text-primary" /> Trip dates
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="bf-start">Start</Label>
                    <Input
                      id="bf-start"
                      type="datetime-local"
                      className="h-11"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bf-end">End</Label>
                    <Input
                      id="bf-end"
                      type="datetime-local"
                      className="h-11"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                  <Badge variant="secondary" className="h-8 justify-center px-3 text-xs">
                    {datesValid ? `${days} day${days === 1 ? '' : 's'}` : '—'}
                  </Badge>
                </div>
                {!datesValid && (startDate || endDate) ? (
                  <p className="text-xs text-destructive">
                    Start must be in the future and before the end date.
                  </p>
                ) : null}
              </section>

              {/* Mode */}
              <section className="space-y-3" aria-labelledby="bf-mode">
                <h3 id="bf-mode" className="text-sm font-semibold">
                  How would you like the car?
                </h3>
                <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Rental mode">
                  {(Object.keys(MODE_META) as BookingMode[]).map((m) => {
                    const Icon = MODE_ICONS[m]
                    const active = mode === m
                    return (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setMode(m)
                          setDraftMode(m)
                        }}
                        className={cn(
                          'flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'bg-card hover:border-foreground/25',
                        )}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <Icon aria-hidden className={cn('h-4 w-4', active && 'text-primary')} />
                          {MODE_META[m].label}
                        </span>
                        <span className="text-xs text-muted-foreground">{MODE_META[m].blurb}</span>
                        <span
                          className={cn(
                            'text-xs font-medium',
                            active ? 'text-primary' : 'text-muted-foreground',
                          )}
                        >
                          {MODE_META[m].feeNote}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* Destination (delivery / chauffeur) */}
              {needsDestination ? (
                <section className="space-y-3" aria-labelledby="bf-dest">
                  <h3 id="bf-dest" className="text-sm font-semibold">
                    Where should we bring the car?
                  </h3>
                  <div className="space-y-1.5">
                    <Label htmlFor="bf-destination">Destination</Label>
                    <Select value={destination} onValueChange={setDestination}>
                      <SelectTrigger id="bf-destination" className="h-11 w-full">
                        <SelectValue placeholder="Choose a preset destination" />
                      </SelectTrigger>
                      <SelectContent>
                        {CITIES.map((city) => (
                          <SelectGroup key={city}>
                            <SelectLabel>{city}</SelectLabel>
                            {DESTINATIONS.filter((d) => d.city === city).map((d) => (
                              <SelectItem key={d.name} value={d.name}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Preset destinations keep your quote instant. Distance is measured from{' '}
                      {vehicle.yardName ?? 'the yard'}.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bf-address">Address details (optional)</Label>
                    <Input
                      id="bf-address"
                      placeholder="e.g. Apartment 4B, Riverside Drive"
                      className="h-11"
                      value={addressDetails}
                      onChange={(e) => setAddressDetails(e.target.value)}
                    />
                  </div>
                </section>
              ) : null}

              {/* Driver (chauffeur) */}
              {needsDriver ? (
                <section className="space-y-3" aria-labelledby="bf-driver">
                  <h3 id="bf-driver" className="text-sm font-semibold">
                    Choose your chauffeur
                  </h3>
                  {driversQuery.isPending ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <Skeleton key={i} className="h-16 rounded-lg" />
                      ))}
                    </div>
                  ) : availableDrivers.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      No chauffeurs available right now — try different dates or switch to another
                      mode.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Chauffeur">
                      {availableDrivers.map((d) => (
                        <DriverOption
                          key={d.id}
                          driver={d}
                          selected={driverId === d.id}
                          onSelect={() => setDriverId(d.id)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              ) : null}

              {/* Extras */}
              <section className="space-y-3" aria-labelledby="bf-extras">
                <h3 id="bf-extras" className="text-sm font-semibold">
                  Extras
                </h3>
                <div className="space-y-2">
                  {EXTRAS_CATALOG.map((extra) => {
                    const qty = extras[extra.key] ?? 0
                    return (
                      <div
                        key={extra.key}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                          qty > 0 && 'border-primary/40 bg-primary/5',
                        )}
                      >
                        <Checkbox
                          id={`extra-${extra.key}`}
                          aria-label={extra.label}
                          checked={qty > 0}
                          onCheckedChange={() =>
                            setExtras((prev) => {
                              const next = { ...prev }
                              if (qty > 0) delete next[extra.key]
                              else next[extra.key] = 1
                              return next
                            })
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <Label
                            htmlFor={`extra-${extra.key}`}
                            className="cursor-pointer text-sm font-medium"
                          >
                            {extra.label}
                          </Label>
                          <p className="truncate text-xs text-muted-foreground">
                            {extra.description}
                          </p>
                        </div>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {extra.perDay ? `${formatKes(extra.perDay)}/day` : formatKes(extra.flat)}
                        </span>
                        {qty > 0 ? (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 w-9"
                              aria-label={`Decrease ${extra.label} quantity`}
                              onClick={() =>
                                setExtras((prev) => ({ ...prev, [extra.key]: Math.max(1, qty - 1) }))
                              }
                              disabled={qty <= 1}
                            >
                              <Minus aria-hidden className="h-3.5 w-3.5" />
                            </Button>
                            <span className="w-6 text-center text-sm font-semibold tabular-nums">
                              {qty}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 w-9"
                              aria-label={`Increase ${extra.label} quantity`}
                              onClick={() =>
                                setExtras((prev) => ({ ...prev, [extra.key]: Math.min(9, qty + 1) }))
                              }
                            >
                              <Plus aria-hidden className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Promo */}
              <section className="space-y-3" aria-labelledby="bf-promo">
                <h3 id="bf-promo" className="text-sm font-semibold">
                  Promo code
                </h3>
                <div className="max-w-xs space-y-1.5">
                  <div className="relative">
                    <Tag
                      aria-hidden
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      placeholder="WELCOME10"
                      aria-label="Promo code"
                      className="h-11 pl-9 font-mono uppercase"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase().slice(0, 20))}
                    />
                  </div>
                  {promoCode.trim().length >= 3 ? (
                    promoQuery.isFetching ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 aria-hidden className="h-3 w-3 animate-spin" /> Checking code...
                      </p>
                    ) : promoQuery.data ? (
                      promoQuery.data.valid ? (
                        <p className="flex items-center gap-1 text-xs font-medium text-primary">
                          <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
                          {promoQuery.data.message}
                        </p>
                      ) : (
                        <p className="flex items-center gap-1 text-xs text-destructive">
                          <XCircle aria-hidden className="h-3.5 w-3.5" />
                          {promoQuery.data.message}
                        </p>
                      )
                    ) : null
                  ) : (
                    <p className="text-xs text-muted-foreground">Try WELCOME10 or SAFARI500.</p>
                  )}
                </div>
              </section>
            </div>

            {/* ---- Live quote sidebar ---- */}
            <aside aria-label="Quote summary">
              <Card className="lg:sticky lg:top-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Live quote</CardTitle>
                  <CardDescription>Updates as you customize your trip</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {quoteQuery.isFetching ? (
                    <div className="space-y-2">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-3.5 w-1/2" />
                      <Skeleton className="h-3.5 w-3/5" />
                      <Skeleton className="h-6 w-full" />
                    </div>
                  ) : quoteQuery.isError ? (
                    <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                      Couldn't compute the quote: {errorMessage(quoteQuery.error)}
                    </p>
                  ) : quote ? (
                    <>
                      <dl className="space-y-1.5">
                        {quote.breakdown.filter((l) => !isDepositLine(l)).map((line, i) => (
                          <div key={i} className="flex items-baseline justify-between gap-2 text-sm">
                            <dt className="min-w-0">
                              {line.label}
                              {line.note ? (
                                <span className="text-xs text-muted-foreground"> · {line.note}</span>
                              ) : null}
                            </dt>
                            <dd
                              className={cn(
                                'shrink-0 font-medium tabular-nums',
                                line.amount < 0 && 'text-primary',
                              )}
                            >
                              {line.amount < 0
                                ? `− ${formatKes(Math.abs(line.amount))}`
                                : formatKes(line.amount)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      {quote.distanceKm !== null && mode !== 'PICKUP' ? (
                        <p className="text-xs text-muted-foreground">
                          ≈ {quote.distanceKm.toFixed(1)} km from {vehicle.yardName ?? 'the yard'}
                        </p>
                      ) : null}
                      <div className="flex items-baseline justify-between border-t pt-3">
                        <span className="font-medium">Total</span>
                        <span className="text-lg font-bold tabular-nums">
                          {formatKes(quote.total)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        A refundable deposit of {formatKes(quote.deposit)} is held separately and
                        returned after your rental.
                      </p>
                      {quote.promoValid === false && quote.promoMessage ? (
                        <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                          {quote.promoMessage}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Pick valid dates to see your price.
                    </p>
                  )}

                  <Button
                    className="h-11 w-full"
                    disabled={!formValid || !quote || quoteQuery.isError || creating}
                    onClick={handleContinue}
                  >
                    {creating ? (
                      <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                    ) : (
                      <>Continue{quote ? ` · ${formatKes(quote.total)}` : ''}</>
                    )}
                  </Button>
                  {invalidReason ? (
                    <p className="text-center text-xs text-muted-foreground">{invalidReason}</p>
                  ) : null}
                </CardContent>
              </Card>
            </aside>
          </div>
        ) : step === 2 && booking ? (
          /* ---------------- Step 2 — review & pay ---------------- */
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="space-y-5">
              <BookingSummaryCard booking={booking} />
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  className="h-10"
                  onClick={() => setStep(1)}
                  disabled={creating}
                >
                  Back to edit
                </Button>
                <p className="text-xs text-muted-foreground">
                  Booking {booking.reference} is held until you pay.
                </p>
              </div>
              <Separator />
              <PaymentStep
                booking={booking}
                finishLabel="View confirmation"
                onPaid={(payment) => {
                  setPaidPayment(payment)
                  setBooking((b) => (b ? { ...b, status: 'PAID', paymentStatus: 'PAID' } : b))
                  setStep(3)
                }}
              />
            </div>
            <aside className="space-y-3" aria-label="Good to know">
              <Card className="p-4">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck aria-hidden className="h-4 w-4 text-primary" /> Good to know
                </h4>
                <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
                  <li>Free cancellation up to 48 hours before your trip starts.</li>
                  <li>
                    A refundable deposit of {formatKes(booking.deposit)} is held after the rental.
                  </li>
                  <li>The owner confirms your booking right after payment.</li>
                  <li>Live tracking activates once your car is dispatched.</li>
                </ul>
              </Card>
            </aside>
          </div>
        ) : step === 3 && booking ? (
          /* ---------------- Step 3 — confirmation ---------------- */
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mx-auto max-w-md py-4 text-center"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="mx-auto"
            >
              <CheckCircle2 aria-hidden className="h-16 w-16 text-primary" />
            </motion.div>
            <h3 className="mt-4 text-2xl font-bold">You're booked in</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Payment received — the owner will confirm shortly.
            </p>

            <div className="mt-6 space-y-3 rounded-lg border bg-muted/40 p-5">
              <StatusBadge status={booking.status} />
              <p className="font-mono text-2xl font-bold tracking-widest">{booking.reference}</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{booking.vehicle.label}</p>
                <p>
                  {formatDateTime(booking.startDate)} → {formatDateTime(booking.endDate)}
                </p>
                {paidPayment?.receiptNo ? (
                  <p>
                    Receipt <span className="font-mono">{paidPayment.receiptNo}</span> ·{' '}
                    {formatKes(paidPayment.amount)} paid
                  </p>
                ) : null}
              </div>
            </div>

            <ol className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm text-muted-foreground">
              <li className="flex gap-2">
                <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                The owner confirms your booking — you'll get a notification.
              </li>
              <li className="flex gap-2">
                <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {booking.mode === 'PICKUP'
                  ? `Collect the car at ${booking.pickupYardName ?? 'the yard'} on the day.`
                  : 'Your car is delivered to your address — live tracking activates when dispatched.'}
              </li>
              <li className="flex gap-2">
                <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Deposit refunded automatically after the rental.
              </li>
            </ol>

            <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button
                className="h-11 px-6"
                onClick={() => {
                  setCustomerTab('bookings')
                  closeBooking()
                }}
              >
                View my bookings
              </Button>
              <Button variant="outline" className="h-11 px-6" onClick={closeBooking}>
                Done
              </Button>
            </div>
          </motion.div>
        ) : null}
      </div>
    </div>
  )
}

// ============================================================
// Sub-components
// ============================================================

function Stepper({ step }: { step: Step }) {
  const steps = ['Trip details', 'Review & pay', 'Confirmation']
  return (
    <ol className="flex items-center gap-1.5 sm:gap-2" aria-label="Booking progress">
      {steps.map((label, i) => {
        const n = (i + 1) as Step
        const done = step > n
        const current = step === n
        return (
          <li key={label} className="flex items-center gap-1.5 sm:gap-2">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                done && 'bg-primary text-primary-foreground',
                current && 'bg-primary/15 text-primary ring-1 ring-primary',
                !done && !current && 'bg-muted text-muted-foreground',
              )}
              aria-current={current ? 'step' : undefined}
            >
              {done ? <Check aria-hidden className="h-4 w-4" /> : n}
            </span>
            <span
              className={cn(
                'hidden text-xs font-medium sm:inline',
                current ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 ? (
              <span aria-hidden className="h-px w-4 bg-border sm:w-8" />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function DriverOption({
  driver,
  selected,
  onSelect,
}: {
  driver: DriverProfile
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card hover:border-foreground/25',
      )}
    >
      <Avatar className="h-10 w-10">
        <AvatarFallback className="bg-primary/10 text-primary">{initials(driver.name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{driver.name}</span>
        <span className="block text-xs text-muted-foreground">
          {driver.yearsExperience} yrs · {formatKes(driver.dailyRate)}/day
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <StarRating value={driver.rating} />
        {selected ? <CheckCircle2 aria-hidden className="h-4 w-4 text-primary" /> : null}
      </span>
    </button>
  )
}

function isDepositLine(line: QuoteLine): boolean {
  return /deposit/i.test(line.label) || /refund/i.test(line.note ?? '')
}

function BookingSummaryCard({ booking }: { booking: Booking }) {
  const v = booking.vehicle
  const ModeIcon = MODE_ICONS[booking.mode]

  const lines: { label: string; amount: number; note?: string }[] = []
  if (booking.rentalTotal > 0)
    lines.push({
      label: `Rental · ${booking.days} day${booking.days === 1 ? '' : 's'}`,
      amount: booking.rentalTotal,
    })
  if (booking.deliveryFee > 0)
    lines.push({
      label: 'Delivery',
      amount: booking.deliveryFee,
      note: booking.distanceKm !== null ? `≈ ${booking.distanceKm.toFixed(1)} km` : undefined,
    })
  if (booking.driverTotal > 0) lines.push({ label: 'Chauffeur', amount: booking.driverTotal })
  if (booking.extrasTotal > 0) lines.push({ label: 'Extras', amount: booking.extrasTotal })
  if (booking.discount > 0)
    lines.push({ label: `Promo ${booking.promoCode ?? ''}`.trim(), amount: -booking.discount })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Review your trip</CardTitle>
        <CardDescription>
          Booking <span className="font-mono">{booking.reference}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md border">
            <VehicleImage src={v.imageUrl} alt={v.label} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{v.label}</p>
            <p className="text-xs text-muted-foreground">
              {formatKes(v.dailyRate)}/day · {v.yardName ?? ''}
            </p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <p className="flex items-start gap-2">
            <CalendarClock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              {formatDateTime(booking.startDate)} → {formatDateTime(booking.endDate)}
              <span className="text-muted-foreground">
                {' '}
                · {booking.days} day{booking.days === 1 ? '' : 's'}
              </span>
            </span>
          </p>
          <p className="flex items-start gap-2">
            <ModeIcon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              {MODE_META[booking.mode].label}
              {booking.deliveryAddress ? (
                <span className="text-muted-foreground"> · {booking.deliveryAddress}</span>
              ) : booking.mode === 'PICKUP' && booking.pickupYardName ? (
                <span className="text-muted-foreground"> · {booking.pickupYardName}</span>
              ) : null}
            </span>
          </p>
          {booking.driver ? (
            <p className="flex items-start gap-2">
              <Avatar className="mt-0.5 h-4 w-4">
                <AvatarFallback className="bg-primary/10 text-[8px] text-primary">
                  {initials(booking.driver.name)}
                </AvatarFallback>
              </Avatar>
              <span>
                Chauffeur: {booking.driver.name}
                <span className="text-muted-foreground"> · {formatKes(booking.driver.dailyRate)}/day</span>
              </span>
            </p>
          ) : null}
        </div>

        {booking.extras.length > 0 ? (
          <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-xs">
            <p className="font-medium">Extras</p>
            {booking.extras.map((x) => (
              <p key={x.key} className="flex justify-between gap-2 text-muted-foreground">
                <span>
                  {x.label}
                  {x.qty > 1 ? ` × ${x.qty}` : ''}
                </span>
                <span className="tabular-nums">{formatKes(x.amount)}</span>
              </p>
            ))}
          </div>
        ) : null}

        <Separator />

        <dl className="space-y-1.5">
          {lines.map((l, i) => (
            <div key={i} className="flex items-baseline justify-between gap-2 text-sm">
              <dt className="min-w-0">
                {l.label}
                {l.note ? <span className="text-xs text-muted-foreground"> · {l.note}</span> : null}
              </dt>
              <dd className={cn('shrink-0 font-medium tabular-nums', l.amount < 0 && 'text-primary')}>
                {l.amount < 0 ? `− ${formatKes(Math.abs(l.amount))}` : formatKes(l.amount)}
              </dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t pt-2.5">
            <dt className="font-medium">Total</dt>
            <dd className="text-lg font-bold tabular-nums">{formatKes(booking.total)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Refundable deposit of {formatKes(booking.deposit)} held separately.
        </p>
      </CardContent>
    </Card>
  )
}
