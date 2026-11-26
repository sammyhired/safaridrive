// ============================================================================
// Throwaway integration test for the SafariDrive tracking service (Task 2-b).
// Connects directly to http://localhost:3003 (server-side test — the browser
// would go through the gateway with ?XTransformPort=3003, not applicable here).
//
// Run: cd mini-services/tracking-service && bun test-client.ts
// Exits 0 when all assertions pass, 1 otherwise.
// ============================================================================

import { io } from 'socket.io-client'

const BASE = 'http://localhost:3003'
const BOOKING = 'test-socket-' + Date.now()
const VEHICLE = 'test-socket-veh'

function fail(msg: string): never {
  console.error('FAIL:', msg)
  process.exit(1)
}
const pass = (msg: string) => console.log('PASS:', msg)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface TripState {
  bookingId: string | null
  active: boolean
  mode: string | null
  label: string | null
  latest: { lat: number; lng: number; speed: number; heading: number; ts: string } | null
  path: { lat: number; lng: number }[]
  from: { lat: number; lng: number } | null
  to: { lat: number; lng: number } | null
  progress: number
  etaMin: number | null
  source: string | null
  vehicleId: string | null
  startedAt: string | null
}

async function main() {
  // --- hard timeout so the script can never hang ---
  const timer = setTimeout(() => fail('overall timeout (20s)'), 20000)
  timer.unref()

  // 1. health
  const health = (await fetch(`${BASE}/health`).then((r) => r.json()).catch(() => null)) as
    | { ok: boolean }
    | null
  if (!health?.ok) fail(`health check failed: ${JSON.stringify(health)}`)
  pass('/health -> {ok:true}')

  // 2. start a DELIVERY sim (socket path must be '/', websocket preferred)
  const start = (await fetch(`${BASE}/sim/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingId: BOOKING,
      vehicleId: VEHICLE,
      from: { lat: -1.2649, lng: 36.8039 }, // Westlands, Nairobi
      to: { lat: -1.2921, lng: 36.781 }, // Kilimani, Nairobi
      mode: 'DELIVERY',
      label: 'Toyota Axio',
    }),
  }).then((r) => r.json())) as { ok: boolean; trip: TripState }
  if (!start?.trip?.active || start.trip.mode !== 'DELIVERY') {
    fail(`sim/start did not return an active DELIVERY trip: ${JSON.stringify(start)}`)
  }
  pass(`sim/start -> active DELIVERY trip (progress=${start.trip.progress}, etaMin=${start.trip.etaMin})`)

  // 3. connect socket (path '/', transports websocket+polling like the real frontend)
  const socket = io(`${BASE}/`, {
    path: '/',
    transports: ['websocket', 'polling'],
    reconnection: false,
    timeout: 8000,
  })

  let gotState: TripState | null = null
  let gotPosition: { lat: number; lng: number; speed: number; heading: number; ts: string } | null =
    null

  socket.on('connect_error', (err: Error) => fail(`socket connect error: ${err.message}`))
  socket.on('trip-state', (t: TripState) => {
    if (t && t.bookingId === BOOKING && !gotState) gotState = t
  })
  socket.on('position', (p: typeof gotPosition) => {
    if (p && !gotPosition) gotPosition = p
  })

  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve())
    setTimeout(() => reject(new Error('socket did not connect within 8s')), 8000)
  })
  pass('socket.io connected (path "/", websocket transport)')

  // 4. join the trip room -> expect immediate trip-state + a position within 5s
  socket.emit('join-trip', { bookingId: BOOKING })

  const deadline = Date.now() + 5000
  while (!(gotState && gotPosition) && Date.now() < deadline) await sleep(100)
  if (!gotState) fail('did not receive trip-state within 5s of join-trip')
  if (!gotState.active || gotState.bookingId !== BOOKING || gotState.mode !== 'DELIVERY') {
    fail(`unexpected trip-state payload: ${JSON.stringify(gotState)}`)
  }
  pass(`trip-state received: active=${gotState.active} mode=${gotState.mode} source=${gotState.source} path=${gotState.path.length}pts`)

  if (!gotPosition) fail('did not receive position event within 5s')
  const { lat, lng, speed, heading, ts } = gotPosition!
  if (typeof lat !== 'number' || typeof lng !== 'number' || typeof speed !== 'number' || typeof heading !== 'number' || typeof ts !== 'string') {
    fail(`malformed position payload: ${JSON.stringify(gotPosition)}`)
  }
  if (speed < 20 || speed > 120) fail(`implausible speed in position event: ${speed}`)
  pass(`position received: ${lat.toFixed(5)},${lng.toFixed(5)} speed=${speed}km/h heading=${heading} ts=${ts}`)

  // 5. leave + stop + verify inactive via REST
  socket.emit('leave-trip', { bookingId: BOOKING })
  socket.disconnect()
  const stop = (await fetch(`${BASE}/sim/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: BOOKING }),
  }).then((r) => r.json())) as { ok: boolean; stopped: boolean }
  if (!stop?.stopped) fail(`sim/stop did not stop the trip: ${JSON.stringify(stop)}`)
  pass('sim/stop -> {ok:true, stopped:true}')

  const after = (await fetch(`${BASE}/trips/${BOOKING}`).then((r) => r.json())) as TripState
  if (after.active !== false || after.latest !== null || after.path.length !== 0 || after.mode !== null) {
    fail(`trip should be inactive after stop: ${JSON.stringify(after)}`)
  }
  pass('GET /trips after stop -> inactive shape {active:false, latest:null, path:[], mode:null}')

  clearTimeout(timer)
  console.log('ALL SOCKET TESTS PASSED')
  process.exit(0)
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
