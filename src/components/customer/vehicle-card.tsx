'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Cog, Fuel, MapPin, Star, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Vehicle } from '@/lib/types'
import { CATEGORY_META } from '@/lib/constants'
import { formatKes } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import VehicleDialog from './vehicle-dialog'
import { VehicleImage } from './ui-bits'

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const openBooking = useAppStore((s) => s.openBooking)
  const [detailsOpen, setDetailsOpen] = useState(false)

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      className="group flex h-full flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-video overflow-hidden">
        <VehicleImage
          src={vehicle.imageUrl}
          alt={`${vehicle.label} rental car`}
          className="transition-transform duration-500 group-hover:scale-105"
        />
        <Badge className="absolute left-3 top-3 border-transparent bg-background/90 text-foreground backdrop-blur">
          {CATEGORY_META[vehicle.category].label}
        </Badge>
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-xs font-semibold backdrop-blur">
          <Star aria-hidden className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          {vehicle.rating.toFixed(1)}
          <span className="font-normal text-muted-foreground">({vehicle.reviewCount})</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="truncate font-semibold leading-tight">{vehicle.label}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {vehicle.ownerName}
            {vehicle.yardCity ? ` · ${vehicle.yardCity}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users aria-hidden className="h-3.5 w-3.5" /> {vehicle.seats} seats
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Cog aria-hidden className="h-3.5 w-3.5" /> {vehicle.transmission}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Fuel aria-hidden className="h-3.5 w-3.5" /> {vehicle.fuelType}
          </span>
        </div>

        <div className="mt-auto flex items-end justify-between gap-2">
          <p>
            <span className="text-lg font-bold tabular-nums">{formatKes(vehicle.dailyRate)}</span>
            <span className="text-xs text-muted-foreground">/day</span>
          </p>
          {vehicle.yardName ? (
            <span className="inline-flex max-w-[10rem] items-center gap-1 text-xs text-muted-foreground">
              <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{vehicle.yardName}</span>
            </span>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Button className="h-11 flex-1" onClick={() => openBooking(vehicle)}>
            Book now
          </Button>
          <Button variant="outline" className="h-11" onClick={() => setDetailsOpen(true)}>
            Details
          </Button>
        </div>
      </div>

      <VehicleDialog
        vehicle={vehicle}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </motion.article>
  )
}

export function VehicleCardSkeleton() {
  return (
    <div className={cn('flex h-full flex-col overflow-hidden rounded-lg border bg-card')}>
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="mt-auto h-6 w-28" />
        <div className="flex gap-2">
          <Skeleton className="h-11 flex-1" />
          <Skeleton className="h-11 w-20" />
        </div>
      </div>
    </div>
  )
}
