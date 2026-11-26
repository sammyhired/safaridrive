# SafariDrive — Two-Sided Car Rental Platform

**Book. Pay. Drive.** A production-grade car rental marketplace for Kenya (and beyond): customers find and book cars in minutes, pay with M-Pesa or card, choose pickup / doorstep delivery / chauffeur — and track their vehicle live on a map. Owners, yards, drivers and platform admins run the whole business from one dashboard.

Built entirely on **open-source tools** — no Google Maps bills, no proprietary GPS vendor lock-in.

---

## Highlights

### Customer experience
- Search by location, category (Economy, Sedan, SUV, 4x4, Van, Luxury, Executive), price, transmission, seats
- Rental-yard map with addresses, opening hours and live availability counts
- **Three ways to get the car**:
  1. **Pickup** at a yard — no delivery fee
  2. **Delivery to your address** — distance-based fee (base + per-km, haversine-calculated)
  3. **Chauffeur** — car + professional driver at a daily rate
- **Automatic price calculator** — rental × days + delivery fee + chauffeur + extras − promo, with a full line-item breakdown; totals are always recomputed server-side (the client is never trusted)
- Extras (comprehensive insurance, child seat, additional driver, airport meet & greet), promo codes
- **M-Pesa STK Push** (Safaricom Daraja adapter with a mock/sandbox mode for demos) and card payments with Luhn validation
- Digital receipts, booking lifecycle with status badges, free cancellation policy (free ≥ 48h before start, 20% fee inside)
- **Live GPS tracking** during delivery and rental — Leaflet + OpenStreetMap map, live marker with heading, speed, ETA and distance remaining
- Two-way reviews and ratings

### Owner / business side
- Fleet management (add/edit vehicles, availability & maintenance states, per-vehicle utilisation)
- Booking inbox with role-guarded actions: accept / reject (with refund), dispatch (starts live tracking), mark picked-up / delivered / returned / complete
- Driver roster with ratings, daily rates and availability
- Expense tracking (fuel, service, insurance, repairs) and net-revenue analytics
- Revenue vs expenses charts, top-vehicles leaderboard, 6-month history

### Driver side
- Today's assignments, active job card with customer + vehicle + addresses
- One-tap status transitions (start / deliver / return) that drive the customer's live map
- Earnings summary and trip history

### Admin control centre
- Platform KPIs: users, fleet, active rentals, revenue, 10% commission take
- Revenue & bookings charts, bookings-by-status distribution
- User management (suspend / activate), promo-code CRUD

---

## Open-source stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS 4, shadcn/ui, lucide-react, Recharts, Framer Motion |
| Database | SQLite + Prisma ORM |
| Maps | **Leaflet + OpenStreetMap tiles** (zero-cost alternative to Google Maps) |
| Realtime | Socket.io (dedicated tracking microservice) |
| GPS ingest | **OSMAND-protocol compatible** (works with Traccar-compatible devices/apps such as GPSLogger — no proprietary tracker vendor required) |
| Payments | Safaricom **M-Pesa Daraja** adapter (official API; pluggable mock mode) + card |
| Auth | HMAC-signed httpOnly cookie sessions (node:crypto scrypt hashing) |
| State | TanStack Query + Zustand |

### Why this matters for Kenya ops
The proposal research priced proprietary GPS at KSh 8,500–12,500 per device plus monthly subscriptions, and Google Maps at $100–275/month. This build replaces both with open-source equivalents: any OSMAND/Traccar-compatible tracker can feed the ingest endpoint, and Leaflet/OSM maps are free — leaving M-Pesa Daraja (free to integrate, pay-per-transaction) as the only unavoidable external service.

---

## Architecture

```
Browser (single-page app at /)
  │  REST + socket.io (/?XTransformPort=3003 via gateway)
  ├────────────────────────────┐
  │                            │
Next.js app (port 3000)        Tracking service (port 3003)
  ├─ /api/* REST endpoints       ├─ socket.io live positions
  ├─ Prisma → SQLite             ├─ trip simulator (demo GPS)
  ├─ pricing engine              └─ OSMAND-compatible ingest
  ├─ M-Pesa Daraja adapter         GET /?id=..&lat=..&lon=..&speed=..&heading=..
  └─ auth (HMAC cookie)
```

- **Booking lifecycle**: `PENDING_PAYMENT → PAID → ACCEPTED → OUT_FOR_DELIVERY → ACTIVE → RETURNED → COMPLETED` (plus `REJECTED` / `CANCELLED` with refunds)
- Every state change emits notifications and (where relevant) starts/stops GPS trip simulation
- The tracking service is standalone (own package.json, hot-reload dev script) so it can be deployed/scaled independently, or replaced by a real Traccar server

## Repo layout

