import { NextResponse, type NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { ApiError, handle, oneOf, optionalString, parseDate, readJson, requireInt, requireString } from '@/app/api/_lib/api'
import { serializeExpense } from '@/app/api/_lib/serialize'

const EXPENSE_CATEGORIES = ['FUEL', 'SERVICE', 'INSURANCE', 'REPAIR', 'OTHER'] as const

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(['OWNER', 'ADMIN'])
    const vehicleId = req.nextUrl.searchParams.get('vehicleId')?.trim()

    const where: Prisma.ExpenseWhereInput = {}
    if (user.role === 'OWNER') {
      where.vehicle = { ownerId: user.id }
      if (vehicleId) where.vehicle = { ownerId: user.id, id: vehicleId }
    } else if (vehicleId) {
      where.vehicleId = vehicleId
    }

    const expenses = await db.expense.findMany({
      where,
      include: { vehicle: true },
      orderBy: { date: 'desc' },
    })
    const total = expenses.reduce((sum, e) => sum + e.amount, 0)
    return NextResponse.json({ expenses: expenses.map(serializeExpense), total })
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(['OWNER'])
    const body = await readJson(req)

    const vehicleId = requireString(body.vehicleId, 'vehicleId')
    const category = oneOf(body.category, 'Category', EXPENSE_CATEGORIES)
    const amount = requireInt(body.amount, 'Amount', { min: 1, max: 10_000_000 })
    const note = optionalString(body.note, 'Note', { max: 300 }) ?? null
    const date = body.date ? parseDate(body.date, 'date') : new Date()

    const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } })
    if (!vehicle) throw new ApiError(404, 'Vehicle not found')
    if (vehicle.ownerId !== user.id) throw new ApiError(403, 'You can only log expenses for your own vehicles')

    const expense = await db.expense.create({
      data: { vehicleId, category, amount, note, date },
      include: { vehicle: true },
    })
    return NextResponse.json({ expense: serializeExpense(expense) })
  })
}
