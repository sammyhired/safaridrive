import { NextResponse } from 'next/server'
import { createSession, verifyPassword } from '@/lib/auth'
import { db } from '@/lib/db'
import { ApiError, handle, readJson, requireString } from '@/app/api/_lib/api'
import type { Role, SessionUser } from '@/lib/types'

const ROLES: Role[] = ['CUSTOMER', 'OWNER', 'DRIVER', 'ADMIN']

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req)
    const email = requireString(body.email, 'Email', { max: 120 }).toLowerCase()
    const password = requireString(body.password, 'Password', { max: 200 })

    const user = await db.user.findUnique({ where: { email } })
    // Single generic failure for every reason (no user / wrong password /
    // suspended / unknown role) — prevents account enumeration. The dummy
    // verify for missing users equalizes the timing side-channel too.
    let ok = false
    if (user) {
      ok = await verifyPassword(password, user.passwordHash)
    } else {
      // Consume comparable scrypt time so "no such user" is not measurably
      // faster than "wrong password" (email enumeration via latency).
      await verifyPassword(password, 'malformed-hash')
    }
    const allowed = ok && user !== null && user.status === 'ACTIVE' && ROLES.includes(user.role as Role)
    if (!allowed || !user) {
      throw new ApiError(401, 'Invalid email or password')
    }

    await createSession(user.id)
    const session: SessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role as Role,
    }
    return NextResponse.json({ user: session })
  })
}
