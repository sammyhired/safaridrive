'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import {
  Bell,
  Building2,
  CalendarCheck,
  Car,
  ChevronDown,
  CreditCard,
  LogIn,
  LogOut,
  Moon,
  Navigation,
  ShieldCheck,
  Smartphone,
  Sun,
} from 'lucide-react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import GetAppDialog from '@/components/shared/get-app-dialog'
import LoginDialog from '@/components/shared/login-dialog'
import { useToast } from '@/hooks/use-toast'
import { useSession } from '@/hooks/use-session'
import { apiGet, apiPost } from '@/lib/api'
import { formatDateTime, initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AppNotification, Role } from '@/lib/types'

const ROLE_TABS: { role: Role; label: string; icon: typeof Car }[] = [
  { role: 'CUSTOMER', label: 'Customer', icon: Car },
  { role: 'OWNER', label: 'Owner', icon: Building2 },
  { role: 'DRIVER', label: 'Driver', icon: Navigation },
  { role: 'ADMIN', label: 'Admin', icon: ShieldCheck },
]

const ROLE_LABELS: Record<Role, string> = {
  CUSTOMER: 'Customer',
  OWNER: 'Business owner',
  DRIVER: 'Driver',
  ADMIN: 'Admin',
}

const NOTIFICATION_ICONS: Record<AppNotification['type'], typeof Bell> = {
  BOOKING: CalendarCheck,
  PAYMENT: CreditCard,
  TRIP: Navigation,
  SYSTEM: Bell,
}

function BrandMark() {
  return (
    <span className="flex shrink-0 items-center gap-2">
      <svg
        width="30"
        height="30"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient
            id="sd-header-logo"
            x1="4"
            y1="4"
            x2="28"
            y2="28"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#34d399" />
            <stop offset="1" stopColor="#059669" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="12.5" stroke="url(#sd-header-logo)" strokeWidth="3" />
        <circle cx="16" cy="16" r="4" fill="url(#sd-header-logo)" />
        <path
          d="M11.5 16H4.5M20.5 16H27.5M16 20.5V27.5"
          stroke="url(#sd-header-logo)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-base font-semibold tracking-tight">SafariDrive</span>
      <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary sm:inline">
        Kenya
      </span>
    </span>
  )
}

function RoleTabs({
  roleView,
  onRoleChange,
  className,
}: {
  roleView: Role
  onRoleChange: (r: Role) => void
  className?: string
}) {
  return (
    <div
      role="tablist"
      aria-label="Workspace"
      className={cn(
        'inline-flex items-center gap-1 rounded-lg bg-muted p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {ROLE_TABS.map(({ role, label, icon: Icon }) => {
        const active = roleView === role
        return (
          <button
            key={role}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onRoleChange(role)}
            className={cn(
              'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors md:h-9',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-11"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {/* Icons swap via the .dark class (set before hydration), so there is no
          flash and no mounted-state needed. */}
      <Sun className="hidden size-4 dark:block" aria-hidden="true" />
      <Moon className="size-4 dark:hidden" aria-hidden="true" />
    </Button>
  )
}

function NotificationBell() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [marking, setMarking] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      apiGet<{ notifications: AppNotification[]; unreadCount: number }>('/api/notifications'),
    refetchInterval: 30_000,
  })

  const notifications = data?.notifications ?? []
  const unread = data?.unreadCount ?? 0

  const markAllRead = async () => {
    setMarking(true)
    try {
      await apiPost('/api/notifications/read-all', {})
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Could not mark notifications as read',
        variant: 'destructive',
      })
    } finally {
      setMarking(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) void refetch()
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-11"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell className="size-4" aria-hidden="true" />
          {unread > 0 ? (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Button
            variant="link"
            className="h-auto p-0 text-xs"
            disabled={unread === 0 || marking}
            onClick={() => void markAllRead()}
          >
            {marking ? 'Marking…' : 'Mark all read'}
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {isLoading && !data ? (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : notifications.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No notifications yet"
              description="Booking and trip updates will show up here."
              className="border-none p-6"
            />
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => {
                const Icon = NOTIFICATION_ICONS[n.type] ?? Bell
                return (
                  <li
                    key={n.id}
                    className={cn(
                      'flex gap-3 px-4 py-3',
                      !n.read && 'bg-accent/50',
                    )}
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDateTime(n.createdAt)}
                      </p>
                    </div>
                    {!n.read ? (
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                        aria-label="Unread"
                      />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function UserChip() {
  const { toast } = useToast()
  const { user, logout } = useSession()

  if (!user) return null

  const handleSignOut = async () => {
    await logout()
    toast({ title: 'Signed out', description: 'See you soon.' })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex min-h-11 items-center gap-2 rounded-full border bg-background py-1 pr-2 pl-1 transition-colors hover:bg-accent"
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-left sm:block">
            <span className="block max-w-32 truncate text-sm leading-tight font-medium">
              {user.name}
            </span>
            <span className="block text-xs leading-tight text-muted-foreground">
              {ROLE_LABELS[user.role]}
            </span>
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
          <p className="mt-1 text-xs font-normal text-muted-foreground">
            {ROLE_LABELS[user.role]}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handleSignOut()} className="min-h-9">
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function AppHeader({
  roleView,
  onRoleChange,
}: {
  roleView: Role
  onRoleChange: (r: Role) => void
}) {
  const { user, isLoading } = useSession()
  const [loginOpen, setLoginOpen] = useState(false)
  const [getAppOpen, setGetAppOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <BrandMark />

        {/* Desktop: role tabs centered in the header */}
        <nav aria-label="Workspace" className="hidden flex-1 justify-center md:flex">
          <RoleTabs roleView={roleView} onRoleChange={onRoleChange} />
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Button
            variant="ghost"
            className="h-11 gap-1.5 px-3"
            aria-label="Get the Android apps"
            onClick={() => setGetAppOpen(true)}
          >
            <Smartphone className="size-4" aria-hidden />
            <span className="hidden sm:inline">Get app</span>
          </Button>
          <ThemeToggle />
          {user ? <NotificationBell /> : null}
          {isLoading ? (
            <Skeleton className="size-9 rounded-full" aria-hidden="true" />
          ) : user ? (
            <UserChip />
          ) : (
            <Button className="h-11" onClick={() => setLoginOpen(true)}>
              <LogIn aria-hidden="true" />
              Sign in
            </Button>
          )}
        </div>
      </div>

      {/* Mobile: role tabs on a second, horizontally scrollable row */}
      <nav aria-label="Workspace" className="border-t md:hidden">
        <div className="mx-auto max-w-7xl px-3 pt-1.5 pb-2">
          <RoleTabs
            roleView={roleView}
            onRoleChange={onRoleChange}
            className="w-full overflow-x-auto"
          />
        </div>
      </nav>

      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <GetAppDialog open={getAppOpen} onOpenChange={setGetAppOpen} role={roleView} />
    </header>
  )
}
