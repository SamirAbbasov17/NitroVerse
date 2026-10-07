import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mergeJson } from './helpers.js';

// İLK YÜKLƏNMƏ (Faza 5.7): İSTEHSAL build-i (dist/) öz serverimizdən verilir, şəbəkə yavaş
// telefon kimi məhdudlaşdırılır (4G: 9 Mbit/s, 170 ms gecikmə; CPU 4× yavaş) və menyunun
// göründüyü ana qədər vaxt ölçülür. Əvvəl `npm run build` lazımdır.
//   npm run build && npx playwright test tests/load.spec.js   → tests/out/load.json
const PORT = 8792;
let srv, dir;
test.beforeAll(async () => {
  if (!fs.existsSync('dist/index.html')) throw new Error('dist/ yoxdur — əvvəl npm run build');
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-load-'));
  srv = spawn('node', ['server/index.mjs'], { env: { ...process.env, PORT: String(PORT), AUTH_SECRET: 'x', DB_FILE: path.join(dir, 't.db'), STATIC_DIR: './dist' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) return; } catch { /* hələ qalxmayıb */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server qalxmadı');
});
test.afterAll(() => { srv?.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

test('yüklənmə: menyuya qədər vaxt və ilk JS ölçüsü (yavaş telefon)', async ({ browser }) => {
  test.setTimeout(240_000);
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });   // hər dəfə boş keş
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 170, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    let jsBefore = 0, jsAll = 0, menuAt = 0;
    const t0 = Date.now();
    page.on('response', async (r) => {
      if (!/\.js(\?|$)/.test(r.url())) return;
      const len = Number(r.headers()['content-length'] || 0) || (await r.body().catch(() => Buffer.alloc(0))).length;
      jsAll += len;
      if (!menuAt) jsBefore += len;
    });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForSelector('.menu-list', { timeout: 120_000 });
    menuAt = Date.now() - t0;
    await page.waitForTimeout(6000);   // arxa fonda yüklənən səhnə parçaları
    runs.push({ menuMs: menuAt, jsBeforeMenuKb: Math.round(jsBefore / 1024), jsTotalKb: Math.round(jsAll / 1024) });
    await ctx.close();
  }
  const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[1];
  const out = { label: process.env.LABEL || 'indi', menuMs: med('menuMs'), jsBeforeMenuKb: med('jsBeforeMenuKb'), jsTotalKb: med('jsTotalKb'), runs };
  mergeJson('load.json', out.label, out);
  console.log(JSON.stringify(out));
  expect(out.menuMs).toBeLessThan(60_000);
});
