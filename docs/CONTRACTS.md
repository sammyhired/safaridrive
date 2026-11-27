# SafariDrive — Master Contract

Two-sided car rental platform for Kenya. Customer side + Owner/Admin/Driver side.
**Everything below is the single source of truth.** Types live in `src/lib/types.ts` (already written — read it first). Constants (pricing rules, extras, categories, destinations, demo accounts) live in `src/lib/constants.ts`. Formatting helpers in `src/lib/format.ts`.

- Framework: Next.js 16 App Router, TypeScript, Tailwind CSS 4, shadcn/ui (New York), lucide-react icons.
- DB: Prisma + SQLite (`src/lib/db.ts` exports `db`). Schema: `prisma/schema.prisma` (already written).
- ONLY route: `/` (src/app/page.tsx). All other functionality = client-side views + `/api/*` REST routes. **No server actions.**
- Money: integer KES (Kenya Shillings). Format via `formatKes()`.
- **Next 16 gotchas**: route handler `params` are async — `const { id } = await params`; `cookies()` is async — `const store = await cookies()`.
- Brand: **SafariDrive** — deep emerald green primary (`--primary` in globals.css), amber accents, neutral slate. NO blue/indigo colors.
- No emojis in UI text. Lucide icons only.

---

## 1. Auth (cookie session, HMAC-signed)

`src/lib/auth.ts` (backend): signs/verifies a `sd_session` cookie containing `{userId}` using `SESSION_SECRET` env (HMAC SHA-256, base64url). Helpers: `createSession(userId)`, `getSessionUser()` (returns `SessionUser | null`, checks user status ACTIVE), `requireUser(roles?)` (throws 401/403 Response), `hashPassword(pw)` / `verifyPassword(pw, hash)` using node:crypto scrypt.

| Endpoint | Body | Response | Notes |
|---|---|---|---|
| POST `/api/auth/register` | `{name, email, phone, password, role}` role ∈ CUSTOMER\|OWNER | `{user: SessionUser}` | validates, email unique, password ≥ 6 |
| POST `/api/auth/login` | `{email, password}` | `{user: SessionUser}` | 401 invalid / suspended |
| POST `/api/auth/logout` | — | `{ok: true}` | clears cookie |
| GET `/api/auth/me` | — | `{user: SessionUser \| null}` | |

## 2. Catalog

| Endpoint | Notes |
|---|---|
| GET `/api/vehicles` | Query: `q, category, city, yardId, minRate, maxRate, transmission, seats, sort` (`price_asc` default; also `price_desc`, `rating`, `newest`) and optional `startDate,endDate` (ISO) — when both given, exclude vehicles that have an overlapping booking (status not in REJECTED/CANCELLED/COMPLETED/RETURNED). Returns `{vehicles: Vehicle[]}` with `label = "Make Model (year)"`, owner name, yard info, `features` split to array. Only status AVAILABLE or BOOKED (not MAINTENANCE/RETIRED). |
| GET `/api/vehicles/[id]` | `{vehicle: Vehicle, reviews: Review[]}` (latest 10) |
| POST `/api/vehicles` | OWNER only. Body: full vehicle fields (see types). Returns `{vehicle}`. |
| PATCH `/api/vehicles/[id]` | Owner of vehicle or ADMIN. Partial update (incl. `status` AVAILABLE\|MAINTENANCE). Returns `{vehicle}`. |
| GET `/api/yards` | `{yards: RentalYard[]}` with `vehicleCount`, `availableCount` |
| GET `/api/categories` | `{categories: {key, label, count, minRate}[]}` in CATEGORY_ORDER |
| GET `/api/drivers` | `{drivers: DriverProfile[]}` (join user for name/phone). Public. |
| PATCH `/api/drivers/[id]` | ADMIN. Body `{status?, dailyRate?}`. `{driver}` |

## 3. Quote engine — `src/lib/pricing.ts`

`computeQuote(input, vehicle, driver, promo)` — server-side, shared by quote + create booking:

