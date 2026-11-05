/**
 * Applies prisma/schema.prisma to the Turso cloud database (libSQL).
 *
 * Idempotent: uses CREATE TABLE IF NOT EXISTS, so it is always safe to run.
 *   Usage: bun scripts/sync-turso.mjs
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client'

// load .env (bun does not auto-load it for scripts)
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch {
  /* no .env — rely on real env vars */
}

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

if (!url || !token) {
  console.error('Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN in environment')
  process.exit(1)
}

// 1. Generate the SQL for the current schema (empty DB -> schema datamodel)
const raw = execSync(
  'bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script',
  { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname }
)

// 2. Make it idempotent (only CREATE statements come out of migrate diff)
const sql = raw
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) =>
    s
      .replace(/^CREATE TABLE /i, 'CREATE TABLE IF NOT EXISTS ')
      .replace(/^CREATE UNIQUE INDEX /i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
      .replace(/^CREATE INDEX /i, 'CREATE INDEX IF NOT EXISTS ')
  )
  .join(';\n') + ';'

// 3. Apply to Turso
const db = createClient({ url, authToken: token })
await db.executeMultiple(sql)

const res = await db.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'"
)
console.log(
  'Turso tables:',
  res.rows.map((r) => r.name).join(', ')
)
console.log('Sync complete.')
