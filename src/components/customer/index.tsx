'use client'

import { useState } from 'react'
import { CalendarCheck, Home, Search } from 'lucide-react'
import { useAppStore, type CustomerTab } from '@/lib/store'
import { cn } from '@/lib/utils'
import BookingFlow from './booking-flow'
import BrowseView from './browse-view'
import HomeView from './home-view'
import MyBookings from './my-bookings'
import { ScrollbarStyles } from './ui-bits'
import { DEFAULT_FILTERS, type SearchFilters } from './filters'

const TABS: { key: CustomerTab; label: string; icon: typeof Home }[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'browse', label: 'Find a car', icon: Search },
  { key: 'bookings', label: 'My bookings', icon: CalendarCheck },
]

export default function CustomerApp() {
  const customerTab = useAppStore((s) => s.customerTab)
  const setCustomerTab = useAppStore((s) => s.setCustomerTab)
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS)

  return (
    <div className="w-full">
      <ScrollbarStyles />

      {/* Customer sub-navigation (segmented control) */}
      <nav
        aria-label="Customer sections"
        className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-2.5 sm:px-6">
          <div role="tablist" className="inline-flex rounded-lg bg-muted p-1">
            {TABS.map((t) => {
              const active = customerTab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCustomerTab(t.key)}
                  className={cn(
                    'flex h-9 min-w-[44px] items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:px-4',
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <t.icon aria-hidden className="h-4 w-4" />
                  <span className={cn(t.key === 'home' ? 'hidden sm:inline' : 'inline')}>
                    {t.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      <main>
        {customerTab === 'home' ? (
          <HomeView filters={filters} setFilters={setFilters} />
        ) : null}
        {customerTab === 'browse' ? (
          <BrowseView filters={filters} setFilters={setFilters} />
        ) : null}
        {customerTab === 'bookings' ? <MyBookings /> : null}
      </main>

      {/* Multi-step booking flow, opened via openBooking() anywhere in the app */}
      <BookingFlow defaultDates={{ start: filters.startDate, end: filters.endDate }} />
    </div>
  )
}
