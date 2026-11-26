'use client'

// AdminApp — platform control centre.
// Sections: Overview, Bookings, Users, Promos.

import { useState } from 'react'
import { ClipboardList, Gauge, ShieldCheck, TicketPercent, Users } from 'lucide-react'
import { useSession } from '@/hooks/use-session'
import { AccessGuard, SessionGateSkeleton } from '@/components/owner/_shared/states'
import { WorkspaceShell, type WorkspaceNavItem } from '@/components/owner/_shared/workspace-shell'
import { BookingsSection } from '@/components/owner/_shared/bookings-section'
import { OverviewSection } from './overview-section'
import { UsersSection } from './users-section'
import { PromosSection } from './promos-section'

type AdminSection = 'overview' | 'bookings' | 'users' | 'promos'

const NAV_ITEMS: WorkspaceNavItem[] = [
  { key: 'overview', label: 'Overview', icon: Gauge },
  { key: 'bookings', label: 'Bookings', icon: ClipboardList },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'promos', label: 'Promos', icon: TicketPercent },
]

export default function AdminApp() {
  const { user, isLoading } = useSession()
  const [section, setSection] = useState<AdminSection>('overview')

  const allowed = user?.role === 'ADMIN'

  if (isLoading) {
    return <SessionGateSkeleton />
  }

  if (!allowed) {
    return (
      <AccessGuard
        icon={ShieldCheck}
        title="Admin workspace"
        description="Sign in as a platform admin to oversee bookings, users, revenue and promotions."
        demoNote="Demo admin: admin@safaridrive.co.ke"
      />
    )
  }

  return (
    <WorkspaceShell items={NAV_ITEMS} active={section} onNavigate={(key) => setSection(key as AdminSection)}>
      {section === 'overview' ? <OverviewSection /> : null}
      {section === 'bookings' ? <BookingsSection variant="admin" /> : null}
      {section === 'users' ? <UsersSection /> : null}
      {section === 'promos' ? <PromosSection /> : null}
    </WorkspaceShell>
  )
}
