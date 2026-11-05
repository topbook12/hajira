import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
const prisma = new PrismaClient({
  adapter: new PrismaLibSQL({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! }),
})
const ids = (await prisma.user.findMany({ where: { phone: '01999999905' }, select: { id: true } })).map((u) => u.id)
await prisma.checkIn.deleteMany({ where: { studentId: { in: ids } } })
await prisma.classSlot.deleteMany({ where: { class: { teacherId: { in: ids } } } })
await prisma.session.deleteMany({ where: { class: { teacherId: { in: ids } } } })
await prisma.membership.deleteMany({ where: { OR: [{ studentId: { in: ids } }, { class: { teacherId: { in: ids } } }] } })
await prisma.class.deleteMany({ where: { teacherId: { in: ids } } })
const r = await prisma.user.deleteMany({ where: { id: { in: ids } } })
console.log(`probe deleted: ${r.count}, remaining users: ${await prisma.user.count()}`)
process.exit(0)
