'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'

import { apiGet, apiPost } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { DEMO_PASSWORD } from '@/lib/constants'
import type { Role, SessionUser } from '@/lib/types'

export interface RegisterPayload {
  name: string
  email: string
  phone: string
  password: string
  role: Role
}

/**
 * Session state backed by React Query. Components can call useSession() freely;
 * the ['session'] query is shared and cached.
 */
export function useSession() {
  const queryClient = useQueryClient()
  const setUser = useAppStore((s) => s.setUser)

  const { data, isLoading } = useQuery({
    queryKey: ['session'],
    queryFn: () => apiGet<{ user: SessionUser | null }>('/api/auth/me'),
    staleTime: 30_000,
  })

  const applySession = (user: SessionUser | null) => {
    queryClient.setQueryData(['session'], { user })
    setUser(user)
    void queryClient.invalidateQueries()
  }

  const login = async (email: string, password: string): Promise<SessionUser> => {
    const res = await apiPost<{ user: SessionUser }>('/api/auth/login', { email, password })
    applySession(res.user)
    return res.user
  }

  const loginDemo = (email: string): Promise<SessionUser> => login(email, DEMO_PASSWORD)

  const register = async (payload: RegisterPayload): Promise<SessionUser> => {
    const res = await apiPost<{ user: SessionUser }>('/api/auth/register', payload)
    applySession(res.user)
    return res.user
  }

  const logout = async (): Promise<void> => {
    try {
      await apiPost<{ ok: boolean }>('/api/auth/logout', {})
    } finally {
      applySession(null)
    }
  }

  return {
    user: data?.user ?? null,
    isLoading,
    login,
    loginDemo,
    register,
    logout,
  }
}
