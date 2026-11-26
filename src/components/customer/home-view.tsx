'use client'

import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  CalendarDays,
  Car,
  Clock,
  CreditCard,
  MapPin,
  MapPinned,
  Phone,
  Radar,
  Search,
  Smartphone,
} from 'lucide-react'
import MapView from '@/components/shared/map-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet } from '@/lib/api'
import { BRAND, CATEGORY_META, DESTINATIONS } from '@/lib/constants'
import { formatKes } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import type { RentalYard, Vehicle, VehicleCategory } from '@/lib/types'
import type { SearchFilters } from './filters'
import { todayStr } from './filters'
import { VehicleCard, VehicleCardSkeleton } from './vehicle-card'
import { CATEGORY_ICONS, SectionHeading } from './ui-bits'

interface HomeViewProps {
  filters: SearchFilters
  setFilters: (updater: (f: SearchFilters) => SearchFilters) => void
}

const CITIES = Array.from(new Set(DESTINATIONS.map((d) => d.city)))

export default function HomeView({ setFilters }: HomeViewProps) {
  const setCustomerTab = useAppStore((s) => s.setCustomerTab)

  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState(todayStr(0))
  const [endDate, setEndDate] = useState(todayStr(1))
  const [heroOk, setHeroOk] = useState(true)
  const howRef = useRef<HTMLElement | null>(null)

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiGet<{ categories: { key: string; label: string; count: number; minRate: number }[] }>('/api/categories'),
  })

  const featuredQuery = useQuery({
    queryKey: ['vehicles', '?sort=rating'],
    queryFn: () => apiGet<{ vehicles: Vehicle[] }>('/api/vehicles?sort=rating'),
  })

  const yardsQuery = useQuery({
    queryKey: ['yards'],
    queryFn: () => apiGet<{ yards: RentalYard[] }>('/api/yards'),
  })

  const featured = useMemo(() => (featuredQuery.data?.vehicles ?? []).slice(0, 6), [featuredQuery.data])
  const yards = yardsQuery.data?.yards ?? []
  const categoryCounts = useMemo(() => {
    const map = new Map<string, { count: number; minRate: number }>()
    for (const c of categoriesQuery.data?.categories ?? []) {
      map.set(c.key, { count: c.count, minRate: c.minRate })
    }
    return map
  }, [categoriesQuery.data])

  function handleSearch() {
    const dest = DESTINATIONS.find((d) => d.name === destination)
    const safeEnd = endDate >= startDate ? endDate : startDate
    setFilters((f) => ({ ...f, city: dest?.city ?? '', startDate, endDate: safeEnd }))
    setCustomerTab('browse')
  }

  function browseCategory(key: VehicleCategory) {
    setFilters((f) => ({ ...f, categories: [key] }))
    setCustomerTab('browse')
  }

  const yardMarkers = yards.map((y) => ({
    id: y.id,
    lat: y.lat,
    lng: y.lng,
    label: y.name,
    kind: 'yard' as const,
    popup: `${y.name} · ${y.address} — ${y.availableCount} cars available`,
  }))

  return (
    <div className="w-full">
      {/* ---------------- Hero ---------------- */}
      <section className="relative isolate overflow-hidden" aria-labelledby="hero-heading">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-800"
        >
          {heroOk ? (
            <img
              src="/images/hero.png"
              alt=""
              className="h-full w-full object-cover"
              onError={() => setHeroOk(false)}
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/95 via-emerald-950/55 to-emerald-950/25" />
        </div>

        <div className="mx-auto max-w-7xl px-4 pb-28 pt-16 sm:px-6 sm:pb-32 sm:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="max-w-2xl"
          >
            <Badge
              variant="outline"
              className="border-white/25 bg-white/10 text-white backdrop-blur"
            >
              {BRAND.tagline} · Car rental in {BRAND.country}
            </Badge>
            <h1
              id="hero-heading"
              className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl"
            >
              Rent a car in minutes
            </h1>
            <p className="mt-3 max-w-xl text-base text-emerald-50/85 sm:text-lg">
              Pay with M-Pesa, get it delivered — or drive it yourself
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" className="h-12 px-6" onClick={() => setCustomerTab('browse')}>
                <Search aria-hidden className="h-4 w-4" /> Find a car
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 border-white/30 bg-white/10 px-6 text-white hover:bg-white/20 hover:text-white"
                onClick={() => howRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                How it works
              </Button>
            </div>
            <p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-emerald-50/75">
              <span className="inline-flex items-center gap-1.5">
                <Smartphone aria-hidden className="h-3.5 w-3.5" /> M-Pesa &amp; card payments
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPinned aria-hidden className="h-3.5 w-3.5" /> Delivery anywhere in town
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Radar aria-hidden className="h-3.5 w-3.5" /> Live GPS tracking
              </span>
            </p>
          </motion.div>
        </div>
      </section>

      {/* ---------------- Search bar (overlaps hero) ---------------- */}
      <section aria-label="Search cars" className="relative z-10 mx-auto -mt-20 max-w-5xl px-4 sm:-mt-24 sm:px-6">
        <Card className="border shadow-lg">
          <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="home-destination">Where to?</Label>
              <Select value={destination} onValueChange={setDestination}>
                <SelectTrigger id="home-destination" className="h-11 w-full">
                  <SelectValue placeholder="Pick a destination" />
                </SelectTrigger>
                <SelectContent>
                  {CITIES.map((city) => (
                    <SelectGroup key={city}>
                      <SelectLabel>{city}</SelectLabel>
                      {DESTINATIONS.filter((d) => d.city === city).map((d) => (
                        <SelectItem key={d.name} value={d.name}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="home-start">Pick-up date</Label>
              <Input
                id="home-start"
                type="date"
                className="h-11"
                value={startDate}
                min={todayStr(0)}
                onChange={(e) => setStartDate(e.target.value || todayStr(0))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="home-end">Return date</Label>
              <Input
                id="home-end"
                type="date"
                className="h-11"
                value={endDate}
                min={startDate || todayStr(0)}
                onChange={(e) => setEndDate(e.target.value || todayStr(1))}
              />
            </div>
            <Button className="h-11 px-6 md:w-auto" onClick={handleSearch}>
              <Search aria-hidden className="h-4 w-4" /> Search
            </Button>
          </div>
        </Card>
      </section>

      {/* ---------------- Categories ---------------- */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <SectionHeading
          title="Browse by category"
          description="From city runabouts to safari-grade 4x4s"
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {(Object.keys(CATEGORY_META) as VehicleCategory[]).map((key, i) => {
            const Icon = CATEGORY_ICONS[key]
            const info = categoryCounts.get(key)
            return (
              <motion.button
                key={key}
                type="button"
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                whileHover={{ y: -3 }}
                onClick={() => browseCategory(key)}
                className="group rounded-lg border bg-card p-4 text-left shadow-sm transition-shadow hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon aria-hidden className="h-5 w-5" />
                </span>
                <h3 className="mt-3 font-semibold">{CATEGORY_META[key].label}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{CATEGORY_META[key].blurb}</p>
                <div className="mt-2 text-xs font-medium text-primary">
                  {categoriesQuery.isPending ? (
                    <Skeleton className="inline-block h-3 w-24 align-middle" />
                  ) : info ? (
                    <>
                      {info.count} {info.count === 1 ? 'car' : 'cars'} · from {formatKes(info.minRate)}/day
                    </>
                  ) : (
                    'Coming soon'
                  )}
                </div>
              </motion.button>
            )
          })}
        </div>
      </section>

      {/* ---------------- Featured vehicles ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 sm:pb-14">
        <SectionHeading
          title="Top-rated vehicles"
          description="Community favorites across all yards"
          action={
            <Button variant="ghost" className="h-10 text-primary" onClick={() => setCustomerTab('browse')}>
              View all <ArrowRight aria-hidden className="h-4 w-4" />
            </Button>
          }
        />
        {featuredQuery.isPending ? (
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-72 shrink-0 sm:w-80">
                <VehicleCardSkeleton />
              </div>
            ))}
          </div>
        ) : featured.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No vehicles listed yet — check back soon.
          </p>
        ) : (
          <div className="sd-scroll -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-3">
            {featured.map((v) => (
              <div key={v.id} className="w-72 shrink-0 snap-start sm:w-80">
                <VehicleCard vehicle={v} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Rental yards ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 sm:pb-14">
        <SectionHeading
          title="Rental yards"
          description="Pick up in person, or have the car delivered to your door"
        />
        {yardsQuery.isPending ? (
          <Skeleton className="h-[360px] w-full rounded-lg" />
        ) : (
          <MapView markers={yardMarkers} center={[-1.35, 37.4]} zoom={6} height="360px" className="overflow-hidden rounded-lg border" />
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {yardsQuery.isPending
            ? Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="space-y-3 p-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-9 w-full" />
                </Card>
              ))
            : yards.map((y) => (
                <motion.div
                  key={y.id}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="flex h-full flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">{y.name}</h3>
                        <p className="text-xs text-muted-foreground">{y.city}</p>
                      </div>
                      <Badge variant={y.availableCount > 0 ? 'secondary' : 'outline'} className="shrink-0">
                        <Car aria-hidden className="mr-1 h-3 w-3" />
                        {y.availableCount} free
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                      <p className="flex items-start gap-1.5">
                        <MapPin aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {y.address}
                      </p>
                      <p className="flex items-center gap-1.5">
                        <Clock aria-hidden className="h-3.5 w-3.5 shrink-0" /> {y.openHours}
                      </p>
                      <a
                        href={`tel:${y.phone}`}
                        className="flex items-center gap-1.5 text-primary hover:underline"
                      >
                        <Phone aria-hidden className="h-3.5 w-3.5 shrink-0" /> {y.phone}
                      </a>
                    </div>
                    <Button
                      variant="outline"
                      className="mt-4 h-10 w-full"
                      onClick={() => {
                        setFilters((f) => ({ ...f, yardId: y.id, city: '' }))
                        setCustomerTab('browse')
                      }}
                    >
                      Browse this yard
                    </Button>
                  </Card>
                </motion.div>
              ))}
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section
        id="how-it-works"
        ref={howRef}
        className="scroll-mt-20 border-t bg-muted/40"
      >
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <SectionHeading title="How it works" description="Three steps from booking to keys in hand" />
          <ol className="grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: CreditCard,
                title: 'Book & pay',
                body: 'Reserve your dates and pay instantly with M-Pesa or card. Free cancellation up to 48 hours before pickup.',
              },
              {
                icon: MapPinned,
                title: 'Pickup, delivery or chauffeur',
                body: 'Collect the car at a yard, have it delivered to your address, or ride with a professional chauffeur.',
              },
              {
                icon: Radar,
                title: 'Track your car live',
                body: 'Follow your car on the map in real time — from dispatch to your doorstep and throughout the trip.',
              },
            ].map((step, i) => (
              <motion.li
                key={step.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35, delay: i * 0.08 }}
                className="relative rounded-lg border bg-card p-6"
              >
                <span className="absolute right-5 top-5 text-4xl font-bold text-muted-foreground/15">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <step.icon aria-hidden className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </motion.li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" className="h-12 px-6" onClick={() => setCustomerTab('browse')}>
              <CalendarDays aria-hidden className="h-4 w-4" /> Start a booking
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
