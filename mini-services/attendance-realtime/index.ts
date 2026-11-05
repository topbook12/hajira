import { createServer } from 'http'
import { Server } from 'socket.io'

/**
 * Hajira realtime relay (demo): lightweight room-based event relay.
 * REST API (Next.js) remains the source of truth; this service only
 * broadcasts live events: session:started / checkin:new / session:closed.
 */

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  console.log(`[hajira-rt] connected: ${socket.id}`)

  // Teacher joins a live session room
  socket.on('join-session', (data: { sessionId: string }) => {
    if (!data?.sessionId) return
    socket.join(`session:${data.sessionId}`)
    console.log(`[hajira-rt] ${socket.id} joined session:${data.sessionId}`)
  })

  socket.on('leave-session', (data: { sessionId: string }) => {
    if (!data?.sessionId) return
    socket.leave(`session:${data.sessionId}`)
  })

  // Student joins their class room (to hear session:started)
  socket.on('join-class', (data: { classId: string }) => {
    if (!data?.classId) return
    socket.join(`class:${data.classId}`)
  })

  socket.on('leave-class', (data: { classId: string }) => {
    if (!data?.classId) return
    socket.leave(`class:${data.classId}`)
  })

  // Student announces a successful check-in -> teacher's live list updates
  socket.on('checkin:new', (data: { sessionId: string; checkIn: unknown }) => {
    if (!data?.sessionId || !data.checkIn) return
    io.to(`session:${data.sessionId}`).emit('checkin:new', data.checkIn)
  })

  // Teacher announces session started -> students of that class see the banner
  socket.on('session:started', (data: { classId: string; session: unknown }) => {
    if (!data?.classId || !data.session) return
    io.to(`class:${data.classId}`).emit('session:started', data.session)
  })

  socket.on('session:closed', (data: { classId: string; sessionId: string }) => {
    if (!data?.classId || !data?.sessionId) return
    io.to(`class:${data.classId}`).emit('session:closed', { sessionId: data.sessionId })
    io.to(`session:${data.sessionId}`).emit('session:closed', { sessionId: data.sessionId })
  })

  socket.on('disconnect', () => {
    console.log(`[hajira-rt] disconnected: ${socket.id}`)
  })

  socket.on('error', (err) => {
    console.error(`[hajira-rt] socket error (${socket.id}):`, err)
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`Hajira realtime server running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0))
})
