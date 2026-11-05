# Hajira — Operations Manual

Start-to-finish plan for running Hajira as a real attendance platform in
universities/colleges/schools: identity, security, daily operation, data,
recovery, and the growth roadmap.

```
                        ┌──────────────────────────────┐
  Teacher phone ───────▶│  Vercel (Next.js serverless) │
  Student phones ──────▶│   /api/*  ·  rotating QR/PIN │
                        └──────────┬───────────────────┘
                                   │ HTTPS (retry + backoff)
                                   ▼
                        ┌──────────────────────────────┐
                        │  Turso libSQL (free tier)    │
                        │  users · classes · sessions  │
                        │  check-ins · timetable       │
                        └──────────┬───────────────────┘
                                   │ export
                                   ▼
                        ┌──────────────────────────────┐
                        │  Excel archive (.xlsx)       │
                        │  permanent record per class  │
                        └──────────────────────────────┘
```

BYOD (bring your own device): the institute buys nothing. Teachers and
students use their own phones; the whole platform runs on free tiers
(Vercel Hobby + Turso Free) with the Excel export as the durable archive.

---

## 1. Identity — how accounts are created

| Who | How | Guardrail |
|---|---|---|
| **First teacher** | Signs up on the login screen (Teacher tab) with name + phone + password. **Teacher key left empty** — bootstrap mode. | Only works while the institute has **zero** teachers. The moment one exists, the door closes. |
| **Later teachers** | Same flow, but must enter the institute **teacher key** (`TEACHER_SIGNUP_KEY` env var, default `HAJIRA-TEACHER`). | The key is shared verbally/by the department head only — never posted publicly. Change it per semester in Vercel → Settings → Environment Variables, then Redeploy. |
| **Students** | Two ways: (a) teacher pastes a CSV roster (`name,phone` per row), or (b) students sign up themselves (Student tab) and join with the **6-character class code**. | Accounts are per phone number (unique). Students can never create teacher accounts (key + one-time bootstrap). |

**First login = account creation.** A phone number that isn't registered yet
gets an account automatically; the password typed that day becomes the
account's password. From then on, that phone + password is the identity.

## 2. Security model — what is verified, and how

**Credentials & sessions**
- Passwords are hashed with **scrypt** (never stored in plaintext).
- Sessions are **HMAC-signed, httpOnly cookies** (`APP_SECRET`). JavaScript
  cannot read them; forging one requires the secret.
- **Rate limiting** on login: 8 attempts / phone / 5 min and 40 / IP / 5 min
  (HTTP 429 + `Retry-After`). Slows password guessing to a crawl.

**The 3-proof check-in chain** (every attendance record)
1. **WHO — device binding.** One device per student. A check-in from a
   different phone is flagged. Optional **fingerprint step**: a WebAuthn
   platform-authenticator ceremony (`userVerification: required`) — the
   phone's own biometric unlock must pass. Honest scope: this proves *the
   device owner unlocked the device with biometrics at that moment*; it is
   not yet a server-enrolled identity credential (Phase 3).
2. **WHERE — GPS geofence.** Distance is computed with haversine against
   the session's coordinates; outside the radius (default 100 m,
   teacher-configurable 30–100 m) → flagged. Location is requested **only
   during an active session**, never stored outside the check-in.
3. **WHEN — live window + rotating code.** Sessions last 1–2 minutes. The
   QR payload / 6-digit PIN is **HMAC-signed per 30-second slot** — a
   screenshot sent to a friend across campus is already expired when they
   try it.

**Trust boundary — flags, not silent lies.** Anything suspicious doesn't
fake success: the check-in lands as `FLAGGED` with human-readable reasons
("Outside classroom range (~320 m)", "Check-in from a new/different device").
The teacher sees flags in the live view and in reports and can **override**
a flagged record (their judgment is the final authority — by design, because
GPS lies in basements and buses).

**Known gaps (planned):** OTP phone verification (Phase 2), server-side
WebAuthn enrollment (Phase 3), SMS alerts (Phase 2).

## 3. Environments & secrets