```
prisma/            schema + seed (demo users, yards, 16 vehicles, bookings, promos)
src/app/api/       REST endpoints (auth, vehicles, yards, quote, bookings,
                   payments, tracking, reviews, expenses, stats, users, promos)
src/components/    customer/ owner/ admin/ driver/ shared/ UI workspaces
src/lib/           types contract, pricing engine, M-Pesa adapter, auth, format helpers
android/           APK sources + build pipeline for the four side apps (see below)
mini-services/
  tracking-service/  socket.io GPS service + OSMAND ingest + simulator
docs/CONTRACTS.md    the full API + component contract used to build the app
```

---

## Android apps (APK) — one per side

Every side of the platform ships as an installable Android app. Each APK is a
lightweight (~40 KB) native shell around the SafariDrive web platform:

| App | Package | Opens |
|---|---|---|
| SafariDrive | `ke.co.safaridrive.customer` | Customer side (search / book / pay / track) |
| SafariDrive Owner | `ke.co.safaridrive.owner` | Owner & yard console |
| SafariDrive Driver | `ke.co.safaridrive.driver` | Driver / chauffeur console |
| SafariDrive Admin | `ke.co.safaridrive.admin` | Platform control centre |

On first launch each app asks for the **server address** of the SafariDrive
platform (kept in the device's localStorage), then deep-links straight into its
side via `/?app=<role>` and remembers it. If the server is unreachable the app
shows an offline screen with retry / change-server actions. Location permission
is requested on first use so the maps and "near me" features work inside the shell.

Signed APKs are served by the platform itself at **`/apk/`** (e.g.
`/apk/SafariDrive-Owner-v1.0.0.apk`) and rebuilt on every push by the
`Android APKs` GitHub Action (download from the run's *Artifacts*).

### Installing on a phone
1. Open the platform in the phone's browser and tap an APK link under `/apk/`
   (or download from GitHub Actions artifacts).
2. Allow "install unknown apps" for your browser when prompted — the APKs are
   self-signed.
3. Open the app, enter your server address, done.

### Rebuilding from source
```bash
# once: Android SDK with build-tools 34 + platform 34
sdkmanager "build-tools;34.0.0" "platforms;android-34"

bash android/build.sh          # -> android/out/ + public/apk/
bash android/tools/gen-icons.mjs  # regenerate launcher/PWA icons (needs sharp)
```

The build needs no Gradle and no JDK — it drives `aapt2` / `d8` / `apksigner`
directly and falls back to the Eclipse compiler (ECJ) on a JRE-only machine.
CI does the same on `ubuntu-latest`.

> **Before Play Store upload**: replace `android/keystore/safaridrive-dev.jks`
> with your own private keystore (the shared dev key is for testing only) and
> review `android:usesCleartextTraffic` (currently on so operators can point
> apps at `http://` LAN/staging servers — turn it off for production HTTPS).

---

## Quickstart

```bash
bun install
cp .env.example .env          # then edit values
bun run db:push               # create SQLite schema
bun prisma/seed.ts            # demo data
bun run dev                   # app on http://localhost:3000

# in a second shell — live tracking service
cd mini-services/tracking-service
bun install
bun run dev                   # service on http://localhost:3003
```

### Demo accounts (password `demo123`)

| Role | Email |
|---|---|
| Customer | customer@safaridrive.co.ke |
| Owner | owner@safaridrive.co.ke |
| Driver | driver@safaridrive.co.ke |
| Admin | admin@safaridrive.co.ke |

The seeded demo includes an **active rental with live GPS** (watch it move on the map), a confirmed chauffeur booking ready to dispatch, a paid booking awaiting owner acceptance, and 6 months of completed bookings powering the dashboards.

### Environment variables

```
DATABASE_URL=file:./db/custom.db
SESSION_SECRET=<random hex>
MPESA_MODE=mock                  # or "daraja" for the real sandbox
MPESA_CONSUMER_KEY=              # Daraja app credentials (when MPESA_MODE=daraja)
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=
MPESA_PASSKEY=
MPESA_CALLBACK_URL=
TRACKING_SERVICE_URL=http://localhost:3003
```

With `MPESA_MODE=mock`, the STK push flow is simulated end-to-end (a phone-prompt dialog lets you approve/decline with a generated receipt) — perfect for demos and tests. Switch to `daraja` with Safaricom sandbox credentials for real integration; the callback endpoint already parses Daraja's `stkCallback` payload shape.

### Connecting real GPS trackers

Any tracker that speaks the OSMAND protocol (Traccar ecosystem, GPSLogger app, most cheap GPRS trackers) can report positions:

```
GET http://<tracking-service>:3003/?id=<vehicleId>&lat=-1.29&lon=36.78&timestamp=1700000000&speed=42&heading=90
POST /api/positions  { "id": "...", "lat": ..., "lon": ..., "speed": ..., "heading": ... }
```

Reported positions replace the simulation for that trip and stream to the customer's map in real time.

---

## Roadmap ideas
- KYC document uploads (licence/ID verification) and vehicle inspection reports
- Security-deposit holds via M-Pesa and automated damage disputes
- SMS notifications (Africa's Talking) and push notifications
- Multi-currency and cross-border rentals
- Owner payout ledger with automated settlement

## License
MIT — see [LICENSE](./LICENSE).
