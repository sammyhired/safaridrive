'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatKes } from '@/lib/format'

interface MpesaSimProps {
  amount: number
  phone: string // normalized 2547XXXXXXXX
  onResult: (result: 'success' | 'failed') => void
  onCancel: () => void
}

/**
 * Simulated STK-push phone prompt shown after /api/payments/mpesa/stk
 * responds (mock mode). Renders inside the payment area as a phone frame.
 */
export default function MpesaSim({ amount, phone, onResult, onCancel }: MpesaSimProps) {
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<'success' | 'failed' | null>(null)

  async function act(value: 'success' | 'failed') {
    setSending(true)
    // Simulate the brief PIN-processing window before the callback lands.
    await new Promise((resolve) => setTimeout(resolve, 1100))
    setSending(false)
    setResult(value)
    onResult(value)
  }

  return (
    <div className="flex flex-col items-center py-4" role="alertdialog" aria-label="M-Pesa prompt">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-[280px] overflow-hidden rounded-[1.75rem] border-[6px] border-neutral-900 bg-white shadow-xl dark:border-neutral-800"
      >
        {/* Notch */}
        <div className="flex h-6 items-center justify-center bg-neutral-900 dark:bg-neutral-800">
          <span className="h-1.5 w-16 rounded-full bg-neutral-700" />
        </div>

        <div className="bg-emerald-700 px-4 py-3">
          <p className="text-sm font-bold tracking-widest text-white">M-PESA</p>
        </div>

        <div className="space-y-3 px-4 py-4 text-sm text-neutral-900">
          <p className="font-medium leading-snug">
            SafariDrive would like to charge you {formatKes(amount)}.
          </p>
          <p>
            Phone: <span className="font-mono">{phone}</span>
          </p>
          <p className="text-neutral-600">Enter M-PESA PIN:</p>

          <div className="flex justify-center gap-2.5 py-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={
                  result
                    ? 'h-2.5 w-2.5 rounded-full bg-emerald-600'
                    : 'h-2.5 w-2.5 rounded-full border border-neutral-400'
                }
              />
            ))}
          </div>

          {sending ? (
            <p className="flex items-center justify-center gap-2 py-2 text-emerald-700">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              Processing payment...
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="h-11 border-emerald-700 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                onClick={() => act('success')}
              >
                Enter PIN
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => act('failed')}
              >
                Decline
              </Button>
            </div>
          )}
        </div>
      </motion.div>

      <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={onCancel}>
        Cancel STK prompt
      </Button>
      <p className="mt-1 max-w-[280px] text-center text-xs text-muted-foreground">
        Simulated prompt — this demo never charges real money.
      </p>
    </div>
  )
}
