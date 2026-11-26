'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  CreditCard,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  XCircle,
} from 'lucide-react'
import { useSession } from '@/hooks/use-session'
import { useToast } from '@/hooks/use-toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiPost } from '@/lib/api'
import { formatKes } from '@/lib/format'
import type { Booking, PaymentSummary } from '@/lib/types'
import { cn } from '@/lib/utils'
import { errorMessage } from './ui-bits'
import { isValidPhone, normalizePhone } from './filters'
import MpesaSim from './mpesa-sim'

type Stage = 'form' | 'stk' | 'success' | 'failed'

interface PaymentStepProps {
  booking: Booking
  finishLabel: string
  onPaid: (payment: PaymentSummary) => void
}

/** M-Pesa / Card payment UI with simulated STK prompt and success screen. */
export function PaymentStep({ booking, finishLabel, onPaid }: PaymentStepProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useSession()

  const [method, setMethod] = useState<'MPESA' | 'CARD'>('MPESA')
  const [stage, setStage] = useState<Stage>('form')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paid, setPaid] = useState<PaymentSummary | null>(null)

  // M-Pesa state
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [stkPayment, setStkPayment] = useState<PaymentSummary | null>(null)

  // Card state
  const [cardNumber, setCardNumber] = useState('')
  const [cardName, setCardName] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')

  const phoneOk = isValidPhone(phone)

  function succeed(payment: PaymentSummary) {
    setPaid(payment)
    setStage('success')
    toast({
      title: 'Payment received',
      description: `${formatKes(payment.amount)} paid · Receipt ${payment.receiptNo ?? 'pending'}`,
    })
    queryClient.invalidateQueries()
  }

  async function startStk() {
    if (!phoneOk) return
    setBusy(true)
    setError(null)
    try {
      const { payment } = await apiPost<{ payment: PaymentSummary }>('/api/payments/mpesa/stk', {
        bookingId: booking.id,
        phone: normalizePhone(phone),
      })
      setStkPayment(payment)
      setStage('stk')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function completeStk(result: 'success' | 'failed') {
    if (!stkPayment?.checkoutRequestId) return
    setBusy(true)
    try {
      const { payment } = await apiPost<{ payment: PaymentSummary }>('/api/payments/mpesa/callback', {
        checkoutRequestId: stkPayment.checkoutRequestId,
        result,
      })
      if (payment.status === 'COMPLETED') {
        succeed(payment)
      } else {
        setError('The M-Pesa request was declined or failed. No money was charged.')
        setStage('failed')
      }
    } catch (e) {
      setError(errorMessage(e))
      setStage('failed')
    } finally {
      setBusy(false)
    }
  }

  const cardDigits = cardNumber.replace(/\D/g, '')
  const expiryOk = isExpiryValid(expiry)
  const cvvOk = /^\d{3}$/.test(cvv)
  const cardOk =
    cardDigits.length === 16 &&
    luhnValid(cardDigits) &&
    cardName.trim().length >= 3 &&
    expiryOk &&
    cvvOk

  async function payCard() {
    if (!cardOk) return
    setBusy(true)
    setError(null)
    try {
      const { payment } = await apiPost<{ payment: PaymentSummary }>('/api/payments/card', {
        bookingId: booking.id,
        cardNumber: cardDigits,
        cardName: cardName.trim(),
        expiry,
        cvv,
      })
      succeed(payment)
    } catch (e) {
      setError(errorMessage(e))
      setStage('failed')
    } finally {
      setBusy(false)
    }
  }

  // ---- Success screen ----
  if (stage === 'success' && paid) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center py-6 text-center"
      >
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 }}
        >
          <CheckCircle2 aria-hidden className="h-14 w-14 text-primary" />
        </motion.div>
        <h3 className="mt-4 text-lg font-semibold">Payment received</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatKes(paid.amount)} paid via {paid.method === 'MPESA' ? 'M-Pesa' : 'card'}
        </p>
        <div className="mt-5 w-full max-w-xs space-y-1.5 rounded-lg border bg-muted/40 p-4 text-sm">
          <p className="flex justify-between gap-2">
            <span className="text-muted-foreground">Receipt</span>
            <span className="font-mono font-semibold">{paid.receiptNo ?? '—'}</span>
          </p>
          <p className="flex justify-between gap-2">
            <span className="text-muted-foreground">Booking</span>
            <span className="font-mono font-semibold">{booking.reference}</span>
          </p>
        </div>
        <Button className="mt-6 h-11 w-full max-w-xs" onClick={() => onPaid(paid)}>
          {finishLabel}
        </Button>
      </motion.div>
    )
  }

  // ---- Simulated STK prompt ----
  if (stage === 'stk' && stkPayment) {
    return (
      <MpesaSim
        amount={booking.total}
        phone={normalizePhone(phone)}
        onResult={completeStk}
        onCancel={() => setStage('form')}
      />
    )
  }

  // ---- Failed screen ----
  if (stage === 'failed') {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <XCircle aria-hidden className="h-14 w-14 text-destructive" />
        <h3 className="mt-4 text-lg font-semibold">Payment not completed</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {error ?? 'The payment request failed. You can retry or use another method.'}
        </p>
        <Button variant="outline" className="mt-6 h-11" onClick={() => { setError(null); setStage('form') }}>
          <RotateCcw aria-hidden className="h-4 w-4" /> Retry payment
        </Button>
      </div>
    )
  }

  // ---- Form ----
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-4 py-3">
        <div>
          <p className="text-sm font-medium">{booking.vehicle.label}</p>
          <p className="font-mono text-xs text-muted-foreground">{booking.reference}</p>
        </div>
        <p className="text-lg font-bold tabular-nums">{formatKes(booking.total)}</p>
      </div>

      <Tabs value={method} onValueChange={(v) => setMethod(v as 'MPESA' | 'CARD')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="MPESA" className="gap-1.5 py-2.5">
            <Smartphone aria-hidden className="h-4 w-4" /> M-Pesa
          </TabsTrigger>
          <TabsTrigger value="CARD" className="gap-1.5 py-2.5">
            <CreditCard aria-hidden className="h-4 w-4" /> Card
          </TabsTrigger>
        </TabsList>

        <TabsContent value="MPESA" className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mpesa-phone">M-Pesa phone number</Label>
            <Input
              id="mpesa-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="07XX XXX XXX"
              className="h-11 font-mono"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, ''))}
              aria-invalid={!phoneOk && phone.length > 0}
            />
            <p className={cn('text-xs', phoneOk || phone.length === 0 ? 'text-muted-foreground' : 'text-destructive')}>
              {phoneOk || phone.length === 0
                ? 'You will receive an STK push prompt on this number.'
                : 'Enter a valid Safaricom number, e.g. 0722 000 001.'}
            </p>
          </div>
          <Button className="h-11 w-full" disabled={!phoneOk || busy} onClick={startStk}>
            {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Smartphone aria-hidden className="h-4 w-4" />}
            Pay {formatKes(booking.total)}
          </Button>
        </TabsContent>

        <TabsContent value="CARD" className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="card-number">Card number</Label>
            <Input
              id="card-number"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="4242 4242 4242 4242"
              className="h-11 font-mono"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-name">Name on card</Label>
            <Input
              id="card-name"
              autoComplete="cc-name"
              placeholder="AMINA NJERI"
              className="h-11 uppercase"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="card-expiry">Expiry (MM/YY)</Label>
              <Input
                id="card-expiry"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="12/28"
                className="h-11 font-mono"
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                aria-invalid={!expiryOk && expiry.length > 0}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-cvv">CVV</Label>
              <Input
                id="card-cvv"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                maxLength={3}
                className="h-11 font-mono"
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 3))}
              />
            </div>
          </div>
          {cardNumber.length > 0 && cardDigits.length === 16 && !luhnValid(cardDigits) ? (
            <p className="text-xs text-destructive">This card number is not valid.</p>
          ) : null}
          <Button className="h-11 w-full" disabled={!cardOk || busy} onClick={payCard}>
            {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <CreditCard aria-hidden className="h-4 w-4" />}
            Pay {formatKes(booking.total)}
          </Button>
        </TabsContent>
      </Tabs>

      {error ? (
        <Alert variant="destructive">
          <XCircle aria-hidden className="h-4 w-4" />
          <AlertTitle>Payment error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
          Simulated payments — no real money moves in this demo.
        </p>
      )}
    </div>
  )
}

// ---------- helpers ----------

function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 16)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
}

function formatExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

function isExpiryValid(value: string): boolean {
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(value)) return false
  const [mm, yy] = value.split('/').map(Number)
  const now = new Date()
  const expiryDate = new Date(2000 + (yy ?? 0), mm ?? 0, 1)
  return expiryDate > now
}

function luhnValid(digits: string): boolean {
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i])
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

// ---------- standalone dialog (Pay now from My bookings) ----------

interface PaymentDialogProps {
  booking: Booking
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function PaymentDialog({ booking, open, onOpenChange }: PaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sd-scroll max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Complete payment</DialogTitle>
          <DialogDescription>
            Settle {formatKes(booking.total)} for booking {booking.reference} to secure your car.
          </DialogDescription>
        </DialogHeader>
        <PaymentStep
          booking={booking}
          finishLabel="Done"
          onPaid={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
