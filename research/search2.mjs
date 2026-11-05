import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

const queries = [
  'dynamic QR code attendance system cheating prevention screenshot',
  'proxy attendance problem university students solution',
  'CourseKey attendance GPS validated QR pricing schools',
  'AccuClass attendance app features pricing',
  'SEAtS software pricing per student university',
  '75 percent attendance rule university Bangladesh UGC',
  'attendance app students privacy GPS tracking complaints',
  'student attendance system problems offline internet classroom',
  'app to mark attendance Bengali Bangladesh class',
  'university ERP attendance module Bangladesh',
];

const zai = await ZAI.create();
const out = {};

for (const q of queries) {
  try {
    const res = await zai.functions.invoke('web_search', { query: q, num: 8 });
    out[q] = (res || []).map(r => ({ name: r.name, url: r.url, snippet: r.snippet, host: r.host_name, date: r.date }));
    console.log(`\n=== ${q} ===`);
    for (const r of out[q]) console.log(`- [${r.host}] ${r.name}\n  ${r.snippet?.slice(0, 200)}\n  ${r.url}`);
  } catch (e) {
    console.error(`FAIL: ${q} -> ${String(e.message).slice(0, 150)}`);
    out[q] = { error: String(e.message).slice(0, 300) };
  }
}

fs.writeFileSync('/home/z/my-project/research/results2.json', JSON.stringify(out, null, 2));
console.log('\nDONE. Saved to research/results2.json');
