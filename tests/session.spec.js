import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { boot } from './helpers.js';

// TƏK SESSİYA: bir hesab eyni anda yalnız bir cihazda açıq ola bilər. Yeni giriş əvvəlki
// cihazın tokenini etibarsız edir; köhnə cihaz çıxarılır və səbəbi bildirişlə deyilir.
// Öz backend-in (server/index.mjs) müvəqqəti SQLite faylı ilə ayrıca nüsxəsi qaldırılır.
const PORT = 8791;
const API = `http://127.0.0.1:${PORT}/api/auth`;
let srv, dir;

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-session-'));
  srv = spawn('node', ['server/index.mjs'], {
    env: { ...process.env, PORT: String(PORT), AUTH_SECRET: 'test-secret', DB_FILE: path.join(dir, 'test.db'), STATIC_DIR: dir },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(API, { method: 'OPTIONS' }); if (r.status === 204) return; } catch { /* hələ qalxmayıb */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('test serveri qalxmadı');
});
test.afterAll(() => { srv?.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

const call = async (body) => {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
};

test('tək sessiya: yeni giriş əvvəlki tokeni etibarsız edir (server)', async () => {
  const nick = 'ses' + Date.now().toString(36).slice(-6);
  const a = await call({ action: 'register', nick, pass: 'parol1' });
  expect(a.status).toBe(200);
  expect((await call({ action: 'me', token: a.token })).status, 'ilk cihaz işləyir').toBe(200);
  const b = await call({ action: 'login', nick, pass: 'parol1' });
  expect(b.status).toBe(200);
  expect(b.token).not.toBe(a.token);
  const oldMe = await call({ action: 'me', token: a.token });
  expect([oldMe.status, oldMe.error], 'köhnə cihaz çıxarıldı').toEqual([401, 'session']);
  for (const action of ['award', 'buy', 'equip', 'daily', 'top', 'changePass', 'setEmail']) {
    const r = await call({ action, token: a.token, amount: 50, reason: 'race', id: 'g_cyan', group: 'glow', pass: 'yeniparol', old: 'parol1', email: 'x@y.zz' });
    expect([action, r.status, r.error], 'köhnə token heç bir əməliyyatda keçmir').toEqual([action, 401, 'session']);
  }
  expect((await call({ action: 'me', token: b.token })).status, 'yeni cihaz işləyir').toBe(200);
  // parol dəyişəndə yeni token verilir, əvvəlki ölür
  const c = await call({ action: 'changePass', token: b.token, old: 'parol1', pass: 'parol2' });
  expect(c.status).toBe(200);
  expect(c.token).toBeTruthy();
  expect((await call({ action: 'me', token: b.token })).error).toBe('session');
  expect((await call({ action: 'me', token: c.token })).status).toBe(200);
  // saxta sid
  const forged = c.token.split('.')[0] + '.AAAA';
  expect((await call({ action: 'me', token: forged })).error).toBe('auth');
});

test('tək sessiya: köhnə cihaz çıxarılır və bildiriş görür (brauzer)', async ({ browser }) => {
  test.setTimeout(120_000);
  const nick = 'two' + Date.now().toString(36).slice(-6);
  const open = async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript((api) => { window.__AUTH_API = api; }, API);
    await boot(page);
    return page;
  };
  const p1 = await open();
  await p1.evaluate(async (n) => {
    await window.__auth.register(n, 'parol1');
  }, nick);
  expect(await p1.evaluate(() => window.__auth.isLoggedIn)).toBe(true);
  const p2 = await open();
  await p2.evaluate(async (n) => {
    await window.__auth.login(n, 'parol1');
  }, nick);
  // 1-ci cihaz: növbəti yoxlamada (pəncərə önə gələndə / 30 s-dən bir) çıxarılır
  await p1.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p1.waitForFunction(() => !window.__auth.isLoggedIn, null, { timeout: 15_000 });
  const s1 = await p1.evaluate(() => ({ token: localStorage.getItem('apexToken'), text: document.body.innerText }));
  expect(s1.token, 'token silindi').toBeNull();
  expect(s1.text, 'səbəb deyilir').toContain('başqa cihazdan');
  await p1.screenshot({ path: 'tests/out/session-kicked.png' });
  await p1.setViewportSize({ width: 844, height: 390 });
  await p1.waitForTimeout(300);
  await p1.screenshot({ path: 'tests/out/session-kicked-mobile.png' });
  expect(await p2.evaluate(() => window.__auth.isLoggedIn), '2-ci cihaz hesabda qalır').toBe(true);
  // 2-ci cihazda alış-veriş əməliyyatı işləyir (mükafat)
  const gold = await p2.evaluate(async () => (await window.__auth.award(40, 'race'))?.gold ?? null);
  expect(gold, '2-ci cihazda mükafat yazılır').not.toBeNull();
});

// ÇAT / SOSİAL: istifadəçi adı tokendən götürülür — başqasının adı ilə yazmaq, onun
// mesajlarını oxumaq və ya dost siyahısını dəyişmək olmur.
test('sosial: kimlik tokendəndir — ad oğurlamaq, özgə mesajını oxumaq olmur (server)', async () => {
  const SOC = API.replace('/auth', '/social');
  const soc = async (body) => {
    const r = await fetch(SOC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, ...(await r.json()) };
  };
  const id = Date.now().toString(36).slice(-5);
  const [na, nb, nc] = ['Ali' + id, 'Bal' + id, 'Cem' + id];
  const [a, b, c] = await Promise.all([na, nb, nc].map((nick) => call({ action: 'register', nick, pass: 'parol1' })));
  const [ua, ub, uc] = [na, nb, nc].map((n) => n.toLowerCase());

  // 1) A B-yə yazır (tokenlə) → B tarixçədə görür
  expect((await soc({ action: 'send', kind: 'dm', to: 'u:' + ub, text: 'salam', token: a.token, from: { cid: 'cid-aaaaaa', n: 'Saxta', u: uc } })).status).toBe(200);
  const hb = await soc({ action: 'dmhist', token: b.token, with: ua });
  expect(hb.msgs.map((m) => [m.f, m.text]), 'göndərən tokendəki addır, deyilən ad yox').toEqual([[ua, 'salam']]);
  // 2) tokensiz: özgə mesajları və dost siyahısı oxunmur
  for (const body of [{ action: 'dmhist', user: ua, with: ub }, { action: 'dmlist', user: ua }, { action: 'frlist', user: ua }, { action: 'frq', user: ua, with: ub }, { action: 'fracc', user: ua, with: ub }]) {
    const r = await soc(body);
    expect([body.action, r.status], 'tokensiz rədd').toEqual([body.action, 401]);
  }
  // 3) C öz tokeni ilə A-nın adını deyir → yalnız ÖZ məlumatını alır
  expect((await soc({ action: 'dmhist', token: c.token, user: ua, with: ub })).msgs, 'C A–B söhbətini oxuya bilmir').toEqual([]);
  expect((await soc({ action: 'dmlist', token: c.token, user: ua })).convos).toEqual([]);
  await soc({ action: 'frq', token: c.token, user: ua, with: ub });
  const frb = await soc({ action: 'frlist', token: b.token });
  expect(frb.in, 'dostluq istəyi A-nın yox, C-nin adından gedir').toEqual([uc]);
  // 4) qonaq hesab sahibinin adı ilə: presence və ümumi çat
  await soc({ action: 'pulse', cid: 'cid-guest1', presence: true, nick: na, user: ua });
  await soc({ action: 'pulse', cid: 'cid-realaa', presence: true, nick: 'nəsə', user: 'nəsə', token: a.token });
  const who = (await soc({ action: 'who' })).players;
  expect(who.find((p) => p.cid === 'cid-guest1'), 'qonaq: hesab adı yoxdur, ad işarələnir').toEqual({ cid: 'cid-guest1', n: '~' + na, u: null });
  expect(who.find((p) => p.cid === 'cid-realaa'), 'hesab: ad tokendən').toEqual({ cid: 'cid-realaa', n: na, u: ua });
  await soc({ action: 'chat', nick: na, text: 'mən Aliyəm (yalan)' });
  await soc({ action: 'chat', nick: 'başqa ad', text: 'mən Aliyəm', token: a.token });
  await soc({ action: 'chat', nick: 'Qonaq' + id, text: 'salam' });
  const feed = (await soc({ action: 'feed', since: 0 })).msgs.map((m) => [m.nick, m.u, m.text]);
  // eyni millisaniyədə yazılanların sırası təsadüfidir — sıra yox, məzmun yoxlanır
  const byText = (x, y) => x[2].localeCompare(y[2]);
  expect(feed.sort(byText)).toEqual([['~' + na, null, 'mən Aliyəm (yalan)'], [na, ua, 'mən Aliyəm'], ['Qonaq' + id, null, 'salam']].sort(byText));
  // 5) qonağa göndərilən hadisədə saxta hesab adı çatmır
  await soc({ action: 'send', kind: 'inv', to: 'cid-guest1', from: { cid: 'cid-evil01', n: nb, u: ub } });
  const ev = (await soc({ action: 'pulse', cid: 'cid-guest1', presence: false })).events;
  expect(ev.map((e) => e.from), 'saxta göndərən').toEqual([{ cid: 'cid-evil01', n: '~' + nb, u: null }]);
  // 6) başqa cihazdan girişdən sonra köhnə token çatda da keçmir
  await call({ action: 'login', nick: na, pass: 'parol1' });
  const old = await soc({ action: 'chat', nick: na, text: 'köhnə cihaz', token: a.token });
  expect([old.status, old.error]).toEqual([401, 'session']);
  expect((await soc({ action: 'pulse', cid: 'cid-realaa', token: a.token })).error).toBe('session');
});

test('sosial: hesabla girən oyunçunun çatı, mesajı və dostluğu tokenlə işləyir (brauzer)', async ({ browser }) => {
  test.setTimeout(120_000);
  const id = Date.now().toString(36).slice(-5);
  const open = async (nick) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(([api, soc]) => { window.__AUTH_API = api; window.__SOCIAL_API = soc; }, [API, API.replace('/auth', '/social')]);
    await boot(page);
    if (nick) await page.evaluate((n) => window.__auth.register(n, 'parol1'), nick);
    return page;
  };
  const [pa, pb, guest] = [await open('Xan' + id), await open('Yar' + id), await open(null)];
  const [ua, ub] = ['xan' + id, 'yar' + id];
  // dostluq: A istək göndərir, B qəbul edir
  expect(await pa.evaluate((u) => window.__social.frRequest(u), ub)).toBe(true);
  expect((await pb.evaluate(() => window.__social.frList())).in).toEqual([ua]);
  expect(await pb.evaluate((u) => window.__social.frAccept(u), ua)).toBe(true);
  expect((await pa.evaluate(() => window.__social.frList())).f).toEqual([ub]);
  // şəxsi mesaj + tarixçə
  expect(await pa.evaluate((u) => window.__social.sendTo('u:' + u, 'dm', { text: 'yarışaq?' }), ub)).toBeTruthy();
  expect((await pb.evaluate((u) => window.__social.dmHist(u), ua)).map((m) => [m.f, m.text])).toEqual([[ua, 'yarışaq?']]);
  expect((await pb.evaluate(() => window.__social.dmList())).map((c) => c.with)).toEqual([ua]);
  // ümumi çat: hesab öz adı ilə, qonaq hesab adını götürə bilmir
  await pa.evaluate(() => window.__social.send('nə yazsam da', 'hamıya salam'));
  await guest.evaluate((n) => window.__social.send(n, 'mən Xanam'), 'Xan' + id);
  const feed = (await guest.evaluate(() => window.__social.feed(0))).msgs.filter((m) => /hamıya salam|mən Xanam/.test(m.text)).map((m) => [m.nick, m.u]);
  expect(feed.sort((x, y) => x[0].localeCompare(y[0]))).toEqual([['Xan' + id, ua], ['~Xan' + id, null]].sort((x, y) => x[0].localeCompare(y[0])));
  // qonaq hesab tələb edən şeyləri ala bilmir (boş qayıdır, xəta atmır)
  expect(await guest.evaluate(() => window.__social.dmList())).toEqual([]);
});

