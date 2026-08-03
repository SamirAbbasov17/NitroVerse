
// Qlobal presence + çat + sosial (DM / dəvət / dostluq).
// Presence: hər client "p/<bucket>/<cid>" açarına {n:ad, u:user} yazır (bucket = 35s pəncərə).
// İnbox: "i/<ünvan>/<ts13>-<rand>" — ünvan cid və ya u:<username>; oxunanda silinir.
// DM tarixçəsi (yalnız login): "dm/<a>|<b>/<ts13>-<rand>" + indeks "dmi/<user>".
// Dostluq: "fr/<user>" → {f:[...], in:[...], out:[...]}.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

const BUCKET_MS = 35000;
const CHAT_KEEP = 120;   // saxlanan son mesaj sayı
const FEED_MAX = 30;     // bir sorğuda qaytarılan maksimum
const WHO_MAX = 40;      // siyahıda göstərilən maksimum oyunçu
const DM_KEEP = 80;      // söhbət başına saxlanan mesaj
const INBOX_TTL = 180000; // çatdırılmamış bildirişin ömrü

const cleanUser = (v) => String(v || '').toLowerCase().replace(/[^\p{L}0-9_-]/gu, '').slice(0, 16);
const cleanNick = (v) => String(v || '').trim().slice(0, 14);

