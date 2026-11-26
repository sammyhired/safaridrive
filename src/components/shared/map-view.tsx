'use client'

import { useEffect, useRef, useState } from 'react'
import type { DivIcon, Map as LeafletMap, Marker as LeafletMarker, Polyline as LeafletPolyline } from 'leaflet'

import { cn } from '@/lib/utils'

// Leaflet CSS ships no type declarations and TypeScript does not type-check
// side-effect imports, so this resolves cleanly. Next.js extracts it at build
// time — nothing runs at import, which keeps SSR safe. (A dynamic
// `await import('leaflet/dist/leaflet.css')` would fail `tsc` with TS2307.)
import 'leaflet/dist/leaflet.css'

type LeafletModule = typeof import('leaflet')
type MarkerKind = NonNullable<MapMarker['kind']>

export interface MapMarker {
  id: string
  lat: number
  lng: number
  label?: string
  kind?: 'vehicle' | 'yard' | 'destination' | 'driver'
  popup?: string
}

export interface MapViewProps {
  markers?: MapMarker[]
  path?: { lat: number; lng: number }[]
  /** Default: Nairobi [-1.2864, 36.8172] */
  center?: [number, number]
  /** Default: 12 */
  zoom?: number
  /** CSS height, default '320px' */
  height?: string
  livePosition?: { lat: number; lng: number; heading?: number } | null
  onMarkerClick?: (id: string) => void
  className?: string
}