// SÜRƏT LİMİTİ: ümumi çat 15 s-də 5 mesaj (kimlik başına), şəxsi göndəriş 30 s-də 12;
// qonaq cid-i dəyişməklə keçə bilmir (IP də sayılır). Ən sonda işləyir — IP sayğacını doldurur.
test('sosial: sürət limiti — spam rədd olunur, gözləmə vaxtı deyilir', async ({ browser }) => {
  test.setTimeout(120_000);
  const SOC = API.replace('/auth', '/social');
  const soc = async (body) => {
    const r = await fetch(SOC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, ...(await r.json()) };
  };
  await new Promise((r) => setTimeout(r, 15_500));   // əvvəlki testlərin çat sayğacı boşalsın
  const id = Date.now().toString(36).slice(-5);
  const a = await call({ action: 'register', nick: 'Spm' + id, pass: 'parol1' });
  const b = await call({ action: 'register', nick: 'Nrm' + id, pass: 'parol1' });
  const st = [];
  for (let i = 0; i < 7; i++) st.push(await soc({ action: 'chat', text: 'spam ' + i, token: a.token }));
  expect(st.map((r) => r.status), 'hesab: 5 keçir, sonrası rədd').toEqual([200, 200, 200, 200, 200, 429, 429]);
  expect(st[5].error).toBe('slow');
  expect(st[5].wait, 'gözləmə vaxtı (s)').toBeGreaterThan(0);
  expect(st[5].wait).toBeLessThanOrEqual(15);
  expect((await soc({ action: 'chat', text: 'mən spam deyiləm', token: b.token })).status, 'başqa oyunçu yaza bilir').toBe(200);
  // qonaq hər mesajda yeni cid ilə: IP limiti (15) dayandırır — 6 artıq sayılıb
  const g = [];
  for (let i = 0; i < 14; i++) g.push((await soc({ action: 'chat', nick: 'Qonaq', text: 'g' + i, cid: 'cid-rot-' + String(i).padStart(3, '0') })).status);
  expect(g.filter((x) => x === 200).length, 'cid dəyişmək limiti keçmir').toBe(9);
  expect(g.slice(9).every((x) => x === 429)).toBe(true);
  const stored = (await soc({ action: 'feed', since: 0 })).msgs.filter((m) => /^spam \d$/.test(m.text)).length;
  expect(stored, 'rədd olunan mesaj çata düşmür').toBe(5);
  // şəxsi göndəriş (dəvət): 12 keçir, 13-cü rədd
  const inv = [];
  for (let i = 0; i < 13; i++) inv.push((await soc({ action: 'send', kind: 'inv', to: 'cid-target1', token: b.token, from: { cid: 'cid-sender1' } })).status);
  expect(inv.filter((x) => x === 200).length).toBe(12);
  expect(inv[12]).toBe(429);
  // brauzer: oyunçuya səbəb və gözləmə vaxtı deyilir
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(([api, s]) => { window.__AUTH_API = api; window.__SOCIAL_API = s; }, [API, SOC]);
  await boot(page);
  const ui = await page.evaluate(async () => {
    const sent = await window.__social.send('Qonaq', 'salam');
    return { sent, wait: window.__social.lastSlow, text: window.__menu._sendFail() };
  });
  expect(ui.sent, 'limit zamanı göndərilmir').toBeNull();
  expect(ui.wait).toBeGreaterThan(0);
  expect(ui.text).toContain('saniyə gözlə');
  console.log(JSON.stringify({ wait6th: st[5].wait, ui }));
  // real ekran: oyunçu çat xanasına yazır → çatın içində sistem sətri kimi görünür
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => window.__menu.showOnline());
  await page.fill('#gchat-input', 'yenə yazıram');
  await page.press('#gchat-input', 'Enter');
  await expect(page.locator('#gchat')).toContainText('saniyə gözlə', { timeout: 8000 });
  await expect(page.locator('#gchat')).not.toContainText('yenə yazıram');
  await page.locator('#gchat').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tests/out/chat-slow-mobile.png' });
});
