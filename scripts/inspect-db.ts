import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || 'file:./db/custom.db'
const prisma = new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: process.env.TURSO_AUTH_TOKEN }) })
console.log('users:', await prisma.user.count())
console.log('classes:', await prisma.class.count())
console.log('sessions:', await prisma.session.count())
console.log('checkins:', await prisma.checkIn.count())
console.log('memberships:', await prisma.membership.count())
const sess = await prisma.session.findMany({ select: { id: true, status: true, startedAt: true } })
console.log('sessions detail:', JSON.stringify(sess))
process.exit(0)
