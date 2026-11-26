import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { handle } from '@/app/api/_lib/api'

export async function GET() {
  return handle(async () => {
    const user = await getSessionUser()
    return NextResponse.json({ user })
  })
}
