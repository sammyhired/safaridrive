'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Gauge,
  Info,
  MapPin,
  Navigation,
  Phone,
  Radar,
  Route,
  Timer,
  UserRound,
} from 'lucide-react'
import MapView from '@/components/shared/map-view'
import { StatusBadge } from '@/components/shared/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useSocket } from '@/hooks/use-socket'
import { apiGet } from '@/lib/api'
import { formatTime, haversineKm, initials } from '@/lib/format'
import type { Booking, GpsPoint, TrackingResponse, TripLatest, TripState } from '@/lib/types'
import { cn } from '@/lib/utils'
import { errorMessage, StarRating } from './ui-bits'

interface TrackingPanelProps {
  booking: Booking
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Live GPS tracking dialog for OUT_FOR_DELIVERY / ACTIVE bookings.
 * Initial state from GET /api/tracking/[id], live updates via socket.io
 * (join-trip -> trip-state + position events).
 */
export default function TrackingPanel({ booking, open, onOpenChange }: TrackingPanelProps) {
  const { socket, connected } = useSocket()

  // Live state fed by socket events. Falls back to the REST snapshot
  // (derived during render) until the first socket update lands.
  const [localTrip, setLocalTrip] = useState<TripState | null>(null)
  const [localLatest, setLocalLatest] = useState<TripLatest | null>(null)
  const [localPath, setLocalPath] = useState<GpsPoint[] | null>(null)

  const trackingQuery = useQuery({
    queryKey: ['tracking', booking.id],
    queryFn: () => apiGet<TrackingResponse>(`/api/tracking/${booking.id}`),
    enabled: open,
    retry: false,
  })

  const restTrip = trackingQuery.data?.trip ?? null
  const trip = localTrip ?? restTrip
  const latest = localLatest ?? trip?.latest ?? null
  const path = localPath ?? trip?.path ?? []

  // Socket lifecycle: join on open (with the per-booking token issued by the
  // auth-checked proxy endpoint), leave on close, stream updates. Until the
  // token arrives the panel relies on the REST snapshot above.
  const joinToken = trackingQuery.data?.joinToken ?? null

  useEffect(() => {
    if (!open || !socket || !joinToken) return
    socket.emit('join-trip', { bookingId: booking.id, token: joinToken })

    const onState = (state: TripState) => {
      setLocalTrip(state)
      if (state.latest) setLocalLatest(state.latest)
      if (state.path) setLocalPath(state.path)
    }
    const onPosition = (p: TripLatest) => {
      setLocalLatest(p)
      setLocalTrip((t) => {
        const base = t ?? restTrip
        return base ? { ...base, latest: p } : t
      })
      setLocalPath((prev) => {
        const current = prev ?? restTrip?.path ?? []
        const last = current[current.length - 1]
        if (last && Math.abs(last.lat - p.lat) < 1e-6 && Math.abs(last.lng - p.lng) < 1e-6) {
          return prev
        }
        return [...current.slice(-499), { lat: p.lat, lng: p.lng }]
      })
    }

    socket.on('trip-state', onState)
    socket.on('position', onPosition)
    return () => {
      socket.off('trip-state', onState)
      socket.off('position', onPosition)
      socket.emit('leave-trip', { bookingId: booking.id })
    }
  }, [open, socket, booking.id, joinToken])

  // ---- derived map data ----
  const v = booking.vehicle
  const from = useMemo<GpsPoint | null>(() => {
    if (trip?.from) return trip.from
    if (v.yardLat !== null && v.yardLng !== null) return { lat: v.yardLat, lng: v.yardLng }
    return null
  }, [trip, v.yardLat, v.yardLng])

  const to = useMemo<GpsPoint | null>(() => {
    if (trip?.to) return trip.to
    if (booking.deliveryLat !== null && booking.deliveryLng !== null) {
      return { lat: booking.deliveryLat, lng: booking.deliveryLng }
    }
    return null
  }, [trip, booking.deliveryLat, booking.deliveryLng])

  const live = latest ?? trip?.latest ?? null
  const isDelivery = booking.status === 'OUT_FOR_DELIVERY' || trip?.mode === 'DELIVERY'

  const distRemaining = live && to ? haversineKm(live, to) : null
  const totalDist = from && to ? haversineKm(from, to) : null

  const progress = useMemo(() => {
    if (!isDelivery) return null
    if (distRemaining !== null && totalDist !== null && totalDist > 0.05) {
      return Math.min(1, Math.max(0, 1 - distRemaining / totalDist))
    }
    return trip?.progress ?? null
  }, [isDelivery, distRemaining, totalDist, trip?.progress])

  const etaMin = useMemo(() => {
    if (!isDelivery) return null
    if (live && live.speed > 3 && distRemaining !== null) {
      return Math.max(1, Math.round((distRemaining / live.speed) * 60))
    }
    return trip?.etaMin ?? null
  }, [isDelivery, live, distRemaining, trip?.etaMin])

  const markers = useMemo(() => {
    const list: {
      id: string
      lat: number
      lng: number
      label?: string
      kind?: 'vehicle' | 'yard' | 'destination' | 'driver'
      popup?: string
    }[] = []
    if (from) {
      list.push({
        id: `yard-${booking.pickupYardId ?? 'x'}`,
        lat: from.lat,
        lng: from.lng,
        label: booking.pickupYardName ?? 'Pickup yard',
        kind: 'yard',
        popup: `${booking.pickupYardName ?? 'Pickup yard'} — start point`,
      })
    }
    if (to) {
      list.push({
        id: `dest-${booking.id}`,
        lat: to.lat,
        lng: to.lng,
        label: booking.deliveryAddress ?? 'Destination',
        kind: 'destination',
        popup: booking.deliveryAddress ?? 'Destination',
      })
    }
    return list
  }, [from, to, booking])

  const center = useMemo<[number, number] | undefined>(() => {
    if (live) return [live.lat, live.lng]
    if (to) return [to.lat, to.lng]
    if (from) return [from.lat, from.lng]
    return undefined
  }, [live, to, from])

  const statusLine =
    booking.status === 'OUT_FOR_DELIVERY'
      ? 'Out for delivery — heading to you'
      : booking.status === 'ACTIVE'
        ? 'On trip — GPS live'
        : 'Live tracking'

  const driver = booking.driver

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sd-scroll max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-3xl lg:max-w-4xl">
        <DialogHeader className="bg-muted/40 px-4 py-4 pr-14 sm:px-6">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
            Live tracking
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                connected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  connected ? 'animate-pulse bg-primary' : 'bg-muted-foreground',
                )}
              />
              {connected ? 'Live' : 'Connecting...'}
            </span>
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {booking.reference} · {v.label}
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-[1fr_310px]">
          {/* Map */}
          <div className="relative min-h-[300px] border-b md:min-h-[420px] md:border-b-0 md:border-r">
            {trackingQuery.isPending ? (
              <Skeleton className="absolute inset-0 rounded-none" />
            ) : markers.length === 0 && !live ? (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                <MapPin aria-hidden className="h-8 w-8 text-muted-foreground/50" />
                No map data available for this booking yet.
              </div>
            ) : (
              <MapView
                markers={markers}
                path={path}
                center={center}
                zoom={live ? 14 : 12}
                height="420px"
                livePosition={live ? { lat: live.lat, lng: live.lng, heading: live.heading } : null}
              />
            )}
          </div>

          {/* Side panel */}
          <div className="space-y-4 p-4 sm:p-5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold leading-tight">{v.label}</p>
                <StatusBadge status={booking.status} />
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-primary">
                <Radar aria-hidden className="h-4 w-4" />
                {statusLine}
              </p>
              {etaMin !== null ? (
                <p className="mt-0.5 text-xs text-muted-foreground">ETA about {etaMin} min</p>
              ) : null}
            </div>

            {progress !== null ? (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>{Math.round(progress * 100)}%</span>
                </div>
                <Progress value={progress * 100} aria-label="Delivery progress" />
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/60 p-2.5">
                <Gauge aria-hidden className="mx-auto h-4 w-4 text-muted-foreground" />
                <p className="mt-1 text-sm font-bold tabular-nums">
                  {live ? Math.round(live.speed) : 0}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">km/h</p>
              </div>
              <div className="rounded-lg bg-muted/60 p-2.5">
                <Route aria-hidden className="mx-auto h-4 w-4 text-muted-foreground" />
                <p className="mt-1 text-sm font-bold tabular-nums">
                  {distRemaining !== null ? distRemaining.toFixed(1) : '—'}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">km left</p>
              </div>
              <div className="rounded-lg bg-muted/60 p-2.5">
                <Timer aria-hidden className="mx-auto h-4 w-4 text-muted-foreground" />
                <p className="mt-1 text-sm font-bold tabular-nums">{etaMin ?? '—'}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">min ETA</p>
              </div>
            </div>

            <p className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Last update</span>
              <span>{live ? formatTime(live.ts) : '—'}</span>
            </p>

            {driver ? (
              <>
                <Separator />
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {initials(driver.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{driver.name}</p>
                    <StarRating value={driver.rating} className="mt-0.5" />
                  </div>
                  {driver.phone ? (
                    <Button variant="outline" size="icon" className="h-10 w-10" asChild>
                      <a href={`tel:${driver.phone}`} aria-label={`Call ${driver.name}`}>
                        <Phone aria-hidden className="h-4 w-4" />
                      </a>
                    </Button>
                  ) : (
                    <UserRound aria-hidden className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </>
            ) : null}

            <Separator />

            <div className="space-y-1.5 text-sm">
              <p className="flex items-start gap-2">
                <Navigation aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  {booking.mode === 'PICKUP'
                    ? `Pickup at ${booking.pickupYardName ?? 'the yard'}`
                    : (booking.deliveryAddress ?? 'Delivery address')}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Updated live via GPS every few seconds.
              </p>
            </div>

            {!trackingQuery.isPending && !trip ? (
              <div className="flex gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                {trackingQuery.isError
                  ? `Live tracking is unavailable right now (${errorMessage(trackingQuery.error)}). You'll see the car's position as soon as it reconnects.`
                  : 'Live tracking has not started yet. It activates the moment your car is dispatched — meanwhile, the map shows the pickup yard.'}
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