export function makeSocial(getStore) {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return json({ error: 'method' }, 405);

    let b;
    try { b = await req.json(); } catch { return json({ error: 'bad-json' }, 400); }
    const action = String(b.action || '');
    const now = Date.now();
    const bucket = Math.floor(now / BUCKET_MS);

    try {
      const store = getStore('social');

      const countOnline = async () => {
        const ids = new Set();
        for (const bk of [bucket, bucket - 1]) {
          const { blobs } = await store.list({ prefix: `p/${bk}/` });
          for (const bl of blobs) ids.add(bl.key.split('/')[2]);
        }
        return ids.size;
      };

      // İnboxdan yeni hadisələri oxu (oxunan silinir), köhnələri təmizlə
      const drainInbox = async (addr) => {
        if (!addr) return [];
        const { blobs } = await store.list({ prefix: `i/${addr}/` });
        const evs = [];
        for (const bl of blobs.slice(0, 20)) {
          const ts = parseInt(bl.key.split('/')[2], 10) || 0;
          if (now - ts > INBOX_TTL) { store.delete(bl.key).catch(() => {}); continue; }
          const ev = await store.get(bl.key, { type: 'json' }).catch(() => null);
          store.delete(bl.key).catch(() => {});
          if (ev) evs.push(ev);
        }
        return evs;
      };

      // ————— Presence heartbeat + inbox (birləşik nəbz) —————
      if (action === 'ping' || action === 'pulse') {
        const cid = String(b.cid || '');
        if (!/^[a-z0-9-]{6,24}$/.test(cid)) return json({ error: 'cid' }, 400);
        const user = cleanUser(b.user);
        if (b.presence !== false) {
          await store.setJSON(`p/${bucket}/${cid}`, { n: cleanNick(b.nick) || 'Oyunçu', u: user || null });
          // Seyrək təmizlik: köhnə bucket açarları
          if (Math.random() < 0.06) {
            const { blobs } = await store.list({ prefix: 'p/' });
            for (const bl of blobs) {
              const bk = parseInt(bl.key.split('/')[1], 10);
              if (bucket - bk > 3) store.delete(bl.key).catch(() => {});
            }
          }
        }
        const events = [...await drainInbox(cid), ...(user ? await drainInbox('u:' + user) : [])];
        return json({ ok: 1, events });
      }

      // ————— Onlayn oyunçu siyahısı —————
      if (action === 'who') {
        const seen = new Map();
        for (const bk of [bucket, bucket - 1]) {
          const { blobs } = await store.list({ prefix: `p/${bk}/` });
          for (const bl of blobs) {
            const cid = bl.key.split('/')[2];
            if (seen.has(cid)) continue;
            const v = await store.get(bl.key, { type: 'json' }).catch(() => null);
            seen.set(cid, { cid, n: v?.n || 'Oyunçu', u: v?.u || null });
            if (seen.size >= WHO_MAX) break;
          }
          if (seen.size >= WHO_MAX) break;
        }
        return json({ players: [...seen.values()] });
      }

      // ————— Şəxsi hadisə göndər: DM / dəvət / dostluq —————
      if (action === 'send') {
        const kinds = ['dm', 'inv', 'invacc', 'invroom', 'frq', 'fracc'];
        const kind = String(b.kind || '');
        if (!kinds.includes(kind)) return json({ error: 'kind' }, 400);
        const to = String(b.to || '').slice(0, 26); // cid 24 + 'u:' prefiksli ad
        if (!/^([a-z0-9-]{6,24}|u:[\p{L}0-9_-]{3,16})$/u.test(to)) return json({ error: 'to' }, 400);
        const from = {
          cid: String(b.from?.cid || '').slice(0, 24),
          n: cleanNick(b.from?.n) || 'Oyunçu',
          u: cleanUser(b.from?.u) || null,
        };
        const ev = { kind, from, t: now };
        if (kind === 'dm') {
          ev.text = String(b.text || '').trim().slice(0, 140);
          if (!ev.text) return json({ error: 'empty' }, 400);
        }
        if (kind === 'invroom') ev.code = String(b.code || '').toUpperCase().slice(0, 4);
        const key = `i/${to}/${String(now).padStart(13, '0')}-${Math.random().toString(36).slice(2, 6)}`;
        await store.setJSON(key, ev);

        // DM tarixçəsi — yalnız hər iki tərəf login olubsa
        if (kind === 'dm' && from.u && to.startsWith('u:')) {
          const other = to.slice(2);
          const pair = [from.u, other].sort().join('|');
          await store.setJSON(`dm/${pair}/${String(now).padStart(13, '0')}-${Math.random().toString(36).slice(2, 6)}`,
            { f: from.u, text: ev.text, t: now });
          // Hər iki istifadəçinin söhbət indeksi
          for (const [me, oth] of [[from.u, other], [other, from.u]]) {
            const idx = await store.get(`dmi/${me}`, { type: 'json' }).catch(() => null) || { c: {} };
            idx.c[oth] = { t: now, last: ev.text.slice(0, 40), f: from.u };
            await store.setJSON(`dmi/${me}`, idx);
          }
          // Seyrək təmizlik: söhbətdə son DM_KEEP mesaj
          if (Math.random() < 0.1) {
            const { blobs } = await store.list({ prefix: `dm/${pair}/` });
            const old = blobs.map((x) => x.key).sort().slice(0, -DM_KEEP);
            for (const k of old) store.delete(k).catch(() => {});
          }
        }
        return json({ ok: 1, t: now });
      }

      // ————— Söhbətlərim (Mesajlar bölməsi) —————
      if (action === 'dmlist') {
        const user = cleanUser(b.user);
        if (!user) return json({ error: 'user' }, 400);
        const idx = await store.get(`dmi/${user}`, { type: 'json' }).catch(() => null) || { c: {} };
        const convos = Object.entries(idx.c)
          .map(([w, v]) => ({ with: w, t: v.t, last: v.last, f: v.f }))
          .sort((a, z) => z.t - a.t).slice(0, 30);
        return json({ convos });
      }

      // ————— Bir söhbətin tarixçəsi —————
      if (action === 'dmhist') {
        const user = cleanUser(b.user), other = cleanUser(b.with);
        if (!user || !other) return json({ error: 'user' }, 400);
        const pair = [user, other].sort().join('|');
        const { blobs } = await store.list({ prefix: `dm/${pair}/` });
        const keys = blobs.map((x) => x.key).sort().slice(-50);
        const msgs = [];
        for (const k of keys) {
          const m = await store.get(k, { type: 'json' }).catch(() => null);
          if (m) msgs.push(m);
        }
        return json({ msgs });
      }

      // ————— Dostluq: istək / qəbul / siyahı —————
      if (action === 'frq' || action === 'fracc' || action === 'frlist') {
        const user = cleanUser(b.user);
        if (!user) return json({ error: 'user' }, 400);
        const load = async (u) => await store.get(`fr/${u}`, { type: 'json' }).catch(() => null) || { f: [], in: [], out: [] };
        if (action === 'frlist') return json(await load(user));
        const other = cleanUser(b.with);
        if (!other || other === user) return json({ error: 'with' }, 400);
        const mine = await load(user), theirs = await load(other);
        if (action === 'frq') {
          if (mine.f.includes(other)) return json({ ok: 1, already: 1 });
          if (!mine.out.includes(other)) mine.out.push(other);
          if (!theirs.in.includes(user)) theirs.in.push(user);
        } else { // fracc — qarşı tərəfin istəyini qəbul et
          if (!mine.in.includes(other)) return json({ error: 'no-req' }, 400);
          mine.in = mine.in.filter((x) => x !== other);
          theirs.out = theirs.out.filter((x) => x !== user);
          if (!mine.f.includes(other)) mine.f.push(other);
          if (!theirs.f.includes(user)) theirs.f.push(user);
        }
        await store.setJSON(`fr/${user}`, mine);
        await store.setJSON(`fr/${other}`, theirs);
        return json({ ok: 1 });
      }

      // ————— Say + yeni mesajlar (onlayn səhifənin poll-u) —————
      if (action === 'feed') {
        const since = Number(b.since) || 0;
        const { blobs } = await store.list({ prefix: 'c/' });
        const keys = blobs.map((x) => x.key).sort().slice(-FEED_MAX);
        const msgs = [];
        for (const k of keys) {
          const ts = parseInt(k.slice(2, 15), 10);
          if (!ts || ts <= since) continue;
          const m = await store.get(k, { type: 'json' }).catch(() => null);
          if (m) msgs.push(m);
        }
        return json({ online: await countOnline(), msgs });
      }

      // ————— Mesaj göndər —————
      if (action === 'chat') {
        const nick = cleanNick(b.nick) || 'Oyunçu';
        const text = String(b.text || '').trim().slice(0, 140);
        if (!text) return json({ error: 'empty' }, 400);
        const key = `c/${String(now).padStart(13, '0')}-${Math.random().toString(36).slice(2, 6)}`;
        await store.setJSON(key, { nick, text, t: now });
        // Seyrək təmizlik: yalnız son CHAT_KEEP mesaj qalsın
        if (Math.random() < 0.1) {
          const { blobs } = await store.list({ prefix: 'c/' });
          const old = blobs.map((x) => x.key).sort().slice(0, -CHAT_KEEP);
          for (const k of old) store.delete(k).catch(() => {});
        }
        return json({ ok: 1, t: now });
      }

      return json({ error: 'action' }, 400);
    } catch {
      return json({ error: 'store' }, 500);
    }
  };
}
