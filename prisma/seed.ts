// ============================================================
// SafariDrive — database seed (CONTRACTS §10)
// Run with: bun prisma/seed.ts
// Wipes all tables (FK-safe order) then inserts demo data.
// ============================================================
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/auth'
import { computeQuote, computeExtrasItems, type QuoteDriver, type QuotePromo } from '../src/lib/pricing'
import { startTripSim } from '../src/lib/tracking-client'
import { DESTINATIONS } from '../src/lib/constants'
import { VEHICLE_IMAGES } from '../src/lib/images'

const DAY = 24 * 3_600_000
const HOUR = 3_600_000
const now = new Date()

function at(offsetMs: number): Date {
  return new Date(now.getTime() + offsetMs)
}

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
function randAlnum(n: number): string {
  let out = ''
  for (let i = 0; i < n; i++) out += ALNUM[Math.floor(Math.random() * ALNUM.length)]
  return out
}
function mpesaReceipt(): string {
  return `SD${randAlnum(10)}`
}
function cardReceipt(): string {
  return `CARD-${randAlnum(10)}`
}
function checkoutId(): string {
  return `ws_CO_${Date.now()}_${randAlnum(6)}`
}

const REF_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const usedRefs = new Set<string>()
function makeRef(): string {
  for (let i = 0; i < 50; i++) {
    let ref = 'SD-'
    for (let j = 0; j < 6; j++) ref += REF_CHARSET[Math.floor(Math.random() * REF_CHARSET.length)]
    if (!usedRefs.has(ref)) {
      usedRefs.add(ref)
      return ref
    }
  }
  throw new Error('Could not generate unique booking references')
}

function dest(name: string): { address: string; lat: number; lng: number } {
  const d = DESTINATIONS.find((x) => x.name === name)
  if (!d) throw new Error(`Unknown destination: ${name}`)
  return { address: `${d.name}, ${d.city}`, lat: d.lat, lng: d.lng }
}

