// ============================================================
// SafariDrive — session auth (HMAC-signed `sd_session` cookie)
// Runs in Node runtime route handlers. No server actions.
// ============================================================
import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from './db'
import type { Role, SessionUser } from './types'

export const SESSION_COOKIE = 'sd_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

const ROLES: Role[] = ['CUSTOMER', 'OWNER', 'DRIVER', 'ADMIN']

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
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
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const candidate = crypto.scryptSync(password, salt, 64)
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate)
}

// ---------- Session cookie ----------
export async function createSession(userId: string): Promise<void> {
  const payload = Buffer.from(JSON.stringify({ userId }), 'utf8').toString('base64url')
  const token = `${payload}.${sign(payload)}`
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    path: '/',
    maxAge: SESSION_MAX_AGE,
    sameSite: 'lax',
  })
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0, sameSite: 'lax' })
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

  let data: { userId?: unknown }
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof data.userId !== 'string' || !data.userId) return null

  const user = await db.user.findFirst({ where: { id: data.userId, status: 'ACTIVE' } })
  if (!user) return null
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