- `days = rentalDays(start, end)` (min 1, ceil of hours/24)
- `rentalTotal = dailyRate × days`
- `distanceKm` = haversine(vehicle.yard, delivery point) — null for PICKUP
- `deliveryFee`: PICKUP → 0; DELIVERY/CHAUFFEUR → `round(DELIVERY_BASE_FEE + DELIVERY_PER_KM × distanceKm)` (if no coords, use 10km default)
- `driverTotal`: CHAUFFEUR → `driver.dailyRate × days` else 0
- `extrasTotal` = Σ (perDay ? perDay×qty×days : flat×qty) using EXTRAS_CATALOG
- `discount` from promo (percentOff or amountOff, applied on rentalTotal+extrasTotal, capped at that subtotal); invalid/expired promo → promoValid false, discount 0, message explains
- `deposit = vehicle.securityDeposit` (displayed, NOT added to total)
- `total = rentalTotal + deliveryFee + driverTotal + extrasTotal − discount`
- `breakdown: QuoteLine[]` — one line per component incl. each extra, promo as negative, plus deposit line (amount = deposit, note "refundable")

| Endpoint | Body | Response |
|---|---|---|
| POST `/api/bookings/quote` | `QuoteInput` (see types) | `{quote: Quote}` — CHAUFFEUR requires `driverId` |
| POST `/api/promo/validate` | `{code, subtotal}` | `{valid, discount, message}` |

## 4. Bookings

Reference format: `SD-` + 6 chars (A-Z0-9, no ambiguous chars).

| Endpoint | Notes |
|---|---|
| POST `/api/bookings` | CUSTOMER. Body = QuoteInput. Server recomputes quote (never trusts client), checks date validity (start ≥ now, end > start) and availability overlap, creates `PENDING_PAYMENT` booking (paymentStatus UNPAID). Returns `{booking: Booking}`. |
| GET `/api/bookings` | Role-scoped: customer → own; owner → bookings for their vehicles; driver → assigned to them; admin → all. Optional `?status=` filter. Returns `{bookings: Booking[]}` newest first, includes vehicle, driver, customer name/phone, payments, `reviewed` (has review). |
| GET `/api/bookings/[id]` | Auth-scoped (customer-of-booking / owner-of-vehicle / assigned-driver / admin). `{booking}` |
| PATCH `/api/bookings/[id]` | Body `{action, reason?}`. Role rules below. Returns `{booking}`. |

### Actions & transitions

| action | who | from → to | side effects |
|---|---|---|---|
| `accept` | owner of vehicle | PAID → ACCEPTED | notify customer |
| `reject` | owner of vehicle | PAID → REJECTED | payments → REFUNDED, paymentStatus REFUNDED, notify customer (reason) |
| `cancel` | customer (own) or admin | PENDING_PAYMENT/PAID/ACCEPTED → CANCELLED | if paid: payments REFUNDED + paymentStatus REFUNDED. Free if ≥48h to start, else 20% fee (note in cancelReason). notify owner. |
| `dispatch` | owner/admin | ACCEPTED + mode DELIVERY/CHAUFFEUR → OUT_FOR_DELIVERY | calls tracking service `POST /sim/start` (yard → delivery coords, mode DELIVERY); if CHAUFFEUR without driverId: assign first AVAILABLE driver. driver.status ON_TRIP. notify customer. |
| `start` | owner/admin/driver | ACCEPTED + PICKUP → ACTIVE | tracking `POST /sim/start` (mode RENTAL loop around yard); notify customer. |
| `deliver` | driver/owner/admin | OUT_FOR_DELIVERY → ACTIVE | tracking: restart sim mode RENTAL (loop near delivery address) if coords exist; notify customer. |
| `return` | owner/driver/admin | ACTIVE → RETURNED | vehicle stays BOOKED; notify customer. |
| `complete` | owner/admin | RETURNED → COMPLETED | vehicle → AVAILABLE; assigned driver → AVAILABLE, tripsCompleted+1; notify customer (invite to review). |

Every state change also creates Notification rows for affected parties. Guard invalid transitions with 400.

