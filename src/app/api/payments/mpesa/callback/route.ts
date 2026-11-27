import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { generateReceipt } from '@/lib/mpesa'
import { ApiError, handle } from '@/app/api/_lib/api'
import { completePayment } from '@/app/api/_lib/payments'
import { serializePayment } from '@/app/api/_lib/serialize'

interface DarajaCallbackItem {
  Name?: string
  Value?: string | number
}

interface DarajaCallback {
  ResultCode?: number
  ResultDesc?: string
  CheckoutRequestID?: string
  CallbackMetadata?: { Item?: DarajaCallbackItem[] }
}

/**
 * Callback shape matrix (fail-closed on every cell):
 *  - mode "mock" (never allowed in production): ONLY the mock demo protocol
 *    `{checkoutRequestId, result, phone?}` — and ONLY when called by the
 *    booking's own customer session. Any daraja-shaped body is rejected.
 *  - mode "daraja": ONLY the official Safaricom shape
 *    `{Body: {stkCallback: {ResultCode, CheckoutRequestID, CallbackMetadata}}}`
 *    — and MPESA_CALLBACK_SECRET is REQUIRED (no secret configured = the
 *    endpoint refuses with 503; an unset secret must never mean "trust any
 *    caller"). The secret must arrive in the `x-callback-secret` header
 *    (never a query string, which leaks into access logs) and is compared
 *    with a timing-safe compare.
 *  - any other MPESA_MODE value: refused (a typo like "Daraja " must not
 *    silently fall back to a weaker path).
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

export async function POST(req: Request) {
  return handle(async () => {
    const mode = (process.env.MPESA_MODE ?? 'mock').trim().toLowerCase()
    if (mode !== 'mock' && mode !== 'daraja') {
      throw new ApiError(503, 'Payment gateway misconfigured')
    }
    if (mode === 'mock' && process.env.NODE_ENV === 'production') {
      // The demo payment protocol must never ship: a production deployment
      // that forgot MPESA_MODE=daraja gets it hard-disabled here.
      throw new ApiError(403, 'Forbidden')
    }
    if (mode === 'daraja') {
      // Fail-closed: an unauthenticated callback URL would let ANYONE forge
      // "payment received" by knowing the URL. No secret configured = no
      // callbacks accepted at all.
      const callbackSecret = process.env.MPESA_CALLBACK_SECRET
      if (!callbackSecret) {
        throw new ApiError(503, 'Payment gateway misconfigured')
      }
      const presented = req.headers.get('x-callback-secret')
      if (!presented || !timingSafeEqualStr(presented, callbackSecret)) {
        throw new ApiError(403, 'Forbidden')
      }
    }

    const body = (await req.json().catch(() => null)) as
      | { checkoutRequestId?: string; result?: string; phone?: string }
      | { Body?: { stkCallback?: DarajaCallback } }
      | null
    if (!body || typeof body !== 'object') throw new ApiError(400, 'Invalid callback body')

    let checkoutRequestId: string | null = null
    let success = false
    let darajaReceipt: string | null = null
    let isMockProtocol = false

    const daraja = (body as { Body?: { stkCallback?: DarajaCallback } }).Body?.stkCallback
    if (daraja && typeof daraja === 'object' && (daraja.ResultCode !== undefined || daraja.CheckoutRequestID)) {
      if (mode !== 'daraja') {
        // daraja-shaped payloads are only ever accepted in daraja mode
        throw new ApiError(400, 'Unsupported callback payload')
      }
      checkoutRequestId = daraja.CheckoutRequestID ?? null
      success = Number(daraja.ResultCode) === 0
      const items = daraja.CallbackMetadata?.Item ?? []
      for (const item of items) {
        if (item.Name === 'MpesaReceiptNumber' && typeof item.Value === 'string') {
          darajaReceipt = item.Value
        }
      }
    } else if (mode === 'mock') {
      // Demo protocol: only reachable when the platform itself runs in mock
      // mode (never in production — see the guard above)
      const mock = body as { checkoutRequestId?: string; result?: string }
      checkoutRequestId = typeof mock.checkoutRequestId === 'string' ? mock.checkoutRequestId : null
      success = mock.result === 'success'
      isMockProtocol = true
    } else {
      throw new ApiError(400, 'Unsupported callback payload')
    }

    if (!checkoutRequestId) throw new ApiError(400, 'checkoutRequestId missing from callback')

    const payment = await db.payment.findFirst({
      where: { checkoutRequestId },
      orderBy: { createdAt: 'desc' },
      include: { booking: true },
    })
    if (!payment) throw new ApiError(404, 'Unknown checkoutRequestId')

    // The demo protocol is further restricted to the paying customer's own
    // session — a leaked checkoutRequestId alone can no longer complete it.
    if (isMockProtocol) {
      const user = await getSessionUser()
      if (!user || payment.booking.customerId !== user.id) {
        throw new ApiError(403, 'Forbidden')
      }
    }

    if (payment.status === 'COMPLETED' || payment.status === 'REFUNDED' || payment.status === 'FAILED') {
      // Idempotent: already processed (FAILED attempts stay failed — a late
      // duplicate callback cannot resurrect a superseded STK attempt)
      return NextResponse.json({ payment: serializePayment(payment) })
    }

    if (success) {
      const updated = await completePayment(payment.id, darajaReceipt ?? generateReceipt())
      return NextResponse.json({ payment: serializePayment(updated) })
    }

    const failed = await db.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED' },
    })
    return NextResponse.json({ payment: serializePayment(failed) })
  })
}
