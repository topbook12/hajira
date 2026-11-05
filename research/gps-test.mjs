import { chromium } from '/home/z/.npm-global/lib/node_modules/playwright/index.mjs';

const ctx = await chromium.launchPersistentContext('/tmp/hajira-gps-profile', {
  headless: true,
  viewport: { width: 420, height: 800 },
  permissions: ['geolocation'],
  geolocation: { latitude: 23.8103, longitude: 90.4125, accuracy: 15 },
  locale: 'bn-BD',
});
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

// clear any stored user, login as student Karim
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('tab', { name: 'শিক্ষার্থী' }).click();
await page.getByLabel('নাম').fill('করিম হোসেন');
await page.getByLabel('ফোন নম্বর').fill('01811000003');
await page.getByRole('button', { name: 'প্রবেশ করুন' }).click();
await page.waitForTimeout(2500);

// open check-in
await page.getByRole('button', { name: 'উপস্থিতি দিন' }).click();
await page.waitForTimeout(3000);
const locText = await page.locator('[role=dialog]').innerText();
console.log('DIALOG:', locText.slice(0, 200).replace(/\n/g, ' | '));

// wait for GPS to resolve (should be OK now with permission granted)
await page.waitForTimeout(1500);
const hasGpsOk = (await page.locator('[role=dialog]').innerText()).includes('লোকেশন পাওয়া গেছে');
console.log('GPS_OK:', hasGpsOk);

// submit
await page.getByRole('button', { name: 'উপস্থিতি নিশ্চিত করুন' }).click();
await page.waitForTimeout(3000);
const result = await page.locator('[role=dialog]').innerText();
console.log('RESULT:', result.slice(0, 300).replace(/\n/g, ' | '));
await page.screenshot({ path: 'research/student-checkin.png' });
await ctx.close();
