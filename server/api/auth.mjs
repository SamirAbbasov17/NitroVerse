// Hesab sistemi: qeydiyyat / giriş / profil / qızıl / maşın alışı.
// Saxlama: Netlify Blobs ('users'), şifrə: scrypt + duz, sessiya: HMAC token.
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

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

// ——— Server tərəfi iqtisadiyyat cədvəlləri (client ilə sinxron saxla!) ———
const STARTER_CARS = ['blaze', 'taxi', 'cruiser', 'ranger', 'venom'];
const CAR_PRICES = {
  titan: 400, cargo: 450, inferno: 550, goldrush: 650, interceptor: 850,
  lagoon: 350, sunburst: 380, flamingo: 420, sequoia: 480,
  crimson: 500, midnight: 600, violetta: 700, frost: 900,
};
// Kosmetika qiymətləri — src/data/cosmetics.js ilə SİNXRON saxla
const COSMETIC_PRICES = {
  p_stock: 0, p_racered: 120, p_midnight: 120, p_mint: 120, p_sand: 120, p_plum: 160,
  p_coral: 160, p_forest: 160, p_ice: 200, p_carbon: 220, p_lime: 240,
  p_magenta: 260, p_gold: 400, p_chrome: 450, p_royal: 500,
  r_stock: 0, r_silver: 90, r_gold: 180, r_red: 140, r_cyan: 160,
  r_lime: 160, r_violet: 200, r_black: 220,
  f_stock: 0, f_ember: 160, f_toxic: 180, f_frost: 180,
  f_magenta: 220, f_gold: 300, f_rainbow: 520,
};
// Finiş animasiyaları
Object.assign(COSMETIC_PRICES, {
  w_none: 0, w_firering: 350, w_goldrain: 450, w_pillar: 550,
  w_starspiral: 700, w_fireworks: 900,
});
// Əfsanəvi effektlər
Object.assign(COSMETIC_PRICES, {
  e_none: 0, e_fire: 900, e_ice: 900, e_volt: 1100,
  e_holo: 1400, e_void: 1600, e_galaxy: 2000,
});

// Maşına xas skinlər — id determinist yaranır (client ilə EYNİ alqoritm)
const SKIN_FX = ['stripes', 'sweep', 'camo', 'checker', 'twotone', 'flames', 'blocks', 'rally'];
const SKIN_PRICES = [420, 620];
function carSkinPrice(id) {
  const m = /^sk_(.+)_([a-z]+)$/.exec(id);
  if (!m) return null;
  const [, carId, fx] = m;
  if (!SKIN_FX.includes(fx)) return null;
  let h = 0;
  for (let i = 0; i < carId.length; i++) h = (h * 31 + carId.charCodeAt(i)) >>> 0;
  // Client ilə EYNİ düzəliş: işarəli sürüşmə mənfi indeks verirdi (bax cosmetics.js)
  const N = SKIN_FX.length;
  const mod = (n, m) => ((n % m) + m) % m;
  const iA = mod(h, N);
  const iB = mod(iA + 1 + mod(h >>> 5, N - 1), N);
  if (fx === SKIN_FX[iA]) return SKIN_PRICES[0];
  if (fx === SKIN_FX[iB]) return SKIN_PRICES[1];
  return null; // bu maşına aid olmayan skin
}

const COSMETIC_GROUP = (id) => {
  if (id.startsWith('sk_')) {
    const m = /^sk_(.+)_[a-z]+$/.exec(id);
    return m ? 'skin_' + m[1] : null;
  }
  return { p: 'paint', r: 'rim', f: 'flame', e: 'effect', w: 'finish' }[id[0]] || null;
};

// Qiymət: sabit cədvəl və ya maşın skini
const priceOf = (id) => (id in COSMETIC_PRICES ? COSMETIC_PRICES[id] : carSkinPrice(id));

const AWARD_MAX = 320;          // bir çağırışda maksimum qızıl
const AWARD_WINDOW_MS = 10 * 60 * 1000;
const AWARD_MAX_IN_WINDOW = 8;  // 10 dəqiqədə maksimum mükafat sayı

const SECRET = process.env.AUTH_SECRET || '';

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expect = createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.nick || !p.exp || Date.now() > p.exp) return null;
    return p;
  } catch {
    return null;
  }
}

