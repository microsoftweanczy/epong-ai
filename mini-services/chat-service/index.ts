import { createServer } from 'http'
import { Server, Socket } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ---- In-memory presence & room state ----
// Map userId -> Set<socketId>  (a user may have multiple tabs/devices)
const userSockets = new Map<string, Set<string>>()
// Map socketId -> userId
const socketUser = new Map<string, string>()

function getOnlineUserIds(): string[] {
  return Array.from(userSockets.keys())
}

function emitPresence(userId: string, isOnline: boolean) {
  io.emit('presence', { userId, isOnline })
}

io.on('connection', (socket: Socket) => {
  console.log(`[socket] connected: ${socket.id}`)

  // ---- User comes online ----
  socket.on('user-online', (data: { userId: string }) => {
    const { userId } = data
    if (!userId) return

    socketUser.set(socket.id, userId)

    // join a personal room so other clients can push updates to this user
    // even when they are not viewing a specific conversation
    socket.join(`user:${userId}`)

    let set = userSockets.get(userId)
    if (!set) {
      set = new Set()
      userSockets.set(userId, set)
      // first connection for this user -> announce online
      emitPresence(userId, true)
    }
    set.add(socket.id)

    // send the freshly connected client the full online list
    socket.emit('online-users', { userIds: getOnlineUserIds() })
  })

  // ---- Join a conversation room ----
  socket.on('join-conversation', (data: { conversationId: string }) => {
    if (!data?.conversationId) return
    socket.join(`conv:${data.conversationId}`)
  })

  // ---- Leave a conversation room ----
  socket.on('leave-conversation', (data: { conversationId: string }) => {
    if (!data?.conversationId) return
    socket.leave(`conv:${data.conversationId}`)
  })

  // ---- A new message was persisted by the API; relay it to the room ----
  socket.on(
    'send-message',
    (payload: {
      message: {
        id: string
        conversationId: string
        senderId: string
        senderName: string
        senderAvatarColor: string
        content: string
        createdAt: string
        status: string
      }
      participantIds?: string[]
    }) => {
      if (!payload?.message?.conversationId) return
      const { message, participantIds } = payload
      // broadcast to everyone else currently viewing this conversation
      socket.to(`conv:${message.conversationId}`).emit('new-message', message)
      // also push to each participant's personal room so their chat list
      // updates in real time even when they are not viewing this conversation
      if (Array.isArray(participantIds)) {
        for (const pid of participantIds) {
          if (pid !== message.senderId) {
            socket.to(`user:${pid}`).emit('new-message', message)
          }
        }
      }
    }
  )

  // ---- Typing indicator ----
  socket.on(
    'typing',
    (data: {
      conversationId: string
      userId: string
      userName: string
      isTyping: boolean
    }) => {
      if (!data?.conversationId) return
      socket.to(`conv:${data.conversationId}`).emit('typing', {
        conversationId: data.conversationId,
        userId: data.userId,
        userName: data.userName,
        isTyping: data.isTyping,
      })
    }
  )

  // ---- Read receipts ----
  socket.on(
    'message-read',
    (data: {
      conversationId: string
      messageIds: string[]
      userId: string
    }) => {
      if (!data?.conversationId || !data.messageIds?.length) return
      socket.to(`conv:${data.conversationId}`).emit('message-read', {
        conversationId: data.conversationId,
        messageIds: data.messageIds,
        userId: data.userId,
      })
    }
  )

  // ---- Message status: delivered ----
  socket.on(
    'message-delivered',
    (data: { conversationId: string; messageIds: string[]; userId: string }) => {
      if (!data?.conversationId || !data.messageIds?.length) return
      socket.to(`conv:${data.conversationId}`).emit('message-delivered', {
        conversationId: data.conversationId,
        messageIds: data.messageIds,
        userId: data.userId,
      })
    }
  )

  // ---- Disconnect ----
  socket.on('disconnect', () => {
    const userId = socketUser.get(socket.id)
    socketUser.delete(socket.id)

    if (userId) {
      const set = userSockets.get(userId)
      if (set) {
        set.delete(socket.id)
        if (set.size === 0) {
          userSockets.delete(userId)
          emitPresence(userId, false)
        }
      }
    }
    console.log(`[socket] disconnected: ${socket.id}`)
  })

  socket.on('error', (error) => {
    console.error(`[socket] error (${socket.id}):`, error)
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`FamilyChat WebSocket server running on port ${PORT}`)
})

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`Received ${signal}, shutting down...`)
  httpServer.close(() => {
    console.log('WebSocket server closed')
    process.exit(0)
  })
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
