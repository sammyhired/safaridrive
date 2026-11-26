// ============================================================================
// SafariDrive Tracking Service (Task 2-b)
// Standalone GPS trip-simulation + live-tracking microservice.
//
//   Port      : 3003 (fixed)
//   State     : in-memory (no database)
//   REST      : POST /sim/start | POST /sim/stop | GET /trips/:bookingId | GET /health
//   OSMAND    : GET /?id=<vehicleId>&lat=&lon=&timestamp=&speed=&heading=
//               (Traccar / GPSLogger compatible) and POST /api/positions (JSON,
//               same fields — also accepts deviceId/latitude/longitude aliases)
//   socket.io : path '/', CORS '*' — rooms "booking:{id}"
//               client emits: join-trip {bookingId} / leave-trip {bookingId}
//               server emits: trip-state (full state) / position {lat,lng,speed,heading,ts}
//
// NOTE on socket.io + REST sharing one port: engine.io's attach() with
// path '/' treats *every* request as an engine.io request (its path check is
// `'/' === req.url.slice(0, 1)`), which would shadow the whole REST API.
// We therefore re-register the http server's 'request' listeners and only
// forward requests carrying engine.io query params (EIO / transport / sid)
// to socket.io; everything else is routed to the REST handler.
//
// Hot reload: `bun --hot` re-evaluates this module while keeping the process
// (and globalThis) alive. Previous server / ticker instances are cleaned up
// via globalThis guards below so the port is re-bound cleanly.
// ============================================================================

import crypto from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Server as SocketIOServer, type Socket } from 'socket.io'

// ------------------------------- constants ---------------------------------

const PORT = 3003
const TICK_MS = 2000 // simulation ticker cadence
const TRIP_STATE_EVERY_TICKS = 15 // emit full trip-state every ~30s
const MAX_PATH_POINTS = 500 // path is capped to the most recent 500 points

// --------------------------------- types -----------------------------------

type TripMode = 'DELIVERY' | 'RENTAL'
type TripSource = 'sim' | 'device'

interface GpsPoint {
  lat: number
  lng: number
}

interface TripLatest extends GpsPoint {
  speed: number // km/h
  heading: number // degrees 0-360 (bearing of movement)
  ts: string // ISO timestamp
}

interface TripStateJson {
  bookingId: string | null
  active: boolean
  mode: TripMode | null
  label: string | null
  source: TripSource | null
  vehicleId: string | null
  startedAt: string | null
  latest: TripLatest | null
  path: GpsPoint[]
  from: GpsPoint | null
  to: GpsPoint | null
  progress: number // 0..1
  etaMin: number | null // minutes remaining (null for RENTAL / unknown)
}

interface SimDelivery {
  kind: 'DELIVERY'
  totalM: number // total path length in meters
  traveledM: number
  baseMps: number // nominal cruise speed m/s
  durationS: number // target wall-clock duration
  arrived: boolean
  jitterM: number // current perpendicular offset (random walk, meters)
}

interface SimRental {
  kind: 'RENTAL'
  waypoints: GpsPoint[] // the looping circuit
  segLengths: number[] // meters between waypoints[i] -> waypoints[i+1]
  lapLengthM: number
  index: number // current segment start waypoint
  segM: number // meters into current segment
  lapM: number // meters into current lap
  speedKmh: number // cruise speed random walk 30..50 km/h
  jitterM: number
}

type Sim = SimDelivery | SimRental

interface Trip {
  bookingId: string
  vehicleId: string
  active: boolean
  mode: TripMode
  label: string | null
  source: TripSource
  latest: TripLatest | null
  path: GpsPoint[]
  from: GpsPoint | null
  to: GpsPoint | null
  progress: number
  etaMin: number | null
  startedAt: string
  sim: Sim | null // null when the trip is device-fed
  ticks: number
  lastTickMs: number
  lastHeading: number
}

// ------------------------------ small utils --------------------------------

const log = (...args: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...args)
const warn = (...args: unknown[]) => console.error(`[${new Date().toISOString()}] WARN`, ...args)

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
const r6 = (v: number) => Math.round(v * 1e6) / 1e6
const r4 = (v: number) => Math.round(v * 1e4) / 1e4
const r1 = (v: number) => Math.round(v * 10) / 10
const nowIso = () => new Date().toISOString()

/** Strict numeric parse: '' / null / NaN / Infinity -> null. */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function strField(v: unknown, maxLen = 200): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, maxLen) : null
}

