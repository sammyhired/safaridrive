'use client'

// Create / edit vehicle dialog for the owner fleet section.
// The form mounts fresh every time the dialog opens (no reset effects).

import { useMemo, useState, type ReactNode } from 'react'
import { CarFront, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CATEGORY_META, CATEGORY_ORDER } from '@/lib/constants'
import { formatKes } from '@/lib/format'
import type { Vehicle, VehicleCategory } from '@/lib/types'
import { useVehicleSave, useYards, type VehiclePayload } from './_shared/api'
import { toInt, truncateLabel } from './_shared/form-utils'

const TRANSMISSIONS = ['Automatic', 'Manual']
const FUEL_TYPES = ['Petrol', 'Diesel', 'Hybrid', 'Electric']

interface VehicleFormState {
  make: string
  model: string
  year: string
  category: VehicleCategory
  plate: string
  seats: string
  doors: string
  transmission: string
  fuelType: string
  dailyRate: string
  securityDeposit: string
  mileageLimitKmPerDay: string
  excessPerKm: string
  imageUrl: string
  features: string
  description: string
  yardId: string
}

function initialState(vehicle: Vehicle | null): VehicleFormState {
  return {
    make: vehicle?.make ?? '',
    model: vehicle?.model ?? '',
    year: vehicle ? String(vehicle.year) : String(new Date().getFullYear()),
    category: vehicle?.category ?? 'ECONOMY',
    plate: vehicle?.plate ?? '',
    seats: vehicle ? String(vehicle.seats) : '5',
    doors: vehicle ? String(vehicle.doors) : '4',
    transmission: vehicle?.transmission ?? 'Automatic',
    fuelType: vehicle?.fuelType ?? 'Petrol',
    dailyRate: vehicle ? String(vehicle.dailyRate) : '',
    securityDeposit: vehicle ? String(vehicle.securityDeposit) : '5000',
    mileageLimitKmPerDay:
      vehicle?.mileageLimitKmPerDay != null ? String(vehicle.mileageLimitKmPerDay) : '',
    excessPerKm: vehicle ? String(vehicle.excessPerKm) : '50',
    imageUrl: vehicle?.imageUrl ?? '',
    features: vehicle?.features?.join(', ') ?? '',
    description: vehicle?.description ?? '',
    yardId: vehicle?.yardId ?? '',
  }
}

