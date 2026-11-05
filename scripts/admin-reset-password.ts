import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

/**
 * Admin recovery tool — clears an account's password (and optionally its
 * device binding) so the person can claim a new password on next login.
 *
 * Last resort when no teacher can help (e.g. the teacher themselves forgot
 * their password). Run from a machine that has the Turso credentials:
 *
 *   bun scripts/admin-reset-password.ts 01712345678        # clear password
 *   bun scripts/admin-reset-password.ts 01712345678 device # also unbind device
 */
const phone = (process.argv[2] || '').replace(/\D/g, '')
const alsoDevice = process.argv[3] === 'device'

if (!/^\d{6,15}$/.test(phone)) {
  console.error('Usage: bun scripts/admin-reset-password.ts <phone> [device]')
  process.exit(1)
}

const prisma = new PrismaClient({
  adapter: new PrismaLibSQL({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  }),
})

const user = await prisma.user.findUnique({ where: { phone } })
if (!user) {
  console.error(`No account found for ${phone}`)
  process.exit(1)
}

await prisma.user.update({
  where: { id: user.id },
  data: { passwordHash: null, ...(alsoDevice ? { deviceId: null } : {}) },
})

console.log(
  `OK: ${user.role} "${user.name}" (${phone}) password cleared${alsoDevice ? ' + device unbound' : ''}.`
)
console.log('They now sign in with their phone + a NEW password (it is claimed on next login).')
process.exit(0)
