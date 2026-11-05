/**
 * Remove the QA fixture accounts used for browser verification
 * (teacher 01900000111 + their classes/sessions, student 01900000099 probe).
 * FK-safe order: CheckIn → ClassSlot → Session → Membership → Class → User.
 *
 * Run:  bun run scripts/remove-qa-fixture.ts
 */
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

const db =
  url && token
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
    : new PrismaClient()

const PHONES = ['01900000111', '01900000099']

const ids = (
  await db.user.findMany({ where: { phone: { in: PHONES } }, select: { id: true } })
).map((u) => u.id)

if (ids.length === 0) {
  console.log('No fixture accounts found — nothing to do')
  process.exit(0)
}

const classes = await db.class.findMany({
  where: { OR: [{ teacherId: { in: ids } }, { memberships: { some: { studentId: { in: ids } } } }] },
  select: { id: true },
})
const classIds = classes.map((c) => c.id)
console.log(`fixture users=${ids.length}, touched classes=${classIds.length}`)

// sessions of the touched classes -> their check-ins die first
const sessions = await db.session.findMany({
  where: { classId: { in: classIds } },
  select: { id: true },
})
const sessionIds = sessions.map((s) => s.id)
if (sessionIds.length) {
  await db.checkIn.deleteMany({ where: { sessionId: { in: sessionIds } } })
}
await db.checkIn.deleteMany({ where: { studentId: { in: ids } } })
await db.classSlot.deleteMany({ where: { classId: { in: classIds } } })
await db.session.deleteMany({ where: { classId: { in: classIds } } })
await db.membership.deleteMany({
  where: { OR: [{ studentId: { in: ids } }, { classId: { in: classIds } }] },
})
await db.class.deleteMany({ where: { id: { in: classIds } } })
const deleted = await db.user.deleteMany({ where: { id: { in: ids } } })

console.log(`Deleted ${deleted.count} fixture user(s) and all their data`)

const users = await db.user.findMany({ select: { phone: true, role: true, name: true } })
console.log('Remaining users:')
for (const u of users) console.log(`  ${u.role} | ${u.name} | ${u.phone}`)
