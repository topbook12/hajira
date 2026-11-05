import { chromium } from '/home/z/.npm-global/lib/node_modules/playwright/index.mjs';

// ===== TEACHER: login, start session, capture PIN =====
const tctx = await chromium.launchPersistentContext('/tmp/hajira-teacher-profile', {
  headless: true, viewport: { width: 1280, height: 800 }, permissions: ['geolocation'],
  geolocation: { latitude: 23.8103, longitude: 90.4125, accuracy: 15 }, locale: 'bn-BD',
});
const tp = tctx.pages()[0] || await tctx.newPage();
await tp.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await tp.evaluate(() => localStorage.clear());
await tp.reload({ waitUntil: 'networkidle' });
await tp.getByLabel('নাম').fill('ড. আয়েশা রহমান');
await tp.getByLabel('ফোন নম্বর').fill('01711000001');
await tp.getByRole('button', { name: 'প্রবেশ করুন' }).click();
await tp.waitForTimeout(2500);
await tp.getByRole('button', { name: 'ক্লাস দেখুন' }).first().click();
await tp.waitForTimeout(1500);
await tp.getByRole('button', { name: 'সেশন শুরু' }).click();
await tp.waitForTimeout(2500);
const pinText = await tp.locator('body').innerText().then(t => t.match(/\b\d{6}\b/)?.[0]);
console.log('TEACHER PIN:', pinText);

// ===== STUDENT FAR AWAY (Chittagong ~250km) with PIN =====
const sctx = await chromium.launchPersistentContext('/tmp/hajira-far-profile', {
  headless: true, viewport: { width: 420, height: 800 }, permissions: ['geolocation'],
  geolocation: { latitude: 22.3569, longitude: 91.7832, accuracy: 10 }, locale: 'bn-BD',
});
const sp = sctx.pages()[0] || await sctx.newPage();
await sp.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await sp.evaluate(() => localStorage.clear());
await sp.reload({ waitUntil: 'networkidle' });
await sp.getByRole('tab', { name: 'শিক্ষার্থী' }).click();
await sp.getByLabel('নাম').fill('সালমা খাতুন');
await sp.getByLabel('ফোন নম্বর').fill('01811000004');
await sp.getByRole('button', { name: 'প্রবেশ করুন' }).click();
await sp.waitForTimeout(2500);
await sp.getByRole('button', { name: 'উপস্থিতি দিন' }).click();
await sp.waitForTimeout(3000);
await sp.getByLabel('QR/PIN কোড (ঐচ্ছিক)').fill(pinText);
await sp.getByRole('button', { name: 'উপস্থিতি নিশ্চিত করুন' }).click();
await sp.waitForTimeout(3000);
const result = await sp.locator('[role=dialog]').innerText();
console.log('FAR-STUDENT RESULT:', result.slice(0, 400).replace(/\n/g, ' | '));
await sp.screenshot({ path: 'research/flagged-checkin.png' });

// ===== TEACHER live list =====
await tp.waitForTimeout(1500);
const live = await tp.locator('body').innerText();
console.log('TEACHER LIVE LIST:', live.slice(0, 700).replace(/\n+/g, ' | '));
await tp.screenshot({ path: 'research/teacher-live.png' });
await tctx.close(); await sctx.close();
