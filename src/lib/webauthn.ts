import crypto from 'node:crypto'
import type { NextRequest } from 'next/server'

/**
 * Hajira WebAuthn (passkey/fingerprint) — server-side helpers.
 *
 * Serverless constraints shape the design: Vercel lambdas share no memory,
 * so the classic "store the challenge in a session/DB" pattern doesn't work
 * reliably. Instead every challenge is a SELF-DESCRIBING signed token:
 *
 *   token    = base64url(JSON payload) + '.' + base64url(HMAC-SHA256(payload, APP_SECRET))
 *   challenge= base64url(token)   <- what the browser actually receives
 *
 * The payload carries who it is for (sub), what it is for (purpose) and when
 * it dies (exp). Verification is pure computation — HMAC check + expiry
 * check — no state.
 *
 * Why the extra outer base64url layer? The browser must round-trip the
 * challenge as RAW BYTES (clientDataJSON.base64url(bytes)).
 * @simplewebauthn/browser decodes options.challenge with atob(), which
 * throws on non-base64 characters — a bare "a.b" token with a '.' would
 * crash client-side. One more base64url pass makes the challenge a single
 * canonical base64url string, which survives encode->sign->re-encode
 * unchanged, and verifyChallenge() peels it back off.
 *
 * APP_SECRET (and its dev fallback) is intentionally identical to the
 * session token in lib/auth.ts so one secret protects both mechanisms.
 */

const CHALLENGE_TTL_SEC = 120 // browsers get 2 minutes to complete a prompt

/**
 * @simplewebauthn/server's byte type. `ReturnType<Uint8Array['slice']>`
 * resolves to `Uint8Array<ArrayBuffer>` under TS 5.7+ typed-array generics —
 * `new Uint8Array(Buffer.from(...))` alone would only give `Uint8Array<ArrayBufferLike>`,
 * which fails assignment into the library's option types.
 */
export type WebAuthnBytes = ReturnType<Uint8Array['slice']>

function toByteArray(buf: Buffer): WebAuthnBytes {
  const out = new Uint8Array(buf.byteLength)
  out.set(buf)
  return out
}

export type ChallengePurpose = 'register' | 'login' | 'assert'

export type ChallengePayload = {
  sub: string // user id ('register' | 'assert'), literal 'login' for usernameless login
  purpose: ChallengePurpose
  exp: number // unix seconds
}

function appSecret(): string {
  return process.env.APP_SECRET || 'hajira-dev-secret-do-not-use-in-production'
}

/* --------------------------- base64url utilities --------------------------- */

export function stringToBytes(s: string): WebAuthnBytes {
  return toByteArray(Buffer.from(s, 'utf8'))
}

export function b64urlToBytes(s: string): WebAuthnBytes {
  return toByteArray(Buffer.from(s, 'base64url'))
}

export function bytesToB64url(b: Uint8Array): string {
  return Buffer.from(b).toString('base64url')
}

/* ------------------------------ challenge token ---------------------------- */