function parsePoint(v: unknown): GpsPoint | null {
  if (!v || typeof v !== 'object') return null
  const lat = num((v as Record<string, unknown>).lat)
  const lng = num((v as Record<string, unknown>).lng)
  if (lat === null || lng === null) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

/** Accepts epoch milliseconds, epoch seconds, or ISO date strings. */
function parseTimestamp(v: unknown): number | null {
  const n = num(v)
  if (n !== null) {
    if (n > 1e12) return n // epoch ms (after ~2001)
    if (n > 0) return n * 1000 // epoch seconds
    return null
  }
  if (typeof v === 'string') {
    const d = Date.parse(v)
    if (Number.isFinite(d)) return d
  }
  return null
}

// ------------------------------- geo helpers -------------------------------

const R_EARTH = 6371000
const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

function haversineM(a: GpsPoint, b: GpsPoint): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)))
}

function bearingDeg(a: GpsPoint, b: GpsPoint): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat))
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng))
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function destination(p: GpsPoint, bearing: number, distM: number): GpsPoint {
  const delta = distM / R_EARTH
  const theta = toRad(bearing)
  const lat1 = toRad(p.lat)
  const lng1 = toRad(p.lng)
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(delta) + Math.cos(lat1) * Math.sin(delta) * Math.cos(theta),
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(lat1),
      Math.cos(delta) - Math.sin(lat1) * Math.sin(lat2),
    )
  return { lat: toDeg(lat2), lng: ((toDeg(lng2) + 540) % 360) - 180 }
}

function interpolate(a: GpsPoint, b: GpsPoint, f: number): GpsPoint {
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }
}

// ------------------------------ trip storage -------------------------------

interface GlobalStore {
  __SD_TRACKING_TRIPS?: Map<string, Trip>
  __SD_TRACKING_HTTP?: import('node:http').Server
  __SD_TRACKING_IO?: SocketIOServer
  __SD_TRACKING_TICKER?: ReturnType<typeof setInterval>
}
const G = globalThis as unknown as GlobalStore

const trips: Map<string, Trip> = G.__SD_TRACKING_TRIPS ?? new Map<string, Trip>()
G.__SD_TRACKING_TRIPS = trips

const roomFor = (bookingId: string) => `booking:${bookingId}`
const countActive = () => {
  let n = 0
  for (const t of trips.values()) if (t.active) n++
  return n
}

function stateJson(t: Trip): TripStateJson {
  return {
    bookingId: t.bookingId,
    active: t.active,
    mode: t.mode,
    label: t.label,
    source: t.source,
    vehicleId: t.vehicleId,
    startedAt: t.startedAt,
    latest: t.latest,
    path: t.path.slice(),
    from: t.from,
    to: t.to,
    progress: t.progress,
    etaMin: t.etaMin,
  }
}

function inactiveJson(bookingId: string | null = null): TripStateJson {
  return {
    bookingId,
    active: false,
    mode: null,
    label: null,
    source: null,
    vehicleId: null,
    startedAt: null,
    latest: null,
    path: [],
    from: null,
    to: null,
    progress: 0,
    etaMin: null,
  }
}

function getState(bookingId: string): TripStateJson {
  const t = trips.get(bookingId)
  return t && t.active ? stateJson(t) : inactiveJson(bookingId)
}

function pushPath(trip: Trip, p: GpsPoint): void {
  trip.path.push({ lat: r6(p.lat), lng: r6(p.lng) })
  if (trip.path.length > MAX_PATH_POINTS) {
    trip.path.splice(0, trip.path.length - MAX_PATH_POINTS)
  }
}

// ---------------------------- sim: construction ----------------------------

function buildRentalSim(center: GpsPoint): SimRental {
  // Rounded-rectangle circuit (superellipse, n=4) around `center`,
  // rotated by a random angle, with slight per-vertex noise for realism.
  const R = rand(500, 1500) // radius 0.5–1.5 km
  const ry = R * rand(0.6, 0.9)
  const rot = rand(0, Math.PI * 2)
  const N = 20
  const cosLat = Math.cos(toRad(center.lat))
  const waypoints: GpsPoint[] = []
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    const x = R * Math.sign(c) * Math.pow(Math.abs(c), 0.5)
    const y = ry * Math.sign(s) * Math.pow(Math.abs(s), 0.5)
    const X = (x * Math.cos(rot) - y * Math.sin(rot)) * rand(0.95, 1.05)
    const Y = (x * Math.sin(rot) + y * Math.cos(rot)) * rand(0.95, 1.05)
    waypoints.push({
      lat: r6(center.lat + Y / 111320),
      lng: r6(center.lng + X / (111320 * cosLat)),
    })
  }
  const segLengths = waypoints.map((w, i) => Math.max(1, haversineM(w, waypoints[(i + 1) % N])))
  const lapLengthM = segLengths.reduce((a, b) => a + b, 0)
  return {
    kind: 'RENTAL',
    waypoints,
    segLengths,
    lapLengthM,
    index: 0,
    segM: 0,
    lapM: 0,
    speedKmh: rand(30, 50),
    jitterM: 0,
  }
}

