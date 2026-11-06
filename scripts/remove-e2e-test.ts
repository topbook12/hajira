import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

/**
 * One-time cleanup: removes the E2E VERIFICATION data created during the
 * fingerprint/Excel work session ("Sir Test" 01712345601 teacher +
 * "Student One" 01812345601 student + their CSE 301 test class, session,
 * check-in) from the production Turso DB, restoring the clean pre-test
 * state. FK-safe order: CheckIn -> ClassSlot -> Session -> Membership -> Class -> User -> Credential.
 */
const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

const prisma = url && token
  ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
  : new PrismaClient()

const TEST_PHONES = ['01712345602', '01912345601', '01912345602']

const testUsers = await prisma.user.findMany({
  where: { phone: { in: TEST_PHONES } },
  select: { id: true, name: true, role: true },
})
const testIds = testUsers.map((u) => u.id)
const testClasses = await prisma.class.findMany({
  where: { teacherId: { in: testIds } },
  select: { id: true },
})
const classIds = testClasses.map((c) => c.id)

console.log(
  `Found ${testUsers.length} test users (${testUsers.map((u) => `${u.name}/${u.role}`).join(', ')}), ${testClasses.length} test classes`
)

const c1 = await prisma.checkIn.deleteMany({ where: { OR: [{ studentId: { in: testIds } }, { sessionId: { in: classIds } }] } })
const c2 = await prisma.classSlot.deleteMany({ where: { classId: { in: classIds } } })
const c3 = await prisma.session.deleteMany({ where: { classId: { in: classIds } } })
const c4 = await prisma.membership.deleteMany({ where: { OR: [{ classId: { in: classIds } }, { studentId: { in: testIds } }] } })
const c5 = await prisma.class.deleteMany({ where: { id: { in: classIds } } })
const c6 = await prisma.credential.deleteMany({ where: { userId: { in: testIds } } })
const c7 = await prisma.user.deleteMany({ where: { id: { in: testIds } } })

console.log(
  `Deleted: ${c1.count} checkIns, ${c2.count} slots, ${c3.count} sessions, ${c4.count} memberships, ${c5.count} classes, ${c6.count} credentials, ${c7.count} users`
)

const remaining = await prisma.user.findMany({ select: { phone: true, role: true } })
console.log(`Remaining users: ${remaining.length ? JSON.stringify(remaining) : 'none (clean)'}`)
