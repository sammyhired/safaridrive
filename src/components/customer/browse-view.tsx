'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Car, Search, SlidersHorizontal } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet } from '@/lib/api'
import { CATEGORY_META } from '@/lib/constants'
import type { RentalYard, Vehicle, VehicleCategory } from '@/lib/types'
import {
  ALL_CATEGORIES,
  buildVehicleQuery,
  countActiveFilters,
  DEFAULT_FILTERS,
  refineVehicles,
  SORT_OPTIONS,
  todayStr,
  type SearchFilters,
} from './filters'
import { useDebouncedValue } from './use-debounce'
import { VehicleCard, VehicleCardSkeleton } from './vehicle-card'

interface BrowseViewProps {
  filters: SearchFilters
  setFilters: (updater: (f: SearchFilters) => SearchFilters) => void
}

const ALL = '__all'

export default function BrowseView({ filters, setFilters }: BrowseViewProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const debounced = useDebouncedValue(filters, 300)

  const queryString = useMemo(() => buildVehicleQuery(debounced), [debounced])
  const vehiclesQuery = useQuery({
    queryKey: ['vehicles', queryString],
    queryFn: () => apiGet<{ vehicles: Vehicle[] }>(`/api/vehicles${queryString}`),
  })

  const yardsQuery = useQuery({
    queryKey: ['yards'],
    queryFn: () => apiGet<{ yards: RentalYard[] }>('/api/yards'),
  })

  const vehicles = useMemo(
    () => refineVehicles(vehiclesQuery.data?.vehicles ?? [], debounced),
    [vehiclesQuery.data, debounced],
  )

  const activeCount = countActiveFilters(filters)
  const hasFilters = activeCount > 0

  const set = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }))

  const sortSelect = (
    <div className="flex items-center gap-2">
      <Label htmlFor="browse-sort" className="hidden text-xs text-muted-foreground sm:inline">
        Sort
      </Label>
      <Select value={filters.sort} onValueChange={(v) => set('sort', v)}>
        <SelectTrigger id="browse-sort" className="h-10 w-[172px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Find a car</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {vehiclesQuery.isPending ? (
              <Skeleton className="inline-block h-4 w-28 align-middle" />
            ) : (
              <>
                {vehicles.length} {vehicles.length === 1 ? 'car' : 'cars'} available
                {debounced.startDate && debounced.endDate ? ' for your dates' : ''}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="h-10 lg:hidden">
                <SlidersHorizontal aria-hidden className="h-4 w-4" />
                Filters
                {activeCount > 0 ? (
                  <Badge className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">{activeCount}</Badge>
                ) : null}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="sd-scroll w-[300px] overflow-y-auto sm:w-[340px]">
              <SheetHeader className="text-left">
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-8">
                <FilterPanel filters={filters} setFilters={setFilters} yards={yardsQuery.data?.yards ?? []} />
                <Button className="mt-5 h-11 w-full" onClick={() => setSheetOpen(false)}>
                  Show {vehicles.length} {vehicles.length === 1 ? 'result' : 'results'}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          {sortSelect}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sd-scroll sticky top-4 max-h-[calc(100vh-2rem)] space-y-6 overflow-y-auto rounded-lg border bg-card p-4 pr-3">
            <FilterPanel filters={filters} setFilters={setFilters} yards={yardsQuery.data?.yards ?? []} />
          </div>
        </aside>

        <div>
          {vehiclesQuery.isPending ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <VehicleCardSkeleton key={i} />
              ))}
            </div>
          ) : vehiclesQuery.isError ? (
            <EmptyState
              icon={Car}
              title="Couldn't load vehicles"
              description="Something went wrong while fetching the fleet. Please try again."
              action={
                <Button variant="outline" className="h-11" onClick={() => vehiclesQuery.refetch()}>
                  Retry
                </Button>
              }
            />
          ) : vehicles.length === 0 ? (
            <EmptyState
              icon={Car}
              title="No cars match your filters"
              description={
                hasFilters
                  ? 'Try widening your dates, budget or category selection.'
                  : 'The fleet is being set up — check back soon.'
              }
              action={
                hasFilters ? (
                  <Button className="h-11" onClick={() => setFilters(() => ({ ...DEFAULT_FILTERS }))}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
              {vehicles.map((v) => (
                <VehicleCard key={v.id} vehicle={v} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FilterPanel({
  filters,
  setFilters,
  yards,
}: {
  filters: SearchFilters
  setFilters: (updater: (f: SearchFilters) => SearchFilters) => void
  yards: RentalYard[]
}) {
  const set = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }))

  const toggleCategory = (key: VehicleCategory) =>
    setFilters((f) => ({
      ...f,
      categories: f.categories.includes(key)
        ? f.categories.filter((c) => c !== key)
        : [...f.categories, key],
    }))

  const locationValue = filters.yardId
    ? `yard:${filters.yardId}`
    : filters.city
      ? `city:${filters.city}`
      : ALL

  const cities = Array.from(new Set(yards.map((y) => y.city)))

  function setLocation(value: string) {
    if (value === ALL) {
      setFilters((f) => ({ ...f, city: '', yardId: '' }))
    } else if (value.startsWith('yard:')) {
      setFilters((f) => ({ ...f, city: '', yardId: value.slice(5) }))
    } else if (value.startsWith('city:')) {
      setFilters((f) => ({ ...f, city: value.slice(5), yardId: '' }))
    }
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="space-y-2">
        <Label htmlFor="filter-q">Search</Label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="filter-q"
            placeholder="Make, model, feature..."
            className="h-10 pl-9"
            value={filters.q}
            onChange={(e) => set('q', e.target.value)}
          />
        </div>
      </div>

      {/* Category */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Category</legend>
        <div className="space-y-1">
          {ALL_CATEGORIES.map((key) => (
            <label
              key={key}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/70"
            >
              <Checkbox
                aria-label={CATEGORY_META[key].label}
                checked={filters.categories.includes(key)}
                onCheckedChange={() => toggleCategory(key)}
              />
              <span className="text-sm">{CATEGORY_META[key].label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Price */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Price per day (KSh)</div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder="Min"
            aria-label="Minimum price per day"
            className="h-10"
            value={filters.minRate}
            onChange={(e) => set('minRate', e.target.value)}
          />
          <span aria-hidden className="text-muted-foreground">
            –
          </span>
          <Input
            type="number"
            min={0}
            placeholder="Max"
            aria-label="Maximum price per day"
            className="h-10"
            value={filters.maxRate}
            onChange={(e) => set('maxRate', e.target.value)}
          />
        </div>
      </div>

      {/* Transmission + seats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="filter-transmission">Gearbox</Label>
          <Select
            value={filters.transmission || ALL}
            onValueChange={(v) => set('transmission', v === ALL ? '' : v)}
          >
            <SelectTrigger id="filter-transmission" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any</SelectItem>
              <SelectItem value="Automatic">Automatic</SelectItem>
              <SelectItem value="Manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-seats">Seats</Label>
          <Select value={filters.minSeats || ALL} onValueChange={(v) => set('minSeats', v === ALL ? '' : v)}>
            <SelectTrigger id="filter-seats" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any</SelectItem>
              <SelectItem value="4">4+</SelectItem>
              <SelectItem value="5">5+</SelectItem>
              <SelectItem value="7">7+</SelectItem>
              <SelectItem value="9">9+</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <Label htmlFor="filter-location">Location</Label>
        <Select value={locationValue} onValueChange={setLocation}>
          <SelectTrigger id="filter-location" className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All locations</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c} value={`city:${c}`}>
                {c} — all yards
              </SelectItem>
            ))}
            {yards.map((y) => (
              <SelectItem key={y.id} value={`yard:${y.id}`}>
                {y.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Dates */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Dates (availability)</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="filter-start" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="filter-start"
              type="date"
              className="h-10"
              min={todayStr(0)}
              value={filters.startDate}
              onChange={(e) => set('startDate', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="filter-end" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="filter-end"
              type="date"
              className="h-10"
              min={filters.startDate || todayStr(0)}
              value={filters.endDate}
              onChange={(e) => set('endDate', e.target.value)}
            />
          </div>
        </div>
        {filters.startDate && filters.endDate ? (
          <p className="text-xs text-muted-foreground">
            Showing cars free for these dates.
          </p>
        ) : null}
      </div>

      <Button
        variant="ghost"
        className="h-10 w-full text-muted-foreground"
        onClick={() => setFilters(() => ({ ...DEFAULT_FILTERS }))}
      >
        Reset filters
      </Button>
    </div>
  )
}