async function main(): Promise<void> {
  console.log('Seeding SafariDrive demo data...')

  // ---------- wipe (FK-safe order) ----------
  await db.notification.deleteMany()
  await db.review.deleteMany()
  await db.payment.deleteMany()
  await db.expense.deleteMany()
  await db.booking.deleteMany()
  await db.vehiclePosition.deleteMany()
  await db.vehicle.deleteMany()
  await db.driver.deleteMany()
  await db.rentalYard.deleteMany()
  await db.promoCode.deleteMany()
  await db.user.deleteMany()

  // ---------- users ----------
  const passwordHash = await hashPassword('demo123')

  const [admin, owner, coast, amina, brian, faith] = await Promise.all([
    db.user.create({
      data: { email: 'admin@safaridrive.co.ke', name: 'Platform Admin', phone: '+254700000000', role: 'ADMIN', passwordHash },
    }),
    db.user.create({
      data: { email: 'owner@safaridrive.co.ke', name: 'SafariDrive Fleet', phone: '+254711000001', role: 'OWNER', passwordHash },
    }),
    db.user.create({
      data: { email: 'coast@safaridrive.co.ke', name: 'Coast AutoHire', phone: '+254711000002', role: 'OWNER', passwordHash },
    }),
    db.user.create({
      data: { email: 'customer@safaridrive.co.ke', name: 'Amina Njeri', phone: '0722000001', role: 'CUSTOMER', passwordHash },
    }),
    db.user.create({
      data: { email: 'brian@example.com', name: 'Brian Otieno', phone: '0722000002', role: 'CUSTOMER', passwordHash },
    }),
    db.user.create({
      data: { email: 'faith@example.com', name: 'Faith Kamau', phone: '0733000003', role: 'CUSTOMER', passwordHash },
    }),
  ])

  const driverSpecs: { key: string; email: string; name: string; phone: string; rate: number; license: string; years: number; rating: number; trips: number }[] = [
    { key: 'david', email: 'driver@safaridrive.co.ke', name: 'David Kimani', phone: '0722111221', rate: 2500, license: 'DL-2017-114580', years: 9, rating: 4.9, trips: 34 },
    { key: 'grace', email: 'grace@safaridrive.co.ke', name: 'Grace Wanjiru', phone: '0722111222', rate: 2000, license: 'DL-2018-097341', years: 6, rating: 4.7, trips: 22 },
    { key: 'peter', email: 'peter@safaridrive.co.ke', name: 'Peter Otieno', phone: '0722111223', rate: 2200, license: 'DL-2019-052167', years: 5, rating: 4.6, trips: 18 },
    { key: 'samuel', email: 'samuel@safaridrive.co.ke', name: 'Samuel Mwangi', phone: '0722111224', rate: 2800, license: 'DL-2016-201493', years: 11, rating: 4.8, trips: 28 },
    { key: 'ali', email: 'ali@safaridrive.co.ke', name: 'Ali Hassan', phone: '0722111225', rate: 2300, license: 'DL-2020-033875', years: 7, rating: 4.8, trips: 26 },
  ]
  const drivers: Record<string, { id: string; userId: string; dailyRate: number; name: string }> = {}
  for (const spec of driverSpecs) {
    const user = await db.user.create({
      data: { email: spec.email, name: spec.name, phone: spec.phone, role: 'DRIVER', passwordHash },
    })
    const profile = await db.driver.create({
      data: {
        userId: user.id,
        licenseNo: spec.license,
        yearsExperience: spec.years,
        dailyRate: spec.rate,
        status: 'AVAILABLE',
        rating: spec.rating,
        tripsCompleted: spec.trips,
      },
    })
    drivers[spec.key] = { id: profile.id, userId: user.id, dailyRate: profile.dailyRate, name: spec.name }
  }

  const users = { admin, owner, coast, amina, brian, faith }
  console.log(`Users: 6 core + 5 drivers`)

  // ---------- yards ----------
  const yardData = [
    { key: 'westlands', name: 'Westlands HQ', city: 'Nairobi', address: 'Woodvale Grove, Westlands', lat: -1.2649, lng: 36.8039, phone: '+254700000001' },
    { key: 'jkia', name: 'JKIA Airport Yard', city: 'Nairobi', address: 'Airport South Road, Embakasi', lat: -1.3192, lng: 36.9278, phone: '+254700000002' },
    { key: 'nyali', name: 'Nyali Yard', city: 'Mombasa', address: 'Links Road, Nyali', lat: -4.05, lng: 39.7004, phone: '+254700000003' },
    { key: 'kisumu', name: 'Milimani Yard', city: 'Kisumu', address: 'Ojijo Oteko Road, Milimani', lat: -0.0917, lng: 34.768, phone: '+254700000004' },
    { key: 'nakuru', name: 'CBD Yard', city: 'Nakuru', address: 'Kenyatta Avenue, CBD', lat: -0.3031, lng: 36.08, phone: '+254700000005' },
  ]
  const yards: Record<string, { id: string; lat: number; lng: number }> = {}
  for (const y of yardData) {
    const { key: _yardKey, ...yardFields } = y
    const yard = await db.rentalYard.create({ data: { ...yardFields } })
    yards[y.key] = { id: yard.id, lat: yard.lat, lng: yard.lng }
  }
  console.log('Yards: 5')

  // ---------- vehicles ----------
  interface VehicleSpec {
    key: string
    make: string
    model: string
    year: number
    category: string
    rate: number
    deposit: number
    yard: string
    transmission: string
    fuel: string
    seats: number
    doors: number
    features: string[]
    ownerKey: 'owner' | 'coast'
    rating: number
    reviewCount: number
    plate: string
  }
  const vehicleSpecs: VehicleSpec[] = [
    { key: 'vitz', make: 'Toyota', model: 'Vitz', year: 2019, category: 'ECONOMY', rate: 3500, deposit: 5000, yard: 'westlands', transmission: 'Manual', fuel: 'Petrol', seats: 5, doors: 4, features: ['A/C', 'USB', 'Fuel efficient'], ownerKey: 'owner', rating: 4.3, reviewCount: 18, plate: 'KDA 123A' },
    { key: 'demio', make: 'Mazda', model: 'Demio', year: 2018, category: 'ECONOMY', rate: 3800, deposit: 5000, yard: 'westlands', transmission: 'Automatic', fuel: 'Petrol', seats: 5, doors: 4, features: ['A/C', 'Bluetooth'], ownerKey: 'owner', rating: 4.2, reviewCount: 9, plate: 'KDB 456B' },
    { key: 'fit', make: 'Honda', model: 'Fit', year: 2020, category: 'ECONOMY', rate: 4200, deposit: 5000, yard: 'jkia', transmission: 'Automatic', fuel: 'Petrol', seats: 5, doors: 4, features: ['A/C', 'Reverse camera'], ownerKey: 'owner', rating: 4.4, reviewCount: 12, plate: 'KDC 789C' },
    { key: 'axio', make: 'Toyota', model: 'Axio', year: 2019, category: 'SALOON', rate: 5000, deposit: 8000, yard: 'westlands', transmission: 'Automatic', fuel: 'Petrol', seats: 5, doors: 4, features: ['A/C', 'Cruise control'], ownerKey: 'owner', rating: 4.5, reviewCount: 15, plate: 'KDE 234F' },
    { key: 'impreza', make: 'Subaru', model: 'Impreza', year: 2019, category: 'SALOON', rate: 6500, deposit: 8000, yard: 'jkia', transmission: 'Automatic', fuel: 'Petrol', seats: 5, doors: 4, features: ['AWD', 'A/C', 'Sport mode'], ownerKey: 'owner', rating: 4.6, reviewCount: 8, plate: 'KDF 567G' },
    { key: 'rav4', make: 'Toyota', model: 'RAV4', year: 2021, category: 'SUV', rate: 9500, deposit: 10000, yard: 'westlands', transmission: 'Automatic', fuel: 'Petrol', seats: 5, doors: 5, features: ['AWD', 'Roof rails', 'A/C'], ownerKey: 'owner', rating: 4.7, reviewCount: 22, plate: 'KDG 890H' },
    { key: 'xtrail', make: 'Nissan', model: 'X-Trail', year: 2020, category: 'SUV', rate: 8500, deposit: 10000, yard: 'nyali', transmission: 'Automatic', fuel: 'Petrol', seats: 5, doors: 5, features: ['AWD', 'Panoramic roof'], ownerKey: 'coast', rating: 4.5, reviewCount: 11, plate: 'KDH 123J' },
    { key: 'everest', make: 'Ford', model: 'Everest', year: 2021, category: 'SUV', rate: 12000, deposit: 15000, yard: 'westlands', transmission: 'Automatic', fuel: 'Diesel', seats: 7, doors: 5, features: ['4WD', '7 seats', 'A/C'], ownerKey: 'owner', rating: 4.6, reviewCount: 7, plate: 'KDJ 456K' },
    { key: 'prado', make: 'Toyota', model: 'Land Cruiser Prado', year: 2019, category: 'FOUR_BY_FOUR', rate: 15000, deposit: 20000, yard: 'westlands', transmission: 'Automatic', fuel: 'Diesel', seats: 7, doors: 5, features: ['4WD', 'Safari-ready', 'Snorkel'], ownerKey: 'owner', rating: 4.8, reviewCount: 26, plate: 'KDK 789L' },
    { key: 'lc76', make: 'Toyota', model: 'Land Cruiser 76', year: 2020, category: 'FOUR_BY_FOUR', rate: 18000, deposit: 25000, yard: 'nakuru', transmission: 'Manual', fuel: 'Diesel', seats: 5, doors: 5, features: ['4WD', 'Safari rack', 'Dual battery'], ownerKey: 'owner', rating: 4.9, reviewCount: 13, plate: 'KDM 234N' },
    { key: 'hiace', make: 'Toyota', model: 'Hiace', year: 2018, category: 'VAN', rate: 11000, deposit: 15000, yard: 'westlands', transmission: 'Manual', fuel: 'Diesel', seats: 14, doors: 5, features: ['14 seats', 'Tour van'], ownerKey: 'owner', rating: 4.4, reviewCount: 19, plate: 'KDN 567P' },
    { key: 'tourvan', make: 'Toyota', model: 'Hiace Tour Van', year: 2019, category: 'VAN', rate: 13000, deposit: 15000, yard: 'nakuru', transmission: 'Automatic', fuel: 'Diesel', seats: 14, doors: 5, features: ['14 seats', 'WiFi', 'Fridge'], ownerKey: 'owner', rating: 4.7, reviewCount: 16, plate: 'KDP 890Q' },
    { key: 'cclass', make: 'Mercedes-Benz', model: 'C200', year: 2020, category: 'LUXURY', rate: 16000, deposit: 25000, yard: 'westlands', transmission: 'Automatic', fuel: 'Petrol', seats: 5, doors: 4, features: ['Leather', 'Ambient light'], ownerKey: 'owner', rating: 4.8, reviewCount: 9, plate: 'KDR 123S' },
    { key: 'x3', make: 'BMW', model: 'X3', year: 2021, category: 'LUXURY', rate: 20000, deposit: 30000, yard: 'nyali', transmission: 'Automatic', fuel: 'Petrol', seats: 5, doors: 5, features: ['Panoramic roof', 'Harman Kardon'], ownerKey: 'coast', rating: 4.9, reviewCount: 10, plate: 'KDT 456T' },
    { key: 'eclass', make: 'Mercedes-Benz', model: 'E250', year: 2021, category: 'EXECUTIVE', rate: 25000, deposit: 40000, yard: 'westlands', transmission: 'Automatic', fuel: 'Petrol', seats: 5, doors: 4, features: ['Chauffeur class', 'Rear A/C'], ownerKey: 'owner', rating: 4.8, reviewCount: 6, plate: 'KDV 789V' },
    { key: 'rover', make: 'Range Rover', model: 'Vogue', year: 2020, category: 'EXECUTIVE', rate: 35000, deposit: 50000, yard: 'nyali', transmission: 'Automatic', fuel: 'Diesel', seats: 5, doors: 5, features: ['V8', 'Massage seats'], ownerKey: 'coast', rating: 4.9, reviewCount: 5, plate: 'KDW 234W' },
  ]

  const vehicles: Record<string, { id: string; dailyRate: number; securityDeposit: number; yardKey: string; ownerId: string; make: string; model: string; year: number }> = {}
  for (const spec of vehicleSpecs) {
    const images = VEHICLE_IMAGES as Record<string, string>
    const imageUrl = images[spec.key] ?? ''
    const vehicle = await db.vehicle.create({
      data: {
        ownerId: users[spec.ownerKey].id,
        yardId: yards[spec.yard].id,
        make: spec.make,
        model: spec.model,
        year: spec.year,
        category: spec.category,
        plate: spec.plate,
        seats: spec.seats,
        doors: spec.doors,
        transmission: spec.transmission,
        fuelType: spec.fuel,
        dailyRate: spec.rate,
        securityDeposit: spec.deposit,
        mileageLimitKmPerDay: spec.category === 'ECONOMY' || spec.category === 'SALOON' ? 200 : null,
        excessPerKm: 50,
        imageUrl,
        features: spec.features.join(', '),
        description: `${spec.make} ${spec.model} ${spec.year} — well maintained and ready for Kenyan roads.`,
        status: 'AVAILABLE',
        rating: spec.rating,
        reviewCount: spec.reviewCount,
      },
    })
    vehicles[spec.key] = {
      id: vehicle.id,
      dailyRate: vehicle.dailyRate,
      securityDeposit: vehicle.securityDeposit,
      yardKey: spec.yard,
      ownerId: vehicle.ownerId,
      make: spec.make,
      model: spec.model,
      year: spec.year,
    }
  }
  console.log('Vehicles: 16')

  // ---------- promos ----------
  await db.promoCode.create({ data: { code: 'WELCOME10', description: '10% off your first ride', percentOff: 10, active: true } })
  await db.promoCode.create({ data: { code: 'SAFARI500', description: 'KSh 500 off your booking', amountOff: 500, active: true } })
  console.log('Promos: 2')

  // ---------- expenses ----------
  const expenseSpecs: { vehicleKey: string; category: string; amount: number; note: string; date: Date }[] = [
    { vehicleKey: 'vitz', category: 'FUEL', amount: 3200, note: 'Top-up before weekend handover', date: at(-10 * DAY) },
    { vehicleKey: 'axio', category: 'SERVICE', amount: 8500, note: '40,000 km major service', date: at(-45 * DAY) },
    { vehicleKey: 'rav4', category: 'INSURANCE', amount: 45000, note: 'Annual comprehensive premium', date: at(-70 * DAY) },
    { vehicleKey: 'prado', category: 'FUEL', amount: 12000, note: 'Refuel after safari convoy', date: at(-33 * DAY) },
    { vehicleKey: 'hiace', category: 'SERVICE', amount: 15000, note: 'Brake pads and discs replaced', date: at(-60 * DAY) },
    { vehicleKey: 'cclass', category: 'INSURANCE', amount: 70000, note: 'Premium cover renewal', date: at(-88 * DAY) },
    { vehicleKey: 'xtrail', category: 'FUEL', amount: 6500, note: 'Coast highway refuel', date: at(-20 * DAY) },
    { vehicleKey: 'rover', category: 'SERVICE', amount: 28000, note: 'Routine service and valet', date: at(-50 * DAY) },
  ]
  for (const e of expenseSpecs) {
    await db.expense.create({
      data: { vehicleId: vehicles[e.vehicleKey].id, category: e.category, amount: e.amount, note: e.note, date: e.date },
    })
  }
  console.log('Expenses: 8')

  // ---------- bookings ----------
  interface PaymentSpec {
    method: 'MPESA' | 'CARD'
    status: 'COMPLETED' | 'REFUNDED' | 'FAILED'
  }
  interface BookingSpec {
    customerKey: 'amina' | 'brian' | 'faith'
    vehicleKey: string
    mode: 'PICKUP' | 'DELIVERY' | 'CHAUFFEUR'
    status: string
    paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED'
    start: Date
    days: number
    delivery?: string
    driverKey?: string
    extras?: { key: string; qty: number }[]
    promo?: string
    payments?: PaymentSpec[]
    cancelReason?: string
    review?: { rating: number; comment?: string }
    createdAt: Date
    vehicleStatus?: 'AVAILABLE' | 'BOOKED'
    pickupYardKey?: string
  }

  const bookingSpecs: BookingSpec[] = [
    // 1. Tracking demo — ACTIVE axio delivered to Kilimani yesterday
    {
      customerKey: 'amina', vehicleKey: 'axio', mode: 'DELIVERY', status: 'ACTIVE', paymentStatus: 'PAID',
      start: at(-1 * DAY), days: 3, delivery: 'Kilimani', extras: [{ key: 'child_seat', qty: 1 }],
      payments: [{ method: 'MPESA', status: 'COMPLETED' }], createdAt: at(-4 * DAY), vehicleStatus: 'BOOKED',
    },
    // 2. Dispatch demo — ACCEPTED prado chauffeur starting tomorrow
    {
      customerKey: 'amina', vehicleKey: 'prado', mode: 'CHAUFFEUR', status: 'ACCEPTED', paymentStatus: 'PAID',
      start: at(1 * DAY), days: 2, delivery: 'Nairobi CBD', driverKey: 'david',
      extras: [{ key: 'comprehensive_insurance', qty: 1 }],
      payments: [{ method: 'MPESA', status: 'COMPLETED' }], createdAt: at(-2 * DAY), vehicleStatus: 'BOOKED',
    },
    // 3. Pending payment — rav4 pickup at JKIA, created today
    {
      customerKey: 'brian', vehicleKey: 'rav4', mode: 'PICKUP', status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID',
      start: at(2 * DAY), days: 2, extras: [{ key: 'airport_meet_greet', qty: 1 }], promo: 'WELCOME10',
      createdAt: at(-2 * HOUR), pickupYardKey: 'jkia',
    },
    // 4. Awaiting owner acceptance — Faith's paid vitz
    {
      customerKey: 'faith', vehicleKey: 'vitz', mode: 'PICKUP', status: 'PAID', paymentStatus: 'PAID',
      start: at(3 * DAY), days: 2, payments: [{ method: 'MPESA', status: 'COMPLETED' }],
      createdAt: at(-1 * DAY), vehicleStatus: 'BOOKED',
    },
    // 5. Completed cclass with 5* review
    {
      customerKey: 'amina', vehicleKey: 'cclass', mode: 'DELIVERY', status: 'COMPLETED', paymentStatus: 'PAID',
      start: at(-20 * DAY), days: 2, delivery: 'Karen',
      payments: [{ method: 'MPESA', status: 'COMPLETED' }],
      review: { rating: 5, comment: 'Spotless car, smooth delivery.' }, createdAt: at(-22 * DAY),
    },
    // 6. Completed hiace (card) with 4* review
    {
      customerKey: 'brian', vehicleKey: 'hiace', mode: 'PICKUP', status: 'COMPLETED', paymentStatus: 'PAID',
      start: at(-40 * DAY), days: 3, payments: [{ method: 'CARD', status: 'COMPLETED' }],
      review: { rating: 4, comment: 'Plenty of space for our church group outing.' }, createdAt: at(-42 * DAY),
    },
    // 7. Completed chauffeur x3 with 5* review
    {
      customerKey: 'faith', vehicleKey: 'x3', mode: 'CHAUFFEUR', status: 'COMPLETED', paymentStatus: 'PAID',
      start: at(-75 * DAY), days: 1, delivery: 'Nyali', driverKey: 'ali',
      payments: [{ method: 'MPESA', status: 'COMPLETED' }],
      review: { rating: 5, comment: 'Ali knew the coast roads inside out — a superb day trip.' }, createdAt: at(-77 * DAY),
    },
    // 8. Cancelled rover (paid then refunded)
    {
      customerKey: 'amina', vehicleKey: 'rover', mode: 'PICKUP', status: 'CANCELLED', paymentStatus: 'REFUNDED',
      start: at(-8 * DAY), days: 3, cancelReason: 'Change of plans',
      payments: [{ method: 'MPESA', status: 'REFUNDED' }], createdAt: at(-12 * DAY),
    },
    // ---- extra COMPLETED bookings spread over the last 6 months ----
    {
      customerKey: 'brian', vehicleKey: 'demio', mode: 'PICKUP', status: 'COMPLETED', paymentStatus: 'PAID',
      start: at(-150 * DAY), days: 3, payments: [{ method: 'MPESA', status: 'COMPLETED' }],
      review: { rating: 4, comment: 'Perfect little city car, easy on fuel.' }, createdAt: at(-152 * DAY),
    },
    {
      customerKey: 'amina', vehicleKey: 'fit', mode: 'PICKUP', status: 'COMPLETED', paymentStatus: 'PAID',
      start: at(-120 * DAY), days: 2, payments: [{ method: 'CARD', status: 'COMPLETED' }], createdAt: at(-122 * DAY),
    },
    {
      customerKey: 'faith', vehicleKey: 'impreza', mode: 'PICKUP', status: 'COMPLETED', paymentStatus: 'PAID',
      start: at(-105 * DAY), days: 2, promo: 'SAFARI500',
      payments: [{ method: 'MPESA', status: 'COMPLETED' }], createdAt: at(-107 * DAY),
    },
    {
      customerKey: 'brian', vehicleKey: 'everest', mode: 'DELIVERY', status: 'COMPLETED', paymentStatus: 'PAID',
      start: at(-85 * DAY), days: 4, delivery: 'Karen',
      payments: [{ method: 'CARD', status: 'COMPLETED' }], createdAt: at(-87 * DAY),
    },
    {
      customerKey: 'amina', vehicleKey: 'tourvan', mode: 'CHAUFFEUR', status: 'COMPLETED', paymentStatus: 'PAID',
      start: at(-55 * DAY), days: 2, delivery: 'Nakuru CBD', driverKey: 'grace',
      payments: [{ method: 'MPESA', status: 'COMPLETED' }],
      review: { rating: 5, comment: 'Grace handled our Nakuru park tour flawlessly.' }, createdAt: at(-57 * DAY),
    },
    {
      customerKey: 'faith', vehicleKey: 'lc76', mode: 'PICKUP', status: 'COMPLETED', paymentStatus: 'PAID',
      start: at(-25 * DAY), days: 3, payments: [{ method: 'MPESA', status: 'COMPLETED' }], createdAt: at(-27 * DAY),
    },
    {
      customerKey: 'brian', vehicleKey: 'eclass', mode: 'CHAUFFEUR', status: 'COMPLETED', paymentStatus: 'PAID',
      start: at(-12 * DAY), days: 1, delivery: 'Westlands', driverKey: 'samuel',
      payments: [{ method: 'CARD', status: 'COMPLETED' }], createdAt: at(-14 * DAY),
    },
  ]

  const customerPhones: Record<string, string> = {
    amina: '254722000001',
    brian: '254722000002',
    faith: '254733000003',
  }

  const createdBookings: Record<string, { id: string; reference: string; vehicleKey: string }> = {}
  const bookingKeys = [
    'axio-active', 'prado-accepted', 'rav4-pending', 'vitz-paid', 'cclass-done', 'hiace-done',
    'x3-done', 'rover-cancelled', 'demio-done', 'fit-done', 'impreza-done', 'everest-done',
    'tourvan-done', 'lc76-done', 'eclass-done',
  ]

  for (let i = 0; i < bookingSpecs.length; i++) {
    const spec = bookingSpecs[i]
    const key = bookingKeys[i]
    const vehicle = vehicles[spec.vehicleKey]
    const customer = users[spec.customerKey]
    const yard = yards[spec.pickupYardKey ?? vehicle.yardKey]

    const delivery = spec.delivery ? dest(spec.delivery) : null
    const driver = spec.driverKey ? drivers[spec.driverKey] : null

    const promo = spec.promo ? await db.promoCode.findUnique({ where: { code: spec.promo } }) : null

    const quoteDriver: QuoteDriver | null = driver ? { name: driver.name, dailyRate: driver.dailyRate } : null
    const quotePromo: QuotePromo | null = promo
      ? {
          code: promo.code,
          percentOff: promo.percentOff,
          amountOff: promo.amountOff,
          active: promo.active,
          expiresAt: promo.expiresAt,
        }
      : null

    const end = new Date(spec.start.getTime() + spec.days * DAY)
    const quote = computeQuote(
      {
        startDate: spec.start.toISOString(),
        endDate: end.toISOString(),
        mode: spec.mode,
        deliveryLat: delivery?.lat,
        deliveryLng: delivery?.lng,
        extras: spec.extras ?? [],
        promoCode: spec.promo,
      },
      { dailyRate: vehicle.dailyRate, securityDeposit: vehicle.securityDeposit, yardLat: yard.lat, yardLng: yard.lng },
      quoteDriver,
      quotePromo,
    )
    const extrasItems = computeExtrasItems(spec.extras ?? [], quote.days)

    const booking = await db.booking.create({
      data: {
        reference: makeRef(),
        customerId: customer.id,
        vehicleId: vehicle.id,
        driverId: driver?.id ?? null,
        mode: spec.mode,
        status: spec.status,
        paymentStatus: spec.paymentStatus,
        startDate: spec.start,
        endDate: end,
        days: quote.days,
        pickupYardId: yard.id,
        deliveryAddress: spec.mode === 'PICKUP' ? null : (delivery?.address ?? null),
        deliveryLat: spec.mode === 'PICKUP' ? null : (delivery?.lat ?? null),
        deliveryLng: spec.mode === 'PICKUP' ? null : (delivery?.lng ?? null),
        distanceKm: quote.distanceKm,
        rentalTotal: quote.rentalTotal,
        deliveryFee: quote.deliveryFee,
        driverTotal: quote.driverTotal,
        extrasTotal: quote.extrasTotal,
        discount: quote.discount,
        deposit: quote.deposit,
        total: quote.total,
        extrasJson: JSON.stringify(extrasItems),
        promoCode: spec.promo && quote.discount > 0 ? spec.promo : null,
        cancelReason: spec.cancelReason ?? null,
        createdAt: spec.createdAt,
      },
    })
    createdBookings[key] = { id: booking.id, reference: booking.reference, vehicleKey: spec.vehicleKey }

    for (const p of spec.payments ?? []) {
      const isMpesa = p.method === 'MPESA'
      await db.payment.create({
        data: {
          bookingId: booking.id,
          method: p.method,
          type: 'RENTAL',
          phone: isMpesa ? customerPhones[spec.customerKey] : null,
          amount: quote.total,
          status: p.status,
          checkoutRequestId: isMpesa ? checkoutId() : null,
          merchantRequestId: isMpesa ? `${Date.now()}-${randAlnum(6)}` : null,
          receiptNo: p.status === 'COMPLETED' ? (isMpesa ? mpesaReceipt() : cardReceipt()) : null,
          createdAt: new Date(spec.createdAt.getTime() + 45 * 60 * 1000),
        },
      })
    }

    if (spec.review) {
      await db.review.create({
        data: {
          bookingId: booking.id,
          authorId: customer.id,
          rating: spec.review.rating,
          comment: spec.review.comment ?? null,
          createdAt: new Date(end.getTime() + 6 * HOUR),
        },
      })
    }

    if (spec.vehicleStatus) {
      await db.vehicle.update({ where: { id: vehicle.id }, data: { status: spec.vehicleStatus } })
    }
  }
  console.log(`Bookings: ${bookingSpecs.length} (+ payments + reviews)`)

  // ---------- live tracking demo: RENTAL loop near Kilimani for the ACTIVE axio ----------
  const axioActive = createdBookings['axio-active']
  const kilimani = dest('Kilimani')
  const westlandsYard = yards['westlands']
  if (axioActive) {
    await startTripSim({
      bookingId: axioActive.id,
      vehicleId: vehicles['axio'].id,
      from: { lat: westlandsYard.lat, lng: westlandsYard.lng },
      to: { lat: kilimani.lat, lng: kilimani.lng },
      mode: 'RENTAL',
      label: 'Toyota Axio (2019)',
    })
  }

  // ---------- notifications for recent events ----------
  const notifSpecs: { userKey: 'amina' | 'brian' | 'faith' | 'owner' | 'coast' | 'david'; title: string; body: string; type: string; read: boolean; at: Date }[] = [
    {
      userKey: 'amina', title: 'Payment received', type: 'PAYMENT', read: false, at: at(-4 * DAY),
      body: `KSh 19,900 received for booking ${createdBookings['axio-active']?.reference} (Toyota Axio 2019).`,
    },
    {
      userKey: 'amina', title: 'Booking confirmed', type: 'BOOKING', read: false, at: at(-5 * HOUR),
      body: `Booking ${createdBookings['prado-accepted']?.reference} confirmed — Toyota Land Cruiser Prado (2019) with chauffeur David Kimani.`,
    },
    {
      userKey: 'amina', title: 'Trip completed', type: 'BOOKING', read: true, at: at(-18 * DAY),
      body: `Your rental of the Mercedes-Benz C200 is complete — leave a review to help other travellers.`,
    },
    {
      userKey: 'faith', title: 'Payment received', type: 'PAYMENT', read: false, at: at(-1 * DAY),
      body: `KSh 12,000 received for booking ${createdBookings['vitz-paid']?.reference} (Toyota Vitz 2019).`,
    },
    {
      userKey: 'faith', title: 'Trip completed', type: 'BOOKING', read: true, at: at(-74 * DAY),
      body: `Your chauffeur day in the BMW X3 is complete — thank you for choosing SafariDrive.`,
    },
    {
      userKey: 'brian', title: 'Complete your payment', type: 'BOOKING', read: false, at: at(-2 * HOUR),
      body: `Booking ${createdBookings['rav4-pending']?.reference} (Toyota RAV4 2021) is awaiting payment — pay to secure your dates.`,
    },
    {
      userKey: 'owner', title: 'New paid booking', type: 'PAYMENT', read: false, at: at(-1 * DAY),
      body: `Faith Kamau paid for booking ${createdBookings['vitz-paid']?.reference} (Toyota Vitz) — accept or decline it.`,
    },
    {
      userKey: 'owner', title: 'Booking cancelled', type: 'BOOKING', read: true, at: at(-10 * DAY),
      body: `Booking ${createdBookings['rover-cancelled']?.reference} (Range Rover Vogue) was cancelled by Amina Njeri — Change of plans.`,
    },
    {
      userKey: 'coast', title: 'Trip completed', type: 'BOOKING', read: true, at: at(-74 * DAY),
      body: `Booking ${createdBookings['x3-done']?.reference} (BMW X3) is complete — a 5-star review was left by Faith Kamau.`,
    },
    {
      userKey: 'david', title: 'New trip assignment', type: 'TRIP', read: false, at: at(-5 * HOUR),
      body: `You are the assigned chauffeur for booking ${createdBookings['prado-accepted']?.reference} starting tomorrow.`,
    },
  ]
  const notifUsers: Record<string, string> = {
    amina: users.amina.id, brian: users.brian.id, faith: users.faith.id,
    owner: users.owner.id, coast: users.coast.id, david: drivers.david.userId,
  }
  for (const n of notifSpecs) {
    await db.notification.create({
      data: {
        userId: notifUsers[n.userKey],
        title: n.title,
        body: n.body,
        type: n.type,
        read: n.read,
        createdAt: n.at,
      },
    })
  }
  console.log('Notifications: 10')

  // ---------- summary ----------
  const [userCount, vehicleCount, bookingCount, paymentCount, reviewCount] = await Promise.all([
    db.user.count(),
    db.vehicle.count(),
    db.booking.count(),
    db.payment.count(),
    db.review.count(),
  ])
  console.log('--- Seed complete ---')
  console.log(`users=${userCount} vehicles=${vehicleCount} bookings=${bookingCount} payments=${paymentCount} reviews=${reviewCount}`)
}

main()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
