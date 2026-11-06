/**
 * Makes the Turso cloud database (libSQL) match prisma/schema.prisma —
 * the safety net that keeps production alive across schema evolution.
 *
 * Why this exists: Hajira deploys from a laptop to Vercel + Turso without a
 * migration pipeline. When a commit adds a COLUMN to an existing table
 * (e.g. User.biometricRequired for WebAuthn), CREATE TABLE IF NOT EXISTS
 * alone cannot apply it — every Prisma query on that table then fails with
 * "no such column", which surfaced to users as a gaslighting
 * "Sign in failed — please try again" for EVERYONE. Never again:
 *
 *   1. CREATE TABLE / INDEX IF NOT EXISTS  (new tables + indexes)
 *   2. ALTER TABLE ADD COLUMN              (missing columns on existing tables)
 *      — sanitized for SQLite's ADD COLUMN rules (no CURRENT_TIMESTAMP
 *        defaults, no bare NOT NULL without a constant default)
 *   3. backfill NOT NULL columns added without a default
 *   4. VERIFY table-by-table, column-by-column; exit 1 loudly on any gap
 *
 * Idempotent: always safe to run, on every build.
 *
 * Usage: bun scripts/sync-turso.mjs   (or: node scripts/sync-turso.mjs)
 * Vercel: runs automatically before `next build` — see package.json "build".
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
  // Local dev / offline build: nothing to sync, never fail the build.
  console.log('[sync-turso] TURSO_* not configured — skipping (local dev).')
  process.exit(0)
}

// prisma migrate diff parses the schema, and our datasource declares
// env("DATABASE_URL") which does not exist on Vercel — it is never CONNECTED
// to for a from-empty diff, but the parser still wants it defined.
process.env.DATABASE_URL ||= 'file:./.sync-turso-tmp.db'

// 1. Generate the SQL for the current schema (empty DB -> schema datamodel).
//    bunx locally, npx on Vercel (bun is not guaranteed there).
function prismaDiffSql() {
  const args =
    'prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script'
  const cwd = new URL('..', import.meta.url).pathname
  let lastErr
  for (const runner of ['bunx', 'npx']) {
    try {
      return execSync(`${runner} ${args}`, { encoding: 'utf8', cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      lastErr = e
      const stderr = String(e?.stderr || '')
      // A real schema/CLI error (not a missing-runner error) should not be
      // hidden by trying the other runner — surface it early.
      if (stderr.includes('error:') && !stderr.includes('command not found')) {
        console.error('[sync-turso] prisma diff failed:\n' + stderr)
        process.exit(1)
      }
    }
  }
  console.error('[sync-turso] could not run prisma CLI (tried bunx + npx):', lastErr?.message)
  process.exit(1)
}

const raw = prismaDiffSql()

// 2. Parse the diff into per-table desired columns so we can repair drift.
//    Statements look like:
//      CREATE TABLE "User" (
//          "id" TEXT NOT NULL PRIMARY KEY,
//          "biometricRequired" BOOLEAN NOT NULL DEFAULT false,
//          ...
//          FOREIGN KEY (...) REFERENCES ... ON DELETE ...
//      );
function parseDesiredSchema(diffSql) {
  const tables = new Map() // name -> Map(colName -> sanitized ADD COLUMN def)
  const createRe = /CREATE TABLE "([^"]+)" \(([\s\S]*?)\);\s*(?=\n|--|$)/g
  for (const m of diffSql.matchAll(createRe)) {
    const tableName = m[1]
    const body = m[2]
    const cols = new Map()
    // split on top-level commas (values in this schema never contain commas)
    let depth = 0
    let cur = ''
    const parts = []
    for (const ch of body) {
      if (ch === '(') depth++
      if (ch === ')') depth--
      if (ch === ',' && depth === 0) {
        parts.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
    if (cur.trim()) parts.push(cur)
    for (const part of parts) {
      const line = part.trim()
      const colMatch = line.match(/^"([^"]+)"\s+(.+)$/)
      if (!colMatch) continue // table-level FOREIGN KEY / UNIQUE / PRIMARY KEY
      cols.set(colMatch[1], sanitizeColumnDef(colMatch[2]))
    }
    tables.set(tableName, cols)
  }
  return tables
}

/**
 * Make a Prisma column definition legal for `ALTER TABLE ... ADD COLUMN`.
 * SQLite refuses: PRIMARY KEY clauses, CURRENT_* defaults, and NOT NULL
 * without a constant default. Anything stripped that was required gets a
 * backfill in pass 4.
 */
