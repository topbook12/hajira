# Task 4-a — Hajira Frontend (শুধু ফ্রন্টএন্ড) — Work Record

## Status: COMPLETE (frontend only), with 1 pre-existing BACKEND blocker reported (not fixed — out of my boundary)

## Files created/modified (exactly the allowed set)

| File | Purpose |
|---|---|
| `src/app/page.tsx` | Root single-page shell: boot splash (no hydration mismatch — localStorage read in useEffect), role-based view state machine, shared header (GraduationCap + হাজিরা, user name, শিক্ষক/শিক্ষার্থী badge, logout), sticky footer `mt-auto` with `pb-[max(1rem,env(safe-area-inset-bottom))]` |
| `src/lib/hajira-client.ts` | `getUser/setUser/getDeviceId`, `api<T>()` (x-user-id header, Bengali error extraction), `getPosition()` (returns `{lat,lng,acc?}` — acc is an extension used for "নির্ভুলতা ~২০ মি" display), `tryFingerprint()` WebAuthn demo (only `any` usage), `getSocket()` → `io('/?XTransformPort=3003')`, plus all API response TS types |
| `src/components/hajira/shared.tsx` | `bn()` Bengali digits, `mmss()`, `bnDateTime()` (toLocaleString bn-BD), `useCountdown()`, `useHajiraToasts()` (stable ok/err), `PulsingDot`, `MethodBadge`, `CheckStatusBadge`, `SessionStatusBadge`, `CodeChip` (copy w/ aria-label "কোড কপি"), `EmptyState`, `ScrollList` (max-h-96 + thin custom scrollbar via arbitrary variants), `FlagList` |
| `src/components/hajira/login-screen.tsx` | Hero (brand, tagline, 3 feature chips), Tabs শিক্ষক/শিক্ষার্থী, name+phone (client validation: name ≥2, phone digits 6–15), POST /api/auth/login, setUser + welcome toast, demo hint |
| `src/components/hajira/teacher/classes-view.tsx` | /api/me poll on `reloadKey`, class cards (code chip, studentCount, pulsing active-session badge), নতুন ক্লাস dialog → POST /api/classes, empty state BookOpen |
| `src/components/hajira/teacher/class-detail.tsx` | GET /api/classes/[id]; start-session card (duration Select 60/120/180, radius Slider 30–300, GPS Switch) → getPosition → POST /api/sessions → warning toast → emit `session:started` → navigate to live; roster (ScrollList), bulk-add dialog (Textarea parse "নাম,ফোন" lines → POST …/students → toast "৩ জন যোগ হয়েছে, ১ জন বাদ"), recent sessions w/ লাইভ দেখুন |
| `src/components/hajira/teacher/live-session.tsx` | Emerald gradient banner + red pulsing dot + mm:ss countdown; QR poll every 5s (payload/pin/expiresInSec, Progress /30); stats present/roster + Progress; live check-in list (framer-motion rows: avatar, method/GPS/bio badges, flags, PRESENT/ABSENT override icon buttons → POST …/override w/ local row update, flags JSON-string parsed); close button → POST …/close → emit `session:closed` → toast summary; ended state → summary + রিপোর্ট দেখুন; socket join-session/leave-session, `checkin:new` prepend (dedupe by studentId), `session:closed` refetch, one-shot refetch when countdown expires |
| `src/components/hajira/teacher/report-view.tsx` | GET /api/reports/class/[id]?threshold= (50/60/75 Select), table (নাম/ফোন/উপস্থিত/ফ্ল্যাগড/অনুপস্থিত/শতকরা+bar/যোগ্যতা badge), CSV download with BOM (`\uFEFF`, headers in Bengali, quoted cells) → hajira-report.csv |
| `src/components/hajira/student/home-view.tsx` | Active sessions (poll 10s + socket `session:started/closed`; per-session ticking mm:ss; per-session detail fetch → "উপস্থিতি রেকর্ড হয়েছে ✅" state; join-class rooms; leave-class on cleanup); my classes cards w/ myPct Progress; join-by-code dialog (emit join-class after join); opens CheckinDialog |
| `src/components/hajira/student/checkin-dialog.tsx` | Stepper (৩ ধাপ); auto-locate + retry (ok/fail states per spec); ?code= URL prefill; optional code input; fingerprint → tryFingerprint (ok/unsupported/skipped states); submit POST /api/checkin {sessionId, code?, lat?, lng?, deviceId, bioVerified}; handles present/flagged/already/410-error result panels (big emerald/amber/rose icons, details chips, flags list); emits `checkin:new` w/ studentName/studentPhone/sessionId embedded; onChecked → parent refetch |
| `src/components/hajira/student/class-detail.tsx` | GET /api/classes/[id] (student shape); myPct card (<60 → amber "আপনি ঝুঁকিতে আছেন!"); session history ScrollList w/ per-row status badges + pulsing "চলছে" for active-unchecked |

## Verification done
- `bunx tsc --noEmit` → **zero errors in all frontend files** (only errors are the pre-existing backend bug below).
- Live smoke test via headless browser against the running dev server:
  - Login (teacher) → welcome toast → classes view ✅
  - Create class "CSE 301 — সেকশন A" → code 6F3A9C shown, card + Bengali numerals ✅
  - Class detail renders (slider/select/switch/roster/sessions) ✅
  - Error toasts render gracefully when APIs fail ✅ (see blocker)
- Page compiles: `✓ Compiled`, `GET / 200` in dev.log.

## ⚠️ PRE-EXISTING BACKEND BUG (must be fixed by backend owner — I am forbidden to touch src/app/api)
`src/app/api/sessions/route.ts` line 24 is a **syntax error**:
```ts
const cls = await db.class.findUnique({ where: { classId ? { id: classId } : { id: 'none' } } })
```
Turbopack: "An object member cannot be declared optional". Correct form:
```ts
const cls = await db.class.findUnique({ where: classId ? { id: classId } : { id: 'none' } })
```
Impact: once this file enters the dev compilation graph (first POST /api/sessions), **every API route starts returning 500** (global compile error), so login/class creation/check-in all break until this one line is fixed. Frontend already handles the failures with destructive toasts + no crash.

## Notes / minor deviations for reviewers
- `getPosition()` additionally returns optional `acc` (accuracy meters) to power the spec'd "নির্ভুলতা ~২০ মি" line; signature remains compatible.
- Student class-detail rows show `methodLabel(myMethod)` as the badge title because `GET /api/classes/[id]` (student shape) does not return flags (contract said "title = flags joined" — not available from API).
- Socket `checkin:new` handler treats payload as the raw checkIn object (relay re-emits `data.checkIn`); teacher dedupes by studentId; a `sessionId` field is embedded by the emitter for safety filtering.
- Logout does not tear down the shared socket singleton (rooms self-clean via leave-class/leave-session effects on unmount; harmless in demo).
