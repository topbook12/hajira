import { chromium } from '/home/z/.npm-global/lib/node_modules/playwright/index.mjs';
const BASE = 'http://localhost:81'; // through Caddy gateway, like the real preview

// ===== TEACHER =====
const tctx = await chromium.launchPersistentContext('/tmp/hajira-rt-teacher', {
  headless: true, viewport: { width: 1280, height: 800 }, permissions: ['geolocation'],
  geolocation: { latitude: 23.8103, longitude: 90.4125, accuracy: 15 }, locale: 'bn-BD',
});
const tp = tctx.pages()[0] || await tctx.newPage();
await tp.goto(BASE, { waitUntil: 'networkidle' });
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

// ===== STUDENT (inside range, with PIN) =====
const sctx = await chromium.launchPersistentContext('/tmp/hajira-rt-student', {
  headless: true, viewport: { width: 420, height: 800 }, permissions: ['geolocation'],
  geolocation: { latitude: 23.81032, longitude: 90.41252, accuracy: 15 }, locale: 'bn-BD',
});
const sp = sctx.pages()[0] || await sctx.newPage();
await sp.goto(BASE, { waitUntil: 'networkidle' });
await sp.evaluate(() => localStorage.clear());
await sp.reload({ waitUntil: 'networkidle' });
await sp.getByRole('tab', { name: 'শিক্ষার্থী' }).click();
await sp.getByLabel('নাম').fill('রাহিম উদ্দিন');
await sp.getByLabel('ফোন নম্বর').fill('01811000002');
await sp.getByRole('button', { name: 'প্রবেশ করুন' }).click();
await sp.waitForTimeout(2500);
await sp.getByRole('button', { name: 'উপস্থিতি দিন' }).click();
await sp.waitForTimeout(3000);
await sp.getByLabel('QR/PIN কোড (ঐচ্ছিক)').fill(pinText);
await sp.getByRole('button', { name: 'উপস্থিতি নিশ্চিত করুন' }).click();
await sp.waitForTimeout(2500);
const result = await sp.locator('[role=dialog]').innerText();
console.log('STUDENT RESULT:', result.includes('উপস্থিত নিশ্চিত') ? 'PRESENT ✅' : result.slice(0,200).replace(/\n/g,' | '));
await sp.screenshot({ path: 'research/student-present.png' });

// ===== TEACHER LIVE (socket update, NO reload) =====
await tp.waitForTimeout(2500);
const live = await tp.locator('body').innerText();
const hasRahim = live.includes('রাহিম');
const count = live.match(/উপস্থিত (\d+)\/(\d+)/);
console.log('REALTIME CHECK → রাহিম in live list:', hasRahim, '| counter:', count?.[0] ?? 'n/a');
await tp.screenshot({ path: 'research/teacher-realtime.png' });
await tctx.close(); await sctx.close();
