'use client'

import { useState, type ReactNode } from 'react'
import {
  Briefcase,
  Bus,
  Car,
  CarFront,
  Gem,
  KeyRound,
  Mountain,
  Star,
  Truck,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { BookingMode, VehicleCategory } from '@/lib/types'
import { cn } from '@/lib/utils'

export const CATEGORY_ICONS: Record<VehicleCategory, LucideIcon> = {
  ECONOMY: Car,
  SALOON: CarFront,
  SUV: Truck,
  FOUR_BY_FOUR: Mountain,
  VAN: Bus,
  LUXURY: Gem,
  EXECUTIVE: Briefcase,
}

export const MODE_ICONS: Record<BookingMode, LucideIcon> = {
  PICKUP: KeyRound,
  DELIVERY: Truck,
  CHAUFFEUR: UserRound,
}

export function StarRating({
  value,
  showValue = false,
  className,
}: {
  value: number
  showValue?: boolean
  className?: string
}) {
  const rounded = Math.round(value)
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role="img"
      aria-label={`Rated ${value.toFixed(1)} out of 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(
            'h-3.5 w-3.5',
            i < rounded ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
          )}
        />
      ))}
      {showValue ? <span className="ml-1 text-xs font-semibold">{value.toFixed(1)}</span> : null}
    </span>
  )
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  return 'Something went wrong. Please try again.'
}

/** Vehicle image with a graceful gradient fallback while seeds/images load. */
export function VehicleImage({
  src,
  alt,
  className,
}: {
  src?: string | null
  alt: string
  className?: string
}) {
  const [ok, setOk] = useState(!!src)
  if (!src || !ok) {
    return (
      <div
        aria-hidden
        className={cn(
          'flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-primary/10',
          className,
        )}
      >
        <Car className="h-10 w-10 text-muted-foreground/50" />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setOk(false)}
      className={cn('h-full w-full object-cover', className)}
    />
  )
}

/** Shared slim scrollbar styling (injected once by CustomerApp). */
export function ScrollbarStyles() {
  return (
    <style>{`
      .sd-scroll { scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
      .sd-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
      .sd-scroll::-webkit-scrollbar-track { background: transparent; }
      .sd-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 9999px; }
      .sd-scroll::-webkit-scrollbar-thumb:hover { background: var(--muted-foreground); }
    `}</style>
  )
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}
