'use client'

import type { LucideIcon } from 'lucide-react'
import { MapPin, Truck, UserRoundCheck } from 'lucide-react'

import { cn } from '@/lib/utils'
import { statusLabel, statusTone } from '@/lib/format'
import type { BookingMode } from '@/lib/types'

const TONE_CLASSES: Record<'neutral' | 'info' | 'success' | 'warning' | 'danger', string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-primary/10 text-primary',
  success: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  danger: 'bg-destructive/10 text-destructive',
}

export function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
      )}
    >
      {statusLabel(status)}
    </span>
  )
}

const MODE_META: Record<BookingMode, { label: string; icon: LucideIcon }> = {
  PICKUP: { label: 'Self pickup', icon: MapPin },
  DELIVERY: { label: 'Delivered', icon: Truck },
  CHAUFFEUR: { label: 'With driver', icon: UserRoundCheck },
}

export function ModeBadge({ mode }: { mode: BookingMode }) {
  const meta = MODE_META[mode] ?? MODE_META.PICKUP
  const Icon = meta.icon
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      {meta.label}
    </span>
  )
}
