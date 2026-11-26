import { NextResponse } from 'next/server'
import { destroySession } from '@/lib/auth'
import { handle } from '@/app/api/_lib/api'

export async function POST() {
  return handle(async () => {
    await destroySession()
    return NextResponse.json({ ok: true })
  })
}