function createTrip(
  bookingId: string,
  vehicleId: string,
  mode: TripMode,
  label: string | null,
  from: GpsPoint,
  to: GpsPoint,
): Trip {
  const trip: Trip = {
    bookingId,
    vehicleId,
    active: true,
    mode,
    label,
    source: 'sim',
    latest: null,
    path: [],
    from: { lat: r6(from.lat), lng: r6(from.lng) },
    to: { lat: r6(to.lat), lng: r6(to.lng) },
    progress: 0,
    etaMin: null,
    startedAt: nowIso(),
    sim: null,
    ticks: 0,
    lastTickMs: Date.now(),
    lastHeading: 0,
  }

  if (mode === 'DELIVERY') {
    const totalM = haversineM(from, to)
    if (totalM < 10) {
      // Degenerate trip (from == to): already at destination, hold there.
      trip.sim = {
        kind: 'DELIVERY',
        totalM,
        traveledM: totalM,
        baseMps: 0,
        durationS: 0,
        arrived: true,
        jitterM: 0,
      }
      trip.progress = 1
      trip.etaMin = 0
      trip.latest = { lat: to.lat, lng: to.lng, speed: 0, heading: 0, ts: nowIso() }
      trip.path = [{ ...to }]
      return trip
    }
    // Pace the trip to complete in ~3–4 minutes for typical delivery
    // distances (~16 m/s ≈ 58 km/h), clamped to [3 min, 9 min].
    const durationS = clamp((totalM / 16) * rand(0.98, 1.05), 180, 540)
    const sim: SimDelivery = {
      kind: 'DELIVERY',
      totalM,
      traveledM: 0,
      baseMps: totalM / durationS,
      durationS,
      arrived: false,
      jitterM: 0,
    }
    trip.sim = sim
    const heading = bearingDeg(from, to)
    trip.lastHeading = heading
    trip.latest = {
      lat: from.lat,
      lng: from.lng,
      speed: r1(clamp(sim.baseMps * 3.6, 20, 60)),
      heading: r1(heading),
      ts: nowIso(),
    }
    trip.etaMin = Math.max(1, Math.round(durationS / 60))
    trip.path = [{ ...from }]
  } else {
    const sim = buildRentalSim(to)
    trip.sim = sim
    const w0 = sim.waypoints[0]
    const w1 = sim.waypoints[1]
    const heading = bearingDeg(w0, w1)
    trip.lastHeading = heading
    trip.latest = {
      lat: w0.lat,
      lng: w0.lng,
      speed: r1(sim.speedKmh),
      heading: r1(heading),
      ts: nowIso(),
    }
    trip.path = [{ lat: w0.lat, lng: w0.lng }]
  }
  return trip
}

// ------------------------------ sim: stepping ------------------------------

function stepDelivery(trip: Trip, dt: number): void {
  const sim = trip.sim
  if (!sim || sim.kind !== 'DELIVERY') return
  const from = trip.from
  const to = trip.to
  if (!from || !to) return

  if (sim.arrived) {
    // Hold position at destination; trip stays active (progress 1, etaMin 0).
    if (trip.latest) trip.latest = { ...trip.latest, speed: 0, ts: nowIso() }
    return
  }

  const prev: GpsPoint = trip.latest ?? from
  const noise = rand(0.95, 1.05)
  sim.traveledM = Math.min(sim.totalM, sim.traveledM + sim.baseMps * noise * dt)

  if (sim.traveledM >= sim.totalM) {
    sim.arrived = true
    trip.progress = 1
    trip.etaMin = 0
    trip.latest = {
      lat: to.lat,
      lng: to.lng,
      speed: 0,
      heading: r1(trip.lastHeading),
      ts: nowIso(),
    }
    pushPath(trip, to)
    return
  }

  const f = sim.traveledM / sim.totalM
  const ideal = interpolate(from, to, f)
  const brg = bearingDeg(from, to)
  sim.jitterM = clamp(sim.jitterM + rand(-4, 4), -12, 12)
  const pos = sim.jitterM === 0 ? ideal : destination(ideal, brg + 90, sim.jitterM)

  const movedM = haversineM(prev, pos)
  // Reported cruise speed stays in the realistic ~35–60 km/h band.
  const speedKmh =
    movedM > 1
      ? clamp((movedM / dt) * 3.6 + rand(-2, 2), 12, 60)
      : clamp(sim.baseMps * 3.6, 12, 60)
  const heading = movedM > 0.8 ? bearingDeg(prev, pos) : trip.lastHeading
  trip.lastHeading = heading
  trip.progress = r4(f)
  const remainM = sim.totalM - sim.traveledM
  trip.etaMin = Math.max(1, Math.round(remainM / Math.max(2, speedKmh / 3.6) / 60))
  trip.latest = {
    lat: r6(pos.lat),
    lng: r6(pos.lng),
    speed: r1(speedKmh),
    heading: r1(heading),
    ts: nowIso(),
  }
  pushPath(trip, pos)
}

