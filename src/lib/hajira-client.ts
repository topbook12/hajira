'use client'

import { io } from 'socket.io-client'
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'

/* ------------------------------ core types ------------------------------ */

export type Role = 'TEACHER' | 'STUDENT'

export type HajiraUser = {
  id: string
  name: string
  phone: string
  role: Role
}

/* --------------------------- API response types -------------------------- */

export type CheckInStatus = 'PRESENT' | 'FLAGGED' | 'ABSENT'

export type TeacherClassInfo = {
  id: string
  name: string
  code: string
  studentCount: number
  totalSessions: number
  avgPct: number
  activeSessionId: string | null
}

export type TeacherTotals = {
  classes: number
  students: number
  sessions: number
  avgPct: number
}

export type StudentClassInfo = {
  id: string
  name: string
  code: string
  teacherName: string
  totalSessions: number
  attendedSessions: number
  myPct: number
}

export type StudentTotals = {
  classes: number
  totalSessions: number
  attendedSessions: number
  overallPct: number
}

export type ActiveSessionInfo = {
  id: string
  classId: string
  className: string
  classCode: string
  teacherName?: string
  /** GPS geofence enforced — false means students may check in remotely */
  requireGps: boolean
  /** Rotating QR / PIN required for this session */
  requireCode: boolean
  endsAt: string
  durationSec: number
  startedAt: string
}

export type RosterStudent = {
  id: string
  name: string
  phone: string
  presentCount?: number
  pct?: number | null
}

export type TeacherClassDetailData = {
  role: 'TEACHER'
  cls: { id: string; name: string; code: string; teacherName: string; threshold?: number }
  roster: RosterStudent[]
  totalSessions?: number
  sessions: { id: string; startedAt: string; status: string; endsAt: string; presentCount: number }[]
}

export type StudentClassDetailData = {
  role: 'STUDENT'
  cls: { id: string; name: string; code: string; teacherName: string; threshold?: number }
  myPct: number
  sessions: {
    id: string
    startedAt: string
    endsAt?: string
    status: string
    myStatus: CheckInStatus
    myMethod: string | null
  }[]
}

export type LiveCheckInRow = {
  id: string
  studentId: string
  studentName: string
  studentPhone: string
  status: CheckInStatus
  distanceM: number | null
  method: string
  bioVerified: boolean
  gpsOk: boolean
  flags: string[]
  createdAt: string
}

export type TeacherSessionData = {
  role: 'TEACHER'
  session: {
    id: string
    classId: string
    className: string
    classCode: string
    status: 'ACTIVE' | 'CLOSED'
    startedAt: string
    endsAt: string
    durationSec: number
    radiusM: number
    requireGps: boolean
  }
  rosterCount: number
  checkIns: LiveCheckInRow[]
}

export type StudentSessionData = {
  role: 'STUDENT'
  session: {
    id: string
    classId: string
    className: string
    classCode: string
    status: 'ACTIVE' | 'CLOSED'
    startedAt: string
    endsAt: string
    durationSec: number
  }
  rosterCount: number
  presentCount: number
  myCheckIn: CheckInInfo | null
}

export type CheckInInfo = {
  status: CheckInStatus
  method: string
  distanceM: number | null
  bioVerified: boolean
  gpsOk: boolean
  flags: string[]
  createdAt: string
}

export type QrInfo = {
  payload: string
  pin: string
  slot: number
  expiresInSec: number
}

export type ReportData = {
  cls: { id: string; name: string; code: string }
  totalSessions: number
  threshold: number
  rows: {
    studentId: string
    name: string
    phone: string
    present: number
    flagged: number
    absent: number
    pct: number
    eligible: boolean
  }[]
  /** Present-sheet grid: one column per session */
  sessions: { id: string; startedAt: string; status: string; presentCount: number }[]
  /** studentId -> sessionId -> 'PRESENT' | 'FLAGGED' (missing = absent) */
  matrix: Record<string, Record<string, string>>
}