const DEFAULT_CENTER: [number, number] = [-1.2864, 36.8172] // Nairobi
const DEFAULT_ZOOM = 12
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// ---------- Inline SVG glyphs (white strokes, no image assets) ----------
const svgWrap = (paths: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`

const CAR_GLYPH = svgWrap(
  '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
)
const BUILDING_GLYPH = svgWrap(
  '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
)
const USER_GLYPH = svgWrap('<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>')

const KIND_GLYPHS: Record<MarkerKind, string> = {
  vehicle: CAR_GLYPH,
  yard: BUILDING_GLYPH,
  destination: '',
  driver: USER_GLYPH,
}

const KIND_Z_OFFSET: Record<MarkerKind, number> = {
  vehicle: 600,
  driver: 700,
  yard: 500,
  destination: 500,
}

// ---------- Injected marker styles (scoped class names, one <style> tag) ----------
const MAP_STYLE_ID = 'safaridrive-leaflet-styles'
const MAP_CSS = `
.sd-plain-marker { background: transparent !important; border: 0 !important; }
.sd-mk { display: flex; align-items: center; justify-content: center; box-sizing: border-box; box-shadow: 0 1px 4px rgba(15,23,42,.35); }
.sd-mk-vehicle { width: 28px; height: 28px; border-radius: 9999px; background: #059669; border: 2px solid #ffffff; }
.sd-mk-driver { width: 28px; height: 28px; border-radius: 9999px; background: #334155; border: 2px solid #ffffff; }
.sd-mk-yard { width: 28px; height: 28px; border-radius: 7px; background: #475569; border: 2px solid #ffffff; }
.sd-mk-destination { width: 30px; height: 30px; border-radius: 50% 50% 4px 50%; background: #d97706; border: 2px solid #ffffff; transform: rotate(45deg); }
.sd-mk-inner { display: flex; transform: rotate(-45deg); }
.sd-mk-dot { width: 8px; height: 8px; border-radius: 9999px; background: #ffffff; }
.sd-live-marker { transition: transform 1s linear; }
.sd-live-wrap { position: relative; width: 26px; height: 26px; }
.sd-live-pulse { position: absolute; inset: 0; border-radius: 9999px; background: rgba(5,150,105,.4); animation: sd-live-ping 1.8s cubic-bezier(0,0,.2,1) infinite; }
.sd-live-dot { position: absolute; left: 8px; top: 8px; width: 10px; height: 10px; border-radius: 9999px; background: #059669; border: 2px solid #ffffff; box-shadow: 0 1px 4px rgba(15,23,42,.4); }
.sd-live-arrow { position: absolute; left: 50%; top: 50%; width: 0; height: 0; margin-left: -5px; margin-top: -17px; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 9px solid #059669; transform-origin: 5px 17px; }
@keyframes sd-live-ping { 0% { transform: scale(1); opacity: .7; } 80%, 100% { transform: scale(2.4); opacity: 0; } }
.sd-popup { font-family: inherit; font-size: 12px; }
`

function ensureMapStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(MAP_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = MAP_STYLE_ID
  style.textContent = MAP_CSS
  document.head.appendChild(style)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildStaticIcon(L: LeafletModule, kind: MarkerKind): DivIcon {
  if (kind === 'destination') {
    return L.divIcon({
      className: 'sd-plain-marker',
      html: '<div class="sd-mk sd-mk-destination"><span class="sd-mk-inner"><span class="sd-mk-dot"></span></span></div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    })
  }
  return L.divIcon({
    className: 'sd-plain-marker',
    html: `<div class="sd-mk sd-mk-${kind}">${KIND_GLYPHS[kind]}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function buildLiveIcon(L: LeafletModule): DivIcon {
  return L.divIcon({
    className: 'sd-plain-marker sd-live-marker',
    html: '<div class="sd-live-wrap"><span class="sd-live-pulse"></span><span class="sd-live-arrow"></span><span class="sd-live-dot"></span></div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

export default function MapView({
  markers,
  path,
  center,
  zoom,
  height = '320px',
  livePosition = null,
  onMarkerClick,
  className,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const leafletRef = useRef<LeafletModule | null>(null)
  const markersRef = useRef<Map<string, LeafletMarker>>(new Map())
  const polylineRef = useRef<LeafletPolyline | null>(null)
  const liveMarkerRef = useRef<LeafletMarker | null>(null)
  const onMarkerClickRef = useRef(onMarkerClick)
  const userPannedRef = useRef(false)
  const lastFitKeyRef = useRef<string | null>(null)
  const initialViewRef = useRef<{ center?: [number, number]; zoom?: number }>({ center, zoom })
  const [ready, setReady] = useState(false)

  onMarkerClickRef.current = onMarkerClick

  // ---- Init map once (client only); destroy on unmount ----
  useEffect(() => {
    if (typeof window === 'undefined') return

    let cancelled = false
    let map: LeafletMap | null = null

    const init = async () => {
      // Leaflet JS is imported dynamically so it never loads during SSR.
      const L = (await import('leaflet')).default
      if (cancelled || !containerRef.current) return

      ensureMapStyles()
      map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
      })
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map)
      map.setView(
        initialViewRef.current.center ?? DEFAULT_CENTER,
        initialViewRef.current.zoom ?? DEFAULT_ZOOM,
      )
      map.on('dragstart', () => {
        userPannedRef.current = true
      })

      leafletRef.current = L
      mapRef.current = map
      setReady(true)
    }

    void init()

    return () => {
      cancelled = true
      map?.remove()
      mapRef.current = null
      leafletRef.current = null
      polylineRef.current = null
      liveMarkerRef.current = null
      markersRef.current.clear()
      userPannedRef.current = false
      lastFitKeyRef.current = null
      setReady(false)
    }
  }, [])

  // Keep map size in sync with layout changes.
  useEffect(() => {
    if (!ready || !containerRef.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize()
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [ready])

  // ---- Sync static markers (diff by id, keep existing DOM nodes) ----
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!ready || !L || !map) return

    const store = markersRef.current
    const next = markers ?? []
    const nextIds = new Set(next.map((m) => m.id))

    store.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.remove()
        store.delete(id)
      }
    })

    for (const m of next) {
      const existing = store.get(m.id)
      if (existing) {
        const pos = existing.getLatLng()
        if (pos.lat !== m.lat || pos.lng !== m.lng) existing.setLatLng([m.lat, m.lng])
        continue
      }
      const kind = m.kind ?? 'vehicle'
      const marker = L.marker([m.lat, m.lng], {
        icon: buildStaticIcon(L, kind),
        title: m.label ?? m.id,
        alt: m.label ?? m.id,
        riseOnHover: true,
        zIndexOffset: KIND_Z_OFFSET[kind],
      })
      const text = m.popup ?? m.label
      if (text) marker.bindPopup(escapeHtml(text), { className: 'sd-popup', closeButton: false })
      marker.on('click', () => onMarkerClickRef.current?.(m.id))
      marker.addTo(map)
      store.set(m.id, marker)
    }
  }, [ready, markers])

  // ---- Sync route polyline ----
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!ready || !L || !map) return

    if (!path || path.length < 2) {
      polylineRef.current?.remove()
      polylineRef.current = null
      return
    }

    const latlngs = path.map((p) => [p.lat, p.lng] as [number, number])
    if (polylineRef.current) {
      polylineRef.current.setLatLngs(latlngs)
    } else {
      polylineRef.current = L.polyline(latlngs, {
        color: '#059669',
        weight: 3,
        opacity: 0.8,
      }).addTo(map)
    }
  }, [ready, path])

  // ---- Live position: create once, then move smoothly via setLatLng ----
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!ready || !L || !map) return

    if (!livePosition) {
      liveMarkerRef.current?.remove()
      liveMarkerRef.current = null
      return
    }

    if (!liveMarkerRef.current) {
      liveMarkerRef.current = L.marker([livePosition.lat, livePosition.lng], {
        icon: buildLiveIcon(L),
        zIndexOffset: 1000,
        interactive: false,
        keyboard: false,
      }).addTo(map)
    } else {
      liveMarkerRef.current.setLatLng([livePosition.lat, livePosition.lng])
    }

    const arrow = liveMarkerRef.current.getElement()?.querySelector<HTMLElement>('.sd-live-arrow')
    if (arrow) {
      const heading = typeof livePosition.heading === 'number' ? livePosition.heading : 0
      arrow.style.transform = `rotate(${heading}deg)`
    }
  }, [ready, livePosition])

  // ---- Gentle follow: pan only when the live dot leaves the viewport ----
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !livePosition || userPannedRef.current) return
    if (!map.getBounds().contains(livePosition)) {
      map.panTo(livePosition, { animate: true })
    }
  }, [ready, livePosition])

  // ---- View: explicit center/zoom, otherwise fit all content ----
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!ready || !L || !map) return

    if (center) {
      const centerKey = `center|${center[0]},${center[1]}|${zoom ?? DEFAULT_ZOOM}`
      if (lastFitKeyRef.current === centerKey) return
      lastFitKeyRef.current = centerKey
      map.setView(center, zoom ?? DEFAULT_ZOOM)
      return
    }
    if (userPannedRef.current) return

    const pts: [number, number][] = []
    for (const m of markers ?? []) pts.push([m.lat, m.lng])
    for (const p of path ?? []) pts.push([p.lat, p.lng])
    if (livePosition) pts.push([livePosition.lat, livePosition.lng])
    if (pts.length === 0) return

    // Fit only when the structure changes (ids / point count), not every tick.
    const key = `${pts.length}|${(markers ?? []).map((m) => m.id).join(',')}|${path?.length ?? 0}|${livePosition ? 1 : 0}`
    if (lastFitKeyRef.current === key) return
    lastFitKeyRef.current = key

    if (pts.length === 1) {
      map.setView(pts[0], zoom ?? 14)
    } else {
      map.fitBounds(L.latLngBounds(pts), { padding: [32, 32] })
    }
  }, [ready, markers, path, livePosition, center, zoom])

  return (
    <div
      className={cn('relative overflow-hidden rounded-lg border bg-muted/40', className)}
      style={{ height }}
    >
      <div
        ref={containerRef}
        role="application"
        aria-label="Interactive map"
        className="absolute inset-0 h-full w-full"
      />
    </div>
  )
}
