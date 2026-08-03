// Netlify Blobs → JSON dump (mövcud hesabları öz serverinə köçürmək üçün).
// İşlətmə:  netlify env varları ilə →  node server/migrate-from-netlify.mjs > dump.json
import { getStore } from '@netlify/blobs';

const out = {};
// Netlify mühitindən KƏNARDA işləyəndə sayt id-si və token açıq verilməlidir
const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_AUTH_TOKEN;
for (const name of ['users', 'rooms', 'social', 'reports']) {
  const store = getStore(siteID && token
    ? { name, siteID, token, consistency: 'strong' }
    : { name, consistency: 'strong' });
  const { blobs } = await store.list();
  out[name] = {};
  for (const b of blobs) {
    const v = await store.get(b.key).catch(() => null);
    if (v != null) out[name][b.key] = v;
  }
  console.error(`${name}: ${Object.keys(out[name]).length} açar`);
}
process.stdout.write(JSON.stringify(out));
