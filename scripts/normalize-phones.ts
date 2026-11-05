/**
 * One-off migration: normalize every user's phone to 01XXXXXXXXX.
 *
 * Handles the exact field failure: an account stored as 8801521706294 while
 * the same human logs in on their phone with 01521706294. If canonicalization
 * collides within the SAME role (two student rows for one number), the older
 * account wins: memberships/check-ins are re-pointed to it and the duplicate
 * row is deleted. Cross-role collisions are ALLOWED by design now
 * (User @@unique([phone, role])).
 *
 * Run:  bun run scripts/normalize-phones.ts
 */
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { normalizeBdPhone } from '../src/lib/phone'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

const db =
  url && token
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
    : new PrismaClient()

async function main() {
  const users = await db.user.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { memberships: true, checkIns: true, teaching: true } } },
  })
  console.log(`Found ${users.length} users`)

  // canonical phone (per role) -> keeper user
  const keeper = new Map<string, (typeof users)[number]>()
  let changed = 0
  let merged = 0

  for (const u of users) {
    const canon = normalizeBdPhone(u.phone)
    if (canon !== u.phone) {
      await db.user.update({ where: { id: u.id }, data: { phone: canon } })
      u.phone = canon
      changed++
      console.log(`  normalized ${u.role} ${u.name}: -> ${canon}`)
    }
    const key = `${canon}:${u.role}`
    const existing = keeper.get(key)
    if (!existing) {
      keeper.set(key, u)
      continue
    }
    // duplicate account, same number + same role -> merge into the OLDER one
    const old = existing.createdAt <= u.createdAt ? existing : u
    const dupe = old.id === existing.id ? u : existing
    console.log(`  merging duplicate ${u.role} ${u.name} (${dupe.phone}) into ${old.id}`)
    await db.membership.updateMany({ where: { studentId: dupe.id }, data: { studentId: old.id } })
    await db.checkIn.updateMany({ where: { studentId: dupe.id }, data: { studentId: old.id } })
    await db.class.updateMany({ where: { teacherId: dupe.id }, data: { teacherId: old.id } })
    await db.user.delete({ where: { id: dupe.id } })
    keeper.set(key, old)
    merged++
  }

  console.log(`Done — ${changed} phone(s) normalized, ${merged} duplicate account(s) merged`)

  const after = await db.user.findMany({ select: { phone: true, role: true, name: true } })
  console.log('Final state:')
  for (const u of after) console.log(`  ${u.role} | ${u.name} | ${u.phone}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
