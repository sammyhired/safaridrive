'use client'

// React Query hooks + mutations for the owner and admin dashboards.
// All mutations broadly invalidate the cache and surface toasts.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import type {
  AdminStats,
  Booking,
  DriverProfile,
  DriverStatus,
  Expense,
  ExpenseCategory,
  OwnerStats,
  PromoCode,
  Role,
  RentalYard,
  UserStatus,
  Vehicle,
  VehicleCategory,
} from '@/lib/types'
import { ACTION_TOAST, type BookingActionKey, type FilterGroup } from './booking-helpers'

// ---------------------------------------------------------------------------
// Response payload shapes
// ---------------------------------------------------------------------------

export interface AdminUserSummary {
  id: string
  name: string
  email: string
  phone: string | null
  role: Role
  status: UserStatus
  createdAt: string
}

export interface VehiclePayload {
  make: string
  model: string
  year: number
  category: VehicleCategory
  plate: string
  seats: number
  doors: number
  transmission: string
  fuelType: string
  dailyRate: number
  securityDeposit: number
  mileageLimitKmPerDay: number | null
  excessPerKm: number
  imageUrl: string
  features: string[]
  description: string | null
  yardId: string | null
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useOwnerStats(enabled = true) {
  return useQuery({
    queryKey: ['stats-owner'],
    queryFn: () => apiGet<{ stats: OwnerStats }>('/api/stats/owner'),
    enabled,
  })
}

export function useAdminStats(enabled = true) {
  return useQuery({
    queryKey: ['stats-admin'],
    queryFn: () => apiGet<{ stats: AdminStats }>('/api/stats/admin'),
    enabled,
  })
}

export function useVehicles() {
  return useQuery({
    queryKey: ['vehicles'],
    queryFn: () => apiGet<{ vehicles: Vehicle[] }>('/api/vehicles'),
  })
}

export function useYards() {
  return useQuery({
    queryKey: ['yards'],
    queryFn: () => apiGet<{ yards: RentalYard[] }>('/api/yards'),
  })
}

export function useDrivers() {
  return useQuery({
    queryKey: ['drivers'],
    queryFn: () => apiGet<{ drivers: DriverProfile[] }>('/api/drivers'),
  })
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiGet<{ users: AdminUserSummary[] }>('/api/users'),
  })
}

export function usePromos() {
  return useQuery({
    queryKey: ['promos'],
    queryFn: () => apiGet<{ promos: PromoCode[] }>('/api/promos'),
  })
}

export function useExpenses(vehicleId?: string) {
  return useQuery({
    queryKey: ['expenses', vehicleId ?? 'ALL'],
    queryFn: () =>
      apiGet<{ expenses: Expense[]; total: number }>(
        vehicleId ? `/api/expenses?vehicleId=${encodeURIComponent(vehicleId)}` : '/api/expenses',
      ),
  })
}

/** Bookings for a display group. Simple groups map to `?status=`, the rest fetch role-scoped all. */
export function useBookingsGroup(group: FilterGroup) {
  const serverStatus = group === 'PAID' ? 'PAID' : null
  return useQuery({
    queryKey: ['bookings', group],
    queryFn: () =>
      apiGet<{ bookings: Booking[] }>(
        serverStatus ? `/api/bookings?status=${serverStatus}` : '/api/bookings',
      ),
  })
}

// ---------------------------------------------------------------------------
// Booking actions
// ---------------------------------------------------------------------------

export interface BookingActionVars {
  booking: Booking
  action: BookingActionKey
  reason?: string
}

export function useBookingAction() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: ({ booking, action, reason }: BookingActionVars) =>
      apiPatch<{ booking: Booking }>(`/api/bookings/${booking.id}`, { action, reason }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries()
      const meta = ACTION_TOAST[vars.action]
      toast({
        title: meta.title,
        description: `${vars.booking.reference} \u00b7 ${meta.description}`,
      })
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Action failed', description: error.message })
    },
  })
}

// ---------------------------------------------------------------------------
// Vehicle mutations
// ---------------------------------------------------------------------------

export function useVehicleSave() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: ({ vehicleId, payload }: { vehicleId: string | null; payload: VehiclePayload }) =>
      vehicleId
        ? apiPatch<{ vehicle: Vehicle }>(`/api/vehicles/${vehicleId}`, payload)
        : apiPost<{ vehicle: Vehicle }>('/api/vehicles', payload),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries()
      toast({
        title: vars.vehicleId ? 'Vehicle updated' : 'Vehicle added',
        description: vars.vehicleId
          ? 'Your changes are live in the catalog.'
          : 'It is now live in the catalog.',
      })
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Could not save vehicle', description: error.message })
    },
  })
}

export function useVehicleStatus() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: ({
      vehicleId,
      status,
    }: {
      vehicleId: string
      status: 'AVAILABLE' | 'MAINTENANCE'
    }) => apiPatch<{ vehicle: Vehicle }>(`/api/vehicles/${vehicleId}`, { status }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries()
      toast({
        title: vars.status === 'MAINTENANCE' ? 'Vehicle in maintenance' : 'Vehicle back in service',
        description:
          vars.status === 'MAINTENANCE'
            ? 'It is hidden from the catalog until it is available again.'
            : 'It can be booked by customers again.',
      })
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Could not update status', description: error.message })
    },
  })
}

// ---------------------------------------------------------------------------
// Driver / user / promo / expense mutations
// ---------------------------------------------------------------------------

export function useDriverUpdate() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: ({
      driverId,
      status,
      dailyRate,
    }: {
      driverId: string
      status?: DriverStatus
      dailyRate?: number
    }) => apiPatch<{ driver: DriverProfile }>(`/api/drivers/${driverId}`, { status, dailyRate }),
    onSuccess: () => {
      void queryClient.invalidateQueries()
      toast({ title: 'Driver updated', description: 'Changes apply to future chauffeur bookings.' })
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Could not update driver', description: error.message })
    },
  })
}

export function useUserStatusUpdate() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: UserStatus }) =>
      apiPatch<{ user: AdminUserSummary }>(`/api/users/${userId}`, { status }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries()
      toast({
        title: vars.status === 'SUSPENDED' ? 'User suspended' : 'User reactivated',
        description:
          vars.status === 'SUSPENDED'
            ? 'They can no longer access SafariDrive until reactivated.'
            : 'They can sign in and book again.',
      })
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Could not update user', description: error.message })
    },
  })
}

export function usePromoCreate() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: (payload: {
      code: string
      description: string
      percentOff?: number
      amountOff?: number
    }) => apiPost<{ promo: PromoCode }>('/api/promos', payload),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries()
      toast({ title: 'Promo created', description: `${vars.code} is ready to use.` })
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Could not create promo', description: error.message })
    },
  })
}

export function usePromoToggle() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: ({ promoId, active }: { promoId: string; active: boolean }) =>
      apiPatch<{ promo: PromoCode }>(`/api/promos/${promoId}`, { active }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries()
      toast({
        title: vars.active ? 'Promo activated' : 'Promo deactivated',
        description: vars.active
          ? 'Customers can apply it at checkout.'
          : 'It will no longer be accepted at checkout.',
      })
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Could not update promo', description: error.message })
    },
  })
}

export function useExpenseCreate() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: (payload: {
      vehicleId: string
      category: ExpenseCategory
      amount: number
      note?: string
      date?: string
    }) => apiPost<{ expense: Expense }>('/api/expenses', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries()
      toast({ title: 'Expense recorded', description: 'Your net revenue has been updated.' })
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Could not record expense', description: error.message })
    },
  })
}
