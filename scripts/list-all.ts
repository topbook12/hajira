import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

const prisma = url && token
  ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
  : new PrismaClient()

const users = await prisma.user.findMany({
  select: { id: true, name: true, phone: true, role: true, createdAt: true },
  orderBy: { createdAt: 'asc' },
})
console.log('=== USERS ===')
for (const u of users) {
  console.log(`${u.role} | ${u.name} | ${u.phone} | ${u.id} | ${u.createdAt.toISOString()}`)
}

const classes = await prisma.class.findMany({
  select: { id: true, name: true, code: true, teacherId: true },
})
console.log('\n=== CLASSES ===')
for (const c of classes) {
  console.log(`${c.name} | code=${c.code} | teacherId=${c.teacherId}`)
}

const sessions = await prisma.session.findMany({ select: { id: true, classId: true, status: true } })
console.log(`\n=== SESSIONS (${sessions.length}) ===`)
for (const s of sessions) console.log(`${s.id} | class=${s.classId} | ${s.status}`)

const checkIns = await prisma.checkIn.count()
const memberships = await prisma.membership.count()
const slots = await prisma.classSlot.count()
console.log(`\ncheckIns=${checkIns} memberships=${memberships} classSlots=${slots}`)
process.exit(0)
