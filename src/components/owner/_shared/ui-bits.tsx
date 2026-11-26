'use client'

// Small reusable presentational bits for the owner + admin dashboards.

import { useState } from 'react'
import { CarFront, KeyRound, Truck, UserCheck, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CATEGORY_META } from '@/lib/constants'
import { initials } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { BookingMode, Vehicle, VehicleCategory } from '@/lib/types'

/** Vehicle photo with graceful fallback to an icon placeholder. */
export function VehicleThumb({
  vehicle,
  className,
}: {
  vehicle: Pick<Vehicle, 'imageUrl' | 'label'>
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (!vehicle.imageUrl || failed) {
    return (
      <div
        className={cn('flex items-center justify-center rounded-md border bg-muted', className)}
        aria-hidden
      >
        <CarFront className="size-5 text-muted-foreground" />
      </div>
    )
  }

  return (
    <img
      src={vehicle.imageUrl}
      alt={vehicle.label}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('rounded-md border object-cover', className)}
    />
  )
}

const MODE_CHIP_META: Record<BookingMode, { label: string; icon: LucideIcon }> = {
  PICKUP: { label: 'Pickup', icon: KeyRound },
  DELIVERY: { label: 'Delivery', icon: Truck },
  CHAUFFEUR: { label: 'Chauffeur', icon: UserCheck },
}

export function ModeChip({ mode, className }: { mode: BookingMode; className?: string }) {
  const meta = MODE_CHIP_META[mode]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground',
        className,
      )}
    >
      <meta.icon className="size-3" aria-hidden />
      {meta.label}
    </span>
  )
}

export function CategoryBadge({
  category,
  className,
}: {
  category: VehicleCategory
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground',
        className,
      )}
    >
      {CATEGORY_META[category]?.label ?? category}
    </span>
  )
}

export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={cn('size-10', className)}>
      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
        {initials(name || '?')}
      </AvatarFallback>
    </Avatar>
  )
}
