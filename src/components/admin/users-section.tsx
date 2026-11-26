'use client'

// Admin users section — searchable roster with suspend / activate controls.

import { useMemo, useState } from 'react'
import {
  BadgeCheck,
  Ban,
  Building2,
  Car,
  CheckCircle2,
  Search,
  ShieldCheck,
  UserRoundX,
  type LucideIcon,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { useSession } from '@/hooks/use-session'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Role } from '@/lib/types'
import { useUserStatusUpdate, useUsers, type AdminUserSummary } from '@/components/owner/_shared/api'
import { InitialsAvatar } from '@/components/owner/_shared/ui-bits'
import { ErrorState } from '@/components/owner/_shared/states'
import { TableSkeleton } from '@/components/owner/_shared/skeletons'
import { SectionHeader } from '@/components/owner/_shared/section-header'

const ROLE_META: Record<Role, { icon: LucideIcon; className: string }> = {
  CUSTOMER: { icon: Car, className: 'text-muted-foreground' },
  OWNER: { icon: Building2, className: 'text-primary' },
  DRIVER: { icon: BadgeCheck, className: 'text-amber-600 dark:text-amber-400' },
  ADMIN: { icon: ShieldCheck, className: 'text-destructive' },
}

function roleTitle(role: Role): string {
  return role.charAt(0) + role.slice(1).toLowerCase()
}

function RoleBadge({ role }: { role: Role }) {
  const meta = ROLE_META[role] ?? ROLE_META.CUSTOMER
  return (
    <Badge variant="outline" className="gap-1.5">
      <meta.icon className={cn('size-3', meta.className)} aria-hidden />
      <span className={meta.className}>{roleTitle(role)}</span>
    </Badge>
  )
}

export function UsersSection() {
  const { user: currentUser } = useSession()
  const usersQuery = useUsers()
  const statusUpdate = useUserStatusUpdate()
  const [search, setSearch] = useState('')
  const [confirmTarget, setConfirmTarget] = useState<AdminUserSummary | null>(null)

  const users = usersQuery.data?.users ?? []
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return users
    return users.filter((user) =>
      [user.name, user.email, user.phone].some(
        (field) => field != null && field.toLowerCase().includes(query),
      ),
    )
  }, [users, search])

  const activate = (target: AdminUserSummary) => {
    statusUpdate.mutate({ userId: target.id, status: 'ACTIVE' })
  }

  return (
    <section aria-label="Users">
      <SectionHeader
        title="Users"
        description="Everyone on the SafariDrive platform — customers, owners, drivers and admins."
        action={
          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email or phone"
              aria-label="Search users"
              className="h-11 w-full pl-9"
            />
          </div>
        }
      />

      {usersQuery.isLoading ? (
        <TableSkeleton rows={7} />
      ) : usersQuery.isError ? (
        <ErrorState
          error={usersQuery.error}
          onRetry={() => {
            void usersQuery.refetch()
          }}
        />
      ) : filtered.length === 0 ? (
        search.trim() !== '' ? (
          <EmptyState
            icon={UserRoundX}
            title="No matching users"
            description={`Nothing matches "${search.trim()}". Try a different name, email or phone.`}
          />
        ) : (
          <EmptyState
            icon={UserRoundX}
            title="No users yet"
            description="Registrations will appear here as people join the platform."
          />
        )
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden p-0 lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((user) => {
                  const isSelf = user.id === currentUser?.id
                  const busy = statusUpdate.isPending && statusUpdate.variables?.userId === user.id
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <InitialsAvatar name={user.name} className="size-8" />
                          <span className="text-sm font-medium">{user.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-52 truncate text-sm text-muted-foreground">
                        {user.email}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.phone ?? '\u2014'}
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={user.role} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={user.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {isSelf ? (
                          <span className="text-xs text-muted-foreground">You</span>
                        ) : user.status === 'ACTIVE' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={busy}
                            onClick={() => setConfirmTarget(user)}
                          >
                            <Ban className="size-3.5" aria-hidden />
                            Suspend
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9"
                            disabled={busy}
                            onClick={() => activate(user)}
                          >
                            <CheckCircle2 className="size-3.5" aria-hidden />
                            Activate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 lg:hidden">
            {filtered.map((user) => {
              const isSelf = user.id === currentUser?.id
              const busy = statusUpdate.isPending && statusUpdate.variables?.userId === user.id
              return (
                <Card key={user.id} className="gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <InitialsAvatar name={user.name} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{user.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    <StatusBadge status={user.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                    <RoleBadge role={user.role} />
                    {user.phone ? <span>{user.phone}</span> : null}
                    <span>Joined {formatDate(user.createdAt)}</span>
                  </div>
                  {isSelf ? (
                    <p className="border-t pt-3 text-xs text-muted-foreground">
                      This is your account.
                    </p>
                  ) : (
                    <div className="border-t pt-3">
                      {user.status === 'ACTIVE' ? (
                        <Button
                          variant="outline"
                          className="h-11 w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={busy}
                          onClick={() => setConfirmTarget(user)}
                        >
                          <Ban className="size-4" aria-hidden />
                          Suspend user
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="h-11 w-full"
                          disabled={busy}
                          onClick={() => activate(user)}
                        >
                          <CheckCircle2 className="size-4" aria-hidden />
                          Activate user
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* Suspend confirmation */}
      <AlertDialog
        open={confirmTarget != null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend {confirmTarget?.name ?? 'user'}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget?.name} will be signed out and unable to book, list vehicles or work
              trips until reactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Keep active</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (!confirmTarget) return
                statusUpdate.mutate({ userId: confirmTarget.id, status: 'SUSPENDED' })
                setConfirmTarget(null)
              }}
            >
              Suspend user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
