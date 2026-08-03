// SQLite üzərində Netlify Blobs-uyğun açar-dəyər anbarı.
// Eyni interfeys → API handler-ləri dəyişmədən həm Netlify-da, həm öz
// serverimizdə işləyir. Xarici asılılıq yoxdur (Node 22+ daxili SQLite).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(file = './data/karbon.db') {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // WAL: paralel oxu/yazı — orta yükdə kilidlənmə olmur
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      store TEXT NOT NULL,
      k     TEXT NOT NULL,
      v     TEXT NOT NULL,
      t     INTEGER NOT NULL,
      PRIMARY KEY (store, k)
    )`);
  db.exec('CREATE INDEX IF NOT EXISTS kv_store_k ON kv(store, k)');
  return db;
}

export function makeGetStore(db) {
  const sel = db.prepare('SELECT v FROM kv WHERE store = ? AND k = ?');
  const ins = db.prepare(
    'INSERT INTO kv(store,k,v,t) VALUES(?,?,?,?) ' +
    'ON CONFLICT(store,k) DO UPDATE SET v = excluded.v, t = excluded.t'
  );
  const del = db.prepare('DELETE FROM kv WHERE store = ? AND k = ?');
  const listAll = db.prepare('SELECT k FROM kv WHERE store = ? ORDER BY k');
  const listPfx = db.prepare("SELECT k FROM kv WHERE store = ? AND k LIKE ? ESCAPE '\\' ORDER BY k");

  // LIKE üçün prefiksi qaçır (%, _ və \ xüsusi simvollardır)
  const esc = (s) => String(s).replace(/[\\%_]/g, (c) => '\\' + c);

  return function getStore(name) {
    return {
      async get(key, opts = {}) {
        const row = sel.get(name, String(key));
        if (!row) return null;
        return opts.type === 'json' ? JSON.parse(row.v) : row.v;
      },
      async set(key, val) {
        ins.run(name, String(key), String(val), Date.now());
      },
      async setJSON(key, obj) {
        ins.run(name, String(key), JSON.stringify(obj), Date.now());
      },
      async delete(key) {
        del.run(name, String(key));
      },
      async list(opts = {}) {
        const rows = opts.prefix
          ? listPfx.all(name, esc(opts.prefix) + '%')
          : listAll.all(name);
        return { blobs: rows.map((r) => ({ key: r.k })) };
      },
    };
  };
}
