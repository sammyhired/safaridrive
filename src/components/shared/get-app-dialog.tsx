'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import {
  Building2,
  Car,
  Check,
  Copy,
  Download,
  ExternalLink,
  Navigation,
  ShieldCheck,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { Role } from '@/lib/types'

interface AppDef {
  role: Role
  label: string
  file: string
  icon: typeof Car
  blurb: string
}

const APPS: AppDef[] = [
  {
    role: 'CUSTOMER',
    label: 'Customer',
    file: 'SafariDrive-Customer-v1.0.0.apk',
    icon: Car,
    blurb: 'Browse cars, book & pay with M-Pesa, track your trip live.',
  },
  {
    role: 'OWNER',
    label: 'Owner',
    file: 'SafariDrive-Owner-v1.0.0.apk',
    icon: Building2,
    blurb: 'List your fleet, approve bookings, watch earnings grow.',
  },
  {
    role: 'DRIVER',
    label: 'Driver',
    file: 'SafariDrive-Driver-v1.0.0.apk',
    icon: Navigation,
    blurb: 'Get dispatched jobs, navigate, and update trip status.',
  },
  {
    role: 'ADMIN',
    label: 'Admin',
    file: 'SafariDrive-Admin-v1.0.0.apk',
    icon: ShieldCheck,
    blurb: 'Approve listings, resolve disputes, monitor the platform.',
  },
]

const RELEASES_URL = 'https://github.com/sammyhired/safaridrive/releases'

/**
 * DialogContent unmounts while closed, so this inner component (and its state)
 * is fresh every time the dialog opens — no sync effects needed.
 */
function GetAppContent({ role }: { role: Role }) {
  const { toast } = useToast()
  const [override, setOverride] = useState<Role | null>(null)
  const selected = override ?? role
  const [origin] = useState(() => window.location.origin)
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)

  const app = APPS.find((a) => a.role === selected) ?? APPS[0]
  const apkUrl = `${origin}/apk/${app.file}`

  // Render a QR of the APK download link so desktop users can scan with a phone
  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(apkUrl, {
      width: 320,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQr(url)
      })
      .catch(() => setQr(''))
    return () => {
      cancelled = true
    }
  }, [apkUrl])

  const copyServer = async () => {
    try {
      await navigator.clipboard.writeText(origin)
      setCopied(true)
      toast({ title: 'Server address copied' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: 'Could not copy — long-press to copy manually', variant: 'destructive' })
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Get the Android apps</DialogTitle>
        <DialogDescription>
          Install SafariDrive straight from this site — no store needed. Free, tiny (~40 KB),
          works on Android 7.0 and newer.
        </DialogDescription>
      </DialogHeader>

      {/* App picker */}
      <div
        role="tablist"
        aria-label="Choose your app"
        className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {APPS.map(({ role: r, label, icon: Icon }) => {
          const active = r === selected
          return (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setOverride(r)}
              className={cn(
                'flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          )
        })}
      </div>

      {/* QR + download */}
      <div className="mt-4 grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-[auto_1fr]">
        <div className="mx-auto flex flex-col items-center gap-2">
          <div className="rounded-lg border bg-white p-2">
            {qr ? (
              <img src={qr} alt={`QR code to download the ${app.label} app`} className="size-32" />
            ) : (
              <div className="size-32 animate-pulse rounded bg-muted" aria-hidden />
            )}
          </div>
          <p className="text-center text-[11px] leading-tight text-muted-foreground">
            Scan with a phone camera to download
          </p>
        </div>
        <div className="flex flex-col justify-center gap-3">
          <div>
            <p className="text-sm font-semibold">SafariDrive {app.label}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{app.blurb}</p>
          </div>
          <Button asChild className="w-full sm:w-auto">
            <a href={`/apk/${app.file}`} download>
              <Download aria-hidden />
              Download APK
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">v1.0.0 · ~40 KB · Android 7.0+</p>
        </div>
      </div>

      {/* Server address */}
      <div className="mt-4 rounded-lg border p-3">
        <p className="text-xs font-medium">
          After installing, the app will ask for the SafariDrive server address:
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 text-xs">
            {origin}
          </code>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            aria-label="Copy server address"
            onClick={() => void copyServer()}
          >
            {copied ? (
              <Check className="size-4 text-primary" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
          </Button>
        </div>
      </div>

      {/* Install steps */}
      <ol className="mt-4 space-y-2 text-sm text-muted-foreground">
        <li className="flex gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
            1
          </span>
          Download the APK above — or scan the QR code from another device.
        </li>
        <li className="flex gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
            2
          </span>
          Tap the download and allow “Install unknown apps” when Android asks — it&apos;s a
          one-time permission for your browser.
        </li>
        <li className="flex gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
            3
          </span>
          Open the app, paste the server address above, and connect.
        </li>
        <li className="flex gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
            4
          </span>
          Sign in — you land straight on your {app.label.toLowerCase()} home.
        </li>
      </ol>

      <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
        <p>
          On iPhone, iPad or desktop? Open this site in the browser and choose “Add to Home
          Screen” — the web app has the same features.
        </p>
        <p className="mt-1.5">
          Every release is also published on{' '}
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
          >
            GitHub Releases <ExternalLink className="size-3" aria-hidden />
          </a>
          .
        </p>
      </div>
    </>
  )
}

export default function GetAppDialog({
  open,
  onOpenChange,
  role,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  role: Role
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto sm:max-w-lg">
        <GetAppContent role={role} />
      </DialogContent>
    </Dialog>
  )
}
