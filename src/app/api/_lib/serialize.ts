// ============================================================
// SafariDrive API — DB row → API contract serializers
// ============================================================
import type { Notification, Payment, Prisma, PromoCode as PromoRow } from '@prisma/client'
import type {
  AppNotification,
  Booking,
  BookingExtrasItem,
  DriverProfile,
  Expense,
  PaymentSummary,
  PromoCode,
  RentalYard,
  Review,
  Vehicle,
} from '@/lib/types'

// ---------- Vehicles ----------
export type VehicleRow = Prisma.VehicleGetPayload<{ include: { owner: true; yard: true } }>

export function serializeVehicle(v: VehicleRow): Vehicle {
  return {
    id: v.id,
    ownerId: v.ownerId,
    ownerName: v.owner.name,
    yardId: v.yardId,
    yardName: v.yard?.name ?? null,
    yardCity: v.yard?.city ?? null,
    yardLat: v.yard?.lat ?? null,
    yardLng: v.yard?.lng ?? null,
    make: v.make,
    model: v.model,
    label: `${v.make} ${v.model} (${v.year})`,
    year: v.year,
    category: v.category as Vehicle['category'],
    plate: v.plate,
    seats: v.seats,
    doors: v.doors,
    transmission: v.transmission,
    fuelType: v.fuelType,
    dailyRate: v.dailyRate,
    securityDeposit: v.securityDeposit,
    mileageLimitKmPerDay: v.mileageLimitKmPerDay,
    excessPerKm: v.excessPerKm,
    imageUrl: v.imageUrl,
    features: v.features ? v.features.split(',').map((f) => f.trim()).filter(Boolean) : [],
    description: v.description,
    status: v.status as Vehicle['status'],
    rating: v.rating,
    reviewCount: v.reviewCount,
    createdAt: v.createdAt.toISOString(),
  }
}

export const vehicleInclude = { owner: true, yard: true } as const

// ---------- Drivers ----------
export type DriverRow = Prisma.DriverGetPayload<{ include: { user: true } }>

export function serializeDriver(d: DriverRow): DriverProfile {
  return {
    id: d.id,
    userId: d.userId,
    name: d.user.name,
    phone: d.user.phone,
    licenseNo: d.licenseNo,
    yearsExperience: d.yearsExperience,
    dailyRate: d.dailyRate,
    status: d.status as DriverProfile['status'],
    rating: d.rating,
    tripsCompleted: d.tripsCompleted,
  }
}

export const driverInclude = { user: true } as const

// ---------- Payments ----------
export type PaymentRow = Payment

export function serializePayment(p: Payment): PaymentSummary {
  return {
    id: p.id,
    method: p.method as PaymentSummary['method'],
    type: p.type as PaymentSummary['type'],
    amount: p.amount,
    status: p.status as PaymentSummary['status'],
    phone: p.phone,
    receiptNo: p.receiptNo,
    checkoutRequestId: p.checkoutRequestId,
    createdAt: p.createdAt.toISOString(),
  }
}

// ---------- Bookings ----------
export type BookingRow = Prisma.BookingGetPayload<{
  include: {
    vehicle: { include: { owner: true; yard: true } }
    customer: true
    driver: { include: { user: true } }
    pickupYard: true
    payments: true
    reviews: { select: { id: true } }
  }
}>

export const bookingInclude = {
  vehicle: { include: vehicleInclude },
  customer: true,
  driver: { include: driverInclude },
  pickupYard: true,
  payments: true,
  reviews: { select: { id: true } },
} as const

export function serializeBooking(b: BookingRow): Booking {
  return {
    id: b.id,
    reference: b.reference,
    customerId: b.customerId,
    customerName: b.customer.name,
    customerPhone: b.customer.phone,
    vehicleId: b.vehicleId,
    vehicle: serializeVehicle(b.vehicle),
    driverId: b.driverId,
    driver: b.driver ? serializeDriver(b.driver) : null,
    mode: b.mode as Booking['mode'],
    status: b.status as Booking['status'],
    paymentStatus: b.paymentStatus as Booking['paymentStatus'],
    startDate: b.startDate.toISOString(),
    endDate: b.endDate.toISOString(),
    days: b.days,
    pickupYardId: b.pickupYardId,
    pickupYardName: b.pickupYard?.name ?? null,
    deliveryAddress: b.deliveryAddress,
    deliveryLat: b.deliveryLat,
    deliveryLng: b.deliveryLng,
    distanceKm: b.distanceKm,
    rentalTotal: b.rentalTotal,
    deliveryFee: b.deliveryFee,
    driverTotal: b.driverTotal,
    extrasTotal: b.extrasTotal,
    discount: b.discount,
    deposit: b.deposit,
    total: b.total,
    extras: parseExtrasJson(b.extrasJson),
    promoCode: b.promoCode,
    cancelReason: b.cancelReason,
    payments: [...b.payments]
      .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
      .map(serializePayment),
    reviewed: b.reviews.length > 0,
    createdAt: b.createdAt.toISOString(),
  }
}

export function parseExtrasJson(json: string): BookingExtrasItem[] {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is BookingExtrasItem =>
        !!item && typeof item === 'object' && typeof (item as BookingExtrasItem).key === 'string',
    )
  } catch {
    return []
  }
}

// ---------- Reviews ----------
export type ReviewRow = Prisma.ReviewGetPayload<{ include: { author: true } }>

export function serializeReview(r: ReviewRow): Review {
  return {
    id: r.id,
    bookingId: r.bookingId,
    authorName: r.author.name,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
  }
}

// ---------- Expenses ----------
export type ExpenseRow = Prisma.ExpenseGetPayload<{ include: { vehicle: true } }>

export function serializeExpense(e: ExpenseRow): Expense {
  return {
    id: e.id,
    vehicleId: e.vehicleId,
    vehicleLabel: `${e.vehicle.make} ${e.vehicle.model} (${e.vehicle.year})`,
    category: e.category as Expense['category'],
    amount: e.amount,
    note: e.note,
    date: e.date.toISOString(),
  }
}

// ---------- Notifications ----------
export function serializeNotification(n: Notification): AppNotification {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    type: n.type as AppNotification['type'],
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  }
}

// ---------- Promos ----------
export function serializePromo(p: PromoRow): PromoCode {
  return {
    id: p.id,
    code: p.code,
    description: p.description,
    percentOff: p.percentOff,
    amountOff: p.amountOff,
    active: p.active,
    expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
    usedCount: p.usedCount,
    maxUses: p.maxUses,
  }
}

// ---------- Yards ----------
export type YardRow = Prisma.RentalYardGetPayload<{ include: { vehicles: { select: { status: true } } } }>

export function serializeYard(y: YardRow): RentalYard {
  return {
    id: y.id,
    name: y.name,
    city: y.city,
    address: y.address,
    lat: y.lat,
    lng: y.lng,
    openHours: y.openHours,
    phone: y.phone,
    vehicleCount: y.vehicles.length,
    availableCount: y.vehicles.filter((v) => v.status === 'AVAILABLE').length,
  }
}