function stepRental(trip: Trip, dt: number): void {
  const sim = trip.sim
  if (!sim || sim.kind !== 'RENTAL') return

  sim.speedKmh = clamp(sim.speedKmh + rand(-3, 3), 30, 50)
  let remain = (sim.speedKmh / 3.6) * dt
  let guard = 0
  while (remain > 0 && guard++ < 64) {
    const segLen = sim.segLengths[sim.index]
    const left = segLen - sim.segM
    if (remain >= left) {
      remain -= left
      sim.lapM = (sim.lapM + left) % sim.lapLengthM
      sim.segM = 0
      sim.index = (sim.index + 1) % sim.waypoints.length
    } else {
      sim.lapM = (sim.lapM + remain) % sim.lapLengthM
      sim.segM += remain
      remain = 0
    }
  }

  const a = sim.waypoints[sim.index]
  const b = sim.waypoints[(sim.index + 1) % sim.waypoints.length]
  const segLen = sim.segLengths[sim.index]
  const f = segLen > 0 ? sim.segM / segLen : 0
  const ideal = interpolate(a, b, f)
  const brg = bearingDeg(a, b)
  sim.jitterM = clamp(sim.jitterM + rand(-3, 3), -8, 8)
  const pos = sim.jitterM === 0 ? ideal : destination(ideal, brg + 90, sim.jitterM)

  const prev: GpsPoint = trip.latest ?? pos
  const movedM = haversineM(prev, pos)
  const heading = movedM > 0.8 ? bearingDeg(prev, pos) : trip.lastHeading
  trip.lastHeading = heading
  trip.progress = r4(sim.lapM / sim.lapLengthM) // fraction of current lap
  trip.etaMin = null // open-ended rental loop
  trip.latest = {
    lat: r6(pos.lat),
    lng: r6(pos.lng),
    speed: r1(sim.speedKmh),
    heading: r1(heading),
    ts: nowIso(),
  }
  pushPath(trip, pos)
}

function stepSim(trip: Trip, dt: number): void {
  if (trip.sim?.kind === 'DELIVERY') stepDelivery(trip, dt)
  else if (trip.sim?.kind === 'RENTAL') stepRental(trip, dt)
}

const isArrived = (sim: Sim | null): boolean =>
  !!sim && sim.kind === 'DELIVERY' && sim.arrived

// ------------------------ internal auth (shared key) ------------------------

/**
 * Shared secret between the Next.js backend and this service.
 * Used two ways:
 *   - `x-internal-key` header: required for /sim/* and /trips/* (the platform
 *     backend is the only legitimate caller; the public must never reach them)
 *   - HMAC-SHA256 join tokens (`b` = bookingId, `exp`), issued per-booking by
 *     the app after an ownership check; required for socket join-trip so a
 *     random visitor cannot subscribe to someone else's live GPS.
 * Fail closed: with no key configured, every privileged call is refused.
 */
const INTERNAL_KEY = process.env.TRACKING_INTERNAL_KEY ?? ''

function requireInternalKey(req: IncomingMessage): boolean {
  if (!INTERNAL_KEY) return false // fail closed when unconfigured
  const presented = req.headers['x-internal-key']
  const value = Array.isArray(presented) ? presented[0] : presented
  if (typeof value !== 'string' || value.length !== INTERNAL_KEY.length) return false
  return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(INTERNAL_KEY))
}

interface JoinTokenClaims {
  b: string // bookingId this token unlocks
  exp: number // epoch seconds
}

