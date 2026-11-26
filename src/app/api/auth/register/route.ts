import { NextResponse } from 'next/server'
import { createSession, hashPassword } from '@/lib/auth'
import { db } from '@/lib/db'
import { ApiError, handle, oneOf, readJson, requireString } from '@/app/api/_lib/api'
import type { SessionUser } from '@/lib/types'

// Small denylist of the most-abused passwords (a real breached-password
// check needs an external service; this catches the obvious cases offline).
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyuiop', 'letmein1', 'welcome1', 'admin123', 'administrator1',
  'iloveyou1', 'sunshine1', 'princess1', 'football1', 'abc12345', 'aaaaaaaa',
  'safaridrive', 'safaridrive1', 'demo1234', 'test1234', 'passw0rd', 'p@ssw0rd',
])

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req)
    const name = requireString(body.name, 'Name', { min: 2, max: 80 })
    const email = requireString(body.email, 'Email', { max: 120 }).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Enter a valid email address')
    const password = requireString(body.password, 'Password', { min: 8, max: 100 })
    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
      throw new ApiError(400, 'That password is too common — choose something less predictable')
    }
    const role = oneOf(body.role, 'Role', ['CUSTOMER', 'OWNER'] as const)
    const phoneRaw = typeof body.phone === 'string' ? body.phone.trim() : ''
    const phone = phoneRaw || null
    if (phone && !/^\+?[0-9\s-]{7,20}$/.test(phone)) {
      throw new ApiError(400, 'Enter a valid phone number')
    }

    const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) throw new ApiError(400, 'An account with this email already exists')

    const user = await db.user.create({
      data: { name, email, phone, role, passwordHash: await hashPassword(password), status: 'ACTIVE' },
    })
    await createSession(user.id)

    const session: SessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role as SessionUser['role'],
    }
    return NextResponse.json({ user: session })
  })
}
