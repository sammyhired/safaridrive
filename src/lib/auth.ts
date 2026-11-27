// ============================================================
// SafariDrive — session auth (HMAC-signed `sd_session` cookie)
// Runs in Node runtime route handlers. No server actions.
//
// Security properties:
//  - HMAC-SHA256 over the payload, verified with timingSafeEqual
//  - payload carries an absolute expiry (`exp`); stolen tokens die
//  - scrypt (N=16384 default) with per-user salt, timing-safe compare
//  - httpOnly + SameSite=Lax cookie; `secure` when the request is https
//    (x-forwarded-proto, set by the gateway) so logins survive both the
//    http dev server and the https production front door
// ============================================================
import crypto from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from './db'
import type { Role, SessionUser } from './types'

export const SESSION_COOKIE = 'sd_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days (short-lived by default)

const ROLES: Role[] = ['CUSTOMER', 'OWNER', 'DRIVER', 'ADMIN']

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters')
  return secret
}

function sign(payloadB64: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(payloadB64).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

// ---------- Password hashing (scrypt, "salt:hash" hex) ----------
// Async wrapper: scryptSync blocks the event loop and is trivially used
// for CPU-exhaustion by spamming login attempts.
const scryptAsync = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => (err ? reject(err) : resolve(derived)))
  })

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = (await scryptAsync(password, salt)).toString('hex')
  return `${salt}:${hash}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) {
    // Consume comparable time so "malformed hash" isn't distinguishable by timing
    await scryptAsync(password, '0000000000000000')
    return false
  }
  const expected = Buffer.from(hash, 'hex')
  const candidate = await scryptAsync(password, salt)
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate)
}

// ---------- Session cookie ----------
async function isSecureRequest(): Promise<boolean> {
  const h = await headers()
  const proto = h.get('x-forwarded-proto')
  if (proto) return proto.split(',')[0].trim() === 'https'
  return false
}

export async function createSession(userId: string): Promise<void> {
  // Bind the token to the user's current session epoch: bumping the epoch
  // (admin suspend / future password change) instantly revokes every cookie
  // minted before the bump.
  const user = await db.user.findUnique({ where: { id: userId }, select: { sessionEpoch: true } })
  const epoch = user?.sessionEpoch ?? 0
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
  const payload = Buffer.from(JSON.stringify({ userId, epoch, exp }), 'utf8').toString('base64url')
  const token = `${payload}.${sign(payload)}`
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: await isSecureRequest(),
    path: '/',
    maxAge: SESSION_MAX_AGE,
    sameSite: 'lax',
  })
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: await isSecureRequest(),
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
  })
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  if (!payload || !signature) return null
  if (!safeEqual(signature, sign(payload))) return null

  let data: { userId?: unknown; epoch?: unknown; exp?: unknown }
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof data.userId !== 'string' || !data.userId) return null
  if (typeof data.exp !== 'number' || data.exp * 1000 < Date.now()) return null
  // Tokens minted before the user's current epoch are revoked (pre-epoch
  // tokens without the field are also rejected — one-time global logout).
  if (typeof data.epoch !== 'number') return null

  const user = await db.user.findFirst({ where: { id: data.userId, status: 'ACTIVE' } })
  if (!user) return null
  if (data.epoch !== user.sessionEpoch) return null
  if (!ROLES.includes(user.role as Role)) return null
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role as Role,
  }
}

/**
 * Returns the session user or throws a JSON `Response` (401/403).
 * Use inside route handlers wrapped by the `handle()` helper:
 *   const user = await requireUser(['OWNER'])
 */
export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) {
    throw NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    throw NextResponse.json({ error: 'You do not have permission to perform this action' }, { status: 403 })
  }
  return user
}
