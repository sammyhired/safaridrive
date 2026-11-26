'use client'

// Drivers section — platform chauffeur roster. Read-only for owners,
// inline status + rate editing for admins.

import { useState } from 'react'
import { Info, Loader2, Save, Star, UserRoundX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { useSession } from '@/hooks/use-session'
import { formatKes, statusLabel } from '@/lib/format'
import type { DriverProfile, DriverStatus } from '@/lib/types'
import { useDriverUpdate, useDrivers } from './_shared/api'
import { toInt } from './_shared/form-utils'
import { ErrorState } from './_shared/states'
import { CardsSkeleton } from './_shared/skeletons'
import { SectionHeader } from './_shared/section-header'
import { InitialsAvatar } from './_shared/ui-bits'

const DRIVER_STATUSES: DriverStatus[] = ['AVAILABLE', 'ON_TRIP', 'OFFLINE']

function DriverCard({ driver, editable }: { driver: DriverProfile; editable: boolean }) {
  // Local draft overrides server values while editing; cleared after a save.
  const [draft, setDraft] = useState<{ status: DriverStatus; rate: string } | null>(null)
  const update = useDriverUpdate()

  const status = draft?.status ?? driver.status
  const rate = draft?.rate ?? String(driver.dailyRate)
  const rateValue = toInt(rate)
  const dirty =
    editable &&
    draft != null &&
    (draft.status !== driver.status ||
      (rateValue != null && rateValue !== driver.dailyRate))

  const save = () => {
    if (rateValue == null) return
    update.mutate(
      {
        driverId: driver.id,
        status,
        dailyRate: rateValue,
      },
      { onSuccess: () => setDraft(null) },
    )
  }

  return (
    <Card className="gap-4 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <InitialsAvatar name={driver.name} className="size-11" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{driver.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {driver.phone ?? 'No phone on file'}
            </p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">License</dt>
          <dd className="font-mono text-xs">{driver.licenseNo}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Experience</dt>
          <dd className="tabular-nums">
            {driver.yearsExperience} {driver.yearsExperience === 1 ? 'yr' : 'yrs'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Trips completed</dt>
          <dd className="tabular-nums">{driver.tripsCompleted}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Rating</dt>
          <dd className="inline-flex items-center gap-1 tabular-nums">
            <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
            {driver.rating.toFixed(1)}
          </dd>
        </div>
      </dl>

      {editable ? (
        <div className="grid grid-cols-2 gap-2 border-t pt-3">
          <div className="space-y-1">
            <Label htmlFor={`driver-status-${driver.id}`} className="text-xs">
              Status
            </Label>
            <Select
              value={status}
              onValueChange={(value) =>
                setDraft({ status: value as DriverStatus, rate })
              }
            >
              <SelectTrigger id={`driver-status-${driver.id}`} className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DRIVER_STATUSES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {statusLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`driver-rate-${driver.id}`} className="text-xs">
              Daily rate (KSh)
            </Label>
            <Input
              id={`driver-rate-${driver.id}`}
              inputMode="numeric"
              className="h-11"
              value={rate}
              onChange={(event) => setDraft({ status, rate: event.target.value })}
            />
          </div>
          <Button
            className="col-span-2 h-11"
            disabled={!dirty || update.isPending || rateValue == null}
            onClick={save}
          >
            {update.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            Save changes
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-xs text-muted-foreground">Daily rate</span>
          <span className="text-sm font-semibold tabular-nums">
            {formatKes(driver.dailyRate)}
          </span>
        </div>
      )}
    </Card>
  )
}

export function DriversSection() {
  const { user } = useSession()
  const driversQuery = useDrivers()
  const isAdmin = user?.role === 'ADMIN'

  return (
    <section aria-label="Drivers">
      <SectionHeader
        title="Drivers"
        description="Professional chauffeurs available for deliveries and chauffeur bookings."
      />

      {!isAdmin ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <p className="text-muted-foreground">
            Platform drivers are shared across all SafariDrive owners. Rates and availability are
            managed by the platform team.
          </p>
        </div>
      ) : null}

      {driversQuery.isLoading ? (
        <CardsSkeleton count={6} />
      ) : driversQuery.isError ? (
        <ErrorState
          error={driversQuery.error}
          onRetry={() => {
            void driversQuery.refetch()
          }}
        />
      ) : (driversQuery.data?.drivers ?? []).length === 0 ? (
        <EmptyState
          icon={UserRoundX}
          title="No drivers yet"
          description="Platform drivers will appear here once they are onboarded."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(driversQuery.data?.drivers ?? []).map((driver) => (
            <DriverCard key={driver.id} driver={driver} editable={isAdmin} />
          ))}
        </div>
      )}
    </section>
  )
}
