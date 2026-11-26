'use client'

import { useQuery } from '@tanstack/react-query'
import { Clock, MapPin, Phone, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet } from '@/lib/api'
import { CATEGORY_META } from '@/lib/constants'
import { formatDate, formatKes } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import type { Review, RentalYard, Vehicle } from '@/lib/types'
import { StarRating, VehicleImage } from './ui-bits'

interface VehicleDialogProps {
  vehicle: Vehicle
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function VehicleDialog({ vehicle, open, onOpenChange }: VehicleDialogProps) {
  const openBooking = useAppStore((s) => s.openBooking)

  const detailQuery = useQuery({
    queryKey: ['vehicle', vehicle.id],
    queryFn: () => apiGet<{ vehicle: Vehicle; reviews: Review[] }>(`/api/vehicles/${vehicle.id}`),
    enabled: open,
  })

  const yardsQuery = useQuery({
    queryKey: ['yards'],
    queryFn: () => apiGet<{ yards: RentalYard[] }>('/api/yards'),
    enabled: open,
  })

  const v = detailQuery.data?.vehicle ?? vehicle
  const reviews = detailQuery.data?.reviews ?? []
  const yard = yardsQuery.data?.yards.find((y) => y.id === v.yardId) ?? null

  const specs: { label: string; value: string }[] = [
    { label: 'Category', value: CATEGORY_META[v.category].label },
    { label: 'Seats', value: `${v.seats} seats` },
    { label: 'Doors', value: `${v.doors} doors` },
    { label: 'Transmission', value: v.transmission },
    { label: 'Fuel', value: v.fuelType },
    {
      label: 'Mileage',
      value: v.mileageLimitKmPerDay
        ? `${v.mileageLimitKmPerDay} km/day · ${formatKes(v.excessPerKm)}/km over`
        : 'Unlimited',
    },
    { label: 'Plate', value: v.plate },
    { label: 'Owner', value: v.ownerName },
  ]

  function handleBook() {
    onOpenChange(false)
    openBooking(v)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sd-scroll max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {v.label}
            <Badge variant="secondary">{CATEGORY_META[v.category].label}</Badge>
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <StarRating value={v.rating} showValue />
            <span className="text-xs">{v.reviewCount} reviews</span>
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-video overflow-hidden rounded-lg border">
          <VehicleImage src={v.imageUrl} alt={`${v.label} rental car`} />
          <Badge className="absolute right-3 top-3 border-transparent bg-background/90 text-foreground backdrop-blur">
            {formatKes(v.dailyRate)}/day
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {specs.map((s) => (
            <div key={s.label} className="rounded-lg bg-muted/60 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold" title={s.value}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {v.features.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {v.features.map((f) => (
              <Badge key={f} variant="outline" className="font-normal">
                {f}
              </Badge>
            ))}
          </div>
        ) : null}

        {v.description ? <p className="text-sm leading-relaxed text-muted-foreground">{v.description}</p> : null}

        <div className="rounded-lg border bg-muted/30 p-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <MapPin aria-hidden className="h-4 w-4 text-primary" /> Pickup yard
          </h4>
          <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            <p className="font-medium text-foreground">{v.yardName ?? 'To be confirmed'}</p>
            <p>{yard ? yard.address : v.yardCity ?? ''}</p>
            {yard ? (
              <>
                <p className="inline-flex items-center gap-1.5">
                  <Clock aria-hidden className="h-3.5 w-3.5" /> {yard.openHours}
                </p>
                <a
                  href={`tel:${yard.phone}`}
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  <Phone aria-hidden className="h-3.5 w-3.5" /> {yard.phone}
                </a>
              </>
            ) : null}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold">Reviews</h4>
          <div className="sd-scroll mt-2 max-h-72 space-y-3 overflow-y-auto pr-1">
            {detailQuery.isPending ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))
            ) : reviews.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No reviews yet — be the first to rent this car.
              </p>
            ) : (
              reviews.map((r) => (
                <article key={r.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{r.authorName}</p>
                    <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
                  </div>
                  <StarRating value={r.rating} className="mt-1" />
                  {r.comment ? <p className="mt-1.5 text-sm text-muted-foreground">{r.comment}</p> : null}
                </article>
              ))
            )}
          </div>
        </div>

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p>
              <span className="text-xl font-bold tabular-nums">{formatKes(v.dailyRate)}</span>
              <span className="text-sm text-muted-foreground">/day</span>
            </p>
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
              {formatKes(v.securityDeposit)} refundable deposit
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button className="h-11 px-6" onClick={handleBook}>
              Book now
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
