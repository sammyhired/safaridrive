'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { CarFront, MapPin, Smartphone, Wallet } from 'lucide-react'

import AppHeader from '@/components/shared/app-header'
import CustomerApp from '@/components/customer'
import OwnerApp from '@/components/owner'
import DriverApp from '@/components/driver'
import AdminApp from '@/components/admin'
import { useAppStore } from '@/lib/store'
import type { Role } from '@/lib/types'
import { BRAND } from '@/lib/constants'

function Workspace({ role }: { role: Role }) {
  switch (role) {
    case 'OWNER':
      return <OwnerApp />
    case 'DRIVER':
      return <DriverApp />
    case 'ADMIN':
      return <AdminApp />
    default:
      return <CustomerApp />
  }
}

function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <CarFront className="h-4 w-4" aria-hidden />
              </span>
              <span className="font-semibold">{BRAND.name}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {BRAND.tagline} Car rental made in {BRAND.country} — book, pay with M-Pesa or
              card, and hit the road.
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Rentals</h3>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>Economy, saloon, SUV &amp; 4x4</li>
              <li>Vans &amp; executive chauffeur</li>
              <li>Yard pickup or doorstep delivery</li>
              <li>Live GPS tracking</li>
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">How it works</h3>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> Choose pickup, delivery
                or chauffeur
              </li>
              <li className="flex items-center gap-2">
                <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden /> Pay before dispatch —
                M-Pesa or card
              </li>
              <li className="flex items-center gap-2">
                <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden /> Track your car live
                on the map
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t pt-4 text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} {BRAND.name}. Built as an open, two-sided rental
            platform for East Africa.
          </p>
        </div>
      </div>
    </footer>
  )
}

export default function Home() {
  // One client-side query client for the whole SPA shell
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  const roleView = useAppStore((s) => s.roleView)
  const setRoleView = useAppStore((s) => s.setRoleView)

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <div className="flex min-h-screen flex-col bg-background text-foreground">
          <AppHeader roleView={roleView} onRoleChange={setRoleView} />
          <main className="flex-1">
            <Workspace role={roleView} />
          </main>
          <SiteFooter />
        </div>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