function sanitizeColumnDef(def) {
  let d = ` ${def.trim()} `
  let backfill = null // SQL literal for backfill, when needed

  // capture defaults BEFORE any stripping
  const currentDefault = d.match(/\bDEFAULT\s+(CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME)\b/i)
  const constDefault = d.match(/\bDEFAULT\s+(?!CURRENT_)([^\s,)]+)/i)

  // SQLite ADD COLUMN forbids: PRIMARY KEY, UNIQUE, CURRENT_* defaults,
  // and NOT NULL without a constant default. (Inline REFERENCES is legal
  // but Prisma never emits it in column defs — strip defensively anyway.)
  d = d.replace(/\bPRIMARY KEY\b/gi, ' ')
  d = d.replace(/\bUNIQUE\b/gi, ' ')
  d = d.replace(/\bREFERENCES\b[\s\S]*/i, ' ')
  // normalize SQL booleans to integer literals
  d = d.replace(/\bfalse\b/gi, '0').replace(/\btrue\b/gi, '1')

  const isNotNull = /\bNOT NULL\b/i.test(d)

  if (currentDefault) {
    // cannot add with CURRENT_* default -> nullable, backfill existing rows
    d = d.replace(/\bDEFAULT\s+(CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME)\b/gi, ' ')
    d = d.replace(/\bNOT NULL\b/gi, ' ')
    backfill = "datetime('now')"
  } else if (isNotNull && !constDefault) {
    d = d.replace(/\bNOT NULL\b/gi, ' ')
    backfill = defaultValueFor(d)
  } else if (isNotNull && constDefault) {
    backfill = constDefault[1].replace(/\bfalse\b/gi, '0').replace(/\btrue\b/gi, '1') // ALTER fills existing rows; backfill anyway for safety
  }

  return { sql: d.replace(/\s+/g, ' ').trim(), backfill }
}

/** Pick a sensible backfill literal from a column definition's type. */
function defaultValueFor(def) {
  if (/\b(BOOLEAN|BOOL)\b/i.test(def)) return '0'
  if (/\b(INT|INTEGER|REAL|FLOAT|DOUBLE|NUMERIC|DECIMAL)\b/i.test(def)) return '0'
  if (/\b(DATETIME|DATE|TIMESTAMP)\b/i.test(def)) return "datetime('now')"
  return "''"
}

const desired = parseDesiredSchema(raw)

// 3. Idempotent CREATE pass (new tables + indexes), then column repair pass.
const createSql = raw
  .replace(/^CREATE TABLE /gmi, 'CREATE TABLE IF NOT EXISTS ')
  .replace(/^CREATE UNIQUE INDEX /gmi, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
  .replace(/^CREATE INDEX /gmi, 'CREATE INDEX IF NOT EXISTS ')
  .trim()

const db = createClient({ url, authToken: token })

if (createSql) {
  await db.executeMultiple(createSql)
  console.log('[sync-turso] create-if-missing pass done (tables + indexes).')
}

/** Live columns of a table: PRAGMA first, sqlite_master.sql fallback. */
async function liveColumns(table) {
  try {
    const res = await db.execute(`PRAGMA table_info("${table}")`)
    if (res.rows.length > 0) {
      return new Set(res.rows.map((r) => String(r.name)))
    }
  } catch {
    /* fall through to sqlite_master */
  }
  const res = await db.execute({
    sql: 'SELECT sql FROM sqlite_master WHERE type = ? AND name = ?',
    args: ['table', table],
  })
  const sql = res.rows[0] ? String(res.rows[0].sql) : ''
  const inner = sql.match(/\(([\s\S]*)\)/)
  const cols = new Set()
  if (inner) {
    for (const line of inner[1].split(',')) {
      const cm = line.trim().match(/^"([^"]+)"/)
      if (cm) cols.add(cm[1])
    }
  }
  return cols
}

let added = 0
for (const [table, cols] of desired) {
  const existing = await liveColumns(table)
  if (existing.size === 0) continue // table just created in pass 1 — complete
  for (const [col, defInfo] of cols) {
    if (existing.has(col)) continue
    try {
      await db.execute(`ALTER TABLE "${table}" ADD COLUMN "${col}" ${defInfo.sql}`)
      added++
      console.log(`[sync-turso] + ${table}.${col}  (${defInfo.sql})`)
    } catch (e) {
      // "duplicate column name" from a racing build is fine; anything else is not
      if (String(e?.message ?? '').toLowerCase().includes('duplicate column')) continue
      console.error(`[sync-turso] FAILED to add ${table}.${col}: ${e?.message}`)
      process.exit(1)
    }
    if (defInfo.backfill) {
      await db.execute(`UPDATE "${table}" SET "${col}" = ${defInfo.backfill} WHERE "${col}" IS NULL`)
    }
  }
}
if (added === 0) console.log('[sync-turso] no column drift.')

// 4. VERIFY — the whole point: never let a silent gap break production again.
const missing = []
for (const [table, cols] of desired) {
  const existing = await liveColumns(table)
  if (existing.size === 0) {
    missing.push(`table "${table}" is MISSING`)
    continue
  }
  for (const col of cols.keys()) {
    if (!existing.has(col)) missing.push(`column "${table}"."${col}" is MISSING`)
  }
}
if (missing.length > 0) {
  console.error('[sync-turso] VERIFICATION FAILED:\n  ' + missing.join('\n  '))
  process.exit(1)
}

const res = await db.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'"
)
console.log(
  '[sync-turso] verified. Turso tables:',
  res.rows.map((r) => r.name).join(', ')
)
console.log('[sync-turso] Sync complete.')
