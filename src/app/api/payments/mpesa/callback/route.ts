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
 * Accepts BOTH shapes:
 *  - mock:   `{checkoutRequestId, result: 'success'|'failed', phone?}` — ONLY in
 *            mock mode AND outside production AND called by the booking's own
 *            customer (the demo phone-prompt dialog). In daraja mode, in
 *            production, or from any other caller this shape is rejected so
 *            nobody can complete a payment by replaying the demo protocol.
 *  - Daraja: `{Body: {stkCallback: {ResultCode, CheckoutRequestID, CallbackMetadata}}}}`
 *            — the only accepted shape in daraja mode. When
 *            MPESA_CALLBACK_SECRET is configured, the caller must also present
 *            it in `x-callback-secret` (Safaricom can be pointed at a
 *            secret-bearing URL; this covers the official lack of callback
 *            signatures until IP allowlisting is in place).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const mode = (process.env.MPESA_MODE ?? 'mock').toLowerCase()
    if (mode === 'mock' && process.env.NODE_ENV === 'production') {
      // The demo payment protocol must never ship: a production deployment
      // that forgot MPESA_MODE=daraja gets it hard-disabled here.
      throw new ApiError(403, 'Forbidden')
    }
    const callbackSecret = process.env.MPESA_CALLBACK_SECRET
    if (mode === 'daraja' && callbackSecret) {
      const presented = req.headers.get('x-callback-secret') ?? new URL(req.url).searchParams.get('secret')
      if (presented !== callbackSecret) {
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

    if (payment.status === 'COMPLETED' || payment.status === 'REFUNDED') {
      // Idempotent: already processed
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
