'use client'

import { io } from 'socket.io-client'

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
  activeSessionId: string | null
}

export type StudentClassInfo = {
  id: string
  name: string
  code: string
  teacherName: string
  totalSessions: number
  myPct: number
}

export type ActiveSessionInfo = {
  id: string
  classId: string
  className: string
  classCode: string
  teacherName?: string
  endsAt: string
  durationSec: number
  startedAt: string
}

export type RosterStudent = { id: string; name: string; phone: string }

export type TeacherClassDetailData = {
  role: 'TEACHER'
  cls: { id: string; name: string; code: string; teacherName: string; threshold?: number }
  roster: RosterStudent[]
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

export async function api<T>(
  path: string,
  opts?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(path, {
    method: opts?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
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
    throw new Error(data?.error ?? 'Something went wrong')
  }
  return (await res.json()) as T
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

export async function tryFingerprint(displayName: string): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false
    if (!('PublicKeyCredential' in window)) return false
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const userId = crypto.getRandomValues(new Uint8Array(16))
    const createPromise = (navigator as any).credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Hajira Attendance' },
        user: { id: userId, name: displayName, displayName },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 8000,
        attestation: 'none',
      },
    })
    // hang-proof: never let a stuck authenticator block check-in
    const guard = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 9000))
    const cred = await Promise.race([createPromise, guard])
    return !!cred
  } catch {
    return false
  }
}

/* -------------------------------- realtime ------------------------------- */

/**
 * Live-event relay (socket.io) — an OPTIONAL accelerator, never a requirement.
 *
 * Every realtime consumer also polls the REST API (the source of truth), so
 * if the relay is unreachable the app keeps working with slightly slower
 * updates. On Vercel there is no long-lived socket server, so deployments
 * set NEXT_PUBLIC_DISABLE_REALTIME=1 and skip connecting entirely — that
 * also saves battery/data (no endless reconnect attempts).
 */
const REALTIME_DISABLED = process.env.NEXT_PUBLIC_DISABLE_REALTIME === '1'

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
  if (REALTIME_DISABLED) {
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