/** HMAC-SHA256 "payload.signature" (base64url); timing-safe compare. */
function verifyJoinToken(raw: unknown, bookingId: string): boolean {
  if (!INTERNAL_KEY || typeof raw !== 'string' || raw.length > 512) return false
  const dot = raw.indexOf('.')
  if (dot <= 0) return false
  const payload = raw.slice(0, dot)
  const signature = raw.slice(dot + 1)
  const expected = crypto.createHmac('sha256', INTERNAL_KEY).update(payload).digest('base64url')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as JoinTokenClaims
    return (
      typeof claims.b === 'string' &&
      claims.b === bookingId &&
      typeof claims.exp === 'number' &&
      claims.exp * 1000 > Date.now()
    )
  } catch {
    return false
  }
}

// --------------------------- ingest protections ----------------------------

/** Per-vehicle ingest rate limit: 30 positions / minute / vehicle id. */
const ingestBuckets = new Map<string, { count: number; resetAt: number }>()

function ingestAllowed(id: string): boolean {
  const now = Date.now()
  const b = ingestBuckets.get(id)
  if (!b || b.resetAt <= now) {
    ingestBuckets.set(id, { count: 1, resetAt: now + 60_000 })
    if (ingestBuckets.size > 5000) {
      for (const [k, v] of ingestBuckets) if (v.resetAt <= now) ingestBuckets.delete(k)
    }
    return true
  }
  b.count += 1
  return b.count <= 30
}

/** Trackers with dead clocks must not backdate/future-date trips. */
function saneTimestamp(tsMs: number): number {
  const now = Date.now()
  if (tsMs < now - 24 * 3600_000) return now // older than a day: ignore device clock
  if (tsMs > now + 10 * 60_000) return now // more than 10 min ahead: ignore
  return tsMs
}


// ------------------------------- REST layer --------------------------------

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    // No CORS headers on purpose: the REST surface is for the platform
    // backend (server-to-server, authenticated by x-internal-key) and for
    // native GPS trackers. Browser access is neither needed nor wanted.
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

function readBody(req: IncomingMessage, limit = 256 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new HttpError(413, 'request body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', (e) => reject(e))
  })
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const buf = await readBody(req)
  if (buf.length === 0) return {}
  try {
    const v = JSON.parse(buf.toString('utf8'))
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    throw new Error('not an object')
  } catch {
    throw new HttpError(400, 'invalid JSON body')
  }
}

/** JSON body, with an x-www-form-urlencoded fallback (some tracker apps POST forms). */
async function readJsonOrForm(req: IncomingMessage): Promise<Record<string, unknown>> {
  const buf = await readBody(req)
  if (buf.length === 0) return {}
  const text = buf.toString('utf8')
  if (String(req.headers['content-type'] ?? '').includes('application/x-www-form-urlencoded')) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of new URLSearchParams(text)) out[k] = v
    return out
  }
  try {
    const v = JSON.parse(text)
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    throw new Error('not an object')
  } catch {
    throw new HttpError(400, 'invalid body: expected JSON {id, lat, lon, timestamp, speed, heading}')
  }
}

function startSim(body: Record<string, unknown>): TripStateJson {
  const bookingId = strField(body.bookingId)
  const vehicleId = strField(body.vehicleId)
  if (!bookingId) throw new HttpError(400, 'bookingId is required')
  if (!vehicleId) throw new HttpError(400, 'vehicleId is required')
  const mode = body.mode
  if (mode !== 'DELIVERY' && mode !== 'RENTAL') {
    throw new HttpError(400, "mode must be 'DELIVERY' or 'RENTAL'")
  }
  const from = parsePoint(body.from)
  if (!from) {
    throw new HttpError(400, 'from must be {lat, lng} with finite lat (-90..90) and lng (-180..180)')
  }
  const hasTo = body.to !== undefined && body.to !== null
  let to = parsePoint(body.to)
  if (!to && !hasTo && mode === 'RENTAL') to = from // RENTAL loops around `to` (fallback: from)
  if (!to) {
    throw new HttpError(400, 'to must be {lat, lng} with finite lat (-90..90) and lng (-180..180)')
  }
  const label = strField(body.label, 160)

  const replaced = trips.has(bookingId)
  const trip = createTrip(bookingId, vehicleId, mode, label, from, to)
  trips.set(bookingId, trip)
  log(
    `sim start booking=${bookingId} vehicle=${vehicleId} mode=${mode}` +
      (replaced ? ' (replaced previous trip)' : ''),
  )
  return stateJson(trip)
}