function hashPass(pass, saltHex = null) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : randomBytes(16);
  const hash = scryptSync(String(pass), salt, 32);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

const pubProfile = (u) => ({
  nick: u.nick, gold: u.gold, cars: u.cars, created: u.created,
  stats: u.stats || {},
  cosmetics: u.cosmetics || [],
  equip: u.equip || {},
  daily: { last: u.dailyLast || 0, streak: u.dailyStreak || 0 },
});

// UTC gün nömrəsi — günlük mükafatın açarı
const dayNum = (ts) => Math.floor(ts / 86400000);

export function makeAuth(getStore) {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    if (!SECRET) return json({ error: 'server-config' }, 500);

    let b;
    try { b = await req.json(); } catch { return json({ error: 'bad-json' }, 400); }
    const store = getStore('users');
    const action = String(b.action || '');

    // ————— Qeydiyyat —————
    if (action === 'register') {
      const nick = String(b.nick || '').trim();
      const pass = String(b.pass || '');
      if (!/^[a-zA-Z0-9_əƏüÜöÖışİĞğçÇşŞ-]{3,16}$/.test(nick)) {
        return json({ error: 'nick-invalid' }, 400);
      }
      if (pass.length < 4 || pass.length > 64) return json({ error: 'pass-short' }, 400);
      const key = nick.toLowerCase();
      const exists = await store.get(key);
      if (exists) return json({ error: 'nick-taken' }, 409);
      const { salt, hash } = hashPass(pass);
      const user = {
        nick, salt, hash,
        gold: 0, cars: [], created: Date.now(),
        awards: [], stats: {},
      };
      await store.setJSON(key, user);
      const token = sign({ nick: key, exp: Date.now() + 30 * 24 * 3600 * 1000 });
      return json({ token, profile: pubProfile(user) });
    }

    // ————— Giriş —————
    if (action === 'login') {
      const key = String(b.nick || '').trim().toLowerCase();
      // Brute-force qoruması: 15 dəqiqədə 8 uğursuz cəhddən sonra kilid
      const now2 = Date.now();
      const rlKey = `rl/${key}`;
      const rl = (await store.get(rlKey, { type: 'json' }).catch(() => null)) || { n: 0, t: 0 };
      if (now2 - rl.t < 15 * 60000 && rl.n >= 8) {
        return json({ error: 'too-many' }, 429);
      }
      const bump = async () => {
        const fresh = now2 - rl.t > 15 * 60000;
        await store.setJSON(rlKey, { n: fresh ? 1 : rl.n + 1, t: fresh ? now2 : rl.t }).catch(() => {});
      };
      const user = await store.get(key, { type: 'json' });
      if (!user) { await bump(); return json({ error: 'no-user' }, 404); }
      const { hash } = hashPass(String(b.pass || ''), user.salt);
      const a = Buffer.from(hash, 'hex');
      const c = Buffer.from(user.hash, 'hex');
      if (a.length !== c.length || !timingSafeEqual(a, c)) {
        await bump();
        return json({ error: 'wrong-pass' }, 401);
      }
      if (rl.n) store.delete(rlKey).catch(() => {}); // uğurlu giriş → sayğac sıfırlanır
      const token = sign({ nick: key, exp: Date.now() + 30 * 24 * 3600 * 1000 });
      return json({ token, profile: pubProfile(user) });
    }

    // ————— Token tələb edən əməliyyatlar —————
    const session = verify(String(b.token || ''));
    if (!session) return json({ error: 'auth' }, 401);
    const user = await store.get(session.nick, { type: 'json' });
    if (!user) return json({ error: 'no-user' }, 404);

    if (action === 'me') return json({ profile: pubProfile(user) });

    // Qızıl mükafatı — tavan + pəncərə limiti (sadə fırıldaq qoruması)
    if (action === 'award') {
      const amount = Math.floor(Number(b.amount) || 0);
      if (amount <= 0 || amount > AWARD_MAX) return json({ error: 'amount' }, 400);
      const now = Date.now();
      user.awards = (user.awards || []).filter((t) => now - t < AWARD_WINDOW_MS);
      if (user.awards.length >= AWARD_MAX_IN_WINDOW) return json({ error: 'rate' }, 429);
      user.awards.push(now);
      user.gold += amount;
      // Sadə statistika
      user.stats = user.stats || {};
      const reason = String(b.reason || 'misc').slice(0, 24);
      user.stats[reason] = (user.stats[reason] || 0) + 1;
      await store.setJSON(session.nick, user);
      return json({ profile: pubProfile(user) });
    }

    // Maşın alışı — qiymət cədvəli SERVER-dədir
    if (action === 'buy') {
      const id = String(b.id || '');
      // Kosmetika alışı (boya/disk/alov/tüstü/effekt/skin) — qiymət SERVERDƏDİR
      const cpAny = priceOf(id);
      if (cpAny != null) {
        const cp = cpAny;
        if (cp === 0) return json({ error: 'free' }, 400);
        user.cosmetics = user.cosmetics || [];
        if (user.cosmetics.includes(id)) return json({ error: 'owned' }, 409);
        if (user.gold < cp) return json({ error: 'poor', need: cp, have: user.gold }, 402);
        user.gold -= cp;
        user.cosmetics.push(id);
        await store.setJSON(session.nick, user);
        return json({ profile: pubProfile(user) });
      }
      const price = CAR_PRICES[id];
      if (!price) return json({ error: 'no-item' }, 400);
      if (STARTER_CARS.includes(id) || (user.cars || []).includes(id)) {
        return json({ error: 'owned' }, 409);
      }
      if (user.gold < price) return json({ error: 'poor', need: price, have: user.gold }, 402);
      user.gold -= price;
      user.cars = [...(user.cars || []), id];
      await store.setJSON(session.nick, user);
      return json({ profile: pubProfile(user) });
    }

    // Kosmetikanı geyin — yalnız sahib olduğun (və ya pulsuz) element
    if (action === 'equip') {
      const id = String(b.id || '');
      // Boş id = ÇIXAR. Yoxsa hesabda seçim qalırdı və skin dərhal geri qayıdırdı.
      if (!id) {
        const g = String(b.group || '');
        if (!/^(paint|rim|flame|smoke|effect|skin_[a-zA-Z0-9_-]{1,24})$/.test(g)) {
          return json({ error: 'no-group' }, 400);
        }
        const eq = { ...(user.equip || {}) };
        delete eq[g];
        user.equip = eq;
        await store.setJSON(session.nick, user);
        return json({ profile: pubProfile(user) });
      }
      const grp = COSMETIC_GROUP(id);
      const pr = priceOf(id);
      if (!grp || pr == null) return json({ error: 'no-item' }, 400);
      const owned = pr === 0 || (user.cosmetics || []).includes(id);
      if (!owned) return json({ error: 'not-owned' }, 403);
      user.equip = { ...(user.equip || {}), [grp]: id };
      await store.setJSON(session.nick, user);
      return json({ profile: pubProfile(user) });
    }

    // Günlük mükafat — gündə 1 dəfə; ardıcıl günlər seriyanı artırır (30→100)
    if (action === 'daily') {
      const now = Date.now();
      const today = dayNum(now);
      const last = dayNum(user.dailyLast || 0);
      if (user.dailyLast && last === today) {
        return json({ error: 'claimed', profile: pubProfile(user) }, 409);
      }
      user.dailyStreak = last === today - 1 ? (user.dailyStreak || 0) + 1 : 1;
      const amount = 30 + Math.min(7, user.dailyStreak) * 10;
      user.dailyLast = now;
      user.gold += amount;
      await store.setJSON(session.nick, user);
      return json({ amount, streak: user.dailyStreak, profile: pubProfile(user) });
    }

    // Liderlər cədvəli — qızıla görə top 10
    if (action === 'top') {
      const { blobs } = await store.list();
      const rows = [];
      for (const bl of blobs.slice(0, 400)) {
        const u = await store.get(bl.key, { type: 'json' });
        if (u?.nick) rows.push({ nick: u.nick, gold: u.gold || 0, cars: (u.cars || []).length });
      }
      rows.sort((a, b) => b.gold - a.gold);
      return json({ top: rows.slice(0, 10), me: { nick: user.nick, gold: user.gold } });
    }

    return json({ error: 'action' }, 400);
  };
}
