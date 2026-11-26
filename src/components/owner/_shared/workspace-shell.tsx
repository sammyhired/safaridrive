'use client'

// Workspace chrome shared by the owner and admin dashboards:
// a collapsible icon-rail sidebar on desktop and a bottom tab bar on mobile.

import { useState, type ReactNode } from 'react'
import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export interface WorkspaceNavItem {
  key: string
  label: string
  icon: LucideIcon
  badge?: number
}

export function WorkspaceShell({
  items,
  active,
  onNavigate,
  children,
}: {
  items: WorkspaceNavItem[]
  active: string
  onNavigate: (key: string) => void
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <TooltipProvider delayDuration={0}>
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-4 sm:px-6 lg:py-6">
        {/* Desktop sidebar */}
        <aside className={cn('hidden shrink-0 lg:block', collapsed ? 'w-14' : 'w-60')}>
          <nav
            aria-label="Workspace sections"
            className="sticky top-24 flex flex-col gap-1 rounded-xl border bg-card p-2 shadow-sm"
          >
            {items.map((item) => {
              const isActive = item.key === active
              const button = (
                <button
                  type="button"
                  onClick={() => onNavigate(item.key)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  <item.icon className="size-[18px] shrink-0" aria-hidden />
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  {!collapsed && item.badge ? (
                    <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      {item.badge}
                    </span>
                  ) : null}
                  {collapsed && item.badge ? (
                    <span
                      className="absolute right-2 top-2 size-2 rounded-full bg-amber-500"
                      aria-label={`${item.badge} pending`}
                    />
                  ) : null}
                </button>
              )

              return collapsed ? (
                <Tooltip key={item.key}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                <div key={item.key}>{button}</div>
              )
            })}

            <div className={cn('mt-1 border-t pt-1', collapsed && 'flex justify-center')}>
              <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className={cn(
                  'flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                  collapsed && 'w-11 justify-center px-0',
                )}
              >
                {collapsed ? (
                  <PanelLeftOpen className="size-[18px]" aria-hidden />
                ) : (
                  <PanelLeftClose className="size-[18px]" aria-hidden />
                )}
                {!collapsed ? <span>Collapse</span> : null}
              </button>
            </div>
          </nav>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Workspace sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div
          className="mx-auto grid max-w-lg"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        >
          {items.map((item) => {
            const isActive = item.key === active
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(item.key)}
                aria-current={isActive ? 'page' : undefined}
                className="relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <item.icon
                  className={cn('size-5', isActive ? 'text-primary' : 'text-muted-foreground')}
                  aria-hidden
                />
                <span
                  className={cn(
                    'max-w-full truncate px-1',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </span>
                {item.badge ? (
                  <span className="absolute right-1/4 top-1.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </nav>
    </TooltipProvider>
  )
}
