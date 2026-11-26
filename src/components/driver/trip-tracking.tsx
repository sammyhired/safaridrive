'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Gauge, Navigation2, RadioTower, Timer } from 'lucide-react'

import MapView, { type MapMarker } from '@/components/shared/map-view'
import { Skeleton } from '@/components/ui/skeleton'
import { useSocket } from '@/hooks/use-socket'
import { apiGet } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Booking, TrackingResponse, TripState } from '@/lib/types'

interface LivePositionEvent {
  lat: number
  lng: number
  speed: number // km/h
  heading: number // degrees
  ts: string // ISO
}

function toEventPosition(latest: NonNullable<TripState['latest']>): LivePositionEvent {
  return {
    lat: latest.lat,
    lng: latest.lng,
    speed: latest.speed,
    heading: latest.heading,
    ts: latest.ts,
  }
}

/**
 * Live GPS tracking for a delivery trip. Joins the trip room over the shared
 * socket, falls back to the REST proxy for the initial state, and renders the
 * moving vehicle on the shared MapView.
 */
export function TripTracking({ booking }: { booking: Booking }) {
  const { socket, connected } = useSocket()
  // Only ever written from socket event callbacks (external system updates).
  const [liveTrip, setLiveTrip] = useState<TripState | null>(null)
  const [liveLatest, setLiveLatest] = useState<LivePositionEvent | null>(null)

  const trackingQuery = useQuery({
    queryKey: ['tracking', booking.id],
    queryFn: () => apiGet<TrackingResponse>(`/api/tracking/${booking.id}`),
    staleTime: 15_000,
    retry: 1,
  })

  // REST fallback seeds the initial view; live socket data always wins.
  const restTrip = trackingQuery.data?.trip ?? null
  const trip = liveTrip ?? restTrip
  const restLatest = restTrip?.latest ? toEventPosition(restTrip.latest) : null
  const latest = liveLatest ?? restLatest

  // Join the trip room (requires the per-booking token from the auth-checked
  // proxy endpoint); leave on unmount. Joins as soon as the token arrives.
  const joinToken = trackingQuery.data?.joinToken ?? null

  useEffect(() => {
    if (!joinToken) return
    socket.emit('join-trip', { bookingId: booking.id, token: joinToken })

    const onTripState = (state: TripState) => {
      setLiveTrip(state)
      if (state.latest) setLiveLatest(toEventPosition(state.latest))
    }
    const onPosition = (position: LivePositionEvent) => setLiveLatest(position)

    socket.on('trip-state', onTripState)
    socket.on('position', onPosition)
    return () => {
      socket.off('trip-state', onTripState)
      socket.off('position', onPosition)
      socket.emit('leave-trip', { bookingId: booking.id })
    }
  }, [socket, booking.id, joinToken])

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = []
    const vehicle = booking.vehicle
    if (vehicle?.yardLat != null && vehicle?.yardLng != null) {
      list.push({
        id: 'yard',
        lat: vehicle.yardLat,
        lng: vehicle.yardLng,
        label: vehicle.yardName ?? 'Rental yard',
        kind: 'yard',
      })
    }
    if (booking.deliveryLat != null && booking.deliveryLng != null) {
      list.push({
        id: 'destination',
        lat: booking.deliveryLat,
        lng: booking.deliveryLng,
        label: booking.deliveryAddress ?? 'Delivery address',
        kind: 'destination',
      })
    }
    return list
  }, [booking])

  const path = useMemo(() => {
    if (!trip) return undefined
    const points = [...trip.path]
    if (latest) points.push({ lat: latest.lat, lng: latest.lng })
    return points.length >= 2 ? points : undefined
  }, [trip, latest])

  const livePosition = latest ? { lat: latest.lat, lng: latest.lng, heading: latest.heading } : null
  const isDelivery = trip?.mode === 'DELIVERY'
  const noTripYet = !trackingQuery.isLoading && !trip && !latest

  return (
    <section
      aria-label="Live trip tracking"
      className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'relative flex size-2.5 rounded-full',
              connected ? 'bg-emerald-600' : 'bg-amber-500',
            )}
            aria-hidden="true"
          >
            <span
              className={cn(
                'absolute inset-0 animate-ping rounded-full',
                connected ? 'bg-emerald-600/60' : 'bg-amber-500/60',
              )}
            />
          </span>
          <p className="text-sm font-semibold">
            {connected ? 'Live tracking' : 'Reconnecting…'}
          </p>
        </div>
        <dl className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <Gauge className="size-4 text-muted-foreground" aria-hidden="true" />
            <dt className="sr-only">Speed</dt>
            <dd className="font-medium tabular-nums">
              {latest ? `${Math.round(latest.speed)} km/h` : '— km/h'}
            </dd>
          </div>
          {isDelivery ? (
            <div className="flex items-center gap-1.5">
              <Timer className="size-4 text-muted-foreground" aria-hidden="true" />
              <dt className="sr-only">Estimated arrival</dt>
              <dd className="font-medium tabular-nums">
                {trip?.etaMin != null ? `${Math.round(trip.etaMin)} min` : '— min'}
              </dd>
            </div>
          ) : null}
          {trip ? (
            <div className="flex items-center gap-1.5">
              <Navigation2 className="size-4 text-muted-foreground" aria-hidden="true" />
              <dt className="sr-only">Route progress</dt>
              <dd className="font-medium tabular-nums">
                {Math.round(trip.progress * 100)}%
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      {trackingQuery.isLoading && !trip ? (
        <Skeleton className="h-[360px] w-full" aria-hidden="true" />
      ) : (
        <MapView
          markers={markers}
          path={path}
          livePosition={livePosition}
          height="360px"
          className="border-0"
        />
      )}

      {noTripYet ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RadioTower className="size-3.5 shrink-0" aria-hidden="true" />
          No live GPS feed for this trip yet — the map shows the pickup yard and destination.
        </p>
      ) : null}
    </section>
  )
}
