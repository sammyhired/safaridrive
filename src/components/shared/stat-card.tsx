'use client'

import type { LucideIcon } from 'lucide-react'
import { TrendingDown, TrendingUp } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  trend,
}: {
  title: string
  value: string
  icon?: LucideIcon
  hint?: string
  trend?: string
}) {
  const trendUp = trend?.trim().startsWith('+')
  const trendDown = trend?.trim().startsWith('-')

  return (
    <Card className="gap-0 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 truncate text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        {Icon ? (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
            <Icon className="size-5" aria-hidden="true" />
          </div>
        ) : null}
      </div>
      {hint || trend ? (
        <div className="mt-3 flex items-center gap-2">
          {trend ? (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-xs font-medium whitespace-nowrap',
                trendUp && 'text-emerald-700 dark:text-emerald-400',
                trendDown && 'text-destructive',
                !trendUp && !trendDown && 'text-muted-foreground',
              )}
            >
              {trendUp ? <TrendingUp className="size-3" aria-hidden="true" /> : null}
              {trendDown ? <TrendingDown className="size-3" aria-hidden="true" /> : null}
              {trend}
            </span>
          ) : null}
          {hint ? <span className="truncate text-xs text-muted-foreground">{hint}</span> : null}
        </div>
      ) : null}
    </Card>
  )
}
