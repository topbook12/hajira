import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

/**
 * Hajira database client.
 *
 * - If TURSO_DATABASE_URL + TURSO_AUTH_TOKEN are set, all data lives in the
 *   Turso cloud (libSQL) — free tier, survives restarts, zero maintenance.
 * - Otherwise falls back to the local SQLite file (offline dev).
 *
 * Turso is reached over HTTPS, so a socket can occasionally drop mid-query
 * ("fetch failed" / "other side closed"). Those are TRANSIENT failures: the
 * query never reached the database or the response was lost — retrying is
 * always safe and self-heals without the user ever noticing. Every operation
 * therefore runs through an automatic retry with backoff below.
 */

const TRANSIENT_MARKERS = [
  'fetch failed',
  'other side closed',
  'econnreset',
  'econnrefused',
  'etimedout',
  'socket',
  'connection closed',
  'connection error',
  'connection terminated',
  'network',
  'bad gateway',
  'service unavailable',
  '502',
  '503',
  '504',
]

export function isTransientDbError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const err = e as { message?: string; cause?: { code?: string; message?: string } }
  const text = `${err.message ?? ''} ${err.cause?.code ?? ''} ${err.cause?.message ?? ''}`.toLowerCase()
  if (!text) return false
  return TRANSIENT_MARKERS.some((m) => text.includes(m))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Retry transient network failures (max 4 attempts, short backoff + jitter). */
export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      if (attempt === 3 || !isTransientDbError(e)) throw e
      await sleep(120 * (attempt + 1) + Math.random() * 120)
    }
  }
  throw lastError
}

function makeClient() {
  const url = process.env.TURSO_DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN

  const base =
    url && token
      ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }), log: ['error'] })
      : new PrismaClient({ log: ['error'] })

  return base.$extends({
    query: {
      $allOperations({ args, query }) {
        return withDbRetry(() => query(args))
      },
    },
  })
}

type ExtendedClient = ReturnType<typeof makeClient>

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedClient | undefined
}

export const db: ExtendedClient = globalForPrisma.prisma ?? makeClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
