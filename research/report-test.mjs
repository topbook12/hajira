import { chromium } from '/home/z/.npm-global/lib/node_modules/playwright/index.mjs';
const BASE = 'http://localhost:81';
const tctx = await chromium.launchPersistentContext('/tmp/hajira-rt-teacher', {
  headless: true, viewport: { width: 1280, height: 900 }, locale: 'bn-BD',
});
const tp = tctx.pages()[0] || await tctx.newPage();
await tp.goto(BASE, { waitUntil: 'networkidle' });
await tp.getByRole('button', { name: 'রিপোর্ট' }).first().click();
await tp.waitForTimeout(2500);
const text = await tp.locator('body').innerText();
console.log('REPORT:', text.slice(0, 500).replace(/\n+/g, ' | '));
await tp.screenshot({ path: 'research/report.png', fullPage: true });
await tctx.close();
