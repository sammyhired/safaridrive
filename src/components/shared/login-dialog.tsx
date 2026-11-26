'use client'

import { useEffect, useState } from 'react'
import {
  Building2,
  Car,
  Loader2,
  LogIn,
  Navigation,
  ShieldCheck,
  UserPlus,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { useSession } from '@/hooks/use-session'
import { ApiError } from '@/lib/api'
import { DEMO_ACCOUNTS } from '@/lib/constants'
import type { Role, SessionUser } from '@/lib/types'

const DEMO_ICONS: Record<Role, typeof Car> = {
  CUSTOMER: Car,
  OWNER: Building2,
  DRIVER: Navigation,
  ADMIN: ShieldCheck,
}

type Busy = null | 'signin' | 'register' | `demo:${string}`

export default function LoginDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { toast } = useToast()
  const { login, loginDemo, register } = useSession()

  const [tab, setTab] = useState<'signin' | 'register'>('signin')
  const [busy, setBusy] = useState<Busy>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<Role>('CUSTOMER')

  useEffect(() => {
    if (open) {
      setTab('signin')
      setBusy(null)
      setEmail('')
      setPassword('')
      setName('')
      setPhone('')
      setRole('CUSTOMER')
    }
  }, [open])

  const fail = (err: unknown): void => {
    if (err instanceof ApiError && err.status === 401) {
      toast({ title: 'Invalid email or password', variant: 'destructive' })
    } else if (err instanceof Error && err.message) {
      toast({ title: err.message, variant: 'destructive' })
    } else {
      toast({ title: 'Something went wrong. Please try again.', variant: 'destructive' })
    }
  }

  const succeed = (user: SessionUser, message: string): void => {
    toast({ title: message, description: user.email })
    onOpenChange(false)
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!email.trim() || !password) {
      toast({ title: 'Enter your email and password', variant: 'destructive' })
      return
    }
    setBusy('signin')
    try {
      const user = await login(email.trim(), password)
      succeed(user, `Signed in as ${user.name}`)
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const handleDemo = async (demoEmail: string) => {
    if (busy) return
    setBusy(`demo:${demoEmail}`)
    try {
      const user = await loginDemo(demoEmail)
      succeed(user, `Signed in as ${user.name}`)
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!name.trim() || !email.trim() || !phone.trim()) {
      toast({ title: 'Please fill in all fields', variant: 'destructive' })
      return
    }
    if (password.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' })
      return
    }
    setBusy('register')
    try {
      const user = await register({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        role,
      })
      succeed(user, `Welcome to SafariDrive, ${user.name}`)
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to SafariDrive</DialogTitle>
          <DialogDescription>Book. Pay. Drive. — car rental across Kenya.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'signin' | 'register')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="register">Create account</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-4">
            <form onSubmit={handleSignIn} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy !== null}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy !== null}
                  required
                />
              </div>
              <Button type="submit" className="h-11 w-full" disabled={busy !== null}>
                {busy === 'signin' ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <LogIn aria-hidden="true" />
                )}
                {busy === 'signin' ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <div className="my-4 flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or try a demo account</span>
              <Separator className="flex-1" />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DEMO_ACCOUNTS.map((account) => {
                const Icon = DEMO_ICONS[account.role]
                const isBusy = busy === `demo:${account.email}`
                return (
                  <Button
                    key={account.email}
                    type="button"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void handleDemo(account.email)}
                    className="h-auto min-h-11 w-full justify-start gap-3 bg-muted/40 px-3 py-2 text-left"
                    aria-label={`Sign in as ${account.label}`}
                  >
                    {isBusy ? (
                      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
                    ) : (
                      <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium">{account.label}</span>
                    </span>
                  </Button>
                )
              })}
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Demo accounts use password &ldquo;demo123&rdquo;.
            </p>
          </TabsContent>

          <TabsContent value="register" className="mt-4">
            <form onSubmit={handleRegister} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reg-name">Full name</Label>
                <Input
                  id="reg-name"
                  autoComplete="name"
                  placeholder="Jane Wanjiru"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy !== null}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reg-email">Email</Label>
                <Input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy !== null}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reg-phone">Phone</Label>
                <Input
                  id="reg-phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="07xx xxx xxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={busy !== null}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reg-password">Password</Label>
                <Input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy !== null}
                  required
                />
              </div>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">I am joining as</legend>
                <RadioGroup
                  value={role}
                  onValueChange={(v) => setRole(v as Role)}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                  disabled={busy !== null}
                >
                  <Label
                    htmlFor="role-customer"
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem value="CUSTOMER" id="role-customer" />
                    <span>
                      <span className="block text-sm font-medium">Customer</span>
                      <span className="block text-xs text-muted-foreground">Rent vehicles</span>
                    </span>
                  </Label>
                  <Label
                    htmlFor="role-owner"
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem value="OWNER" id="role-owner" />
                    <span>
                      <span className="block text-sm font-medium">Business owner</span>
                      <span className="block text-xs text-muted-foreground">List your fleet</span>
                    </span>
                  </Label>
                </RadioGroup>
              </fieldset>

              <Button type="submit" className="h-11 w-full" disabled={busy !== null}>
                {busy === 'register' ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <UserPlus aria-hidden="true" />
                )}
                {busy === 'register' ? 'Creating account…' : 'Create account'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
