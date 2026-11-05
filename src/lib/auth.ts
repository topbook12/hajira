import crypto from 'node:crypto'
import type { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'

/**
 * Hajira auth — zero extra dependencies, realistic security for an MVP:
 *
 * - Passwords: scrypt (node:crypto) with per-user random salt.
 * - Sessions: HMAC-SHA256-signed token in an httpOnly cookie (stateless,
 *   30-day expiry, tamper-proof). No JWT library needed.
 */

const SESSION_COOKIE = 'hajira_session'
const SESSION_TTL_SEC = 60 * 60 * 24 * 30 // 30 days

function appSecret(): string {
  return process.env.APP_SECRET || 'hajira-dev-secret-do-not-use-in-production'
}

/* --------------------------------- passwords ------------------------------ */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 32).toString('hex')
  return `s1:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false
  const [ver, salt, hash] = stored.split(':')
  if (ver !== 's1' || !salt || !hash) return false
  const candidate = crypto.scryptSync(password, salt, 32)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)
}

/* --------------------------- signed session token -------------------------- */

type SessionPayload = { uid: string; exp: number }

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

export function signSession(uid: string): string {
  const payload: SessionPayload = { uid, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC }
  const body = b64url(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', appSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = crypto.createHmac('sha256', appSecret()).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload
    if (!payload.uid || typeof payload.exp !== 'number') return null
    if (payload.exp * 1000 < Date.now()) return null
    return payload.uid
  } catch {
    return null
  }
}

/* ------------------------------- cookie helpers ---------------------------- */

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SEC,
  }
}

export { SESSION_COOKIE }

export function setSessionCookie(res: NextResponse, uid: string) {
  res.cookies.set(SESSION_COOKIE, signSession(uid), sessionCookieOptions())
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 })
}

/** Reads the signed session cookie and returns the user id (or null). */
export function getUserIdFromRequest(req: NextRequest): string | null {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
}
