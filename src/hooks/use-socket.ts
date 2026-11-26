'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import { io, type Socket } from 'socket.io-client'

// Module-level singleton: every useSocket() consumer shares one connection.
// The URL is ALWAYS relative with the gateway port in the XTransformPort query
// parameter (never a host/port URL), and the engine.io path is always '/'.
let socketSingleton: Socket | null = null

function getSocket(): Socket {
  if (!socketSingleton) {
    socketSingleton = io('/?XTransformPort=3003', {
      path: '/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      timeout: 10_000,
      // During SSR there is no window — never attempt to connect there.
      autoConnect: typeof window !== 'undefined',
    })
  }
  return socketSingleton
}

export function useSocket(): { socket: Socket; connected: boolean } {
  // Created lazily once per runtime (browser or SSR pass). On the server the
  // socket exists but never connects; consumers only use it in effects, which
  // do not run during SSR.
  const [socket] = useState<Socket>(() => getSocket())

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      socket.on('connect', onStoreChange)
      socket.on('disconnect', onStoreChange)
      return () => {
        socket.off('connect', onStoreChange)
        socket.off('disconnect', onStoreChange)
      }
    },
    [socket],
  )
  const getSnapshot = useCallback(() => socket.connected, [socket])
  const getServerSnapshot = useCallback(() => false, [])

  const connected = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return { socket, connected }
}
