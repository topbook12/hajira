import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, haversineM, requireUser, unauthorized, verifyCode } from '@/lib/hajira'

/**
 * Student check-in — the 3-proof verification engine:
 *  1. WHO   -> device binding + optional fingerprint (bioVerified)
 *  2. WHERE -> GPS geofence around the classroom
 *  3. WHEN  -> active session within the 1-2 minute window (+ optional rotating QR/PIN)
 */
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'STUDENT') return badRequest('শুধু শিক্ষার্থী চেক-ইন করতে পারে')

  const body = await req.json().catch(() => null)
  const sessionId = String(body?.sessionId || '')
  const code = String(body?.code || '').trim()
  const deviceId = String(body?.deviceId || '').trim()
  const bioVerified = !!body?.bioVerified
  const lat = body?.lat == null ? null : Number(body.lat)
  const lng = body?.lng == null ? null : Number(body.lng)

  if (!sessionId) return badRequest('সেশন আইডি দরকার')
  if (!deviceId) return badRequest('ডিভাইস আইডি দরকার')

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { class: { select: { name: true } } },
  })
  if (!session) return badRequest('সেশন পাওয়া যায়নি')

  const member = await db.membership.findUnique({
    where: { classId_studentId: { classId: session.classId, studentId: user.id } },
  })
  if (!member) return badRequest('আপনি এই ক্লাসের শিক্ষার্থী নন')

  const now = new Date()
  if (session.status !== 'ACTIVE' || session.endsAt <= now) {
    return NextResponse.json({ error: 'সেশনের সময় শেষ — উপস্থিতি নেওয়া হয়ে গেছে' }, { status: 410 })
  }

  const existing = await db.checkIn.findUnique({
    where: { sessionId_studentId: { sessionId, studentId: user.id } },
  })
  if (existing) {
    return NextResponse.json(
      { already: true, checkIn: existing, message: 'আপনার উপস্থিতি আগেই রেকর্ড হয়েছে ✅' },
      { status: 200 }
    )
  }

  const flags: string[] = []
  let method = 'BUTTON'
  let gpsOk = !session.requireGps
  let distanceM: number | null = null

  // Proof 3 (optional fast-entry): rotating QR payload or 6-digit PIN
  if (code) {
    const v = verifyCode(code, session)
    if (v.ok) {
      method = v.method
    } else {
      flags.push('কোড যাচাই ব্যর্থ (ভুল বা পুরনো)')
    }
  }

  // Proof 2 (WHERE): GPS geofence
  if (session.requireGps) {
    if (lat == null || lng == null) {
      flags.push('GPS পাওয়া যায়নি (পারমিশন দিন)')
    } else {
      distanceM = Math.round(haversineM(session.lat!, session.lng!, lat, lng) * 10) / 10
      gpsOk = distanceM <= session.radiusM
      if (!gpsOk) flags.push(`ক্লাসরুমের রেঞ্জের বাইরে (~${Math.round(distanceM)} মিটার)`)
    }
  }

  // Proof 1 (WHO): device binding — one device per student
  if (user.deviceId && user.deviceId !== deviceId) {
    flags.push('নতুন/ভিন্ন ডিভাইস থেকে চেক-ইন')
  } else if (!user.deviceId) {
    await db.user.update({ where: { id: user.id }, data: { deviceId } })
  }

  const status = flags.length ? 'FLAGGED' : 'PRESENT'

  const checkIn = await db.checkIn.create({
    data: {
      sessionId,
      studentId: user.id,
      status,
      distanceM,
      method,
      bioVerified,
      gpsOk,
      deviceId,
      flags: flags.length ? JSON.stringify(flags) : null,
    },
  })

  return NextResponse.json({
    checkIn: {
      id: checkIn.id,
      status: checkIn.status,
      method: checkIn.method,
      distanceM: checkIn.distanceM,
      bioVerified: checkIn.bioVerified,
      gpsOk: checkIn.gpsOk,
      flags,
      createdAt: checkIn.createdAt,
    },
    className: session.class.name,
    message:
      status === 'PRESENT'
        ? 'উপস্থিতি সফলভাবে রেকর্ড হয়েছে ✅'
        : 'চেক-ইন হয়েছে, তবে কিছু বিষয় যাচাইয়ের জন্য ফ্ল্যাগ হয়েছে ⚠️',
  })
}
