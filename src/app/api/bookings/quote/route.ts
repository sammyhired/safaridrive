import { NextResponse } from 'next/server'
import { handle, readJson } from '@/app/api/_lib/api'
import { buildQuoteContext } from '@/app/api/_lib/quote-flow'

/** Public quote endpoint — totals are always computed server-side. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req)
    const { quote } = await buildQuoteContext(body)
    return NextResponse.json({ quote })
  })
}
