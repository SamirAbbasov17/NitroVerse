// Futbol (telefon): zərbə (💥) və nitro (⚡) düymələri dolma vaxtı bozarır və dolma halqası göstərir,
// yenidən hazır olanda parıldayır.
import { test, expect } from '@playwright/test';
import path from 'path';
import { boot, startMode, MODES, OUT, ensureDir } from './helpers.js';

test('futbol telefon: zərbə və nitro düymələri dolmanı göstərir, hazır olanda parıldayır', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'football').config);
  await page.waitForFunction(() => window.__active._state === 'play', null, { timeout: 30_000 });
  const cls = (t) => page.evaluate((k) => { const b = document.querySelector(`[data-t="${k}"]`); return { cool: b.classList.contains('is-cool'), ready: b.classList.contains('is-ready'), flash: b.classList.contains('is-flash'), cd: +b.style.getPropertyValue('--cd') }; }, t);
  await page.waitForTimeout(300);
  expect((await cls('back')).ready, 'zərbə əvvəldən hazırdır').toBe(true);
  expect((await cls('use')).ready, 'nitro əvvəldən hazırdır').toBe(true);
  // zərbə → dolur
  await page.evaluate(() => window.__active._lunge());
  await page.waitForTimeout(700);
  const mid = await cls('back');
  expect(mid.cool, 'zərbədən sonra bozarır').toBe(true);
  expect(mid.cd, 'dolma halqası irəliləyir').toBeGreaterThan(0.1);
  expect(mid.cd).toBeLessThan(0.6);
  // nitro: bütün yükləri xərclə → dolur
  await page.evaluate(() => { const sc = window.__active; sc.playerCar.nitroCharges = 1; sc.playerCar._nitroT = 2; sc._useNitro(); });
  await page.waitForTimeout(300);
  expect((await cls('use')).cool, 'nitro bitəndə bozarır').toBe(true);
  await page.screenshot({ path: path.join(ensureDir(path.join(OUT, 'shots')), 'm-football-cooldown.png') });
  // zərbə hazır olur → parıltı
  await page.waitForFunction(() => document.querySelector('[data-t="back"]').classList.contains('is-ready'), null, { timeout: 6000 });
  const back = await cls('back');
  expect(back.flash, 'hazır olan an parıldayır').toBe(true);
  await page.screenshot({ path: path.join(OUT, 'shots', 'm-football-ready.png') });
  await ctx.close();
});
