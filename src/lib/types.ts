// ============================================================
// SafariDrive — shared type contract (frontend + backend)
// All enum-like unions here are stored as strings in SQLite.
// ============================================================

export type Role = 'CUSTOMER' | 'OWNER' | 'DRIVER' | 'ADMIN'

export type VehicleCategory =
  | 'ECONOMY'
  | 'SALOON'
  | 'SUV'
  | 'FOUR_BY_FOUR'
  | 'VAN'
  | 'LUXURY'
  | 'EXECUTIVE'

export type BookingMode = 'PICKUP' | 'DELIVERY' | 'CHAUFFEUR'

export type BookingStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'OUT_FOR_DELIVERY'
  | 'ACTIVE'
  | 'RETURNED'
  | 'COMPLETED'

export type PaymentMethod = 'MPESA' | 'CARD'
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED'
export type PaymentType = 'RENTAL' | 'DEPOSIT'
export type VehicleStatus = 'AVAILABLE' | 'BOOKED' | 'MAINTENANCE' | 'RETIRED'
export type DriverStatus = 'AVAILABLE' | 'ON_TRIP' | 'OFFLINE'
export type UserStatus = 'ACTIVE' | 'SUSPENDED'
export type ExpenseCategory = 'FUEL' | 'SERVICE' | 'INSURANCE' | 'REPAIR' | 'OTHER'

export interface SessionUser {
  id: string
  name: string
  email: string
  phone: string | null
  role: Role
}

export interface RentalYard {
  id: string
  name: string
  city: string
  address: string
  lat: number
  lng: number
  openHours: string
  phone: string
  vehicleCount: number
  availableCount: number
}

export interface Vehicle {
  id: string
  ownerId: string
  ownerName: string
  yardId: string | null
  yardName: string | null
  yardCity: string | null
  yardLat: number | null
  yardLng: number | null
  make: string
  model: string
  label: string // "Toyota RAV4 (2021)"
  year: number
  category: VehicleCategory
  plate: string
  seats: number
  doors: number
  transmission: string
  fuelType: string
  dailyRate: number
  securityDeposit: number
  mileageLimitKmPerDay: number | null
  excessPerKm: number
  imageUrl: string
  features: string[]
  description: string | null
  status: VehicleStatus
  rating: number
  reviewCount: number
  createdAt: string
}

export interface DriverProfile {
  id: string
  userId: string
  name: string
  phone: string | null
  licenseNo: string
  yearsExperience: number
  dailyRate: number
  status: DriverStatus
  rating: number
  tripsCompleted: number
}

export interface ExtraSelection {
  key: string
  qty: number
}

export interface QuoteInput {
  vehicleId: string
  startDate: string // ISO
  endDate: string // ISO
  mode: BookingMode
  deliveryAddress?: string
  deliveryLat?: number
  deliveryLng?: number
  extras: ExtraSelection[]
  promoCode?: string
  driverId?: string // required for CHAUFFEUR
}

export interface QuoteLine {
  label: string
  amount: number
  note?: string
}

export interface Quote {
  days: number
  rentalTotal: number
  deliveryFee: number
  driverTotal: number
  extrasTotal: number
  discount: number
  deposit: number
  total: number
  distanceKm: number | null
  promoValid: boolean
  promoMessage: string | null
  breakdown: QuoteLine[]
}

export interface BookingExtrasItem {
  key: string
  label: string
  qty: number
  amount: number
}

export interface PaymentSummary {
  id: string
  method: PaymentMethod
  type: PaymentType
  amount: number
  status: PaymentStatus
  phone: string | null
  receiptNo: string | null
  checkoutRequestId: string | null
  createdAt: string
}

export interface Booking {
  id: string
  reference: string
  customerId: string
  customerName: string
  customerPhone: string | null
  vehicleId: string
  vehicle: Vehicle
  driverId: string | null
  driver: DriverProfile | null
  mode: BookingMode
  status: BookingStatus
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED'
  startDate: string
  endDate: string
  days: number
  pickupYardId: string
  pickupYardName: string | null
  deliveryAddress: string | null
  deliveryLat: number | null
  deliveryLng: number | null
  distanceKm: number | null
  rentalTotal: number
  deliveryFee: number
  driverTotal: number
  extrasTotal: number
  discount: number
  deposit: number
  total: number
  extras: BookingExtrasItem[]
  promoCode: string | null
  cancelReason: string | null
  payments: PaymentSummary[]
  reviewed: boolean
  createdAt: string
}

export interface Review {
  id: string
  bookingId: string
  authorName: string
  rating: number
  comment: string | null
  createdAt: string
}

export interface PromoCode {
  id: string
  code: string
  description: string
  percentOff: number | null
  amountOff: number | null
  active: boolean
  expiresAt: string | null
}

export interface Expense {
  id: string
  vehicleId: string
  vehicleLabel: string
  category: ExpenseCategory
  amount: number
  note: string | null
  date: string
}

export interface AppNotification {
  id: string
  title: string
  body: string
  type: 'BOOKING' | 'PAYMENT' | 'TRIP' | 'SYSTEM'
  read: boolean
  createdAt: string
}

export interface MonthlyPoint {
  month: string // "Jan"
  revenue: number
  expenses?: number
  bookings: number
}

export interface OwnerStats {
  fleetSize: number
  activeRentals: number
  pendingBookings: number
  upcomingBookings: number
  revenueTotal: number
  expensesTotal: number
  netRevenue: number
  utilization: number // percent
  monthly: MonthlyPoint[]
  topVehicles: { label: string; revenue: number; bookings: number }[]
}

export interface AdminStats {
  totalUsers: number
  customers: number
  owners: number
  drivers: number
  totalVehicles: number
  activeRentals: number
  totalRevenue: number
  platformCommission: number
  monthly: MonthlyPoint[]
  bookingsByStatus: { status: BookingStatus; count: number }[]
  recentBookings: Booking[]
  topVehicles: { label: string; revenue: number; bookings: number }[]
}

export interface DriverStats {
  activeJob: Booking | null
  upcomingJobs: Booking[]
  completedTrips: number
  earningsThisMonth: number
  rating: number
  status: DriverStatus
}

// ---- Tracking (live GPS) ----

export interface GpsPoint {
  lat: number
  lng: number
}

export interface TripLatest extends GpsPoint {
  speed: number // km/h
  heading: number // degrees
  ts: string // ISO
}

export interface TripState {
  active: boolean
  mode: 'DELIVERY' | 'RENTAL'
  label: string | null // vehicle label
  latest: TripLatest | null
  path: GpsPoint[]
  from: GpsPoint | null
  to: GpsPoint | null
  progress: number // 0..1
  etaMin: number | null
}

export interface TrackingResponse {
  booking: {
    id: string
    reference: string
    mode: BookingMode
    status: BookingStatus
    vehicleLabel: string
    driverName: string | null
    driverPhone: string | null
    deliveryAddress: string | null
  }
  trip: TripState | null
}

// ---- Auth API shapes ----

export interface ApiResponse<T> {
  data: T
}
