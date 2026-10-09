// CARMAGEDDON yaddaşı HESABA bağlıdır (qonaqda — brauzerdə). Öz backend-in müvəqqəti nüsxəsi qaldırılır.
// Yoxlanır: (1) server: cgSet / cgGet, yanlış forma rədd olunur, token tələb olunur; (2) qonaq irəliləyişi hesaba
// girəndə köçür; (3) başqa cihazda (təmiz brauzer) eyni hesabla "Davam et" çıxır; (4) "Yenidən başla" serverdə də
// silir; (5) başqa hesab və qonaq bu irəliləyişi görmür.
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { boot } from './helpers.js';

const PORT = 8793;
const API = `http://127.0.0.1:${PORT}/api/auth`;
let srv, dir;
test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-cgsave-'));
  srv = spawn('node', ['server/index.mjs'], { env: { ...process.env, PORT: String(PORT), AUTH_SECRET: 'test-secret', DB_FILE: path.join(dir, 'test.db'), STATIC_DIR: dir }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { const r = await fetch(API, { method: 'OPTIONS' }); if (r.status === 204) return; } catch { /* hələ qalxmayıb */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('test serveri qalxmadı');
});
test.afterAll(() => { srv?.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
const call = async (body) => { const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json()) }; };

test('yaddaş serverdə: yazılır, oxunur, silinir; yanlış forma və tokensiz sorğu rədd olunur', async () => {
  const nick = 'cg' + Date.now().toString(36).slice(-6);
  const a = await call({ action: 'register', nick, pass: 'parol1' });
  expect((await call({ action: 'cgGet', token: a.token })).save, 'təzə hesabda yaddaş yoxdur').toBeNull();
  const sv = { stage: 'chase', sec: 2, q: { seeds: 9 }, got: ['s1'], seen: ['wren2'], x: 300, y: 400 };
  expect((await call({ action: 'cgSet', token: a.token, save: sv })).status).toBe(200);
  expect((await call({ action: 'cgGet', token: a.token })).save).toEqual(sv);
  expect((await call({ action: 'cgSet', token: a.token, save: { stage: 'hack' } })).status, 'naməlum mərhələ').toBe(400);
  expect((await call({ action: 'cgSet', token: a.token, save: { stage: 'camp', junk: 'x'.repeat(5000) } })).status, 'çox böyük').toBe(400);
  expect((await call({ action: 'cgSet', token: a.token, save: [1, 2] })).status, 'massiv').toBe(400);
  expect((await call({ action: 'cgGet', token: 'yalan' })).status, 'tokensiz').toBe(401);
  expect((await call({ action: 'cgGet', token: a.token })).save, 'rədd olunan yazılar yaddaşı pozmur').toEqual(sv);
  expect((await call({ action: 'cgSet', token: a.token, save: null })).status).toBe(200);
  expect((await call({ action: 'cgGet', token: a.token })).save).toBeNull();
  // profil cavabına düşmür (lazımsız yük və sızma olmasın)
  await call({ action: 'cgSet', token: a.token, save: sv });
  expect(JSON.stringify((await call({ action: 'me', token: a.token })).profile)).not.toContain('chase');
});

test('yaddaş hesabla gəzir: qonaqdan hesaba köçür, başqa cihazda davam edir, başqası görmür', async ({ browser }) => {
  test.setTimeout(180_000);
  const nick = 'sv' + Date.now().toString(36).slice(-6), other = 'ot' + Date.now().toString(36).slice(-6);
  const device = async () => { const ctx = await browser.newContext(); const page = await ctx.newPage(); await page.addInitScript((api) => { window.__AUTH_API = api; }, API); await boot(page); return page; };
  const openCg = async (page) => { await page.evaluate(() => window.__menu.onOpenGame('carmageddon')); await page.waitForSelector('.cg.is-ready', { timeout: 30_000 }); await page.waitForFunction(() => !!window.__cg?.saveFrom, null, { timeout: 10_000 }); return page.evaluate(() => ({ from: window.__cg.saveFrom, btn: document.querySelector('[data-cg-story]').textContent, hasNew: !document.querySelector('[data-cg="new"]').hidden, local: JSON.parse(localStorage.getItem('cgCh1') || 'null')?.stage ?? null, owner: localStorage.getItem('cgCh1Owner') })); };
  const leave = async (page) => { await page.keyboard.press('Escape'); await page.waitForSelector('.menu-list .mrow', { timeout: 30_000 }); };

  // CİHAZ 1 — qonaq kimi oynayıb (yaddaş brauzerdədir), sonra hesab açır → irəliləyiş hesaba köçür
  const p1 = await device();
  await p1.evaluate(() => localStorage.setItem('cgCh1', JSON.stringify({ stage: 'evening', q: { seeds: 9, parts: 9, pip: 9, radio: 0 }, got: [], seen: [] })));
  const g = await openCg(p1);
  expect([g.from, g.btn, g.local], 'qonaq: yaddaş brauzerdədir').toEqual(['guest', 'Davam et', 'evening']);
  await leave(p1);
  const tok = await p1.evaluate(async (n) => { await window.__auth.register(n, 'parol1'); return window.__auth.token; }, nick);
  const a = await openCg(p1);
  expect([a.from, a.btn, a.owner], 'hesaba girəndə qonaq irəliləyişi hesaba köçür').toEqual(['adopted', 'Davam et', nick]);
  expect((await call({ action: 'cgGet', token: tok })).save?.stage, 'serverdə var').toBe('evening');
  // oyun irəliləyir → serverə yazılır
  await p1.locator('[data-cg="story"]').click();
  await p1.waitForSelector('.cgs.is-ready', { timeout: 20_000 });
  await p1.evaluate(async () => { const m = await import('/src/games/carmageddon/camp.js'); m.setStage('chase', { sec: 3 }); });
  await p1.waitForTimeout(1800);
  expect((await call({ action: 'cgGet', token: tok })).save, 'irəliləyiş serverə getdi').toMatchObject({ stage: 'chase', sec: 3 });

  // CİHAZ 2 — təmiz brauzer, eyni hesab → "Davam et" çıxır (yaddaş serverdən gəlir)
  const p2 = await device();
  expect(await p2.evaluate(() => localStorage.getItem('cgCh1')), 'ikinci cihazda yerli yaddaş yoxdur').toBeNull();
  const tok2 = await p2.evaluate(async (n) => { await window.__auth.login(n, 'parol1'); return window.__auth.token; }, nick);
  const b = await openCg(p2);
  expect([b.from, b.btn, b.hasNew, b.local], 'başqa cihazda hesabın yaddaşı').toEqual(['server', 'Davam et', true, 'chase']);
  // "Yenidən başla" → serverdə də silinir (hekayə açılır, proloq başlayır)
  await p2.locator('[data-cg="new"]').click();
  await p2.waitForSelector('.cgs.is-ready', { timeout: 20_000 });
  await p2.waitForTimeout(1800);
  expect((await call({ action: 'cgGet', token: tok2 })).save, 'yenidən başlayanda serverdə silindi').toBeNull();
  await p2.keyboard.press('Escape'); await p2.locator('[data-cgp="title"]').click();

  // CİHAZ 2-də çıxış → qonaq hesabın yaddaşını görmür; başqa hesab da görmür
  await call({ action: 'cgSet', token: tok2, save: { stage: 'night', q: {}, got: [], seen: [] } });
  await leave(p2);
  await p2.evaluate(() => window.__auth.logout());
  const q = await openCg(p2);
  expect([q.from, q.btn, q.hasNew], 'qonaq: hesabın irəliləyişi görünmür').toEqual(['guest', 'Hekayəyə başla', false]);
  await leave(p2);
  await p2.evaluate(async (n) => { await window.__auth.register(n, 'parol1'); }, other);
  const o = await openCg(p2);
  expect([o.from, o.btn], 'başqa hesab: təmiz başlayır').toEqual(['empty', 'Hekayəyə başla']);
  await leave(p2);
  // ilk hesabla yenidən gir → gecə mərhələsi qayıdır
  await p2.evaluate(async (n) => { window.__auth.logout(); await window.__auth.login(n, 'parol1'); }, nick);
  const r = await openCg(p2);
  expect([r.from, r.btn, r.local], 'öz hesabı ilə qayıdanda irəliləyiş yerindədir').toEqual(['server', 'Davam et', 'night']);
});
