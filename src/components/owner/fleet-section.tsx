'use client'

// Owner fleet section — table on desktop, stacked cards on mobile, with
// add/edit dialog and availability toggle.

import { useMemo, useState } from 'react'
import { CarFront, CheckCircle2, Loader2, Pencil, Plus, Star, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { useSession } from '@/hooks/use-session'
import { formatKes } from '@/lib/format'
import type { Vehicle } from '@/lib/types'
import { useVehicleStatus, useVehicles } from './_shared/api'
import { ErrorState } from './_shared/states'
import { TableSkeleton } from './_shared/skeletons'
import { SectionHeader } from './_shared/section-header'
import { CategoryBadge, VehicleThumb } from './_shared/ui-bits'
import { VehicleDialog } from './vehicle-dialog'

function Rating({ value, count }: { value: number; count: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm tabular-nums">
      <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
      {value.toFixed(1)}
      <span className="text-xs text-muted-foreground">({count})</span>
    </span>
  )
}

export function FleetSection() {
  const { user } = useSession()
  const vehiclesQuery = useVehicles()
  const statusMutation = useVehicleStatus()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Vehicle | null>(null)

  const isAdmin = user?.role === 'ADMIN'

  const vehicles = useMemo(() => {
    const all = vehiclesQuery.data?.vehicles ?? []
    if (isAdmin) return all
    return all.filter((vehicle) => vehicle.ownerId === user?.id)
  }, [vehiclesQuery.data, isAdmin, user])

  const counts = useMemo(
    () => ({
      total: vehicles.length,
      available: vehicles.filter((v) => v.status === 'AVAILABLE').length,
      booked: vehicles.filter((v) => v.status === 'BOOKED').length,
      maintenance: vehicles.filter((v) => v.status === 'MAINTENANCE').length,
    }),
    [vehicles],
  )

  const busyVehicleId = statusMutation.isPending ? statusMutation.variables?.vehicleId : undefined

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (vehicle: Vehicle) => {
    setEditing(vehicle)
    setDialogOpen(true)
  }

  const toggleStatus = (vehicle: Vehicle) => {
    statusMutation.mutate({
      vehicleId: vehicle.id,
      status: vehicle.status === 'MAINTENANCE' ? 'AVAILABLE' : 'MAINTENANCE',
    })
  }

  const summaryText = `${counts.total} vehicles \u00b7 ${counts.available} available \u00b7 ${counts.booked} booked \u00b7 ${counts.maintenance} maintenance`

  return (
    <section aria-label="Fleet">
      <SectionHeader
        title={isAdmin ? 'All vehicles' : 'Your fleet'}
        description={
          isAdmin
            ? 'Full platform catalog. As admin you can edit any vehicle or pause it for maintenance.'
            : 'Manage your vehicles, pricing and availability across yards.'
        }
        action={
          isAdmin ? null : (
            <Button className="h-11" onClick={openCreate}>
              <Plus className="size-4" aria-hidden />
              Add vehicle
            </Button>
          )
        }
      />

      {vehiclesQuery.isLoading ? (
        <TableSkeleton rows={6} />
      ) : vehiclesQuery.isError ? (
        <ErrorState
          error={vehiclesQuery.error}
          onRetry={() => {
            void vehiclesQuery.refetch()
          }}
        />
      ) : vehicles.length === 0 ? (
        <EmptyState
          icon={CarFront}
          title={isAdmin ? 'No vehicles yet' : 'No vehicles in your fleet yet'}
          description={
            isAdmin
              ? 'Once owners list their vehicles they will appear here.'
              : 'Add your first vehicle to start accepting bookings on SafariDrive.'
          }
          action={
            isAdmin ? undefined : (
              <Button className="h-11" onClick={openCreate}>
                <Plus className="size-4" aria-hidden />
                Add vehicle
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">{summaryText}</p>

          {/* Desktop table */}
          <Card className="hidden overflow-hidden p-0 lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Yard</TableHead>
                  <TableHead className="text-right">Rate / day</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rating</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((vehicle) => {
                  const busy = busyVehicleId === vehicle.id
                  const inMaintenance = vehicle.status === 'MAINTENANCE'
                  return (
                    <TableRow key={vehicle.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <VehicleThumb vehicle={vehicle} className="h-11 w-16 shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{vehicle.label}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {vehicle.plate}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <CategoryBadge category={vehicle.category} />
                      </TableCell>
                      <TableCell className="max-w-36 truncate text-sm text-muted-foreground">
                        {vehicle.yardName ?? '\u2014'}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {formatKes(vehicle.dailyRate)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={vehicle.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Rating value={vehicle.rating} count={vehicle.reviewCount} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-9"
                            aria-label={`Edit ${vehicle.label}`}
                            onClick={() => openEdit(vehicle)}
                          >
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9"
                            disabled={vehicle.status === 'BOOKED' || busy}
                            onClick={() => toggleStatus(vehicle)}
                          >
                            {busy ? (
                              <Loader2 className="size-3.5 animate-spin" aria-hidden />
                            ) : inMaintenance ? (
                              <CheckCircle2 className="size-3.5" aria-hidden />
                            ) : (
                              <Wrench className="size-3.5" aria-hidden />
                            )}
                            <span className="hidden xl:inline">
                              {inMaintenance ? 'Back in service' : 'Maintenance'}
                            </span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile / tablet cards */}
          <div className="flex flex-col gap-3 lg:hidden">
            {vehicles.map((vehicle) => {
              const busy = busyVehicleId === vehicle.id
              const inMaintenance = vehicle.status === 'MAINTENANCE'
              return (
                <Card key={vehicle.id} className="gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <VehicleThumb vehicle={vehicle} className="h-14 w-[88px] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{vehicle.label}</p>
                        <StatusBadge status={vehicle.status} />
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {vehicle.plate}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <CategoryBadge category={vehicle.category} />
                        <span className="truncate">{vehicle.yardName ?? 'No yard'}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="font-semibold text-foreground">
                          {formatKes(vehicle.dailyRate)}/day
                        </span>
                        <Rating value={vehicle.rating} count={vehicle.reviewCount} />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 border-t pt-3">
                    <Button
                      variant="outline"
                      className="h-11 flex-1"
                      onClick={() => openEdit(vehicle)}
                    >
                      <Pencil className="size-4" aria-hidden />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 flex-1"
                      disabled={vehicle.status === 'BOOKED' || busy}
                      onClick={() => toggleStatus(vehicle)}
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : inMaintenance ? (
                        <CheckCircle2 className="size-4" aria-hidden />
                      ) : (
                        <Wrench className="size-4" aria-hidden />
                      )}
                      {inMaintenance ? 'Back in service' : 'Maintenance'}
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}

      <VehicleDialog open={dialogOpen} onOpenChange={setDialogOpen} vehicle={editing} />
    </section>
  )
}
