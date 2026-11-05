/**
 * In-memory sliding-window rate limiter — zero-dependency, zero-cost.
 *
 * Used to slow down password guessing on /api/auth/login. On serverless
 * (Vercel) each warm instance keeps its own counters, so this is a
 * per-instance baseline, not a global guarantee — exactly right for
 * stopping casual brute-force without adding infrastructure. If the pilot
 * ever sees coordinated attacks, swap the Map for Upstash Redis (same
 * interface) — the call sites don't change.
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
let lastPrune = Date.now()

export type RateResult = { ok: boolean; retryAfterSec: number; remaining: number }

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now()

  // Opportunistic cleanup so long-lived instances don't grow the map forever.
  if (buckets.size > 5_000 || now - lastPrune > 60_000) {
    lastPrune = now
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
  }

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSec: 0, remaining: limit - 1 }
  }

  bucket.count++
  if (bucket.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000), remaining: 0 }
  }
  return { ok: true, retryAfterSec: 0, remaining: limit - bucket.count }
}

/** Best-effort client IP for limiter keys (Vercel forwards x-forwarded-for). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}
