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
    const password = requireString(body.password, 'Password')

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new ApiError(401, 'Invalid email or password')
    }
    if (user.status !== 'ACTIVE') {
      throw new ApiError(401, 'This account has been suspended')
    }
    if (!ROLES.includes(user.role as Role)) {
      throw new ApiError(401, 'This account cannot sign in')
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
