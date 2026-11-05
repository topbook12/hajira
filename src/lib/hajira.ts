import crypto from 'node:crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

export const SLOT_MS = 30_000 // rotating QR/PIN changes every 30 seconds

/* -------------------------- auth helpers (cookie) -------------------------- */

export async function requireUser(req: NextRequest) {
  const uid = getUserIdFromRequest(req)
  if (!uid) return null
  const user = await db.user.findUnique({ where: { id: uid } })
  return user
}

export function unauthorized() {
  return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
}

export function forbidden(msg = 'Not allowed') {
  return NextResponse.json({ error: msg }, { status: 403 })
}

export function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

/* ---------- geo ---------- */

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/* ---------- rotating QR / PIN (TOTP-style slots) ---------- */

export function slotOf(now = Date.now()) {
  return Math.floor(now / SLOT_MS)
}

export function sigOf(secret: string, sessionId: string, slot: number) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${sessionId}:${slot}`)
    .digest('hex')
}

export function pinOf(secret: string, sessionId: string, slot: number) {
  const sig = sigOf(secret, sessionId, slot)
  const n = parseInt(sig.slice(0, 8), 16) % 1_000_000
  return n.toString().padStart(6, '0')
}

export function payloadOf(secret: string, sessionId: string, slot: number) {
  return `ATT1.${sessionId}.${slot}.${sigOf(secret, sessionId, slot)}`
}

export function validSlots(now = Date.now()) {
  const t = slotOf(now)
  return [t, t - 1] // current + previous (clock-skew tolerance)
}

/** Accepts either full QR payload "ATT1.<sessionId>.<slot>.<sig>" or a 6-digit PIN */
export function verifyCode(
  code: string,
  session: { id: string; secret: string }
): { ok: boolean; method: 'QR' | 'PIN'; slot?: number } {
  const trimmed = (code || '').trim()
  if (!trimmed) return { ok: false, method: 'PIN' }
  const parts = trimmed.split('.')
  if (parts.length === 4 && parts[0] === 'ATT1' && parts[1] === session.id) {
    const slot = Number(parts[2])
    if (
      Number.isInteger(slot) &&
      validSlots().includes(slot) &&
      parts[3] === sigOf(session.secret, session.id, slot)
    ) {
      return { ok: true, method: 'QR', slot }
    }
    return { ok: false, method: 'QR' }
  }
  if (/^\d{6}$/.test(trimmed)) {
    for (const s of validSlots()) {
      if (pinOf(session.secret, session.id, s) === trimmed) {
        return { ok: true, method: 'PIN', slot: s }
      }
    }
    return { ok: false, method: 'PIN' }
  }
  return { ok: false, method: 'PIN' }
}

/* ---------- misc ---------- */

export function randomClassCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6)
}

export function randomSecret() {
  return crypto.randomBytes(24).toString('hex')
}
