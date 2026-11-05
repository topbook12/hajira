import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

const pages = [
  'https://attendanceradar.com/proxy-attendance-in-universities-what-it-is-and-how-to-stop-it',
  'https://qrcodepulse.com/qr-code-for-attendance',
  'https://mahroos.app/automated-attendance-tracking',
  'https://www.thesai.org/Publications/ViewPaper?Volume=14&Issue=4&Code=IJACSA&SerialNo=104',
];

const zai = await ZAI.create();
const out = {};

for (const url of pages) {
  try {
    const res = await zai.functions.invoke('page_reader', { url });
    const content = typeof res?.content === 'string' ? res.content : JSON.stringify(res).slice(0, 4000);
    out[url] = content?.slice(0, 9000);
    console.log(`\n===== ${url} =====\n${out[url]?.slice(0, 3500)}\n...[truncated]`);
  } catch (e) {
    console.error(`FAIL: ${url} -> ${String(e.message).slice(0, 120)}`);
    out[url] = { error: String(e.message).slice(0, 300) };
  }
}

fs.writeFileSync('/home/z/my-project/research/pages.json', JSON.stringify(out, null, 2));
console.log('\nDONE');
