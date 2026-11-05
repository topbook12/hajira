# Hajira — Smart Attendance Platform

Attendance in 60 seconds — proxy-proof, effortless. Built for universities, colleges and schools where proxy attendance is the norm and roll-call wastes class time.

## How it works

1. **Teacher starts a session** — picks a time window (60–180s), GPS radius (30–300m) and whether the rotating code is required.
2. **A projector-size QR + 6-digit PIN appears** — both refresh every **30 seconds** with a server-signed HMAC. Screenshots forwarded to absent friends stop working within half a minute.
3. **Students check in from their own phones** — no app install needed:
   - **WHO** → password account + one-device-per-student binding (+ optional device fingerprint via WebAuthn)
   - **WHERE** → GPS geofence around the classroom (location is read only during the session, and only the rounded distance in metres is stored — never raw coordinates)
   - **WHEN** → the 1–3 minute window + the rotating code
4. **Anything suspicious is flagged, not silently dropped** — teacher reviews and overrides with one tap.
5. **One-tap Excel archive** — 4 sheets (Class Info, Summary with exam eligibility, Sessions, full Check-in Log).

## Cost-effective by design

- **Turso cloud libSQL (free tier)** holds only what's needed: 5 small tables, no images, no raw GPS history. A whole university-year of check-ins is a few MB.
- **Excel is the long-term archive** — teachers own their data offline; the cloud DB stays lean forever.
- **Students bring their own devices** — zero hardware, zero install, works in any browser.
- Polling with tiny JSON payloads + an optional socket relay — cheap enough for the smallest server.

## Tech stack

Next.js 16 (App Router) · TypeScript · Prisma + Turso libSQL · Tailwind CSS 4 + shadcn/ui · node:crypto (scrypt passwords, HMAC sessions, signed rotating codes) · SheetJS export · socket.io live relay (optional)

## Run locally

```bash
bun install
cp .env.example .env   # or create .env with the vars below
bun run db:push        # create tables in the local SQLite file
bun run dev
```

### Environment variables

```env
# Turso (free at turso.tech) — omit both to fall back to local SQLite
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
APP_SECRET=<random 32-byte hex — signs sessions and QR codes>
TEACHER_SIGNUP_KEY=<share with faculty only — gates teacher account creation>
DATABASE_URL=file:./db/custom.db   # used by the Prisma CLI for local push
```

### Sync schema to Turso

```bash
bun run db:sync-turso   # idempotent CREATE IF NOT EXISTS against your Turso DB
```

## Deploy free

Push to GitHub → import in Vercel → add the env vars above → `bun run db:sync-turso` once. Total cost: **$0** for a department-sized deployment.

## Security notes (MVP scope)

- Phone numbers are not OTP-verified yet (SMS costs money); accounts are protected by password + teacher key. OTP is the top Phase-2 item.
- Device binding rejects/flags second devices; teachers can reset a student's device from the roster.
- The rotating code proves presence in the room, not which finger pressed the sensor — device biometrics (WebAuthn) add a same-device unlock signal and are recorded per check-in.
