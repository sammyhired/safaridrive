// Customer-side search/booking filter state + helpers.
// Pure functions only (no React) so it can be shared by all views.

import type { Vehicle, VehicleCategory } from '@/lib/types'
import { CATEGORY_ORDER } from '@/lib/constants'

export interface SearchFilters {
  q: string
  categories: VehicleCategory[]
  city: string // '' = all cities
  yardId: string // '' = all yards
  minRate: string
  maxRate: string
  transmission: string // '' = any
  minSeats: string // '' = any (minimum seats)
  sort: string
  startDate: string // yyyy-mm-dd or ''
  endDate: string // yyyy-mm-dd or ''
}

export const DEFAULT_FILTERS: SearchFilters = {
  q: '',
  categories: [],
  city: '',
  yardId: '',
  minRate: '',
  maxRate: '',
  transmission: '',
  minSeats: '',
  sort: 'price_asc',
  startDate: '',
  endDate: '',
}

export const SORT_OPTIONS = [
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'newest', label: 'Newest first' },
] as const

/** yyyy-mm-dd for today (+ optional offset), local time. */
export function todayStr(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function dayAtLocal(dateStr: string, hour = 9): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, hour, 0, 0, 0)
}

/** Builds the query string for GET /api/vehicles from the current filters. */
export function buildVehicleQuery(f: SearchFilters): string {
  const p = new URLSearchParams()
  if (f.q.trim()) p.set('q', f.q.trim())
  if (f.city) p.set('city', f.city)
  if (f.yardId) p.set('yardId', f.yardId)
  if (f.minRate) p.set('minRate', f.minRate)
  if (f.maxRate) p.set('maxRate', f.maxRate)
  if (f.transmission) p.set('transmission', f.transmission)
  if (f.sort) p.set('sort', f.sort)
  // Only a single category is pushed to the API; multi-select is refined
  // client-side (small fleet, keeps behavior robust).
  if (f.categories.length === 1) p.set('category', f.categories[0])
  if (f.startDate && f.endDate && f.endDate >= f.startDate) {
    p.set('startDate', dayAtLocal(f.startDate).toISOString())
    p.set('endDate', dayAtLocal(f.endDate).toISOString())
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Client-side refinement for filters the API query may not cover. */
export function refineVehicles(vehicles: Vehicle[], f: SearchFilters): Vehicle[] {
  const minSeats = Number(f.minSeats)
  return vehicles.filter((v) => {
    if (f.categories.length > 1 && !f.categories.includes(v.category)) return false
    if (f.minSeats && Number.isFinite(minSeats) && v.seats < minSeats) return false
    return true
  })
}

export function countActiveFilters(f: SearchFilters): number {
  let n = 0
  if (f.q.trim()) n++
  n += f.categories.length
  if (f.city) n++
  if (f.yardId) n++
  if (f.minRate) n++
  if (f.maxRate) n++
  if (f.transmission) n++
  if (f.minSeats) n++
  if (f.startDate) n++
  if (f.endDate) n++
  return n
}

export const ALL_CATEGORIES: VehicleCategory[] = CATEGORY_ORDER

/** Date -> `yyyy-MM-ddTHH:mm` value for datetime-local inputs. */
export function dateTimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Default booking dates (datetime-local values). Prefers dates carried over
 * from the search bar, clamped so the start is always in the future.
 */
export function defaultBookingDates(startDay?: string, endDay?: string): { start: string; end: string } {
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  let start = startDay ? dayAtLocal(startDay) : dayAtLocal(todayStr(1))
  let end = endDay ? dayAtLocal(endDay) : new Date(start.getTime() + dayMs)
  if (end.getTime() <= start.getTime()) end = new Date(start.getTime() + dayMs)
  if (start.getTime() < now + 15 * 60 * 1000) {
    // Start already passed (or too close): shift to tomorrow 09:00 keeping duration.
    const duration = Math.max(end.getTime() - start.getTime(), dayMs)
    start = dayAtLocal(todayStr(1))
    end = new Date(start.getTime() + duration)
  }
  return { start: dateTimeLocalValue(start), end: dateTimeLocalValue(end) }
}

/** Normalizes a Kenyan mobile number to 2547XXXXXXXX for M-Pesa. */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('0')) d = `254${d.slice(1)}`
  if (d.length === 9 && (d.startsWith('1') || d.startsWith('7'))) d = `254${d}`
  return d
}

export function isValidPhone(raw: string): boolean {
  // Kenyan mobiles: 07xx / 01xx locally, 2547xx / 2541xx internationally
  return /^254[17]\d{8}$/.test(normalizePhone(raw))
}
