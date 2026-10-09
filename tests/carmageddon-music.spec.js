// CARMAGEDDON musiqisi: hər səhnənin öz treki var, fayllar yerindədir, səs söndürməyə tabedir,
// Carmageddon-dan çıxanda susur. (Treklərin necə səsləndiyini test yoxlamır — onu qulaq yoxlayır.)
import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

const open = async (page, save) => {
  await page.evaluate((s) => { if (s) localStorage.setItem('cgCh1', JSON.stringify(s)); else localStorage.removeItem('cgCh1'); window.__menu.onOpenGame('carmageddon'); }, save);
  await page.waitForSelector('.cg.is-ready', { timeout: 30_000 });
};
const want = (page) => page.evaluate(() => window.__cgMusic.state.want);

test('musiqi: səhnəyə görə trek, fayllar, səs söndürmə, çıxışda susur', async ({ page }) => {
  test.setTimeout(240_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await page.evaluate(() => localStorage.setItem('apexMuted', '0'));
  await page.reload(); await page.waitForFunction(() => !!window.__menu, null, { timeout: 60_000 });
  await page.mouse.click(5, 5);
  for (const n of ['scavenger', 'caravan', 'settlement', 'emptycity', 'bleeding', 'hunt']) {
    const r = await page.request.get(`/carmageddon/music/${n}.mp3`);
    expect([n, r.status(), Number(r.headers()['content-length']) > 500_000], 'fayl yerindədir').toEqual([n, 200, true]);
  }
  await open(page, null);
  expect(await want(page), 'başlıq ekranı').toBe('scavenger');
  await page.waitForFunction(() => { const s = window.__cgMusic.state; return !s.paused && s.level > 0.5; }, null, { timeout: 15_000 });
  // səs söndürmə musiqiyə də aiddir
  const vol = await page.evaluate(async () => {
    const A = window.__audio, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    if (A.muted) A.toggleMute(); await wait(400); const on = window.__cgMusic.state.vol;
    A.toggleMute(); await wait(400); const off = window.__cgMusic.state.vol;
    A.toggleMute(); return { on, off };
  });
  expect(vol.on, 'səs açıqkən musiqi eşidilir').toBeGreaterThan(0.1);
  expect(vol.off, 'səs söndürüləndə musiqi də susur').toBe(0);
  // hekayə: proloq → karvan; düşərgə → məskən
  await page.locator('[data-cg="story"]').click();
  await page.waitForSelector('.cgs.is-ready', { timeout: 20_000 });
  await page.waitForFunction(() => window.__cgMusic.state.want === 'caravan', null, { timeout: 10_000 });
  await page.locator('.cgs__skip').click();
  await page.waitForFunction(() => window.__cgMusic.state.want === 'settlement', null, { timeout: 15_000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__cgMusic.state.want === 'scavenger', null, { timeout: 8000 });
  // gecə → gərgin trek; qaçış → təqib treki
  await page.keyboard.press('Escape');
  await page.waitForSelector('.menu-list .mrow', { timeout: 30_000 });
  expect(await page.evaluate(() => window.__cgMusic.state.paused), 'Carmageddon-dan çıxanda musiqi susur').toBe(true);
  await open(page, { stage: 'night', q: {}, got: [], seen: [] });
  await page.locator('[data-cg="story"]').click();
  await page.waitForFunction(() => window.__cgMusic.state.want === 'emptycity', null, { timeout: 20_000 });
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.waitForSelector('.menu-list .mrow', { timeout: 30_000 });
  await open(page, { stage: 'chase', sec: 0, q: {}, got: [], seen: [] });
  await page.locator('[data-cg="story"]').click();
  await page.waitForFunction(() => window.__cgMusic.state.want === 'hunt', null, { timeout: 20_000 });
  expect(errs).toEqual([]);
});
