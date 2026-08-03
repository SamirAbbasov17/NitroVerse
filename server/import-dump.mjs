// JSON dump → SQLite (öz serverində bir dəfə işlədilir).
// İşlətmə:  DB_FILE=/var/lib/karbon/karbon.db node server/import-dump.mjs dump.json
import { readFileSync } from 'node:fs';
import { openDb, makeGetStore } from './kv.mjs';

const file = process.argv[2];
if (!file) { console.error('İstifadə: node server/import-dump.mjs dump.json'); process.exit(1); }
const data = JSON.parse(readFileSync(file, 'utf8'));
const db = openDb(process.env.DB_FILE || './data/karbon.db');
const getStore = makeGetStore(db);
let total = 0;
for (const [name, entries] of Object.entries(data)) {
  const store = getStore(name);
  for (const [k, v] of Object.entries(entries)) {
    await store.set(k, v);
    total++;
  }
  console.log(`${name}: ${Object.keys(entries).length} açar`);
}
console.log(`Cəmi ${total} yazı köçürüldü.`);
