// Netlify Blobs → JSON dump (mövcud hesabları öz serverinə köçürmək üçün).
// İşlətmə:  netlify env varları ilə →  node server/migrate-from-netlify.mjs > dump.json
import { getStore } from '@netlify/blobs';

const out = {};
for (const name of ['users', 'rooms', 'social']) {
  const store = getStore({ name, consistency: 'strong' });
  const { blobs } = await store.list();
  out[name] = {};
  for (const b of blobs) {
    const v = await store.get(b.key).catch(() => null);
    if (v != null) out[name][b.key] = v;
  }
  console.error(`${name}: ${Object.keys(out[name]).length} açar`);
}
process.stdout.write(JSON.stringify(out));