| Variable | Where | Notes |
|---|---|---|
| `TURSO_DATABASE_URL` | Vercel + local `.env` | libSQL URL |
| `TURSO_AUTH_TOKEN` | Vercel + local `.env` | rotate if ever shared |
| `APP_SECRET` | Vercel + local `.env` | signs cookies — `openssl rand -hex 32`; changing it logs everyone out |
| `TEACHER_SIGNUP_KEY` | Vercel | institute teacher key; change per semester |

Deploy flow: `git push origin main` → Vercel builds → production updates.
Commits must be authored by the owner's GitHub account (`topbook12`) —
Vercel Hobby blocks deploys from unlinked commit authors.

## 4. Onboarding a new institute (30 minutes)

1. **Create the teacher account**: department head signs up as Teacher
   (bootstrap, no key needed if the deployment is fresh).
2. **Set a private teacher key**: Vercel → env vars →
   `TEACHER_SIGNUP_KEY=<secret>` → Redeploy. Share it only with faculty.
3. **Create classes**: name + exam-eligibility threshold (default 70%).
4. **Enroll students**: paste CSV roster, *and/or* announce the class code —
   students join themselves in seconds.
5. **(Optional) Timetable**: add weekly slots (day, start–end, room) so the
   student home shows "next class" context.
6. **First session**: teacher taps **Start session**, sets duration + GPS
   radius, students scan/enter the PIN, done in 60–120 seconds.
7. **Install as an app (PWA)**: Android Chrome → "Install Hajira" banner or
   menu ⋮ → *Add to Home screen*. iOS Safari → Share → *Add to Home
   Screen*. It then runs full-screen like a native app; a graceful offline
   page appears without internet (check-ins always require network — by
   design, they must be verified live).

## 5. Daily runbook (teacher)

**Before class** — open the class; live timetable says whether today is a
session day. Ensure phone location permission is granted once.

**During** — Start session (1–2 min window). The live view streams check-ins
in real time: green = present, amber = **flagged** (read the reason, decide:
override or leave for the report). Late stragglers: the window is short by
design — punctuality is a feature.

**After** — the session auto-closes at `endsAt`. Reports show per-student
percentages vs. the threshold. **Export Excel** after each class or weekly:
the `.xlsx` is the permanent archive (data stays in *your* file, independent
of any platform).

## 6. Data management & backup

- **Archive of record**: Excel export per class (roster, every session,
  flags, overrides, percentages). Keep copies in Drive/institute storage.
- **Database backup** (Turso free tier): `turso db shell <db> .dump` or the
  repo's `scripts/sync-turso.mjs` for a local snapshot. Monthly is
  plenty for pilot scale.
- **Footprint**: each check-in row is a few hundred bytes; a 60-student
  class × 30 sessions ≈ tens of KB. Turso's free tier is effectively
  unlimited for years of pilot use.
- **Deletion policy**: closing a class removes it from active views; keep
  the Excel as the long-term record.

## 7. Recovery & support (who fixes what)

| Problem | Fix | Who |
|---|---|---|
| Student forgot password | Roster → key icon (Reset password) → student signs in with phone + NEW password; device re-binds | Their teacher |
| Student lost / changed phone | Same button — device binding clears too | Their teacher |
| Teacher forgot password | `bun scripts/admin-reset-password.ts <phone>` (owner, has Turso creds) | Pilot owner |
| "Network hiccup" messages | The retry layer already re-sent the query 4×; if it still shows, Turso blipped — retry the action; check status.turso.tech | Pilot owner |
| Wrong GPS / basement classroom | Teacher override on the flagged record; or start the session with GPS off | Their teacher |
| Suspected proxy attempt | Live view flags (device change, outside range, bad code) — evidence is in the Excel archive | Their teacher |

## 8. Roadmap

- **Phase 1 — Pilot (now)**: single deployment, one institute, free tiers.
  Success = a real teacher runs it daily for 2–4 weeks and keeps the Excel
  archive.
- **Phase 2 — Hardening**: OTP phone verification at signup, SMS absence
  alerts to guardians, timetable auto-sessions, per-institute settings.
- **Phase 3 — Scale**: multi-institute admin panel, server-verified WebAuthn
  (enrolled credentials), usage-based Pro pricing (bKash/Nagad), Redis-backed
  rate limits, Turso replica in the institute's region.
