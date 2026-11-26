'use client'

// Expenses section — total + per-category summary, vehicle filter,
// grouped expense log and an add-expense dialog.

import { useEffect, useMemo, useState } from 'react'
import {
  Fuel,
  Hammer,
  Loader2,
  Plus,
  Receipt,
  ShieldCheck,
  Tag,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/shared/empty-state'
import { useSession } from '@/hooks/use-session'
import { formatDate, formatKes, formatKesShort } from '@/lib/format'
import type { Expense, ExpenseCategory, Vehicle } from '@/lib/types'
import { useExpenseCreate, useExpenses, useVehicles } from './_shared/api'
import { toInt, todayInputValue, truncateLabel } from './_shared/form-utils'
import { ErrorState } from './_shared/states'
import { ListSkeleton } from './_shared/skeletons'
import { SectionHeader } from './_shared/section-header'

const EXPENSE_CATEGORY_META: Record<ExpenseCategory, { label: string; icon: LucideIcon }> = {
  FUEL: { label: 'Fuel', icon: Fuel },
  SERVICE: { label: 'Service', icon: Wrench },
  INSURANCE: { label: 'Insurance', icon: ShieldCheck },
  REPAIR: { label: 'Repair', icon: Hammer },
  OTHER: { label: 'Other', icon: Tag },
}

const EXPENSE_CATEGORIES = Object.keys(EXPENSE_CATEGORY_META) as ExpenseCategory[]

// ---------------------------------------------------------------------------
// Add-expense dialog
// ---------------------------------------------------------------------------

function ExpenseDialog({
  open,
  onOpenChange,
  vehicles,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  vehicles: Vehicle[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open ? <ExpenseForm vehicles={vehicles} onOpenChange={onOpenChange} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function ExpenseForm({
  vehicles,
  onOpenChange,
}: {
  vehicles: Vehicle[]
  onOpenChange: (open: boolean) => void
}) {
  const create = useExpenseCreate()
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '')
  const [category, setCategory] = useState<ExpenseCategory>('FUEL')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayInputValue())

  const amountValue = toInt(amount)
  const isValid = vehicleId !== '' && amountValue != null && amountValue > 0 && date.trim() !== ''

  const submit = () => {
    if (!isValid) return
    create.mutate(
      {
        vehicleId,
        category,
        amount: amountValue,
        note: note.trim() || undefined,
        date,
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Record an expense</DialogTitle>
        <DialogDescription>
          Fuel, service, insurance and repair costs count against your net revenue.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="expense-vehicle">Vehicle</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger id="expense-vehicle" className="h-11 w-full">
                <SelectValue placeholder="Choose a vehicle" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No vehicles in your fleet
                  </SelectItem>
                ) : (
                  vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {truncateLabel(vehicle.label, 24)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-category">Category</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as ExpenseCategory)}
            >
              <SelectTrigger id="expense-category" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {EXPENSE_CATEGORY_META[option].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-amount">Amount (KSh)</Label>
            <Input
              id="expense-amount"
              inputMode="numeric"
              className="h-11"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="2500"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-date">Date</Label>
            <Input
              id="expense-date"
              type="date"
              className="h-11"
              value={date}
              max={todayInputValue()}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-note">Note (optional)</Label>
            <Textarea
              id="expense-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Full service at Westlands garage"
            />
          </div>
        </div>

      <DialogFooter>
        <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button className="h-11" onClick={submit} disabled={!isValid || create.isPending}>
          {create.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Save expense
        </Button>
      </DialogFooter>
    </>
  )
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export function ExpensesSection() {
  const { user } = useSession()
  const vehiclesQuery = useVehicles()
  const [vehicleFilter, setVehicleFilter] = useState('ALL')
  const [addOpen, setAddOpen] = useState(false)

  const isOwner = user?.role === 'OWNER'
  const isAdmin = user?.role === 'ADMIN'
  const expensesQuery = useExpenses(vehicleFilter === 'ALL' ? undefined : vehicleFilter)

  const myVehicles = useMemo(() => {
    const all = vehiclesQuery.data?.vehicles ?? []
    return isAdmin ? all : all.filter((vehicle) => vehicle.ownerId === user?.id)
  }, [vehiclesQuery.data, isAdmin, user])

  const expenses = useMemo(
    () =>
      [...(expensesQuery.data?.expenses ?? [])].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [expensesQuery.data],
  )

  const byCategory = useMemo(() => {
    const totals = new Map<ExpenseCategory, number>()
    for (const expense of expenses) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount)
    }
    return EXPENSE_CATEGORIES.filter((category) => totals.has(category)).map((category) => ({
      category,
      total: totals.get(category) ?? 0,
    }))
  }, [expenses])

  const groups = useMemo(() => {
    const map = new Map<string, Expense[]>()
    for (const expense of expenses) {
      const list = map.get(expense.vehicleLabel) ?? []
      list.push(expense)
      map.set(expense.vehicleLabel, list)
    }
    return [...map.entries()].map(([label, rows]) => ({
      label,
      rows,
      subtotal: rows.reduce((sum, row) => sum + row.amount, 0),
    }))
  }, [expenses])

  const total = expensesQuery.data?.total ?? groups.reduce((sum, g) => sum + g.subtotal, 0)

  return (
    <section aria-label="Expenses">
      <SectionHeader
        title="Expenses"
        description="Fuel, service, insurance and repair costs across your fleet."
        action={
          isOwner ? (
            <Button className="h-11" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" aria-hidden />
              Add expense
            </Button>
          ) : null
        }
      />

      {/* Summary + vehicle filter */}
      <Card className="mb-4 gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total expenses</p>
            <p className="text-3xl font-bold tabular-nums text-destructive">{formatKes(total)}</p>
            <p className="text-xs text-muted-foreground">
              {expenses.length} record{expenses.length === 1 ? '' : 's'}
              {vehicleFilter !== 'ALL' ? ' for the selected vehicle' : ' across your fleet'}
            </p>
          </div>
          <div className="w-full sm:w-64">
            <Label htmlFor="expense-filter" className="sr-only">
              Filter by vehicle
            </Label>
            <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
              <SelectTrigger id="expense-filter" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All vehicles</SelectItem>
                {myVehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    {truncateLabel(vehicle.label, 24)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {byCategory.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {byCategory.map(({ category, total: categoryTotal }) => {
              const meta = EXPENSE_CATEGORY_META[category]
              return (
                <span
                  key={category}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                >
                  <meta.icon className="size-3.5 text-muted-foreground" aria-hidden />
                  {meta.label}
                  <span className="font-semibold tabular-nums">
                    {formatKesShort(categoryTotal)}
                  </span>
                </span>
              )
            })}
          </div>
        ) : null}
      </Card>

      {/* Grouped log */}
      {expensesQuery.isLoading ? (
        <ListSkeleton rows={5} />
      ) : expensesQuery.isError ? (
        <ErrorState
          error={expensesQuery.error}
          onRetry={() => {
            void expensesQuery.refetch()
          }}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No expenses recorded"
          description={
            isOwner
              ? 'Track fuel, servicing and repairs here to see true net revenue on your overview.'
              : 'Owners have not recorded any expenses for their fleets yet.'
          }
          action={
            isOwner ? (
              <Button className="h-11" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" aria-hidden />
                Add expense
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="max-h-96 overflow-y-auto overflow-x-hidden rounded-xl border bg-card [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
          {groups.map((group) => (
            <section key={group.label} aria-label={`Expenses for ${group.label}`}>
              <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-muted/95 px-4 py-2 backdrop-blur">
                <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h3>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatKes(group.subtotal)}
                </span>
              </header>
              <ul className="divide-y">
                {group.rows.map((expense) => {
                  const meta = EXPENSE_CATEGORY_META[expense.category] ?? EXPENSE_CATEGORY_META.OTHER
                  return (
                    <li key={expense.id} className="flex items-center gap-3 px-4 py-3">
                      <meta.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{meta.label}</p>
                        {expense.note ? (
                          <p className="truncate text-xs text-muted-foreground">{expense.note}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(expense.date)}
                      </span>
                      <span className="w-28 shrink-0 text-right text-sm font-semibold tabular-nums text-destructive">
                        &minus; {formatKes(expense.amount)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ExpenseDialog open={addOpen} onOpenChange={setAddOpen} vehicles={myVehicles} />
    </section>
  )
}
