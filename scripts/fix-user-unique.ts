/**
 * One-off schema repair on Turso: replace User.phone global-unique index
 * with the per-role composite unique (phone, role).
 *
 * Why: the same human must be able to hold a TEACHER and a STUDENT account
 * with one phone (pilot reality), while phone formats (+880/01…) are
 * canonicalized to stop duplicate-account confusion.
 *
 * Run:  bun run scripts/fix-user-unique.ts
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client'

try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch {
  /* no .env */
}

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
if (!url || !token) {
  console.error('Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN')
  process.exit(1)
}

const client = createClient({ url, authToken: token })

const before = await client.execute(
  "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='User'"
)
console.log('User indexes before:')
for (const r of before.rows) console.log(' -', r.name, '::', r.sql)

await client.execute('DROP INDEX IF EXISTS "User_phone_key"')
await client.execute(
  'CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_role_key" ON "User"("phone", "role")'
)

const after = await client.execute(
  "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='User'"
)
console.log('User indexes after:')
for (const r of after.rows) console.log(' -', r.name, '::', r.sql)

client.close()
console.log('Done')
