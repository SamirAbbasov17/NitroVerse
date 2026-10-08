import { test, expect } from '@playwright/test';
import path from 'node:path';
import { OUT, boot, startMode, autopilot, ensureDir } from './helpers.js';

// NƏTİCƏ EKRANI (Faza 5.6): dövrə vaxtları, ən yaxşı dövrə, şəxsi rekord, liderdən fərq.
// Kadrlar: tests/out/results-screen/
const DIR = ensureDir(path.join(OUT, 'results-screen'));

const STANDINGS = [
  { name: 'Vortex', color: 0x3aa0ff, model: 'hyper', position: 1, finishTime: 98.42 },
  { name: 'Sən', isPlayer: true, color: 0xff6a3d, model: 'race', position: 2, finishTime: 99.87, score: 340, lapTimes: [34.21, 32.95, 32.71], goldMissed: 60 },
  { name: 'Nova', color: 0x46d47e, model: 'coupe', position: 3, finishTime: 101.3 },
  { name: 'Rook', color: 0xffd257, model: 'sedan', position: 4, finishTime: 104.05 },
  { name: 'Mira', color: 0xb44dff, model: 'suv', position: 5, finishTime: null },
  { name: 'Dash', color: 0xff4544, model: 'van', position: 6, finishTime: null },
];
const show = (page, standings, cfg = { mode: 'race', trackId: 'desert', laps: 3 }) => page.evaluate(async ([st, c]) => {
  const { Results } = await import('/src/ui/Results.js');
  new Results(document.getElementById('ui-root'), { standings: st, config: c, onRestart() {}, onMenu() {} });
}, [standings, cfg]);

test('nəticə: dövrə vaxtları, ən yaxşı dövrə və rekord məntiqi (masaüstü)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page);
  await page.evaluate(() => localStorage.removeItem('apexRecords'));
  // 1-ci yarış: rekord yoxdur → hər ikisi yeni
  await show(page, STANDINGS);
  await expect(page.locator('.laps__chip')).toHaveCount(3);
  await expect(page.locator('.laps__chip.is-best')).toContainText('0:32.71');
  await expect(page.locator('.laps__recs')).toContainText('Yeni dövrə rekordu!');
  await expect(page.locator('.laps__recs')).toContainText('Yeni yarış rekordu!');
  await expect(page.locator('.results__row').nth(1).locator('.results__time')).toContainText('+1.45');
  await expect(page.locator('.results__row').nth(4).locator('.results__time')).toHaveText('--:--');
  await page.waitForTimeout(600);   // açılış keçidi bitsin
  await page.screenshot({ path: path.join(DIR, 'd-new-record.png') });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('apexRecords')))).toEqual({ desert: { lap: 32.71, race: { 3: 99.87 } } });
  // 2-ci yarış daha yavaş → rekordlar göstərilir, dəyişmir
  const slow = STANDINGS.map((r) => (r.isPlayer ? { ...r, finishTime: 103.2, lapTimes: [35.1, 34.0, 33.9] } : r));
  await show(page, slow);
  await expect(page.locator('.laps__recs')).toContainText('Ən yaxşı dövrən');
  await expect(page.locator('.laps__recs')).toContainText('0:32.71');
  await expect(page.locator('.laps__recs')).toContainText('0:99.87'.replace('0:99.87', '1:39.87'));
  await expect(page.locator('.laps__new')).toHaveCount(0);
  await page.waitForTimeout(600);   // açılış keçidi bitsin
  await page.screenshot({ path: path.join(DIR, 'd-no-record.png') });
  // 3-cü yarış: yalnız dövrə rekordu yenilənir, əvvəlkisi göstərilir
  const quickLap = STANDINGS.map((r) => (r.isPlayer ? { ...r, finishTime: 101.0, lapTimes: [36.0, 33.0, 31.9] } : r));
  await show(page, quickLap);
  await expect(page.locator('.laps__new')).toHaveCount(1);
  await expect(page.locator('.laps__recs')).toContainText('əvvəl 0:32.71');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('apexRecords')).desert)).toEqual({ lap: 31.9, race: { 3: 99.87 } });
  // başqa dövrə sayı ayrı yarış rekordudur; bitirməyən oyunçuda blok yoxdur
  await show(page, STANDINGS.map((r) => (r.isPlayer ? { ...r, finishTime: null, lapTimes: undefined } : r)));
  await expect(page.locator('.laps')).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem('apexRecords'));
});

test('nəticə: telefon (844×390) — dörd dildə daşma yoxdur, düymələr əlçatandır', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const lang of ['az', 'en', 'ru', 'tr']) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await boot(page, { lang });
    await page.evaluate(() => localStorage.setItem('apexRecords', JSON.stringify({ desert: { lap: 33.5, race: { 3: 97.1 } } })));
    await show(page, STANDINGS);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(DIR, `m-${lang}.png`) });
    const fit = await page.evaluate(() => {
      const sc = document.querySelector('.screen__scroll').getBoundingClientRect();
      const bad = [...document.querySelectorAll('.laps *, .results *, .screen__heading *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > sc.right + 1 || r.left < sc.left - 1); }).length;
      const el = document.querySelector('.screen__scroll'); el.scrollTop = el.scrollHeight;
      const b = document.querySelector('[data-restart]').getBoundingClientRect();
      return { bad, btnVisible: b.bottom <= window.innerHeight + 1 && b.top >= 0 };
    });
    expect([lang, fit.bad, fit.btnVisible]).toEqual([lang, 0, true]);
    await ctx.close();
  }
});

test('nəticə: real yarışda dövrə vaxtları ölçülür və rekord yazılır (2 dövrə)', async ({ page }) => {
  test.setTimeout(240_000);
  await boot(page);
  await page.evaluate(() => localStorage.removeItem('apexRecords'));
  await startMode(page, { mode: 'race', trackId: 'desert', carId: 'blaze', laps: 2, difficulty: 'easy' });
  await autopilot(page, true);
  await page.waitForSelector('.screen .results', { timeout: 200_000 });
  const r = await page.evaluate(() => ({
    chips: [...document.querySelectorAll('.laps__chip b')].map((e) => e.textContent),
    recs: document.querySelector('.laps__recs')?.textContent || '',
    stored: JSON.parse(localStorage.getItem('apexRecords') || '{}'),
    rm: (() => { const p = window.__active.raceManager.getPlayer(); return { laps: p.lapTimes.map((v) => +v.toFixed(2)), total: +p.finishTime.toFixed(2), finished: p.finished, dnf: !!p.dnf }; })(),
  }));
  console.log(JSON.stringify(r));
  await page.waitForTimeout(600);   // açılış keçidi bitsin
  await page.screenshot({ path: path.join(DIR, 'd-real-race.png') });
  if (!r.rm.dnf) {
    expect(r.rm.laps.length).toBe(2);
    expect(r.chips.length).toBe(2);
    for (const v of r.rm.laps) { expect(v).toBeGreaterThan(15); expect(v).toBeLessThan(120); }
    // dövrələrin cəmi yarış vaxtından qriddən start xəttinə qədərki hissə qədər azdır
    expect(r.rm.total - (r.rm.laps[0] + r.rm.laps[1])).toBeGreaterThanOrEqual(0);
    expect(r.rm.total - (r.rm.laps[0] + r.rm.laps[1])).toBeLessThan(6);
    expect(r.stored.desert.lap).toBeCloseTo(Math.min(...r.rm.laps), 1);
    expect(r.stored.desert.race[2]).toBeCloseTo(r.rm.total, 1);
  }
  await page.evaluate(() => localStorage.removeItem('apexRecords'));
});
