import type { BookingMode, VehicleCategory } from './types'

// ---------- Pricing rules (single source of truth, mirrored in backend) ----------
export const DELIVERY_BASE_FEE = 500 // KES
export const DELIVERY_PER_KM = 120 // KES per km
export const PLATFORM_COMMISSION_RATE = 0.1 // 10% platform take rate
export const CANCEL_FREE_HOURS = 48 // free cancellation until 48h before start
export const CANCEL_FEE_RATE = 0.2 // 20% fee inside 48h

// ---------- Extras catalog ----------
export interface ExtraDef {
  key: string
  label: string
  description: string
  perDay: number // KES per day (0 if flat)
  flat: number // KES one-off (0 if per-day)
}

export const EXTRAS_CATALOG: ExtraDef[] = [
  {
    key: 'comprehensive_insurance',
    label: 'Comprehensive insurance',
    description: 'Zero-excess cover for peace of mind',
    perDay: 800,
    flat: 0,
  },
  {
    key: 'child_seat',
    label: 'Child seat',
    description: 'Certified child safety seat',
    perDay: 0,
    flat: 500,
  },
  {
    key: 'additional_driver',
    label: 'Additional driver',
    description: 'Register a second authorized driver',
    perDay: 1000,
    flat: 0,
  },
  {
    key: 'airport_meet_greet',
    label: 'Airport meet & greet',
    description: 'Agent meets you with keys at arrivals',
    perDay: 0,
    flat: 1500,
  },
]

export function findExtra(key: string): ExtraDef | undefined {
  return EXTRAS_CATALOG.find((e) => e.key === key)
}

// ---------- Vehicle categories ----------
export const CATEGORY_META: Record<VehicleCategory, { label: string; blurb: string }> = {
  ECONOMY: { label: 'Economy', blurb: 'Budget-friendly city runabouts' },
  SALOON: { label: 'Sedan', blurb: 'Comfortable sedans for business & family' },
  SUV: { label: 'SUV', blurb: 'Roomy crossovers for any road' },
  FOUR_BY_FOUR: { label: '4x4', blurb: 'Safari-grade off-roaders' },
  VAN: { label: 'Van', blurb: 'Group travel & tour vans' },
  LUXURY: { label: 'Luxury', blurb: 'Premium comfort, statement cars' },
  EXECUTIVE: { label: 'Executive', blurb: 'Chauffeur-class executive rides' },
}

export const CATEGORY_ORDER: VehicleCategory[] = [
  'ECONOMY',
  'SALOON',
  'SUV',
  'FOUR_BY_FOUR',
  'VAN',
  'LUXURY',
  'EXECUTIVE',
]

// ---------- Delivery destinations (preset pins; users may also pin custom) ----------
export interface Destination {
  name: string
  city: string
  lat: number
  lng: number
}

export const DESTINATIONS: Destination[] = [
  { name: 'Nairobi CBD', city: 'Nairobi', lat: -1.2864, lng: 36.8172 },
  { name: 'Westlands', city: 'Nairobi', lat: -1.2649, lng: 36.8039 },
  { name: 'Kilimani', city: 'Nairobi', lat: -1.2921, lng: 36.781 },
  { name: 'Lavington', city: 'Nairobi', lat: -1.279, lng: 36.766 },
  { name: 'Karen', city: 'Nairobi', lat: -1.3197, lng: 36.7076 },
  { name: 'Runda', city: 'Nairobi', lat: -1.2114, lng: 36.8156 },
  { name: 'JKIA Terminal', city: 'Nairobi', lat: -1.3192, lng: 36.9278 },
  { name: 'Syokimau', city: 'Nairobi', lat: -1.345, lng: 36.9153 },
  { name: 'Mombasa CBD', city: 'Mombasa', lat: -4.0435, lng: 39.6682 },
  { name: 'Nyali', city: 'Mombasa', lat: -4.05, lng: 39.7004 },
  { name: 'Kisumu CBD', city: 'Kisumu', lat: -0.1022, lng: 34.768 },
  { name: 'Nakuru CBD', city: 'Nakuru', lat: -0.3031, lng: 36.08 },
]

// ---------- Booking modes ----------
export const MODE_META: Record<BookingMode, { label: string; blurb: string; feeNote: string }> = {
  PICKUP: {
    label: 'Pick up yourself',
    blurb: 'Collect the car at the rental yard',
    feeNote: 'No delivery fee',
  },
  DELIVERY: {
    label: 'Deliver to me',
    blurb: 'We drive the car to your address',
    feeNote: 'Delivery fee by distance',
  },
  CHAUFFEUR: {
    label: 'With driver',
    blurb: 'Car + professional chauffeur',
    feeNote: 'Delivery + daily driver fee',
  },
}

// ---------- Demo accounts (seeded) ----------
export const DEMO_ACCOUNTS = [
  { role: 'CUSTOMER' as const, email: 'customer@safaridrive.co.ke', label: 'Amina Njeri — Customer' },
  { role: 'OWNER' as const, email: 'owner@safaridrive.co.ke', label: 'SafariDrive Fleet — Owner' },
  { role: 'DRIVER' as const, email: 'driver@safaridrive.co.ke', label: 'David Kimani — Driver' },
  { role: 'ADMIN' as const, email: 'admin@safaridrive.co.ke', label: 'Platform Admin' },
]
export const DEMO_PASSWORD = 'demo123'

// ---------- Misc ----------
export const BRAND = {
  name: 'SafariDrive',
  tagline: 'Book. Pay. Drive.',
  country: 'Kenya',
  currency: 'KES',
}
