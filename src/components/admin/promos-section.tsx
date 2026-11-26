'use client'

// Admin promos section — create promo codes and toggle them active/inactive.

import { useState } from 'react'
import { Loader2, Plus, TicketPercent } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { formatDate, formatKes } from '@/lib/format'
import { usePromoCreate, usePromoToggle, usePromos } from '@/components/owner/_shared/api'
import { toInt } from '@/components/owner/_shared/form-utils'
import { ErrorState } from '@/components/owner/_shared/states'
import { TableSkeleton } from '@/components/owner/_shared/skeletons'
import { SectionHeader } from '@/components/owner/_shared/section-header'

type PromoKind = 'percent' | 'amount'

function promoValue(percentOff: number | null, amountOff: number | null): string {
  if (percentOff != null) return `${percentOff}% off`
  if (amountOff != null) return formatKes(amountOff)
  return '\u2014'
}

export function PromosSection() {
  const promosQuery = usePromos()
  const create = usePromoCreate()
  const toggle = usePromoToggle()

  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<PromoKind>('percent')
  const [value, setValue] = useState('')

  const numericValue = toInt(value)
  const isValid =
    code.trim().length >= 3 &&
    numericValue != null &&
    (kind === 'percent' ? numericValue >= 1 && numericValue <= 100 : numericValue >= 1)

  const submit = () => {
    if (!isValid) return
    create.mutate(
      {
        code: code.trim().toUpperCase(),
        description: description.trim(),
        percentOff: kind === 'percent' ? numericValue : undefined,
        amountOff: kind === 'amount' ? numericValue : undefined,
      },
      {
        onSuccess: () => {
          setCode('')
          setDescription('')
          setValue('')
        },
      },
    )
  }

  const busyPromoId = toggle.isPending ? toggle.variables?.promoId : undefined

  return (
    <section aria-label="Promos">
      <SectionHeader
        title="Promo codes"
        description="Discount codes customers can apply at checkout."
      />

      {/* Create form */}
      <Card className="mb-6 gap-4 p-4 sm:p-6">
        <div>
          <CardTitle className="text-base">Create a promo code</CardTitle>
          <CardDescription className="mt-1 text-xs">
            Percentage or fixed amount off the rental subtotal (before delivery and chauffeur fees).
          </CardDescription>
        </div>
        <form
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="promo-code">Code</Label>
            <Input
              id="promo-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="SUMMER25"
              maxLength={24}
              className="h-11 font-mono uppercase"
              aria-describedby="promo-code-hint"
            />
            <p id="promo-code-hint" className="text-xs text-muted-foreground">
              Min 3 characters, shown uppercase.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promo-description">Description</Label>
            <Input
              id="promo-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Summer campaign"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Discount type</Label>
            <RadioGroup
              value={kind}
              onValueChange={(next) => setKind(next as PromoKind)}
              className="flex h-11 items-center gap-5"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="percent" id="promo-kind-percent" />
                <Label htmlFor="promo-kind-percent" className="font-normal">
                  Percent off
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="amount" id="promo-kind-amount" />
                <Label htmlFor="promo-kind-amount" className="font-normal">
                  Amount off
                </Label>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promo-value">
              {kind === 'percent' ? 'Percent off (%)' : 'Amount off (KSh)'}
            </Label>
            <div className="flex gap-2">
              <Input
                id="promo-value"
                inputMode="numeric"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={kind === 'percent' ? '10' : '500'}
                className="h-11"
              />
              <Button type="submit" className="h-11 shrink-0" disabled={!isValid || create.isPending}>
                {create.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Plus className="size-4" aria-hidden />
                )}
                Create
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Table */}
      {promosQuery.isLoading ? (
        <TableSkeleton rows={5} />
      ) : promosQuery.isError ? (
        <ErrorState
          error={promosQuery.error}
          onRetry={() => {
            void promosQuery.refetch()
          }}
        />
      ) : (promosQuery.data?.promos ?? []).length === 0 ? (
        <EmptyState
          icon={TicketPercent}
          title="No promo codes yet"
          description="Create your first code above to run a campaign or reward loyal customers."
        />
      ) : (
        <>
          <Card className="hidden overflow-hidden p-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Expiry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(promosQuery.data?.promos ?? []).map((promo) => (
                  <TableRow key={promo.id}>
                    <TableCell>
                      <span className="font-mono text-sm font-semibold">{promo.code}</span>
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-sm text-muted-foreground">
                      {promo.description || '\u2014'}
                    </TableCell>
                    <TableCell className="text-sm font-medium tabular-nums">
                      {promoValue(promo.percentOff, promo.amountOff)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Switch
                          checked={promo.active}
                          onCheckedChange={(checked) =>
                            toggle.mutate({ promoId: promo.id, active: checked })
                          }
                          disabled={busyPromoId === promo.id}
                          aria-label={`Toggle ${promo.code}`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {promo.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {promo.expiresAt ? formatDate(promo.expiresAt) : 'No expiry'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {(promosQuery.data?.promos ?? []).map((promo) => (
              <Card key={promo.id} className="gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">{promo.code}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {promo.description || 'No description'}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {promoValue(promo.percentOff, promo.amountOff)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-xs text-muted-foreground">
                    {promo.expiresAt ? `Expires ${formatDate(promo.expiresAt)}` : 'No expiry'}
                  </span>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs text-muted-foreground">
                      {promo.active ? 'Active' : 'Inactive'}
                    </span>
                    <Switch
                      checked={promo.active}
                      onCheckedChange={(checked) =>
                        toggle.mutate({ promoId: promo.id, active: checked })
                      }
                      disabled={busyPromoId === promo.id}
                      aria-label={`Toggle ${promo.code}`}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
