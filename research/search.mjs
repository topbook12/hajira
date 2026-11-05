import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

const queries = [
  // Global competitors
  'QR code based student attendance system university app',
  'geofencing GPS student attendance software university SEAtS CourseKey',
  'Top Hat attendance higher education pricing',
  'rotating QR code prevent proxy attendance cheating classroom',
  'student attendance tracking app college India QR code',
  // Bangladesh context
  'university attendance app Bangladesh biometric QR',
  'attendance management system private university Dhaka',
  // Methods & anti-fraud
  'TOTP time-based QR code attendance location spoofing prevention',
  'BLE beacon NFC classroom attendance tracking',
  'one device one student attendance device fingerprint',
];

const zai = await ZAI.create();
const out = {};

for (const q of queries) {
  try {
    const res = await zai.functions.invoke('web_search', { query: q, num: 8 });
    out[q] = (res || []).map(r => ({ name: r.name, url: r.url, snippet: r.snippet, host: r.host_name, date: r.date }));
    console.log(`\n=== ${q} ===`);
    for (const r of out[q]) console.log(`- [${r.host}] ${r.name}\n  ${r.snippet?.slice(0, 220)}\n  ${r.url}`);
  } catch (e) {
    console.error(`FAIL: ${q} -> ${e.message}`);
    out[q] = { error: e.message };
  }
}

fs.writeFileSync('/home/z/my-project/research/results.json', JSON.stringify(out, null, 2));
console.log('\nDONE. Saved to research/results.json');