interface PositionInput {
  id: unknown
  lat: unknown
  lon?: unknown
  lng?: unknown
  timestamp: unknown
  speed: unknown
  heading: unknown
}

function ingestPosition(p: PositionInput): { tripActive: boolean } {
  const id = strField(p.id, 200)
  if (!id) throw new HttpError(400, 'id (vehicleId) is required')
  const lat = num(p.lat)
  const lng = num(p.lng ?? p.lon)
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new HttpError(400, 'lat/lon must be finite numbers (lat -90..90, lon/lng -180..180)')
  }
  if (!ingestAllowed(id)) {
    log(`ingest vehicle=${id} dropped: rate limit`)
    return { tripActive: false }
  }
  const tsMs = saneTimestamp(parseTimestamp(p.timestamp) ?? Date.now())
  const speedRaw = num(p.speed)
  const speed = speedRaw !== null && speedRaw >= 0 ? Math.min(speedRaw, 300) : 0
  const headingRaw = num(p.heading)
  const pos: GpsPoint = { lat, lng }

  let trip: Trip | null = null
  for (const t of trips.values()) {
    if (t.active && t.vehicleId === id) {
      trip = t
      break
    }
  }
  if (!trip) {
    log(`ingest vehicle=${id} ${lat},${lng} -> no active trip`)
    return { tripActive: false }
  }

  let heading: number
  if (headingRaw !== null && headingRaw >= 0 && headingRaw <= 360) {
    heading = headingRaw % 360
  } else if (trip.latest) {
    heading = bearingDeg(trip.latest, pos)
  } else {
    heading = 0
  }

  // Switch the trip from simulation to real device feed.
  trip.source = 'device'
  trip.sim = null
  trip.latest = {
    lat: r6(lat),
    lng: r6(lng),
    speed: r1(speed),
    heading: r1(((heading % 360) + 360) % 360),
    ts: new Date(tsMs).toISOString(),
  }
  pushPath(trip, trip.latest)

  if (trip.mode === 'DELIVERY' && trip.from && trip.to) {
    // Keep progress/eta meaningful using the original from/to geometry.
    const totalM = haversineM(trip.from, trip.to)
    const remainM = haversineM(trip.latest, trip.to)
    trip.progress = totalM > 10 ? r4(clamp(1 - remainM / totalM, 0, 1)) : 1
    trip.etaMin =
      speed > 3
        ? Math.max(0, Math.round(remainM / (speed / 3.6) / 60))
        : trip.progress >= 1
          ? 0
          : null
  }

  io.to(roomFor(trip.bookingId)).emit('position', trip.latest)
  log(
    `ingest vehicle=${id} booking=${trip.bookingId} -> device position ${lat},${lng} speed=${speed}km/h (mode=${trip.mode})`,
  )
  return { tripActive: true }
}

