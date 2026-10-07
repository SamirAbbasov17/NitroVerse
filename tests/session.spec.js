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
