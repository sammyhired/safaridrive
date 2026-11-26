import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
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
 *            mock mode (local demos). In daraja mode this shape is rejected so
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
      // Demo protocol: only reachable when the platform itself runs in mock mode
      const mock = body as { checkoutRequestId?: string; result?: string }
      checkoutRequestId = typeof mock.checkoutRequestId === 'string' ? mock.checkoutRequestId : null
      success = mock.result === 'success'
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