/** The inner 'body.sig' form. '.' is NOT valid inside a base64url challenge. */
function signChallengeToken(payload: ChallengePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', appSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

/**
 * Challenge handed to the browser: the signed token wrapped in one more
 * base64url pass so it contains only web-safe characters.
 */
export function signChallenge(payload: ChallengePayload): string {
  return Buffer.from(signChallengeToken(payload)).toString('base64url')
}

/**
 * Peel the browser's base64url wrapper off a challenge. '.' cannot appear in
 * base64url, so the presence of a dot unambiguously means the argument is
 * already the inner 'body.sig' token (handy for tests/manual verification).
 *
 * The wrapper may be nested: @simplewebauthn/server v13+ UTF-8-encodes a
 * string `challenge` option and base64url-encodes the bytes again, so a
 * challenge that was ALREADY base64url reaches clientDataJSON double-wrapped:
 *
 *   base64url( utf8( base64url( 'body.sig' ) ) )
 *
 * Decode in a loop until the signed token (with its '.') appears — tolerant
 * of direct tokens, single and double wrapping alike. Anything that still
 * shows no dot after 3 passes is not ours; the HMAC check downstream is the
 * final authority anyway.
 */
function unwrapChallenge(challenge: string): string | null {
  let cur = challenge
  for (let pass = 0; pass < 3; pass++) {
    if (cur.includes('.')) return cur
    let decoded: string
    try {
      decoded = Buffer.from(cur, 'base64url').toString('utf8')
    } catch {
      return null
    }
    // Base64url decode never throws on this input — detect no-progress or
    // binary garbage instead (a valid decode is printable and shorter).
    if (!decoded.length || decoded === cur || /[\uFFFD]/.test(decoded)) return null
    cur = decoded
  }
  return null
}

/** Verify HMAC + expiry + purpose; returns the payload, or null if invalid. */
export function verifyChallenge(
  challenge: string,
  purpose: ChallengePurpose
): ChallengePayload | null {
  if (!challenge || typeof challenge !== 'string') return null
  const token = unwrapChallenge(challenge)
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = crypto.createHmac('sha256', appSecret()).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as ChallengePayload
    if (!payload || typeof payload.exp !== 'number' || typeof payload.sub !== 'string') return null
    if (payload.purpose !== purpose) return null
    if (payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

/**
 * Builds the `expectedChallenge` callback accepted by
 * verifyRegistrationResponse / verifyAuthenticationResponse
 * (`(challenge: string) => boolean`). When `sub` is given the challenge must
 * also name THAT user — binding registration/assertion to the session user,
 * not just to a valid signature.
 */
export function challengeVerifier(purpose: ChallengePurpose, sub?: string) {
  return (challenge: string): boolean => {
    const payload = verifyChallenge(challenge, purpose)
    if (!payload) return false
    if (sub !== undefined && payload.sub !== sub) return false
    return true
  }
}

export function newChallengeExp(): number {
  return Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SEC
}

/* ------------------------------- rp / origin ------------------------------- */

/**
 * Derive rpID + origin from proxy-aware request headers so the same code
 * works on localhost (:3000, http), the Vercel production domain and any
 * preview deployment.
 *
 * rpID = bare hostname (no port, no scheme) — WebAuthn requires exactly this.
 * origin = protocol + host as the browser reports it in clientDataJSON.
 *
 * `allowedOrigins` also admits the http variant of an https host: Vercel and
 * preview URLs are always https, but bare `next dev` is http://localhost and
 * never sends x-forwarded-proto. Accepting both schemes for the SAME host is
 * the pragmatic serverless-friendly compromise (an attacker still cannot
 * cross hosts).
 */
export function getRpAndOrigin(req: NextRequest): {
  rpID: string
  origin: string
  allowedOrigins: string[]
} {
  const host = (
    req.headers.get('x-forwarded-host')?.split(',')[0] ||
    req.headers.get('host') ||
    'localhost:3000'
  ).trim()
  const proto = (req.headers.get('x-forwarded-proto')?.split(',')[0] || 'https').trim()
  const rpID = host.split(':')[0]
  const origin = `${proto}://${host}`
  const allowedOrigins = proto === 'https' ? [origin, `http://${host}`] : [origin]
  return { rpID, origin, allowedOrigins }
}

/* --------------------------- response shape guard -------------------------- */

/**
 * Minimal runtime check that the client posted something shaped like a
 * PublicKeyCredential JSON (what @simplewebauthn/browser's startRegistration /
 * startAuthentication return via .toJSON()).
 */
export function isCredentialResponse(
  value: unknown
): value is { id: string; response: Record<string, unknown> } {
  if (!value || typeof value !== 'object') return false
  const v = value as { id?: unknown; response?: unknown }
  return typeof v.id === 'string' && v.id.length > 0 && !!v.response && typeof v.response === 'object'
}
