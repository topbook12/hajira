import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

const queries = [
  'Qwickly attendance Canvas LMS features',
  'free attendance app for teachers freemium limit students',
  'Bangladesh university minimum attendance 60 percent exam eligibility',
  'ClassTrack bunk calculator student app',
  'school attendance SMS parents Bangladesh app',
];

const zai = await ZAI.create();
const out = {};

for (const q of queries) {
  try {
    const res = await zai.functions.invoke('web_search', { query: q, num: 6 });
    out[q] = (res || []).map(r => ({ name: r.name, url: r.url, snippet: r.snippet, host: r.host_name }));
    console.log(`\n=== ${q} ===`);
    for (const r of out[q]) console.log(`- [${r.host}] ${r.name}\n  ${r.snippet?.slice(0, 200)}`);
  } catch (e) {
    console.error(`FAIL: ${q}`);
    out[q] = { error: String(e.message).slice(0, 200) };
  }
}

fs.writeFileSync('/home/z/my-project/research/results3.json', JSON.stringify(out, null, 2));
console.log('\nDONE');
