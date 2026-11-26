// ============================================================
// SafariDrive — server-side client for the tracking mini-service
// (port 3003). NEVER throws: bookings must still transition when
// the tracking service is down.
// ============================================================
import type { TripState } from './types'

const BASE = (process.env.TRACKING_SERVICE_URL ?? 'http://localhost:3003').replace(/\/+$/, '')
const INTERNAL_KEY = process.env.TRACKING_INTERNAL_KEY ?? ''
const TIMEOUT_MS = 2500

/** Auth headers for the tracking service (server-to-server shared key). */
function internalHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(INTERNAL_KEY ? { 'x-internal-key': INTERNAL_KEY } : {}),
    ...extra,
  }
}

export interface SimStartPayload {
  bookingId: string
  vehicleId: string
  from: { lat: number; lng: number }
  to: { lat: number; lng: number }
  mode: 'DELIVERY' | 'RENTAL'
  label: string
}

/** Start (or restart) a trip simulation. Best-effort; never throws. */
export async function startTripSim(payload: SimStartPayload): Promise<void> {
  try {
    const res = await fetch(`${BASE}/sim/start`, {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      console.error(`[tracking] sim/start failed for ${payload.bookingId}: HTTP ${res.status}`)
    }
  } catch (err) {
    console.error(`[tracking] sim/start error for ${payload.bookingId}:`, err instanceof Error ? err.message : err)
  }
}

/** Stop a trip simulation. Best-effort; never throws. */
export async function stopTripSim(bookingId: string): Promise<void> {
  try {
    const res = await fetch(`${BASE}/sim/stop`, {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify({ bookingId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      console.error(`[tracking] sim/stop failed for ${bookingId}: HTTP ${res.status}`)
    }
  } catch (err) {
    console.error(`[tracking] sim/stop error for ${bookingId}:`, err instanceof Error ? err.message : err)
  }
}

/** Fetch the current trip state. Returns null when the service is down / no trip. */
export async function fetchTripState(bookingId: string): Promise<TripState | null> {
  try {
    const res = await fetch(`${BASE}/trips/${bookingId}`, {
      headers: INTERNAL_KEY ? { 'x-internal-key': INTERNAL_KEY } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) {
      if (res.status !== 404) {
        console.error(`[tracking] trips/${bookingId} failed: HTTP ${res.status}`)
      }
      return null
    }
    const data = (await res.json()) as TripState
    if (!data || typeof data !== 'object' || typeof data.active !== 'boolean') return null
    return data
  } catch (err) {
    console.error(`[tracking] trips/${bookingId} error:`, err instanceof Error ? err.message : err)
    return null
  }
}
