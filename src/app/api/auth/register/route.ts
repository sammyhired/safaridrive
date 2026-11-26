import { NextResponse } from 'next/server'
import { createSession, hashPassword } from '@/lib/auth'
import { db } from '@/lib/db'
import { ApiError, handle, oneOf, readJson, requireString } from '@/app/api/_lib/api'
import type { SessionUser } from '@/lib/types'

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req)
    const name = requireString(body.name, 'Name', { min: 2, max: 80 })
    const email = requireString(body.email, 'Email', { max: 120 }).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Enter a valid email address')
    const password = requireString(body.password, 'Password', { min: 6, max: 100 })
    const role = oneOf(body.role, 'Role', ['CUSTOMER', 'OWNER'] as const)
    const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null

    const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) throw new ApiError(400, 'An account with this email already exists')

    const user = await db.user.create({
      data: { name, email, phone, role, passwordHash: hashPassword(password), status: 'ACTIVE' },
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
