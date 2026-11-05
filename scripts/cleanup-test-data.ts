import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

/**
 * One-time cleanup: removes leftover DEV TEST data (Prof. Test Rahman /
 * Ayesha Karim / CSE 301 demo class) from the production Turso DB so the
 * real pilot teacher gets the first-teacher bootstrap slot.
 * Deletes in FK-safe order: CheckIn -> ClassSlot -> Session -> Membership -> Class -> User.
 */
const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

const prisma = url && token
  ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
  : new PrismaClient()

const TEST_PHONES = ['01711100099', '01711100088']

const testUsers = await prisma.user.findMany({
  where: { phone: { in: TEST_PHONES } },
  select: { id: true, name: true },
})
const testIds = testUsers.map((u) => u.id)
const testClasses = await prisma.class.findMany({
  where: { teacherId: { in: testIds } },
  select: { id: true, name: true },
})
const classIds = testClasses.map((c) => c.id)

console.log(`Deleting data for ${testUsers.length} test users, ${testClasses.length} test classes...`)

// 1. Check-ins inside test sessions + by test students
const sessions = await prisma.session.findMany({ where: { classId: { in: classIds } }, select: { id: true } })
const sessionIds = sessions.map((s) => s.id)
const r1 = await prisma.checkIn.deleteMany({
  where: { OR: [{ sessionId: { in: sessionIds } }, { studentId: { in: testIds } }] },
})
console.log(`checkIns deleted: ${r1.count}`)

// 2. Timetable slots of test classes
const r2 = await prisma.classSlot.deleteMany({ where: { classId: { in: classIds } } })
console.log(`classSlots deleted: ${r2.count}`)

// 3. Sessions of test classes
const r3 = await prisma.session.deleteMany({ where: { classId: { in: classIds } } })
console.log(`sessions deleted: ${r3.count}`)

// 4. Memberships (test classes + test students)
const r4 = await prisma.membership.deleteMany({
  where: { OR: [{ classId: { in: classIds } }, { studentId: { in: testIds } }] },
})
console.log(`memberships deleted: ${r4.count}`)

// 5. Classes owned by test teacher
const r5 = await prisma.class.deleteMany({ where: { teacherId: { in: testIds } } })
console.log(`classes deleted: ${r5.count}`)

// 6. The test users themselves
const r6 = await prisma.user.deleteMany({ where: { id: { in: testIds } } })
console.log(`users deleted: ${r6.count}`)

const remainingUsers = await prisma.user.count()
const remainingClasses = await prisma.class.count()
console.log(`\nDONE. Remaining: users=${remainingUsers} classes=${remainingClasses}`)
process.exit(0)
