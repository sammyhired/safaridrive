'use client'

// Access guard, session gate skeleton and error state for the dashboards.

import { useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import LoginDialog from '@/components/shared/login-dialog'
import { ApiError } from '@/lib/api'

/** Friendly full-width card prompting the visitor to sign in with the right role. */
export function AccessGuard({
  icon: Icon,
  title,
  description,
  demoNote,
}: {
  icon: LucideIcon
  title: string
  description: string
  demoNote: string
}) {
  const [loginOpen, setLoginOpen] = useState(false)

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-20">
      <Card className="items-center gap-4 p-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-7" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <p className="w-full rounded-lg border border-dashed bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
          {demoNote}
        </p>
        <Button size="lg" className="h-11 w-full sm:w-auto" onClick={() => setLoginOpen(true)}>
          Sign in to continue
        </Button>
        <p className="text-xs text-muted-foreground">
          Use the demo quick-login buttons inside, or register a new owner account.
        </p>
      </Card>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  )
}

/** Shown while the session query resolves. */
export function SessionGateSkeleton() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-20">
      <Card className="items-center gap-3 p-6">
        <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Checking your session&hellip;</p>
      </Card>
    </div>
  )
}

/** Graceful query error card — treats 401/403 as an access problem, no crash. */
export function ErrorState({ error, onRetry }: { error: Error | null; onRetry?: () => void }) {
  const restricted = error instanceof ApiError && (error.status === 401 || error.status === 403)

  return (
    <Card className="items-center gap-4 p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold">{restricted ? 'Access restricted' : 'Something went wrong'}</h3>
        <p className="text-sm text-muted-foreground">
          {restricted
            ? 'Your account cannot view this data. Sign in with the correct role to continue.'
            : (error?.message ?? 'The request failed. Please try again.')}
        </p>
      </div>
      {onRetry ? (
        <Button variant="outline" className="h-11" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden />
          Try again
        </Button>
      ) : null}
    </Card>
  )
}