async function handleRest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const rawUrl = req.url ?? '/'
    let u: URL
    try {
      u = new URL(rawUrl, 'http://localhost')
    } catch {
      return sendJson(res, 400, { error: 'malformed request url' })
    }
    const method = (req.method ?? 'GET').toUpperCase()
    const path = u.pathname

    if (method === 'OPTIONS') {
      // No CORS allow-origin: browsers are intentionally NOT permitted to
      // call this service's REST API cross-origin (the web app talks to it
      // server-to-server; native trackers do not preflight).
      res.writeHead(204)
      res.end()
      return
    }

    // --- health ---
    if (path === '/health' && method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        service: 'safaridrive-tracking',
        activeTrips: countActive(),
        time: nowIso(),
      })
    }

    // --- simulation control (platform backend only) ---
    if (path === '/sim/start' && method === 'POST') {
      if (!requireInternalKey(req)) return sendJson(res, 403, { error: 'forbidden' })
      const body = await readJson(req)
      const trip = startSim(body)
      return sendJson(res, 200, { ok: true, trip })
    }

    if (path === '/sim/stop' && method === 'POST') {
      if (!requireInternalKey(req)) return sendJson(res, 403, { error: 'forbidden' })
      const body = await readJson(req)
      const bookingId = strField(body.bookingId)
      if (!bookingId) return sendJson(res, 400, { error: 'bookingId is required' })
      const trip = trips.get(bookingId)
      if (!trip) return sendJson(res, 200, { ok: true, stopped: false })
      io.to(roomFor(bookingId)).emit('trip-state', inactiveJson(bookingId))
      trips.delete(bookingId)
      log(`sim stop booking=${bookingId} vehicle=${trip.vehicleId} (mode=${trip.mode}, source=${trip.source})`)
      return sendJson(res, 200, { ok: true, stopped: true })
    }

    // --- trip state (platform backend only; the app re-checks ownership) ---
    if (path.startsWith('/trips/') && method === 'GET') {
      if (!requireInternalKey(req)) return sendJson(res, 403, { error: 'forbidden' })
      let bookingId = path.slice('/trips/'.length)
      try {
        bookingId = decodeURIComponent(bookingId)
      } catch {
        /* keep raw */
      }
      if (!bookingId) return sendJson(res, 400, { error: 'bookingId is required' })
      return sendJson(res, 200, getState(bookingId))
    }

    // --- OSMAND / Traccar JSON ingest variant ---
    if (path === '/api/positions' && method === 'POST') {
      const body = await readJsonOrForm(req)
      const result = ingestPosition({
        id: body.id ?? body.deviceId ?? body.uniqueId,
        lat: body.lat ?? body.latitude,
        lng: body.lng ?? body.lon ?? body.longitude,
        timestamp: body.timestamp ?? body.time ?? body.fixTime,
        speed: body.speed,
        heading: body.heading ?? body.bearing ?? body.course,
      })
      return sendJson(res, 200, { status: 'ok', tripActive: result.tripActive })
    }

    // --- OSMAND protocol ingest (GPSLogger / Traccar-compatible) ---
    if (path === '/' && method === 'GET') {
      const q = u.searchParams
      const result = ingestPosition({
        id: q.get('id'),
        lat: q.get('lat'),
        lng: q.get('lng') ?? q.get('lon'),
        timestamp: q.get('timestamp') ?? q.get('time'),
        speed: q.get('speed'),
        heading: q.get('heading') ?? q.get('bearing'),
      })
      return sendJson(res, 200, { status: 'ok', tripActive: result.tripActive })
    }

    return sendJson(res, 404, { error: `no route for ${method} ${path}` })
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message })
    warn('rest handler error:', err instanceof Error ? err.message : err)
    return sendJson(res, 500, { error: 'internal error' })
  }
}

// ------------------------- socket.io + http server --------------------------

// Clean up previous instances left over from a `bun --hot` reload so the
// port can be re-bound and no duplicate tickers keep running.
if (G.__SD_TRACKING_TICKER) {
  clearInterval(G.__SD_TRACKING_TICKER)
  G.__SD_TRACKING_TICKER = undefined
}
if (G.__SD_TRACKING_IO) {
  try {
    G.__SD_TRACKING_IO.close()
  } catch {
    /* already closed */
  }
  G.__SD_TRACKING_IO = undefined
}
if (G.__SD_TRACKING_HTTP) {
  const old = G.__SD_TRACKING_HTTP
  try {
    ;(old as unknown as { closeAllConnections?: () => void }).closeAllConnections?.()
  } catch {
    /* noop */
  }
  try {
    old.close()
  } catch {
    /* already closed */
  }
  G.__SD_TRACKING_HTTP = undefined
  log('hot reload: replaced previous server instance')
}

const httpServer = createServer((req, res) => {
  void handleRest(req, res)
})

const io = new SocketIOServer(httpServer, {
  // DO NOT change the path, it is used by the gateway (Caddy) to forward
  // websocket connections from the browser to this service.
  path: '/',
  serveClient: false,
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
})
G.__SD_TRACKING_IO = io

// engine.io (socket.io) with path '/' would intercept EVERY http request on
// this port (its path check is a one-char prefix match on '/'), shadowing the
// REST API and the OSMAND ingest route. Re-register the request listeners so
// only genuine engine.io requests (query contains EIO / transport / sid) are
// forwarded to socket.io — everything else hits the REST router.
const engineHandlers = httpServer.listeners('request').slice(0) as Array<
  (req: IncomingMessage, res: ServerResponse) => void
>
httpServer.removeAllListeners('request')
httpServer.on('request', (req, res) => {
  if (isEngineIoRequest(req.url)) {
    for (const h of engineHandlers) h.call(httpServer, req, res)
  } else {
    void handleRest(req, res)
  }
})

function isEngineIoRequest(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false
  const qi = rawUrl.indexOf('?')
  if (qi < 0) return false
  return /(?:^|&)(eio|transport|sid)=/i.test(rawUrl.slice(qi + 1))
}

function extractBookingId(data: unknown): string | null {
  if (typeof data === 'string') {
    const s = data.trim()
    return s ? s.slice(0, 200) : null
  }
  if (data && typeof data === 'object') {
    return strField((data as Record<string, unknown>).bookingId)
  }
  return null
}