## 5. Payments

`src/lib/mpesa.ts` — adapter with `MPESA_MODE` env (`mock` default | `daraja`). Mock mode generates `checkoutRequestId` like `ws_CO_<ts>_<rand>` and receipt `SD<10 alphanum>`. Daraja mode: implements STK push via Safaricom Daraja sandbox (env: `MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_URL`) — code path present but default mock.

| Endpoint | Notes |
|---|---|
| POST `/api/payments/mpesa/stk` | CUSTOMER. `{bookingId, phone}` — phone regex `^(?:254|\+254|0)1[0-9]{8}$` (normalize to 254…). Creates Payment PENDING (method MPESA, amount = booking.total). Returns `{payment: PaymentSummary}`. In mock mode frontend then simulates the phone prompt. |
| POST `/api/payments/mpesa/callback` | Fail-closed matrix. mock mode (never in production): `{checkoutRequestId, result, phone?}` accepted ONLY from the paying customer's own session. daraja mode: ONLY the official `{Body:{stkCallback:{...}}}` shape AND `MPESA_CALLBACK_SECRET` is REQUIRED (unset → 503; header `x-callback-secret`, timing-safe compare). Any other `MPESA_MODE` → 503. On success: payment COMPLETED + receiptNo, booking → PAID (paymentStatus PAID), vehicle → BOOKED, notifications to customer + owner. FAILED attempts are terminal (a late callback cannot resurrect them); a duplicate payment for an already-settled booking is voided (FAILED), never double-billed. Returns `{payment}`. 404 unknown checkoutRequestId. |
| POST `/api/payments/card` | CUSTOMER. Simulated gateway — in production hard-disabled unless `CARD_MOCK_ENABLED=true`. `{bookingId, cardNumber, cardName, expiry (MM/YY), cvv}`. Luhn check, expiry in future, cvv 3 digits. Instant COMPLETED (receipt `CARD-…`), booking → PAID, vehicle BOOKED. `{payment}` |
| GET `/api/payments?bookingId=` | `{payments: PaymentSummary[]}` |

## 6. Tracking (live GPS)

Next.js talks to the tracking mini-service at `TRACKING_SERVICE_URL` (default `http://localhost:3003`) server-side.

| Endpoint | Notes |
|---|---|
| GET `/api/tracking/[bookingId]` | Customer-of-booking / owner / driver / admin. Proxies `GET {TRACKING_SERVICE_URL}/trips/{bookingId}`. Returns `TrackingResponse` (see types). If service down → `{booking, trip: null}`. |

Frontend live updates: socket.io client `io('/?XTransformPort=3003')` (path MUST be `/`), join room: emit `join-trip` with `{bookingId, token}` (token from `GET /api/tracking/[bookingId]`, per-booking HMAC, 10-min TTL); server emits `trip-state` (full TripState) then `position` `{lat,lng,speed,heading,ts}` every ~2s. Leave: `leave-trip`. Without a valid token the join is rejected (`join-error`).

## 7. Reviews / Expenses / Notifications / Stats / Users / Promos