/* ----------------------------- student analytics -------------------------- */

export type StudentAnalytics = {
  totals: {
    classes: number
    totalSessions: number
    attendedSessions: number
    flaggedSessions: number
    overallPct: number
    currentStreak: number
    bestStreak: number
  }
  perClass: {
    id: string
    name: string
    code: string
    teacherName: string
    total: number
    present: number
    flagged: number
    absent: number
    pct: number
    rank: number | null
    classSize: number
  }[]
  /** Chronological, most recent last — for the trend chart */
  timeline: { id: string; at: string; className: string; status: 'PRESENT' | 'FLAGGED' | null }[]
  /** Most recent check-ins, newest first */
  recent: {
    id: string
    at: string
    className: string
    status: CheckInStatus
    method: string
    distanceM: number | null
    gpsOk: boolean
    bioVerified: boolean
  }[]
}

/* --------------------------- what-if (eligibility) ------------------------- */

/**
 * How many consecutive sessions the student can still MISS while staying at
 * or above `threshold` % (0 = already at/under the line).
 */
export function sessionsCanMiss(present: number, total: number, threshold: number): number {
  const t = Math.min(99, Math.max(1, threshold)) / 100
  const surplus = present - t * total
  return surplus > 0 ? Math.floor(surplus / t) : 0
}

/**
 * How many sessions in a row the student must ATTEND to climb back to
 * `threshold` % (0 = already at/above it).
 */
export function sessionsNeeded(present: number, total: number, threshold: number): number {
  const t = Math.min(99, Math.max(1, threshold)) / 100
  const deficit = t * total - present
  return deficit > 0 ? Math.ceil(deficit / (1 - t)) : 0
}

/* ------------------------------- timetable -------------------------------- */

/** Weekly timetable slot — dayOfWeek: 0 = Sun … 6 = Sat; minutes from midnight */
export type ClassSlot = {
  id?: string
  dayOfWeek: number
  startMin: number
  endMin: number
  room?: string | null
}

/** One of the student's classes happening today */
export type TodaySlot = {
  classId: string
  className: string
  classCode: string
  startMin: number
  endMin: number
  room: string | null
}

/* ------------------------------ localStorage ----------------------------- */

const USER_KEY = 'hajira_user'
const DEVICE_KEY = 'hajira_device'

/**
 * Per-tab identity cache. Each tab keeps the user who signed in within it,
 * so opening the app in a second tab (or logging out elsewhere) never swaps
 * this tab's identity mid-session. localStorage is only the boot/persist layer.
 */
let cachedUser: HajiraUser | null | undefined

export function getUser(): HajiraUser | null {
  if (typeof window === 'undefined') return null
  if (cachedUser !== undefined) return cachedUser
  try {
    const raw = window.localStorage.getItem(USER_KEY)
    if (!raw) {
      cachedUser = null
      return null
    }
    const parsed = JSON.parse(raw) as Partial<HajiraUser> | null
    if (parsed && typeof parsed.id === 'string' && (parsed.role === 'TEACHER' || parsed.role === 'STUDENT')) {
      cachedUser = parsed as HajiraUser
    } else {
      cachedUser = null
    }
  } catch {
    cachedUser = null
  }
  return cachedUser
}

export function setUser(u: HajiraUser | null) {
  if (typeof window === 'undefined') return
  cachedUser = u
  if (u) window.localStorage.setItem(USER_KEY, JSON.stringify(u))
  else window.localStorage.removeItem(USER_KEY)
}

