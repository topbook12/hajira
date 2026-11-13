/*
 * Hajira AUTO PRESENCE E2E audit — passive attendance mode
 *   Teacher opts in ("Auto attendance" toggle) -> session starts, no code at all
 *   Student A (in fence, app open on Home)  -> counted PRESENT with NO tap (beacon)
 *   Student B (14 km away, mobile)          -> FLAGGED outside range (beacon, no tap)
 *   Student C (joined, never beacons)       -> ABSENT automatically at close
 *   Teacher roster/summary + Excel reflect AUTO method and the A/F/A outcome
 */
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const BASE = 'http://localhost:3000'
const OUT = '/home/z/my-project/research'
const CLASSROOM = { latitude: 23.7307, longitude: 90.3923, accuracy: 12 }
const FAR_AWAY = { latitude: 23.86, longitude: 90.3923, accuracy: 12 }

const rnd = () => String(Math.floor(100000 + Math.random() * 900000))
const newPhone = () => '01799' + rnd()
const stamp = Date.now().toString().slice(-5)
const TEACHER = { name: `Auto Audit Teacher ${stamp}`, phone: newPhone(), password: 'audit-pass-1' }
const STU_IN = { name: `Auto Stu In ${stamp}`, phone: newPhone(), password: 'audit-pass-2' }
const STU_FAR = { name: `Auto Stu Far ${stamp}`, phone: newPhone(), password: 'audit-pass-3' }
const STU_GHOST = { name: `Auto Stu Ghost ${stamp}`, phone: newPhone(), password: 'audit-pass-4' }
const CLASS_NAME = `Audit AUTO CSE 501 (${stamp})`

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const jsErrors = []
async function newPage(ctx, label) {
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    const hide = () =>
      document.querySelectorAll('nextjs-portal').forEach((el) => {
        el.style.setProperty('display', 'none', 'important')
      })
    try {
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
  // hydration settle — on a cold dev server the first paint precedes React;
  // clicking before handlers attach would native-submit and reload the page
  await page.waitForTimeout(1500)
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
  await page.locator('[role="dialog"]').getByRole('button', { name: 'Join class' }).click()
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
    /* ---------- teacher: opt-in auto mode ---------- */
    const ctxT = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      geolocation: CLASSROOM,
      permissions: ['geolocation'],
    })
    const t = await newPage(ctxT, 'teacher')
    await signup(t, { role: 'TEACHER', ...TEACHER })
    await t.getByRole('button', { name: 'New class' }).waitFor({ timeout: 30000 })
    await t.getByRole('button', { name: 'New class' }).click()
    await t.fill('#new-class-name', CLASS_NAME)
    await t.locator('[role="dialog"]').getByRole('button', { name: 'Create', exact: true }).click()
    await t.locator('.card-3d').filter({ hasText: CLASS_NAME }).waitFor({ timeout: 15000 })
    await t.locator('.card-3d').filter({ hasText: CLASS_NAME }).getByRole('button', { name: 'Open class' }).click()
    await t.getByRole('button', { name: 'Start session' }).waitFor({ timeout: 15000 })
    check('A1 teacher ready + class open', true)

    const autoSwitch = t.locator('#auto-switch')
    await autoSwitch.waitFor({ timeout: 10000 })
    await autoSwitch.click()
    const codeSwitch = t.locator('#code-switch')
    check(
      'A2 auto toggle on -> QR/PIN switch disabled & off',
      (await codeSwitch.isDisabled()) && (await codeSwitch.getAttribute('data-state')) === 'unchecked'
    )
    check('A3 auto explainer mentions absent marking', await t.getByText('everyone not counted is marked absent').first().isVisible())

    await t.getByRole('button', { name: 'Start session' }).click()
    await waitText(t, 'Auto attendance — counted by location', 25000)
    check('A4 session live — banner announces auto attendance', true)
    check('A5 live card says "Auto attendance running"', await t.getByText('Auto attendance running').first().isVisible())
    check('A6 no PIN on screen', (await t.locator('[aria-label="PIN code"]').count()) === 0)

    const headerText = await t.locator('section[aria-label="Live attendance session"]').innerText()
    const classCode = headerText.match(/Code:\s*([A-Z0-9]{6})/)?.[1] ?? ''
    check('A7 class code extracted', !!classCode, classCode)

    /* ---------- student A: inside fence, ZERO taps ---------- */
    const ctxA = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      geolocation: CLASSROOM,
      permissions: ['geolocation'],
    })
    const a = await newPage(ctxA, 'stu-in')
    await signup(a, { role: 'STUDENT', ...STU_IN })
    await waitText(a, 'Live sessions', 20000)
    await joinClass(a, classCode, CLASS_NAME)
    await goTab(a, 'Home')

    const autoCard = a.getByText('Finding you — attendance counting automatically', { exact: false }).first()
    await autoCard.waitFor({ timeout: 20000 })
    check('B1 auto card mounts and starts beaconing with no tap', true)
    // the manual scan/one-tap button must NOT be the primary action anymore
    check(
      'B2 no "Check in — scan QR"/"one tap" primary button on auto card',
      (await a.getByRole('button', { name: 'Check in — scan QR' }).count()) === 0
    )

    await waitText(a, 'Counted automatically — you are in range', 30000)
    check('B3 counted PRESENT automatically (no tap ever)', true)

    /* ---------- student B: 14 km away on mobile ---------- */
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
    await joinClass(b, classCode, CLASS_NAME)
    await goTab(b, 'Home')
    await waitText(b, 'You are outside the classroom range', 30000)
    check('C1 far student beaconed and told they are outside', true)

    /* ---------- student C: joins, never beacons (stays off Home) ---------- */
    const ctxC = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      geolocation: CLASSROOM,
      permissions: ['geolocation'],
    })
    const c = await newPage(ctxC, 'stu-ghost')
    await signup(c, { role: 'STUDENT', ...STU_GHOST })
    await waitText(c, 'Live sessions', 20000)
    await joinClass(c, classCode, CLASS_NAME)
    check('D1 ghost student joined but never opens Home (no beacon)', true)
    await c.waitForTimeout(4000) // give A/B beacons a beat; C stays silent

    /* ---------- teacher roster + end-of-window sweep ---------- */
    await t.locator('li').filter({ hasText: STU_IN.name }).first().waitFor({ timeout: 20000 })
    const rowA = await t.locator('li').filter({ hasText: STU_IN.name }).first().innerText()
    check(
      'E1 roster: in-range student Present with Auto method',
      rowA.includes('Present') && rowA.includes('Auto'),
      ''
    )
    await t.locator('li').filter({ hasText: STU_FAR.name }).first().waitFor({ timeout: 20000 })
    const rowB = await t.locator('li').filter({ hasText: STU_FAR.name }).first().innerText()
    check('E2 roster: far student Flagged (outside range)', rowB.includes('Flagged'))

    await t.getByRole('button', { name: 'End session' }).click()
    await waitText(t, 'students present', 15000)
    check('E3 session ended — summary shown', true)

    // ABSENT sweep: ghost student gets an explicit Absent row
    await t.locator('li').filter({ hasText: STU_GHOST.name }).first().waitFor({ timeout: 20000 })
    const rowC = await t.locator('li').filter({ hasText: STU_GHOST.name }).first().innerText()
    check('E4 sweep: never-seen student marked Absent automatically', rowC.includes('Absent'))

    const statsTxt = await t.locator('section[aria-label="Live attendance session"]').innerText()
    check('E5 stats show 1/3 present (only in-range student)', statsTxt.includes('1/3'))

    /* ---------- student A: ended session leaves the home feed ---------- */
    await goTab(a, 'Home')
    await waitText(a, 'No active session right now', 20000)
    check('F1 ended session cleared from student home feed', true)

    /* ---------- Excel: AUTO method + auto column ---------- */
    await t.getByRole('button', { name: 'Back', exact: true }).first().click()
    if (!(await t.getByRole('button', { name: 'New class' }).isVisible().catch(() => false))) {
      await t.getByRole('button', { name: 'Back', exact: true }).first().click()
    }
    await t.getByRole('button', { name: 'New class' }).waitFor({ timeout: 15000 })
    const [download] = await Promise.all([
      t.waitForEvent('download', { timeout: 25000 }),
      t.locator('.card-3d').filter({ hasText: CLASS_NAME }).locator('button[title="Download present sheet (Excel)"]').click(),
    ])
    const fp = path.join(OUT, 'audit-auto-export.xlsx')
    await download.saveAs(fp)
    check('G1 Excel downloaded', fs.existsSync(fp) && fs.statSync(fp).size > 1000, `${fs.statSync(fp).size} bytes`)
    const tmp = path.join(OUT, 'audit-auto-xlsx-tmp')
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
      'G2 Excel has AUTO method rows + Auto attendance column + class',
      allXml.includes(CLASS_NAME) && allXml.includes('AUTO') && allXml.includes('Auto attendance')
    )
    fs.rmSync(tmp, { recursive: true, force: true })

    /* ---------- console/page errors ---------- */
    const pageErrors = jsErrors.filter((e) => e.includes('pageerror'))
    // a beacon racing the teacher's End session gets the honest 410 back —
    // the browser logs ANY non-2xx as console noise; it is the designed
    // terminal signal, not an app bug (client shows "window ended" state)
    const consoleErrors = jsErrors.filter(
      (e) => e.includes('console') && !/410 \(Gone\)/i.test(e)
    )
    check('H1 zero uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
    check('H2 zero console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

    await t.screenshot({ path: path.join(OUT, 'audit-auto-final-teacher.png') })
    await a.screenshot({ path: path.join(OUT, 'audit-auto-final-student.png') })
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
