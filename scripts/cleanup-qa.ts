/**
 * Removes today's QA test data from the production Turso DB (FK-safe order):
 *   CheckIn → ClassSlot → Session → Membership → Class → User
 * Only deletes rows created by the browser QA run (phones 01712345888 / 01712345999).
 */
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'
import 'dotenv/config'

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
if (!url || !authToken) throw new Error('Missing Turso env vars')

const client = createClient({ url, authToken })
const db = new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken }) })

const QA_PHONES = ['01712345888', '01712345999']

async function main() {
  const users = await db.user.findMany({
    where: { phone: { in: QA_PHONES } },
    select: { id: true, name: true, phone: true, role: true },
  })
  console.log('QA users found:', users)
  if (users.length === 0) {
    console.log('Nothing to clean.')
    return
  }
  const ids = users.map((u) => u.id)

  const classes = await db.class.findMany({
    where: { teacherId: { in: ids } },
    select: { id: true, name: true },
  })
  const classIds = classes.map((c) => c.id)
  console.log('QA classes:', classes)

  for (const classId of classIds) {
    const sessions = await db.session.findMany({ where: { classId }, select: { id: true } })
    for (const s of sessions) {
      await db.checkIn.deleteMany({ where: { sessionId: s.id } })
      await db.session.delete({ where: { id: s.id } })
    }
    await db.classSlot.deleteMany({ where: { classId } })
    await db.membership.deleteMany({ where: { classId } })
    await db.class.delete({ where: { id: classId } })
  }

  // memberships where the QA users are students
  await db.checkIn.deleteMany({
    where: { studentId: { in: ids.filter((i) => !classIds.length || true) } },
  })
  await db.membership.deleteMany({ where: { studentId: { in: ids } } })
  const deleted = []
  for (const id of ids) deleted.push(await db.user.delete({ where: { id } }).catch((e) => ({ err: String(e) })))
  console.log('Deleted users:', deleted)

  const usersLeft = await db.user.count()
  const classesLeft = await db.class.count()
  console.log(`Remaining: ${usersLeft} users, ${classesLeft} classes`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
