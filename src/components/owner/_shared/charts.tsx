'use client'

// Recharts wrappers for the dashboards. Colors come from theme CSS variables
// (--chart-1..5, --border, --destructive) so charts adapt to light/dark mode.

import { useId } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BookingStatus, MonthlyPoint } from '@/lib/types'
import { formatKes, formatKesShort, statusLabel, statusTone } from '@/lib/format'
import { truncateLabel } from './form-utils'

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 11 }

const TONE_COLORS: Record<string, string> = {
  success: 'var(--chart-1)',
  info: 'var(--chart-4)',
  warning: 'var(--chart-2)',
  danger: 'var(--destructive)',
  neutral: 'var(--chart-5)',
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

interface TipItem {
  name?: string | number
  value?: number | string
  color?: string
  payload?: Record<string, unknown>
}

export function ChartTip({
  active,
  payload,
  label,
  formatValue,
  labelFromPayload,
}: {
  active?: boolean
  payload?: TipItem[]
  label?: string | number
  formatValue?: (value: number, name?: string | number) => string
  labelFromPayload?: string
}) {
  if (!active || !payload || payload.length === 0) return null

  const fullLabel = labelFromPayload
    ? String(payload[0]?.payload?.[labelFromPayload] ?? label)
    : label

  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-semibold text-foreground">{fullLabel}</p>
      <ul className="space-y-1">
        {payload.map((item, index) => (
          <li key={index} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              {item.name}
            </span>
            <span className="font-medium tabular-nums text-foreground">
              {formatValue
                ? formatValue(Number(item.value ?? 0), item.name)
                : String(item.value ?? 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Monthly trend chart (revenue / expenses areas, optional bookings line)
// ---------------------------------------------------------------------------

export interface TrendSeries {
  key: 'revenue' | 'expenses' | 'bookings'
  name: string
  color: string
  kind: 'area' | 'line'
  currency?: boolean
}

export function TrendChart({ data, series }: { data: MonthlyPoint[]; series: TrendSeries[] }) {
  const gradientId = useId().replace(/:/g, '')
  const hasMoney = series.some((s) => s.currency)
  const hasCount = series.some((s) => !s.currency)

  const formatFor = (name?: string | number) => {
    const match = series.find((s) => s.name === name)
    return match?.currency ? formatKes : (value: number) => `${value}`
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 4 }}>
        <defs>
          {series
            .filter((s) => s.kind === 'area')
            .map((s) => (
              <linearGradient key={s.key} id={`${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={AXIS_TICK} dy={4} />
        {hasMoney ? (
          <YAxis
            yAxisId="money"
            width={56}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            tickFormatter={(value: number) => formatKesShort(value)}
          />
        ) : null}
        {hasCount ? (
          <YAxis
            yAxisId="count"
            orientation="right"
            width={28}
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
          />
        ) : null}
        <Tooltip
          cursor={{ stroke: 'var(--border)', strokeDasharray: '4 4' }}
          content={<ChartTip formatValue={(value, name) => formatFor(name)(value)} />}
        />
        <Legend
          verticalAlign="top"
          height={26}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)', paddingBottom: 4 }}
        />
        {series.map((s) =>
          s.kind === 'line' ? (
            <Line
              key={s.key}
              yAxisId={s.currency && hasMoney ? 'money' : 'count'}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 4 }}
            />
          ) : (
            <Area
              key={s.key}
              yAxisId={s.currency && hasMoney ? 'money' : 'count'}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#${gradientId}-${s.key})`}
              activeDot={{ r: 4 }}
            />
          ),
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Top vehicles by revenue (horizontal bars)
// ---------------------------------------------------------------------------

export function TopVehiclesChart({
  data,
}: {
  data: { label: string; revenue: number; bookings: number }[]
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted-foreground">
        No completed bookings yet
      </div>
    )
  }

  const rows = data.map((d) => ({ ...d, short: truncateLabel(d.label, 20) }))
  const height = Math.max(180, rows.length * 44 + 24)

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            tickFormatter={(value: number) => formatKesShort(value)}
          />
          <YAxis
            type="category"
            dataKey="short"
            width={128}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
          />
          <Tooltip
            cursor={{ fill: 'var(--accent)' }}
            content={<ChartTip formatValue={formatKes} labelFromPayload="label" />}
          />
          <Bar dataKey="revenue" name="Revenue" fill="var(--chart-1)" radius={[0, 4, 4, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bookings by status (horizontal bars, tone-colored)
// ---------------------------------------------------------------------------

export function StatusCountChart({ data }: { data: { status: BookingStatus; count: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted-foreground">
        No bookings yet
      </div>
    )
  }

  const rows = [...data]
    .sort((a, b) => b.count - a.count)
    .map((d) => ({
      ...d,
      label: statusLabel(d.status),
      color: TONE_COLORS[statusTone(d.status)] ?? 'var(--chart-1)',
    }))
  const height = Math.max(180, rows.length * 36 + 24)

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={116}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
          />
          <Tooltip
            cursor={{ fill: 'var(--accent)' }}
            content={
              <ChartTip formatValue={(value) => `${value} booking${value === 1 ? '' : 's'}`} />
            }
          />
          <Bar dataKey="count" name="Bookings" radius={[0, 4, 4, 0]} barSize={14}>
            {rows.map((row) => (
              <Cell key={row.status} fill={row.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
