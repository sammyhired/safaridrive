// ============================================================
// SafariDrive API security middleware
//
// Runs before every /api/* route handler:
//   1. Cross-origin guard — browsers always attach an Origin header to
//      cross-site POST/PATCH/PUT/DELETE. If one is present and its host is
//      neither this deployment's host (Host / x-forwarded-host) nor on the
//      ALLOWED_ORIGINS list, the request is refused. Requests without Origin
//      (curl, Safaricom Daraja callbacks, native GPS trackers) pass — they
//      are not browsers and cannot mount CSRF.
//   2. Tiered rate limiting per client IP (in-memory; single-instance).
//   3. HSTS on https requests.
//
// Edge runtime: no Node APIs here — plain JS only.
// ============================================================
import { NextResponse, type NextRequest } from 'next/server'

type Bucket = { count: number; resetAt: number }

// module-scope: one map per server instance, pruned on demand
const buckets = new Map<string, Bucket>()
let lastPrune = 0

function prune(now: number): void {
  if (now - lastPrune < 30_000) return
  lastPrune = now
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0].trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip') ?? 'local'
}

/** Strip default ports so Origin https://host == Host host:443. */
function normalizeHost(host: string | null): string {
  if (!host) return ''
  const h = host.trim().toLowerCase()
  if (h.endsWith(':443') && h.startsWith('https')) return h.slice(0, -4)
  return h.replace(/:(443|80)$/, '')
}

function originHost(origin: string | null): string {
  if (!origin) return ''
  try {
    return normalizeHost(new URL(origin).host)
  } catch {
    return ''
  }
}

// (limit, windowMs) per route class; fall back to the default tier
function tier(path: string, method: string): { limit: number; windowMs: number } {
  if (path === '/api/auth/login' || path === '/api/auth/register') {
    return { limit: 10, windowMs: 5 * 60_000 }
  }
  if (path.startsWith('/api/payments/')) {
    return { limit: 30, windowMs: 5 * 60_000 }
  }
  if (path === '/api/bookings/quote' || path === '/api/bookings' || path === '/api/promo/validate') {
    return { limit: 90, windowMs: 5 * 60_000 }
  }
  if (path.startsWith('/api/tracking/')) {
    return { limit: 120, windowMs: 5 * 60_000 }
  }
  if (method === 'GET' || method === 'HEAD') {
    return { limit: 400, windowMs: 5 * 60_000 }
  }
  return { limit: 120, windowMs: 5 * 60_000 }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const method = req.method.toUpperCase()

  // ---- 1. Cross-origin guard for state-changing requests ----
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const origin = req.headers.get('origin')
    if (origin) {
      const allowed = new Set<string>()
      const host = normalizeHost(req.headers.get('host'))
      if (host) allowed.add(host)
      const fwdHost = normalizeHost(req.headers.get('x-forwarded-host'))
      if (fwdHost) allowed.add(fwdHost)
      for (const o of (process.env.ALLOWED_ORIGINS ?? '').split(',')) {
        const h = normalizeHost(o)
        if (h) allowed.add(h)
      }
      const oh = originHost(origin)
      if (!oh || !allowed.has(oh)) {
        return NextResponse.json(
          { error: 'Cross-origin request rejected' },
          { status: 403 },
        )
      }
    }
  }

  // ---- 2. Rate limiting ----
  const now = Date.now()
  prune(now)
  const { limit, windowMs } = tier(pathname, method)
  const key = `${clientIp(req)}:${method === 'GET' || method === 'HEAD' ? 'r' : 'w'}:${pathname}`
  const existing = buckets.get(key)
  let count: number
  let resetAt: number
  if (!existing || existing.resetAt <= now) {
    count = 1
    resetAt = now + windowMs
    buckets.set(key, { count, resetAt })
  } else {
    existing.count += 1
    count = existing.count
    resetAt = existing.resetAt
  }
  if (count > limit) {
    const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000))
    const res = NextResponse.json(
      { error: 'Too many requests — slow down and try again shortly' },
      { status: 429 },
    )
    res.headers.set('Retry-After', String(retryAfter))
    return res
  }

  // ---- 3. HSTS when already on https ----
  const res = NextResponse.next()
  if ((req.headers.get('x-forwarded-proto') ?? '').split(',')[0].trim() === 'https') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  return res
}

export const config = {
  matcher: '/api/:path*',
}
