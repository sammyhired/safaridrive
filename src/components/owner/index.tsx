'use client'

// OwnerApp — fleet & rental business control centre.
// Sections: Overview, Fleet, Bookings, Drivers, Expenses.

import { useMemo, useState } from 'react'
import {
  Building2,
  CarFront,
  ClipboardList,
  Gauge,
  Receipt,
  Users,
} from 'lucide-react'
import { useSession } from '@/hooks/use-session'
import { AccessGuard, SessionGateSkeleton } from './_shared/states'
import { WorkspaceShell, type WorkspaceNavItem } from './_shared/workspace-shell'
import { useOwnerStats } from './_shared/api'
import { BookingsSection } from './_shared/bookings-section'
import { OverviewSection } from './overview-section'
import { FleetSection } from './fleet-section'
import { DriversSection } from './drivers-section'
import { ExpensesSection } from './expenses-section'

type OwnerSection = 'overview' | 'fleet' | 'bookings' | 'drivers' | 'expenses'

export default function OwnerApp() {
  const { user, isLoading } = useSession()
  const [section, setSection] = useState<OwnerSection>('overview')

  const allowed = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const statsQuery = useOwnerStats(allowed)

  const navItems: WorkspaceNavItem[] = useMemo(
    () => [
      { key: 'overview', label: 'Overview', icon: Gauge },
      { key: 'fleet', label: 'Fleet', icon: CarFront },
      {
        key: 'bookings',
        label: 'Bookings',
        icon: ClipboardList,
        badge: statsQuery.data?.stats.pendingBookings,
      },
      { key: 'drivers', label: 'Drivers', icon: Users },
      { key: 'expenses', label: 'Expenses', icon: Receipt },
    ],
    [statsQuery.data],
  )

  if (isLoading) {
    return <SessionGateSkeleton />
  }

  if (!allowed) {
    return (
      <AccessGuard
        icon={Building2}
        title="Owner workspace"
        description="Sign in as a fleet owner to manage your vehicles, bookings, drivers and expenses."
        demoNote="Demo owner: owner@safaridrive.co.ke"
      />
    )
  }

  return (
    <WorkspaceShell
      items={navItems}
      active={section}
      onNavigate={(key) => setSection(key as OwnerSection)}
    >
      {section === 'overview' ? <OverviewSection /> : null}
      {section === 'fleet' ? <FleetSection /> : null}
      {section === 'bookings' ? <BookingsSection variant="owner" /> : null}
      {section === 'drivers' ? <DriversSection /> : null}
      {section === 'expenses' ? <ExpensesSection /> : null}
    </WorkspaceShell>
  )
}
