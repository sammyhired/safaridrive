// ============================================================
// SafariDrive — server-side quote engine (CONTRACTS §3)
// Money is integer KES everywhere.
// ============================================================
import { DELIVERY_BASE_FEE, DELIVERY_PER_KM, findExtra } from './constants'
import { haversineKm, rentalDays } from './format'
import type { BookingExtrasItem, ExtraSelection, Quote, QuoteLine } from './types'

export interface QuoteVehicle {
  dailyRate: number
  securityDeposit: number
  yardLat: number | null
  yardLng: number | null
}

export interface QuoteDriver {
  name: string | null
  dailyRate: number
}

export interface QuotePromo {
  id?: string
  code: string
  percentOff: number | null
  amountOff: number | null
  active: boolean
  expiresAt: Date | null
  usedCount?: number | null
  maxUses?: number | null
}

export interface QuoteInputLike {
  startDate: string
  endDate: string
  mode: 'PICKUP' | 'DELIVERY' | 'CHAUFFEUR'
  deliveryLat?: number
  deliveryLng?: number
  extras: ExtraSelection[]
  promoCode?: string
}

const DEFAULT_DELIVERY_KM = 10 // fallback when no coords available

/** Sanitize + price the selected extras into booking line items. */
export function computeExtrasItems(
  extras: ExtraSelection[] | undefined | null,
  days: number,
): BookingExtrasItem[] {
  if (!Array.isArray(extras)) return []
  const items: BookingExtrasItem[] = []
  for (const sel of extras) {
    if (!sel || typeof sel.key !== 'string') continue
    const def = findExtra(sel.key)
    if (!def) continue
    const qty = Math.min(10, Math.max(1, Math.floor(Number(sel.qty) || 1)))
    const amount = def.perDay > 0 ? def.perDay * qty * days : def.flat * qty
    items.push({ key: def.key, label: def.label, qty, amount })
  }
  return items
}

/** Evaluate a promo against a subtotal. Shared by computeQuote + /api/promo/validate. */
export function evaluatePromo(
  code: string,
  promo: QuotePromo | null,
  subtotal: number,
): { valid: boolean; discount: number; message: string } {
  const upper = code.trim().toUpperCase()
  if (!promo) {
    return { valid: false, discount: 0, message: `Code ${upper} not found` }
  }
  if (!promo.active) {
    return { valid: false, discount: 0, message: `Code ${upper} is not active` }
  }
  if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
    return { valid: false, discount: 0, message: `Code ${upper} has expired` }
  }
  if (promo.maxUses != null && (promo.usedCount ?? 0) >= promo.maxUses) {
    return { valid: false, discount: 0, message: `Code ${upper} has reached its usage limit` }
  }
  let discount = 0
  if (promo.percentOff && promo.percentOff > 0) {
    discount = Math.round((subtotal * promo.percentOff) / 100)
  } else if (promo.amountOff && promo.amountOff > 0) {
    discount = promo.amountOff
  }
  discount = Math.max(0, Math.min(discount, subtotal))
  if (promo.percentOff) {
    return { valid: true, discount, message: `${upper} applied — ${promo.percentOff}% off` }
  }
  return { valid: true, discount, message: `${upper} applied — KSh ${discount.toLocaleString('en-KE')} off` }
}

export function computeQuote(
  input: QuoteInputLike,
  vehicle: QuoteVehicle,
  driver: QuoteDriver | null,
  promo: QuotePromo | null,
): Quote {
  const days = rentalDays(input.startDate, input.endDate)
  const rentalTotal = vehicle.dailyRate * days

  // Distance from the pickup yard to the delivery point
  let distanceKm: number | null = null
  let deliveryFee = 0
  if (input.mode !== 'PICKUP') {
    const hasYard =
      typeof vehicle.yardLat === 'number' && Number.isFinite(vehicle.yardLat) &&
      typeof vehicle.yardLng === 'number' && Number.isFinite(vehicle.yardLng)
    const hasDest =
      typeof input.deliveryLat === 'number' && Number.isFinite(input.deliveryLat) &&
      typeof input.deliveryLng === 'number' && Number.isFinite(input.deliveryLng)
    if (hasYard && hasDest) {
      distanceKm = haversineKm(
        { lat: vehicle.yardLat as number, lng: vehicle.yardLng as number },
        { lat: input.deliveryLat as number, lng: input.deliveryLng as number },
      )
    } else {
      distanceKm = DEFAULT_DELIVERY_KM
    }
    deliveryFee = Math.round(DELIVERY_BASE_FEE + DELIVERY_PER_KM * distanceKm)
  }

  const driverTotal = input.mode === 'CHAUFFEUR' && driver ? driver.dailyRate * days : 0

  // Extras priced per selection
  const extraItems = computeExtrasItems(input.extras, days)
  const extrasTotal = extraItems.reduce((sum, item) => sum + item.amount, 0)

  // Promo (applied on rental + extras, capped at that subtotal)
  const subtotal = rentalTotal + extrasTotal
  let promoValid = true
  let promoMessage: string | null = null
  let discount = 0
  const code = (input.promoCode ?? '').trim()
  if (code) {
    const evaluated = evaluatePromo(code, promo, subtotal)
    promoValid = evaluated.valid
    promoMessage = evaluated.message
    discount = evaluated.discount
  }

  const deposit = vehicle.securityDeposit
  const total = rentalTotal + deliveryFee + driverTotal + extrasTotal - discount

  const breakdown: QuoteLine[] = [
    {
      label: `Car rental (${days} ${days === 1 ? 'day' : 'days'} × KSh ${vehicle.dailyRate.toLocaleString('en-KE')})`,
      amount: rentalTotal,
    },
  ]
  if (input.mode !== 'PICKUP') {
    breakdown.push({
      label: 'Delivery fee',
      amount: deliveryFee,
      note:
        distanceKm !== null
          ? `${distanceKm.toFixed(1)} km from pickup yard (KSh ${DELIVERY_BASE_FEE.toLocaleString('en-KE')} + KSh ${DELIVERY_PER_KM}/km)`
          : 'standard distance rate',
    })
  }
  if (input.mode === 'CHAUFFEUR' && driver) {
    breakdown.push({
      label: `Chauffeur — ${driver.name ?? 'Professional driver'} (${days} ${days === 1 ? 'day' : 'days'})`,
      amount: driverTotal,
      note: `KSh ${driver.dailyRate.toLocaleString('en-KE')} per day`,
    })
  }
  for (const item of extraItems) {
    const def = findExtra(item.key)
    breakdown.push({
      label: item.qty > 1 ? `${item.label} × ${item.qty}` : item.label,
      amount: item.amount,
      note: def && def.perDay > 0 ? `KSh ${def.perDay.toLocaleString('en-KE')} × ${days} days` : undefined,
    })
  }
  if (discount > 0 && code) {
    breakdown.push({ label: `Promo ${code.toUpperCase()}`, amount: -discount, note: promoMessage ?? undefined })
  }
  breakdown.push({ label: 'Security deposit (refundable)', amount: deposit, note: 'refundable' })

  return {
    days,
    rentalTotal,
    deliveryFee,
    driverTotal,
    extrasTotal,
    discount,
    deposit,
    total,
    distanceKm: input.mode === 'PICKUP' ? null : distanceKm,
    promoValid,
    promoMessage,
    breakdown,
  }
}
