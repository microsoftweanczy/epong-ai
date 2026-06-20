'use client'

import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

// Singleton socket client. Always uses the relative path "/" with the
// XTransformPort query so Caddy can forward to the chat mini-service (port 3003).
export function getSocket(): Socket {
  if (socket) return socket

  socket = io('/?XTransformPort=3003', {
    transports: ['websocket', 'polling'],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  })

  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}