| Endpoint | Notes |
|---|---|
| POST `/api/reviews` | CUSTOMER, booking COMPLETED + own. `{bookingId, rating (1-5), comment?}`. Updates vehicle `rating` (mean) + `reviewCount`. `{review}` |
| GET `/api/reviews?vehicleId=` | `{reviews: Review[]}` |
| GET `/api/expenses` | OWNER (or ADMIN). Own vehicles. Optional `?vehicleId=`. `{expenses: Expense[], total}` |
| POST `/api/expenses` | OWNER. `{vehicleId, category, amount, note?, date?}` (must own vehicle) → `{expense}` |
| GET `/api/notifications` | any logged-in. `{notifications: AppNotification[] (latest 20), unreadCount}` |
| POST `/api/notifications/read-all` | `{ok}` |
| GET `/api/stats/owner` | OWNER. `{stats: OwnerStats}` — revenue = Σ COMPLETED booking totals of their vehicles; monthly = last 6 months (revenue, expenses, bookings); utilization = booked days last 30d ÷ (fleet×30); topVehicles top 5 |
| GET `/api/stats/admin` | ADMIN. `{stats: AdminStats}` — commission = 10% (PLATFORM_COMMISSION_RATE) of total completed revenue |
| GET `/api/stats/driver` | DRIVER. `{stats: DriverStats}` — earningsThisMonth = Σ driverTotal of COMPLETED bookings assigned this month |
| GET `/api/users` | ADMIN. `{users: {id,name,email,phone,role,status,createdAt}[]}` |
| PATCH `/api/users/[id]` | ADMIN. `{status}` toggle ACTIVE/SUSPENDED → `{user}` |
| GET `/api/promos` | ADMIN. `{promos: PromoCode[]}` |
| POST `/api/promos` | ADMIN. `{code, description, percentOff?, amountOff?}` → `{promo}` |
| PATCH `/api/promos/[id]` | ADMIN. `{active}` → `{promo}` |

All endpoints return JSON. Errors: `{error: "message"}` with proper status (400/401/403/404). Dates as ISO strings.

## 8. Frontend component ownership map

Entry components (default exports) wired by page.tsx:
- `src/components/customer/index.tsx` → `CustomerApp`
- `src/components/owner/index.tsx` → `OwnerApp`
- `src/components/admin/index.tsx` → `AdminApp`
- `src/components/driver/index.tsx` → `DriverApp`