function validate(state: VehicleFormState): Record<string, string> {
  const errors: Record<string, string> = {}
  const year = toInt(state.year)
  const rate = toInt(state.dailyRate)
  const deposit = toInt(state.securityDeposit)
  const seats = toInt(state.seats)
  const doors = toInt(state.doors)
  const excess = toInt(state.excessPerKm)

  if (!state.make.trim() || state.make.trim().length < 2) errors.make = 'Min 2 characters'
  if (!state.model.trim()) errors.model = 'Required'
  if (year == null || year < 1980 || year > new Date().getFullYear() + 1)
    errors.year = `1980 \u2013 ${new Date().getFullYear() + 1}`
  if (state.plate.trim().length < 4) errors.plate = 'Min 4 characters'
  if (rate == null || rate < 500) errors.dailyRate = 'Min KSh 500'
  if (deposit == null || deposit < 0) errors.securityDeposit = '0 or more'
  if (seats == null || seats < 2 || seats > 60) errors.seats = '2 \u2013 60'
  if (doors == null || doors < 2 || doors > 8) errors.doors = '2 \u2013 8'
  if (excess == null || excess < 0) errors.excessPerKm = '0 or more'
  if (state.mileageLimitKmPerDay.trim() !== '') {
    const limit = toInt(state.mileageLimitKmPerDay)
    if (limit == null || limit < 20) errors.mileageLimitKmPerDay = 'Min 20 km (or leave empty)'
  }
  return errors
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function VehicleDialog({
  open,
  onOpenChange,
  vehicle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  vehicle: Vehicle | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        {open ? <VehicleForm vehicle={vehicle} onOpenChange={onOpenChange} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function VehicleForm({
  vehicle,
  onOpenChange,
}: {
  vehicle: Vehicle | null
  onOpenChange: (open: boolean) => void
}) {
  const yardsQuery = useYards()
  const save = useVehicleSave()

  const [state, setState] = useState<VehicleFormState>(() => initialState(vehicle))
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  const errors = useMemo(() => validate(state), [state])
  const isValid = Object.keys(errors).length === 0

  const imageUrl = state.imageUrl.trim()
  const showImage = imageUrl !== '' && failedUrl !== imageUrl

  const set = <K extends keyof VehicleFormState>(key: K, value: VehicleFormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }))
  }

  const submit = () => {
    if (!isValid) return
    const payload: VehiclePayload = {
      make: state.make.trim(),
      model: state.model.trim(),
      year: toInt(state.year) ?? new Date().getFullYear(),
      category: state.category,
      plate: state.plate.trim().toUpperCase(),
      seats: toInt(state.seats) ?? 5,
      doors: toInt(state.doors) ?? 4,
      transmission: state.transmission,
      fuelType: state.fuelType,
      dailyRate: toInt(state.dailyRate) ?? 0,
      securityDeposit: toInt(state.securityDeposit) ?? 0,
      mileageLimitKmPerDay:
        state.mileageLimitKmPerDay.trim() === '' ? null : toInt(state.mileageLimitKmPerDay),
      excessPerKm: toInt(state.excessPerKm) ?? 0,
      imageUrl,
      features: state.features
        .split(',')
        .map((feature) => feature.trim())
        .filter(Boolean),
      description: state.description.trim() || null,
      yardId: state.yardId || null,
    }
    save.mutate(
      { vehicleId: vehicle?.id ?? null, payload },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  const ratePreview = toInt(state.dailyRate)

  return (
    <>
      <DialogHeader>
        <DialogTitle>{vehicle ? 'Edit vehicle' : 'Add a vehicle'}</DialogTitle>
        <DialogDescription>
          {vehicle
            ? 'Update the listing details customers see in the catalog.'
            : 'List a new vehicle on SafariDrive. It becomes bookable immediately.'}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Photo */}
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="vehicle-image">Photo URL</Label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="aspect-[16/9] w-full overflow-hidden rounded-lg border bg-muted sm:w-64">
              {showImage ? (
                <img
                  src={imageUrl}
                  alt="Vehicle preview"
                  onError={() => setFailedUrl(imageUrl)}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <CarFront className="size-6" aria-hidden />
                </div>
              )}
            </div>
            <div className="flex-1 space-y-1.5">
              <Input
                id="vehicle-image"
                value={state.imageUrl}
                onChange={(event) => set('imageUrl', event.target.value)}
                placeholder="/images/your-car.jpg or https://..."
              />
              <p className="text-xs text-muted-foreground">
                Live preview. Paste any image URL that customers should see.
              </p>
            </div>
          </div>
        </div>

        <Field label="Make" htmlFor="vehicle-make" error={errors.make}>
          <Input
            id="vehicle-make"
            value={state.make}
            onChange={(event) => set('make', event.target.value)}
            placeholder="Toyota"
          />
        </Field>
        <Field label="Model" htmlFor="vehicle-model" error={errors.model}>
          <Input
            id="vehicle-model"
            value={state.model}
            onChange={(event) => set('model', event.target.value)}
            placeholder="RAV4"
          />
        </Field>
        <Field label="Year" htmlFor="vehicle-year" error={errors.year}>
          <Input
            id="vehicle-year"
            inputMode="numeric"
            value={state.year}
            onChange={(event) => set('year', event.target.value)}
            placeholder="2021"
          />
        </Field>

        <Field label="Category" htmlFor="vehicle-category">
          <Select
            value={state.category}
            onValueChange={(value) => set('category', value as VehicleCategory)}
          >
            <SelectTrigger id="vehicle-category" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_ORDER.map((category) => (
                <SelectItem key={category} value={category}>
                  {CATEGORY_META[category].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Plate" htmlFor="vehicle-plate" error={errors.plate}>
          <Input
            id="vehicle-plate"
            value={state.plate}
            onChange={(event) => set('plate', event.target.value.toUpperCase())}
            placeholder="KDA 123A"
            className="font-mono"
          />
        </Field>
        <Field label="Yard" htmlFor="vehicle-yard" hint="Where customers collect the car">
          <Select value={state.yardId} onValueChange={(value) => set('yardId', value)}>
            <SelectTrigger id="vehicle-yard" className="h-11 w-full">
              <SelectValue placeholder="No yard" />
            </SelectTrigger>
            <SelectContent>
              {(yardsQuery.data?.yards ?? []).map((yard) => (
                <SelectItem key={yard.id} value={yard.id}>
                  {truncateLabel(`${yard.name} \u00b7 ${yard.city}`, 26)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Seats" htmlFor="vehicle-seats" error={errors.seats}>
          <Input
            id="vehicle-seats"
            inputMode="numeric"
            value={state.seats}
            onChange={(event) => set('seats', event.target.value)}
          />
        </Field>
        <Field label="Doors" htmlFor="vehicle-doors" error={errors.doors}>
          <Input
            id="vehicle-doors"
            inputMode="numeric"
            value={state.doors}
            onChange={(event) => set('doors', event.target.value)}
          />
        </Field>
        <Field label="Transmission" htmlFor="vehicle-transmission">
          <Select value={state.transmission} onValueChange={(value) => set('transmission', value)}>
            <SelectTrigger id="vehicle-transmission" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSMISSIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Fuel" htmlFor="vehicle-fuel">
          <Select value={state.fuelType} onValueChange={(value) => set('fuelType', value)}>
            <SelectTrigger id="vehicle-fuel" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FUEL_TYPES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Daily rate (KSh)"
          htmlFor="vehicle-rate"
          error={errors.dailyRate}
          hint={
            ratePreview != null && ratePreview >= 500
              ? `${formatKes(ratePreview)} per day`
              : undefined
          }
        >
          <Input
            id="vehicle-rate"
            inputMode="numeric"
            value={state.dailyRate}
            onChange={(event) => set('dailyRate', event.target.value)}
            placeholder="5000"
          />
        </Field>
        <Field
          label="Security deposit (KSh)"
          htmlFor="vehicle-deposit"
          error={errors.securityDeposit}
          hint="Refundable, not added to the total"
        >
          <Input
            id="vehicle-deposit"
            inputMode="numeric"
            value={state.securityDeposit}
            onChange={(event) => set('securityDeposit', event.target.value)}
            placeholder="8000"
          />
        </Field>

        <Field
          label="Mileage limit (km/day)"
          htmlFor="vehicle-mileage"
          error={errors.mileageLimitKmPerDay}
          hint="Leave empty for unlimited"
        >
          <Input
            id="vehicle-mileage"
            inputMode="numeric"
            value={state.mileageLimitKmPerDay}
            onChange={(event) => set('mileageLimitKmPerDay', event.target.value)}
            placeholder="Unlimited"
          />
        </Field>
        <Field label="Excess per km (KSh)" htmlFor="vehicle-excess" error={errors.excessPerKm}>
          <Input
            id="vehicle-excess"
            inputMode="numeric"
            value={state.excessPerKm}
            onChange={(event) => set('excessPerKm', event.target.value)}
            placeholder="50"
          />
        </Field>

        <Field
          label="Features"
          htmlFor="vehicle-features"
          hint="Comma separated, e.g. A/C, Roof rails, Bluetooth"
        >
          <Input
            id="vehicle-features"
            value={state.features}
            onChange={(event) => set('features', event.target.value)}
            placeholder="A/C, Bluetooth"
          />
        </Field>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="vehicle-description">Description</Label>
          <Textarea
            id="vehicle-description"
            rows={3}
            value={state.description}
            onChange={(event) => set('description', event.target.value)}
            placeholder="A short pitch for renters — condition, ideal trips, anything special."
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button className="h-11" onClick={submit} disabled={!isValid || save.isPending}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {vehicle ? 'Save changes' : 'Add vehicle'}
        </Button>
      </DialogFooter>
    </>
  )
}
