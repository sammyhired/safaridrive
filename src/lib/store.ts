'use client'

import { create } from 'zustand'
import type { BookingMode, Role, SessionUser, Vehicle } from './types'

// Minimal global client state. Server state lives in React Query.

export type CustomerTab = 'home' | 'browse' | 'bookings'

interface AppState {
  // Which role workspace is displayed (independent of who is logged in)
  roleView: Role
  setRoleView: (r: Role) => void

  // Session (mirrored from /api/auth/me for convenience)
  user: SessionUser | null
  setUser: (u: SessionUser | null) => void

  // Customer navigation
  customerTab: CustomerTab
  setCustomerTab: (t: CustomerTab) => void

  // Booking flow — set when "Book now" clicked on a vehicle
  bookingVehicle: Vehicle | null
  openBooking: (v: Vehicle) => void
  closeBooking: () => void

  // Persisted booking draft (dates/mode) so it survives dialog reopens
  draftMode: BookingMode
  setDraftMode: (m: BookingMode) => void
}

export const useAppStore = create<AppState>((set) => ({
  roleView: 'CUSTOMER',
  setRoleView: (r) => set({ roleView: r }),

  user: null,
  setUser: (u) => set({ user: u }),

  customerTab: 'home',
  setCustomerTab: (t) => set({ customerTab: t }),

  bookingVehicle: null,
  openBooking: (v) => set({ bookingVehicle: v }),
  closeBooking: () => set({ bookingVehicle: null }),

  draftMode: 'PICKUP',
  setDraftMode: (m) => set({ draftMode: m }),
}))
