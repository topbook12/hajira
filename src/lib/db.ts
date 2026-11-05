import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Hajira database client.
 *
 * - If TURSO_DATABASE_URL + TURSO_AUTH_TOKEN are set, all data lives in the
 *   Turso cloud (libSQL) — free tier, survives restarts, zero maintenance.
 * - Otherwise falls back to the local SQLite file (offline dev).
 */
function makeClient(): PrismaClient {
  const url = process.env.TURSO_DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN

  if (url && token) {
    const adapter = new PrismaLibSQL({ url, authToken: token })
    return new PrismaClient({ adapter, log: ['error'] })
  }

  return new PrismaClient({ log: ['error'] })
}

export const db = globalForPrisma.prisma ?? makeClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
