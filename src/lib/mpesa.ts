// ============================================================
// SafariDrive — M-Pesa adapter (CONTRACTS §5)
// MPESA_MODE=mock (default) | daraja (Safaricom sandbox)
// ============================================================

export interface StkPushResult {
  checkoutRequestId: string
  merchantRequestId?: string
  customerMessage?: string
}

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function randomAlnum(len: number): string {
  let out = ''
  for (let i = 0; i < len; i++) out += ALNUM[Math.floor(Math.random() * ALNUM.length)]
  return out
}

/** Mock receipt: SD + 10 uppercase alphanumeric chars. */
export function generateReceipt(): string {
  return `SD${randomAlnum(10)}`
}

function mockStkPush(): StkPushResult {
  return {
    checkoutRequestId: `ws_CO_${Date.now()}_${randomAlnum(6)}`,
    merchantRequestId: `${Date.now()}-${randomAlnum(6)}`,
    customerMessage: 'Success. Request accepted for processing',
  }
}

// ---------- Daraja (sandbox) ----------
function darajaConfig() {
  return {
    key: process.env.MPESA_CONSUMER_KEY,
    secret: process.env.MPESA_CONSUMER_SECRET,
    shortcode: process.env.MPESA_SHORTCODE,
    passkey: process.env.MPESA_PASSKEY,
    callbackUrl: process.env.MPESA_CALLBACK_URL,
  }
}

function darajaTimestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

async function darajaAccessToken(): Promise<string> {
  const { key, secret } = darajaConfig()
  if (!key || !secret) throw new Error('Daraja credentials not configured (MPESA_CONSUMER_KEY/SECRET)')
  const auth = Buffer.from(`${key}:${secret}`).toString('base64')
  const res = await fetch('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Daraja OAuth failed (${res.status})`)
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error('Daraja OAuth returned no token')
  return data.access_token
}

async function darajaStkPush(phone: string, amount: number, accountReference: string): Promise<StkPushResult> {
  const { shortcode, passkey, callbackUrl } = darajaConfig()
  if (!shortcode || !passkey || !callbackUrl) {
    throw new Error('Daraja STK config missing (MPESA_SHORTCODE/PASSKEY/CALLBACK_URL)')
  }
  const timestamp = darajaTimestamp()
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64')
  const token = await darajaAccessToken()
  const res = await fetch('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: accountReference,
      TransactionDesc: 'SafariDrive car rental',
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const data = (await res.json().catch(() => null)) as {
    CheckoutRequestID?: string
    MerchantRequestID?: string
    CustomerMessage?: string
    errorMessage?: string
  } | null
  if (!res.ok || !data?.CheckoutRequestID) {
    throw new Error(data?.errorMessage ?? `Daraja STK push failed (${res.status})`)
  }
  return {
    checkoutRequestId: data.CheckoutRequestID,
    merchantRequestId: data.MerchantRequestID,
    customerMessage: data.CustomerMessage,
  }
}

/**
 * Initiate an STK push. In mock mode this returns immediately with a
 * simulated checkoutRequestId; in daraja mode it calls the Safaricom sandbox.
 */
export async function initiateStkPush(
  phone: string,
  amount: number,
  accountReference: string,
): Promise<StkPushResult> {
  const mode = (process.env.MPESA_MODE ?? 'mock').toLowerCase()
  if (mode === 'daraja') {
    return darajaStkPush(phone, amount, accountReference)
  }
  return mockStkPush()
}
