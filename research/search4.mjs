import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

const queries = [
  'WebAuthn fingerprint authentication web app browser Android iOS support',
  'WebAuthn platform authenticator attendance check-in web application',
  'progressive web app geolocation attendance check-in browser fingerprint WebAuthn',
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

fs.writeFileSync('/home/z/my-project/research/results4.json', JSON.stringify(out, null, 2));
console.log('\nDONE');
