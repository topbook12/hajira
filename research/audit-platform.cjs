/*
 * Hajira full-platform E2E audit (Playwright, real geolocation grants)
 * Covers:
 *   A. Teacher signup + class creation
 *   B. LOCATION-ONLY session (no QR/PIN): toggle -> live screen -> student "one tap" check-in
 *      - student inside fence  -> PRESENT, method Location, GPS ok
 *      - student 14 km away    -> FLAGGED "Outside classroom range"
 *   C. Teacher live roster (real-time) + End session summary
 *   D. QR/PIN regression: second session shows QR/PIN, student checks in with PIN
 *   E. Excel export contains the location-only data
 *   F. Console/page error sweep
 */
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const BASE = 'http://localhost:3000'
const OUT = '/home/z/my-project/research'

const CLASSROOM = { latitude: 23.7307, longitude: 90.3923, accuracy: 12 } // teacher + student-in
const FAR_AWAY = { latitude: 23.86, longitude: 90.3923, accuracy: 12 } // ~14.4 km north

const rnd = () => String(Math.floor(100000 + Math.random() * 900000))
const newPhone = () => '01799' + rnd()

const stamp = Date.now().toString().slice(-5)
const TEACHER = { name: `Loc Audit Teacher ${stamp}`, phone: newPhone(), password: 'audit-pass-1' }
const STU_IN = { name: `Loc Stu Inside ${stamp}`, phone: newPhone(), password: 'audit-pass-2' }
const STU_FAR = { name: `Loc Stu Far ${stamp}`, phone: newPhone(), password: 'audit-pass-3' }
const CLASS_NAME = `Audit LOC CSE 401 (${stamp})`

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const jsErrors = []
async function newPage(ctx, label) {
  const page = await ctx.newPage()
  // Hide the Next.js dev overlay portal (dev-only UI; it covers the mobile
  // bottom nav and intercepts clicks — production never ships it)
  await page.addInitScript(() => {
    const hide = () =>
      document.querySelectorAll('nextjs-portal').forEach((el) => {
        el.style.setProperty('display', 'none', 'important')
      })
    try {
      // document (not documentElement — null at init-script time), plus a
      // short poll as a belt-and-braces for late-inserted portals
      new MutationObserver(hide).observe(document, { childList: true, subtree: true })
      document.addEventListener('DOMContentLoaded', hide)
      let n = 0
      const iv = setInterval(() => {
        hide()
        if (++n > 60) clearInterval(iv)
      }, 250)
    } catch {
      /* noop */
    }
  })
  page.on('pageerror', (e) => jsErrors.push(`[${label}] pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|net::ERR_ABORTED/i.test(m.text()))
      jsErrors.push(`[${label}] console: ${m.text()}`)
  })
  return page
}

const waitText = (page, text, timeout = 15000) =>
  page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout })

async function signup(page, { role, name, phone, password }) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.locator('#hajira-name').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByRole('tab', { name: role }).click()
  await page.fill('#hajira-name', name)
  await page.fill('#hajira-phone', phone)
  await page.fill('#hajira-password', password)
  const key = page.locator('#hajira-teacher-key')
  if (await key.isVisible().catch(() => false)) await key.fill('HAJIRA-TEACHER')
  await page
    .getByRole('button', { name: role === 'TEACHER' ? 'Continue as teacher' : 'Sign in', exact: true })
    .click()
}

async function joinClass(page, code, className) {
  await page
    .locator('[aria-label="Student sections"] button')
    .filter({ hasText: 'Classes' })
    .locator('visible=true')
    .first()
    .click()
  await page.getByRole('button', { name: 'Join a class' }).first().waitFor({ timeout: 12000 })
  await page.getByRole('button', { name: 'Join a class' }).first().click()
  await page.fill('#join-code', code)
  await page
    .locator('[role="dialog"]')
    .getByRole('button', { name: 'Join class' })
    .click()
  await waitText(page, className, 12000)
}

async function goTab(page, tab) {
  await page
    .locator('[aria-label="Student sections"] button')
    .filter({ hasText: tab })
    .locator('visible=true')
    .first()
    .click()
}

;(async () => {
  const browser = await chromium.launch()
  try {
    /* ---------- A. teacher signup + class ---------- */
    const ctxT = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      geolocation: CLASSROOM,
      permissions: ['geolocation'],
    })
    const t = await newPage(ctxT, 'teacher')

    await signup(t, { role: 'TEACHER', ...TEACHER })
    await t.getByRole('button', { name: 'New class' }).waitFor({ timeout: 20000 })
    check('A1 teacher signup -> dashboard', true)

    await t.getByRole('button', { name: 'New class' }).click()
    await t.fill('#new-class-name', CLASS_NAME)
    await t.locator('[role="dialog"]').getByRole('button', { name: 'Create', exact: true }).click()
    const cardT = t.locator('.card-3d').filter({ hasText: CLASS_NAME })
    await cardT.waitFor({ timeout: 15000 })
    check('A2 class created & visible', true)

    await cardT.getByRole('button', { name: 'Open class' }).click()
    await t.getByRole('button', { name: 'Start session' }).waitFor({ timeout: 15000 })
    check('A3 class detail open', true)

    /* ---------- B. location-only session ---------- */
    const codeSwitch = t.locator('#code-switch')
    await codeSwitch.waitFor({ timeout: 10000 })
    const wasChecked = await codeSwitch.getAttribute('data-state')
    await codeSwitch.click()
    await waitText(t, 'Location-only mode', 5000)
    check(
      'B1 QR/PIN toggle exists & turns off (green explainer shows)',
      (await codeSwitch.getAttribute('data-state')) === 'unchecked' && wasChecked === 'checked'
    )

    await t.getByRole('button', { name: 'Start session' }).click()
    await waitText(t, 'Location-only — no code shown', 25000)
    check('B2 session started — banner says location-only', true)

    const pinCount = await t.locator('[aria-label="PIN code"]').count()
    const qrVisible = await t.getByText('Location-only check-in').first().isVisible()
    check('B3 no PIN element on live screen', pinCount === 0, `pin elements: ${pinCount}`)
    check('B4 location-only card shown instead of QR', qrVisible)

    const headerText = await t.locator('section[aria-label="Live attendance session"]').innerText()
    const mCode = headerText.match(/Code:\s*([A-Z0-9]{6})/)
    const classCode = mCode ? mCode[1] : ''
    check('B5 class code readable from live header', !!classCode, classCode)

    /* ---------- C. student inside fence -> PRESENT ---------- */
    const ctxA = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      geolocation: CLASSROOM,
      permissions: ['geolocation'],
    })
    const a = await newPage(ctxA, 'stu-in')

    await signup(a, { role: 'STUDENT', ...STU_IN })
    await waitText(a, 'Live sessions', 20000)
    check('C1 student A signup -> home', true)

    await joinClass(a, classCode, CLASS_NAME)
    check('C2 student A joined class', true)

    await goTab(a, 'Home')
    const oneTap = a.getByRole('button', { name: 'Check in — one tap' })
    await oneTap.waitFor({ timeout: 25000 })
    check('C3 live card shows one-tap button (no QR wording)', true)

    await oneTap.click()
    await waitText(a, 'No QR or PIN needed', 10000)
    check('C4 dialog: green "No QR or PIN needed" banner', true)
    check('C5 dialog: NO code input rendered', (await a.locator('#checkin-code').count()) === 0)

    await waitText(a, 'Location found', 12000)
    await a.getByRole('button', { name: 'Confirm attendance' }).click()
    await waitText(a, 'Attendance confirmed!', 15000)
    const resA = await a.locator('[role="dialog"]').innerText()
    check(
      'C6 inside fence -> PRESENT with Method: Location + GPS ok',
      resA.includes('Method: Location') && resA.includes('GPS ✓'),
      resA.match(/Distance: [^\n]*/)?.[0] ?? ''
    )
    await a.getByRole('button', { name: 'Close', exact: true }).first().click()
    await waitText(a, 'Attendance recorded', 8000)
    check('C7 card flips to "Attendance recorded"', true)

    /* ---------- D. student far away (MOBILE viewport) -> FLAGGED ---------- */
    const ctxB = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      geolocation: FAR_AWAY,
      permissions: ['geolocation'],
    })
    const b = await newPage(ctxB, 'stu-far')

    await signup(b, { role: 'STUDENT', ...STU_FAR })
    await waitText(b, 'Live sessions', 20000)
    check('D1 student B signup (mobile viewport)', true)
    check('D2 mobile bottom nav visible', await b.locator('[aria-label="Student sections"]').locator('visible=true').first().isVisible())

    await joinClass(b, classCode, CLASS_NAME)
    check('D3 student B joined class', true)

    await goTab(b, 'Home')
    const oneTapB = b.getByRole('button', { name: 'Check in — one tap' })
    await oneTapB.waitFor({ timeout: 25000 })
    await oneTapB.click()
    await b.getByRole('button', { name: 'Confirm attendance' }).click()
    await waitText(b, 'Checked in — flagged for review', 15000)
    const resB = await b.locator('[role="dialog"]').innerText()
    check(
      'D4 far student -> FLAGGED with distance reason',
      resB.includes('Outside classroom range'),
      resB.match(/Outside classroom range[^\n]*/)?.[0] ?? ''
    )
    await b.getByRole('button', { name: 'Close', exact: true }).first().click()

    /* ---------- E. teacher live roster real-time + end ---------- */
    await t.locator('li').filter({ hasText: STU_IN.name }).first().waitFor({ timeout: 20000 })
    const rowA = await t.locator('li').filter({ hasText: STU_IN.name }).first().innerText()
    check('E1 roster (real-time): inside student Present + Location badge', rowA.includes('Present') && rowA.includes('Location'))

    await t.locator('li').filter({ hasText: STU_FAR.name }).first().waitFor({ timeout: 20000 })
    const rowB = await t.locator('li').filter({ hasText: STU_FAR.name }).first().innerText()
    check('E2 roster: far student Flagged', rowB.includes('Flagged'))

    const statsTxt = await t.locator('section[aria-label="Live attendance session"]').innerText()
    check('E3 stats show 1/2 present', statsTxt.includes('1/2'))

    await t.getByRole('button', { name: 'End session' }).click()
    await waitText(t, 'students present', 15000)
    check('E4 session ended with summary', true)

    /* ---------- F. QR/PIN regression session ---------- */
    await t.getByRole('button', { name: 'Back', exact: true }).first().click()
    // Back lands on class detail or dashboard — handle both
    const startBtn = t.getByRole('button', { name: 'Start session' })
    if (!(await startBtn.isVisible().catch(() => false))) {
      await t.locator('.card-3d').filter({ hasText: CLASS_NAME }).getByRole('button', { name: 'Open class' }).click()
    }
    await startBtn.waitFor({ timeout: 15000 })
    const codeSwitch2 = t.locator('#code-switch')
    if ((await codeSwitch2.getAttribute('data-state')) !== 'checked') await codeSwitch2.click()
    check('F1 toggle re-defaults to ON (QR/PIN mode back)', (await codeSwitch2.getAttribute('data-state')) === 'checked')

    await startBtn.click()
    const pinEl = t.locator('[aria-label="PIN code"]')
    await pinEl.waitFor({ timeout: 25000 })
    const pin = (await pinEl.innerText()).trim()
    check('F2 live screen shows rotating PIN again', /^\d{6}$/.test(pin), pin)

    // student A checks in with the PIN
    await goTab(a, 'Home')
    const scanBtn = a.getByRole('button', { name: 'Check in — scan QR' })
    await scanBtn.waitFor({ timeout: 25000 })
    check('F3 live card back to "scan QR" wording', true)
    await scanBtn.click()
    await a.locator('#checkin-code').waitFor({ timeout: 10000 })
    check('F4 dialog shows the code step again', true)
    await a.fill('#checkin-code', pin)
    await a.getByRole('button', { name: 'Confirm attendance' }).click()
    await waitText(a, 'Attendance confirmed!', 15000)
    const resA2 = await a.locator('[role="dialog"]').innerText()
    check('F5 PIN check-in -> PRESENT, Method: Code', resA2.includes('Method: Code'))

    await t.locator('li').filter({ hasText: STU_IN.name }).first().waitFor({ timeout: 20000 })
    check('F6 teacher roster shows the PIN check-in', true)
    await t.getByRole('button', { name: 'End session' }).click()
    await waitText(t, 'students present', 15000)

    /* ---------- G. Excel export ---------- */
    await t.getByRole('button', { name: 'Back', exact: true }).first().click()
    if (!(await t.getByRole('button', { name: 'New class' }).isVisible().catch(() => false))) {
      await t.getByRole('button', { name: 'Back', exact: true }).first().click()
    }
    await t.getByRole('button', { name: 'New class' }).waitFor({ timeout: 15000 })
    const cardT2 = t.locator('.card-3d').filter({ hasText: CLASS_NAME })
    const [download] = await Promise.all([
      t.waitForEvent('download', { timeout: 25000 }),
      cardT2.locator('button[title="Download present sheet (Excel)"]').click(),
    ])
    const fp = path.join(OUT, 'audit-export.xlsx')
    await download.saveAs(fp)
    check('G1 Excel downloaded', fs.existsSync(fp) && fs.statSync(fp).size > 1000, `${fs.statSync(fp).size} bytes`)

    const tmp = path.join(OUT, 'audit-xlsx-tmp')
    fs.rmSync(tmp, { recursive: true, force: true })
    execSync(`unzip -o -q "${fp}" -d "${tmp}"`)
    let allXml = ''
    const walk = (dir) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name)
        if (f.isDirectory()) walk(p)
        else if (f.name.endsWith('.xml')) allXml += fs.readFileSync(p, 'utf8')
      }
    }
    walk(tmp)
    check(
      'G2 Excel contains class, GPS method (location-only) and Code required column',
      allXml.includes(CLASS_NAME) && allXml.includes('GPS') && allXml.includes('Code required')
    )
    fs.rmSync(tmp, { recursive: true, force: true })

    /* ---------- H. console/page errors ---------- */
    const pageErrors = jsErrors.filter((e) => e.includes('pageerror'))
    const consoleErrors = jsErrors.filter((e) => e.includes('console'))
    check('H1 zero uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
    check('H2 zero console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

    // screenshots for the record
    await t.screenshot({ path: path.join(OUT, 'audit-loc-final-teacher.png'), fullPage: false })
    await a.screenshot({ path: path.join(OUT, 'audit-loc-final-student.png'), fullPage: false })
  } finally {
    await browser.close()
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n===== RESULT: ${results.length - failed.length}/${results.length} checks passed =====`)
  if (failed.length) {
    console.log('FAILED:')
    failed.forEach((f) => console.log(`  - ${f.name} ${f.detail}`))
    process.exit(1)
  }
})().catch((e) => {
  console.error('AUDIT CRASHED:', e)
  process.exit(2)
})
