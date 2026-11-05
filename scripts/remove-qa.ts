import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
// Works against Turso when TURSO_* vars are set, else the local dev SQLite file.
const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || 'file:./db/custom.db'
const prisma = new PrismaClient({
  adapter: new PrismaLibSQL({ url, authToken: process.env.TURSO_AUTH_TOKEN }),
})
// QA accounts used to browser-verify the QR scanner + remote check-in.
const ids = (
  await prisma.user.findMany({ where: { phone: { in: ['01700000401', '01700000402'] } }, select: { id: true } })
).map((u) => u.id)
await prisma.checkIn.deleteMany({ where: { OR: [{ studentId: { in: ids } }, { session: { class: { teacherId: { in: ids } } } }] } })
await prisma.classSlot.deleteMany({ where: { class: { teacherId: { in: ids } } } })
await prisma.session.deleteMany({ where: { class: { teacherId: { in: ids } } } })
await prisma.membership.deleteMany({ where: { OR: [{ studentId: { in: ids } }, { class: { teacherId: { in: ids } } }] } })
await prisma.class.deleteMany({ where: { teacherId: { in: ids } } })
const r = await prisma.user.deleteMany({ where: { id: { in: ids } } })
console.log(`qa users deleted: ${r.count}, remaining users: ${await prisma.user.count()}`)
process.exit(0)