io.on('connection', (socket: Socket) => {
  log(`socket connected ${socket.id}`)
  socket.on('join-trip', (data: unknown) => {
    try {
      const bookingId = extractBookingId(data)
      if (!bookingId) return
      // Live GPS is sensitive: only holders of a per-booking token issued by
      // the platform (after an ownership check) may subscribe.
      const token =
        data && typeof data === 'object'
          ? (data as Record<string, unknown>).token
          : undefined
      if (!verifyJoinToken(token, bookingId)) {
        socket.emit('join-error', { bookingId, reason: 'unauthorized' })
        warn(`join-trip rejected for ${socket.id} booking=${bookingId.slice(0, 12)}..: bad token`)
        return
      }
      void socket.join(roomFor(bookingId))
      // Immediately send the full trip state (inactive shape when unknown).
      socket.emit('trip-state', getState(bookingId))
      log(`socket ${socket.id} joined ${roomFor(bookingId)}`)
    } catch (err) {
      warn(`join-trip error from ${socket.id}:`, err instanceof Error ? err.message : err)
    }
  })
  socket.on('leave-trip', (data: unknown) => {
    try {
      const bookingId = extractBookingId(data)
      if (!bookingId) return
      socket.leave(roomFor(bookingId))
      log(`socket ${socket.id} left ${roomFor(bookingId)}`)
    } catch (err) {
      warn(`leave-trip error from ${socket.id}:`, err instanceof Error ? err.message : err)
    }
  })
  socket.on('error', (err: Error) => warn(`socket ${socket.id} error: ${err.message}`))
  socket.on('disconnect', (reason: string) => {
    // Room memberships are cleaned up automatically by socket.io.
    log(`socket disconnected ${socket.id} (${reason})`)
  })
})

// ------------------------------ sim ticker ---------------------------------

function tick(): void {
  for (const trip of Array.from(trips.values())) {
    try {
      if (!trip.active || trip.source !== 'sim' || !trip.sim) continue
      const now = Date.now()
      // Use real elapsed time so pauses/suspends don't teleport the vehicle.
      const dt = clamp((now - trip.lastTickMs) / 1000, 0.2, 15)
      trip.lastTickMs = now
      const wasArrived = isArrived(trip.sim)
      stepSim(trip, dt)
      if (trip.latest) io.to(roomFor(trip.bookingId)).emit('position', trip.latest)
      trip.ticks++
      const nowArrived = isArrived(trip.sim)
      if (trip.ticks % TRIP_STATE_EVERY_TICKS === 0 || (nowArrived && !wasArrived)) {
        io.to(roomFor(trip.bookingId)).emit('trip-state', stateJson(trip))
      }
    } catch (err) {
      warn(`ticker error booking=${trip.bookingId}:`, err instanceof Error ? err.message : err)
    }
  }
}

G.__SD_TRACKING_TICKER = setInterval(tick, TICK_MS)

// ------------------------------- startup -----------------------------------

function tryListen(attemptsLeft: number): void {
  const onError = (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      // Previous instance (hot reload) may still be unbinding the port.
      setTimeout(() => tryListen(attemptsLeft - 1), 300)
    } else {
      log(`FATAL: cannot listen on port ${PORT}: ${err.message}`)
      process.exit(1)
    }
  }
  httpServer.once('error', onError)
  httpServer.listen(PORT, () => {
    httpServer.removeListener('error', onError)
    httpServer.on('error', (e) => warn('server error:', e.message))
    G.__SD_TRACKING_HTTP = httpServer
    log('SafariDrive tracking service')
    log(`  listening on port ${PORT}`)
    log(`  REST   : POST /sim/start | POST /sim/stop | GET /trips/:bookingId | GET /health`)
    log(`  OSMAND : GET /?id=<vehicleId>&lat=&lon=&timestamp=&speed=&heading= | POST /api/positions`)
    log(`  socket : path '/', rooms booking:{id} (join-trip / leave-trip -> trip-state / position)`)
    log(`  ticker : ${TICK_MS}ms, active trips: ${countActive()}`)
  })
}

process.on('uncaughtException', (err) => warn('uncaughtException:', err.message))
process.on('unhandledRejection', (err) =>
  warn('unhandledRejection:', err instanceof Error ? err.message : String(err)),
)
process.on('SIGTERM', () => {
  log('SIGTERM received, shutting down')
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  log('SIGINT received, shutting down')
  httpServer.close(() => process.exit(0))
})

tryListen(20)