export function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  let id = window.localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev-${Math.random().toString(36).slice(2)}-${Date.now()}`
    window.localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

/* --------------------------------- fetch --------------------------------- */

/**
 * Mobile-grade fetch layer.
 *
 * Phones on cellular networks drop/hang requests far more often than
 * desktops — and a hung request used to leave a dashboard skeleton on
 * screen forever, which students read as "my data is gone". So:
 *   1. every request has a hard timeout (AbortController)
 *   2. safe GETs automatically retry once (read-only, idempotent)
 *   3. failures carry a plain-language message the UI can show with a
 *      Try-again button — never a silent empty state
 */
const FETCH_TIMEOUT_MS = 12_000

type ApiOpts = { method?: string; body?: unknown; timeoutMs?: number }

async function rawFetch<T>(path: string, opts: ApiOpts): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? FETCH_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(path, {
      method: opts.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      signal: ctrl.signal,
    })
  } catch (e) {
    clearTimeout(timer)
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('The request timed out — check your internet and try again')
    }
    throw new Error('No internet connection — check your mobile data or Wi-Fi')
  }
  clearTimeout(timer)

  if (!res.ok) {
    // Expired/invalid session cookie -> drop cached identity so the app
    // returns to the login screen on the next render.
    if (res.status === 401) {
      setUser(null)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hajira:unauthorized'))
      }
    }
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    const msg =
      data?.error ??
      (res.status >= 502 && res.status <= 504
        ? 'The server is waking up — try again in a moment'
        : 'Something went wrong — try again')
    const err = new Error(msg) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return (await res.json()) as T
}

export async function api<T>(path: string, opts?: ApiOpts): Promise<T> {
  const method = opts?.method ?? 'GET'
  const isGet = method === 'GET'
  try {
    return await rawFetch<T>(path, opts ?? {})
  } catch (e) {
    // One automatic retry for transient network failures on read-only calls.
    // HTTP 4xx errors are real answers — never retried.
    const status = (e as Error & { status?: number }).status
    const transient = status === undefined || status === 503 || (status >= 502 && status <= 504)
    if (isGet && transient) {
      await new Promise((r) => setTimeout(r, 500))
      return rawFetch<T>(path, opts ?? {})
    }
    throw e
  }
}

/** Trigger a browser download for a blob (Excel exports etc.) */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Clear the server session cookie + local cache. */
export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } catch {
    /* network hiccup — local cache is cleared below anyway */
  }
  setUser(null)
}

/* ------------------------------- geolocation ----------------------------- */

export function getPosition(): Promise<{ lat: number; lng: number; acc?: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 }
    )
  })
}

/* --------------------------- WebAuthn fingerprint ------------------------ */
/**
 * Real, server-verified biometrics (WebAuthn passkeys):
 *  - register this device's fingerprint/face/PIN once (Profile)
 *  - verify with the sensor at every check-in (server checks the signature)
 *  - sign in with the sensor instead of phone + password
 *
 * The server stores only a PUBLIC key; the fingerprint itself never leaves
 * the phone. All calls go through `api()` so errors arrive as honest,
 * plain-language messages.
 */

/** True when this browser can do WebAuthn at all. */
export function bioSupported(): boolean {
  try {
    return typeof window !== 'undefined' && browserSupportsWebAuthn()
  } catch {
    return false
  }
}

export type BioStatus = {
  enrolled: boolean
  biometricRequired: boolean
  credentials: {
    id: string
    credentialId: string
    deviceType: string | null
    backedUp: boolean
    createdAt: string
  }[]
}

export function getBioStatus(): Promise<BioStatus> {
  return api<BioStatus>('/api/webauthn/status')
}

export function setBioPreference(
  enabled: boolean
): Promise<{ ok: true; biometricRequired: boolean }> {
  return api('/api/webauthn/preference', { method: 'POST', body: { enabled } })
}

export function removeCredential(
  credentialId: string
): Promise<{ ok: boolean; enrolled: boolean; biometricRequired: boolean }> {
  return api('/api/webauthn/status', { method: 'DELETE', body: { credentialId } })
}

/** Enroll this device's sensor as a Hajira passkey (must be signed in). */
export async function fingerprintRegister(): Promise<void> {
  const { options } = await api<{ options: unknown }>('/api/webauthn/register/options', {
    method: 'POST',
  })
  let attResp: Awaited<ReturnType<typeof startRegistration>>
  try {
    attResp = await startRegistration({
      optionsJSON: options as PublicKeyCredentialCreationOptionsJSON,
    })
  } catch (e) {
    const name = (e as DOMException)?.name
    if (name === 'NotAllowedError' || name === 'AbortError') {
      throw new Error('Fingerprint setup was cancelled — try again when you are ready')
    }
    if (name === 'InvalidStateError') {
      throw new Error('This device already has a fingerprint saved for Hajira')
    }
    throw new Error('This device could not complete fingerprint setup')
  }
  await api('/api/webauthn/register/verify', { method: 'POST', body: { response: attResp } })
}

/** Ask the sensor to verify the current user — server-checked signature. */
export async function fingerprintAssert(): Promise<void> {
  const { options } = await api<{ options: unknown }>('/api/webauthn/assert/options', {
    method: 'POST',
  })
  let authResp: Awaited<ReturnType<typeof startAuthentication>>
  try {
    authResp = await startAuthentication({
      optionsJSON: options as PublicKeyCredentialRequestOptionsJSON,
    })
  } catch (e) {
    const name = (e as DOMException)?.name
    if (name === 'NotAllowedError' || name === 'AbortError') {
      throw new Error('Fingerprint verification was cancelled or timed out')
    }
    throw new Error('Fingerprint verification failed on this device')
  }
  await api('/api/webauthn/assert/verify', { method: 'POST', body: { response: authResp } })
}

/** Usernameless passkey sign-in — sensor prompt, then a normal session. */
export async function passkeyLogin(): Promise<HajiraUser> {
  const { options } = await api<{ options: unknown }>('/api/webauthn/login/options', {
    method: 'POST',
  })
  let authResp: Awaited<ReturnType<typeof startAuthentication>>
  try {
    authResp = await startAuthentication({
      optionsJSON: options as PublicKeyCredentialRequestOptionsJSON,
    })
  } catch (e) {
    const name = (e as DOMException)?.name
    if (name === 'NotAllowedError' || name === 'AbortError') {
      throw new Error(
        'No saved fingerprint for Hajira on this device — sign in with your phone number and password first, then add your fingerprint from Profile'
      )
    }
    throw new Error('Fingerprint sign-in failed — use phone and password instead')
  }
  const res = await api<{ user: HajiraUser }>('/api/webauthn/login/verify', {
    method: 'POST',
    body: { response: authResp },
  })
  setUser(res.user)
  return res.user
}

/* -------------------------------- realtime ------------------------------- */

/**
 * Live-event relay (socket.io) — an OPTIONAL accelerator, never a requirement.
 *
 * Every realtime consumer also polls the REST API (the source of truth), so
 * the app keeps working with slightly slower updates when this is off.
 *
 * Realtime is OPT-IN via NEXT_PUBLIC_ENABLE_REALTIME=1 — set it only where a
 * websocket server actually exists (self-hosted gateway / mini service).
 * On serverless hosts (Vercel) there is no socket server: leaving this off
 * prevents an endless reconnect storm that silently burns the phone's
 * battery and mobile data on every dashboard screen.
 */
const REALTIME_ENABLED = process.env.NEXT_PUBLIC_ENABLE_REALTIME === '1'

type MinimalSocket = {
  emit: (event: string, ...args: unknown[]) => void
  on: (event: string, cb: (...args: unknown[]) => void) => unknown
  off: (event: string, cb?: (...args: unknown[]) => void) => unknown
  connected: boolean
}

function makeNoopSocket(): MinimalSocket {
  return {
    emit: () => undefined,
    on: () => undefined,
    off: () => undefined,
    connected: false,
  }
}

let socket: MinimalSocket | null = null

export function getSocket(): MinimalSocket {
  if (!REALTIME_ENABLED) {
    if (!socket) socket = makeNoopSocket()
    return socket
  }
  if (!socket) {
    socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity, // never give up: gateway may blip mid-class
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    })
  }
  return socket
}