Shared (owned by Task 3-c):
- `src/components/shared/app-header.tsx` → default `AppHeader({ roleView, onRoleChange }: { roleView: Role; onRoleChange: (r: Role) => void })` — sticky top, brand mark (inline SVG steering-wheel style logo + "SafariDrive"), role tabs (Customer/Owner/Driver/Admin with lucide icons: Car, Building2, IdCard/BadgeCheck, ShieldCheck), notification bell (popover list, unread badge, "mark all read"), user menu (avatar w/ initials, name/role, logout), theme toggle (next-themes, sun/moon). If not logged in, tabs still switch views; actions needing auth open LoginDialog.
- `src/components/shared/login-dialog.tsx` → default `LoginDialog({open, onOpenChange})` — email/password form + 4 demo quick-login buttons (from DEMO_ACCOUNTS), register tab (customer/owner role select). Uses `useSession`.
- `src/components/shared/map-view.tsx` → default `MapView` — Leaflet + OSM tiles (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`), 'use client', dynamically imports leaflet inside useEffect (SSR-safe), custom `L.divIcon` HTML markers (NO image assets), polyline path, live pulsing marker with heading rotation. Props:
```ts
interface MapMarker { id: string; lat: number; lng: number; label?: string; kind?: 'vehicle'|'yard'|'destination'|'driver'; popup?: string }
interface MapViewProps { markers?: MapMarker[]; path?: {lat:number;lng:number}[]; center?: [number,number]; zoom?: number; height?: string; livePosition?: {lat:number;lng:number;heading?:number}|null; onMarkerClick?: (id:string)=>void; className?: string }
```
- `src/components/shared/status-badge.tsx` → `StatusBadge({status: string})` using `statusTone/statusLabel` from format.ts.
- `src/components/shared/stat-card.tsx` → `StatCard({title, value, icon, hint?, trend?})`.
- `src/components/shared/empty-state.tsx` → `EmptyState({icon, title, description, action?})`.
- `src/hooks/use-session.ts` → `useSession()` — React Query wrapper: `{user, isLoading, login(email,password), register(...), logout(), loginDemo(email)}`. On success: update `['session']` query cache + `useAppStore` user + `queryClient.invalidateQueries()`.
- `src/hooks/use-socket.ts` → `useSocket()` — singleton socket.io client to `/?XTransformPort=3003` (path `/`, transports websocket+polling), returns `{socket, connected}`.

Style rules for everyone: cards `p-4`/`p-6`, `gap-4`/`gap-6`; long lists `max-h-96 overflow-y-auto`; responsive mobile-first; interactive elements ≥44px touch; skeleton loaders during queries; toasts for actions (existing `use-toast`); framer-motion subtle transitions OK; semantic HTML; NO blue/indigo — emerald/amber/red/slate tokens (`bg-primary text-primary-foreground`, `bg-muted`, `text-muted-foreground`, `bg-accent`…).

## 9. Tracking mini-service protocol (Task 2-b)

Standalone bun project at `mini-services/tracking-service/`, port **3003**, `bun --hot index.ts` as `dev` script, socket.io `path: '/'`, CORS `*`.

REST (called server-to-server by Next.js, or by GPS devices through the gateway `?XTransformPort=3003`):
- `POST /sim/start` `{bookingId, vehicleId, from:{lat,lng}, to:{lat,lng}, mode: 'DELIVERY'|'RENTAL', label}` — starts simulation. DELIVERY: vehicle moves from→to along a straight line at realistic speed, completing in ~3-4 min wall time, then holds at destination. RENTAL: loops on a small circuit around `to` (or `from` if no `to`).
- `POST /sim/stop` `{bookingId}`
- `GET /trips/:bookingId` → `{active, mode, label, latest, path, from, to, progress, etaMin}` (path capped at last 500 points)
- `GET /?id=<vehicleId>&key=<deviceKey>&lat=..&lon=..&timestamp=..&speed=..&heading=..` — **OSMAND protocol compatible** (works with Traccar-compatible apps like GPSLogger): updates the active trip for that vehicle (external hardware ingest). `key = HMAC-SHA256(TRACKING_INTERNAL_KEY, "device:"+vehicleId)` (hex) — the vehicleId alone is public, so it is never accepted as the only credential. Also `POST /api/positions` accepting the same fields as JSON (key in body `key` or `x-device-key` header).

Socket events: client emits `join-trip {bookingId, token}` (per-booking HMAC token issued by the app after an ownership check; tokens expire after 10 min and expired members are swept from rooms) → server joins room `booking:{id}`, emits `trip-state` (full state) then broadcasts `position` `{lat,lng,speed,heading,ts}` to that room every 2s. `leave-trip {bookingId}` to leave. `disconnect` cleans rooms. Join attempts are rate-limited per socket (5 / 10s).

## 10. Seed data (Task 2-a, `prisma/seed.ts`, run with `bun prisma/seed.ts`)

Password for ALL seeded users: `demo123` (use hashPassword from auth lib).

**Users**: admin@safaridrive.co.ke (ADMIN, "Platform Admin") · owner@safaridrive.co.ke (OWNER, "SafariDrive Fleet") · coast@safaridrive.co.ke (OWNER, "Coast AutoHire") · customer@safaridrive.co.ke (CUSTOMER, "Amina Njeri", 0722000001) · brian@example.com (CUSTOMER, "Brian Otieno") · faith@example.com (CUSTOMER, "Faith Kamau") · driver@safaridrive.co.ke (DRIVER, "David Kimani", rate 2500) + Grace Wanjiru (2000) + Peter Otieno (2200) + Samuel Mwangi (2800) + Ali Hassan (2300).

**Yards**: Westlands HQ Nairobi (-1.2649,36.8039, +254700000001) · JKIA Airport Yard Nairobi (-1.3192,36.9278) · Nyali Yard Mombasa (-4.05,39.7004) · Milimani Yard Kisumu (-0.0917,34.768) · CBD Yard Nakuru (-0.3031,36.08).

**Vehicles** (imageUrl from `src/lib/images.ts` `VEHICLE_IMAGES[key]`; owner = SafariDrive Fleet unless noted; plates like KDA 123A):
key, make/model/year/category/rate/deposit/yard/transmission/fuel/seats/features:
- vitz — Toyota Vitz 2019 ECONOMY 3500/5000 Westlands Manual Petrol 5 [A/C, USB, Fuel efficient]
- demio — Mazda Demio 2018 ECONOMY 3800/5000 Westlands Automatic Petrol 5 [A/C, Bluetooth]
- fit — Honda Fit 2020 ECONOMY 4200/5000 JKIA Automatic Petrol 5 [A/C, Reverse camera]
- axio — Toyota Axio 2019 SALOON 5000/8000 Westlands Automatic Petrol 5 [A/C, Cruise control]
- impreza — Subaru Impreza 2019 SALOON 6500/8000 JKIA Automatic Petrol 5 [AWD, A/C, Sport mode]
- rav4 — Toyota RAV4 2021 SUV 9500/10000 Westlands Automatic Petrol 5 [AWD, Roof rails, A/C]
- xtrail — Nissan X-Trail 2020 SUV 8500/10000 Nyali (owner Coast AutoHire) Automatic Petrol 5 [AWD, Panoramic roof]
- everest — Ford Everest 2021 SUV 12000/15000 Westlands Automatic Diesel 7 [4WD, 7 seats, A/C]
- prado — Toyota Land Cruiser Prado 2019 FOUR_BY_FOUR 15000/20000 Westlands Automatic Diesel 7 [4WD, Safari-ready, Snorkel]
- lc76 — Toyota Land Cruiser 76 2020 FOUR_BY_FOUR 18000/25000 Nakuru Manual Diesel 5 [4WD, Safari rack, Dual battery]
- hiace — Toyota Hiace 2018 VAN 11000/15000 Westlands Manual Diesel 14 [14 seats, Tour van]
- tourvan — Toyota Hiace Tour Van 2019 VAN 13000/15000 Nakuru Automatic Diesel 14 [14 seats, WiFi, Fridge]
- cclass — Mercedes-Benz C200 2020 LUXURY 16000/25000 Westlands Automatic Petrol 5 [Leather, Ambient light]
- x3 — BMW X3 2021 LUXURY 20000/30000 Nyali (Coast AutoHire) Automatic Petrol 5 [Panoramic roof, Harman Kardon]
- eclass — Mercedes-Benz E250 2021 EXECUTIVE 25000/40000 Westlands Automatic Petrol 5 [Chauffeur class, Rear A/C]
- rover — Range Rover Vogue 2020 EXECUTIVE 35000/50000 Nyali (Coast AutoHire) Automatic Diesel 5 [V8, Massage seats]
mileageLimit 200/day for ECONOMY/SALOON, null (unlimited) others; excessPerKm 50. Ratings 4.2–4.9 with reviewCount 3–40.

**Promos**: WELCOME10 (10% off your first ride) · SAFARI500 (KSh 500 off) — both active.

**Expenses**: ~8 rows across vehicles (fuel/service/insurance) over last 3 months.

**Bookings** (create with computed totals via computeQuote; dates relative to seed time; payments COMPLETED with receipts; notifications for recent events):
1. Amina + axio, DELIVERY Westlands→Kilimani, ACTIVE (started yesterday, 3-day rental, paid MPESA) — tracking demo booking (RENTAL loop near Kilimani)
2. Amina + prado, CHAUFFEUR with David Kimani, ACCEPTED starting tomorrow, 2 days — ready to "dispatch" demo
3. Brian + rav4, PICKUP at JKIA, PENDING_PAYMENT (created today)
4. Faith + vitz, PICKUP Westlands, PAID (awaiting owner accept) starting in 3 days
5. Amina + cclass, COMPLETED 20 days ago, 2 days, MPESA, review 5* "Spotless car, smooth delivery."
6. Brian + hiace, COMPLETED 40 days ago, 3 days, card paid, review 4*
7. Faith + x3, COMPLETED ~2.5 months ago, CHAUFFEUR 1 day, review 5*
8. Amina + rover, CANCELLED 10 days ago (paid then refunded), reason "Change of plans"
Plus ~6 more COMPLETED bookings spread across the last 6 months (various vehicles/customers, MPESA/card, some chauffeur) so revenue charts have 6 months of data.

## 11. Env vars (already in .env)

`DATABASE_URL`, `SESSION_SECRET`, `MPESA_MODE=mock`, `TRACKING_SERVICE_URL=http://localhost:3003`
