import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

const prisma = url && token
  ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
  : new PrismaClient()

const teachers = await prisma.user.findMany({
  where: { role: 'TEACHER' },
  select: { id: true, name: true, phone: true, createdAt: true },
})
console.log('TEACHER_COUNT:', teachers.length)
for (const t of teachers) {
  console.log(`- ${t.name} | ${t.phone} | created ${t.createdAt?.toISOString()}`)
}
const students = await prisma.user.count({ where: { role: 'STUDENT' } })
console.log('STUDENT_COUNT:', students)
process.exit(0)
