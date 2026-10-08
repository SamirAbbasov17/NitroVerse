import { test, expect } from '@playwright/test';
import path from 'node:path';
import { OUT, startMode, autopilot, ensureDir } from './helpers.js';

// İLK YARIŞ İPUCLARI (Faza 5.3): yeni oyunçuya start, drift və bonus ipucu lazım olan anda görünür,
// hərəkət ediləndə itir və ikinci yarışda bir daha çıxmır. Kadrlar: tests/out/coach/
const DIR = ensureDir(path.join(OUT, 'coach'));
const RACE = { mode: 'race', trackId: 'desert', carId: 'blaze', laps: 3, difficulty: 'easy' };

async function fresh(page, lang = 'az') {
  await page.addInitScript((l) => {
    if (sessionStorage.getItem('nvInit')) return;
    sessionStorage.setItem('nvInit', '1');
    localStorage.setItem('apexLang', l); localStorage.setItem('apexMuted', '1'); localStorage.removeItem('apexCoach');
  }, lang);
  await page.goto('/');
  await page.waitForFunction(() => !!window.__menu && !!window.__showcase, null, { timeout: 60_000 });
}
const step = (page) => page.evaluate(() => document.querySelector('.coach:not(.coach--out)')?.dataset.step || null);
const waitStep = (page, name, ms = 40_000) => page.waitForFunction((n) => document.querySelector('.coach:not(.coach--out)')?.dataset.step === n, name, { timeout: ms });

test('ipucları: start → drift → bonus; hərəkətdən sonra itir, ikinci yarışda çıxmır (masaüstü)', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await fresh(page);
  await startMode(page, RACE);
  expect(await step(page), 'geri sayımda ipucu yoxdur').toBeNull();
  await waitStep(page, 'drive', 20_000);
  await expect(page.locator('.coach')).toContainText('qaz');
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(DIR, 'd-drive.png') });
  await autopilot(page, true);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('apexCoach') || '[]').includes('drive'), null, { timeout: 20_000 });
  // drift ipucu döngədə gəlir; oyunçu drift edəndə itir
  await waitStep(page, 'drift', 60_000);
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(DIR, 'd-drift.png') });
  await page.evaluate(() => { window.__active.input.touch.handbrake = true; });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('apexCoach') || '[]').includes('drift'), null, { timeout: 15_000 });
  await page.evaluate(() => { window.__active.input.touch.handbrake = false; });
  // bonus ipucu: avtopilot yolda qutu götürübsə artıq göstərilib; yoxsa oyunçunun əlinə bonus verilir
  await page.waitForTimeout(1500);
  if (!(await page.evaluate(() => JSON.parse(localStorage.getItem('apexCoach') || '[]').includes('item')))) {
    if ((await step(page)) !== 'item') {
      await page.evaluate(() => { const r = window.__active.racers.find((x) => x.isPlayer); if (!r.items.length) r.items.push('boost'); });
      await waitStep(page, 'item', 20_000);
    }
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(DIR, 'd-item.png') });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('apexCoach') || '[]').includes('item'), null, { timeout: 12_000 });
  }
  await page.waitForFunction(() => !document.querySelector('.coach:not(.coach--out)'), null, { timeout: 12_000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('apexCoach')).sort())).toEqual(['drift', 'drive', 'item']);
  expect(await page.evaluate(() => window.__active.coach), 'hamısı görüldü → məşqçi söndü').toBeNull();
  // ikinci yarış: heç bir ipucu
  await startMode(page, RACE);
  await autopilot(page, true);
  await page.waitForTimeout(12_000);
  expect(await page.evaluate(() => document.querySelectorAll('.coach').length)).toBe(0);
  // ayarlardan yenidən açmaq
  await page.evaluate(() => { window.__menu.showSettings?.('ctl'); });
});

test('ipucları: telefon (844×390) — idarə düymələrini və HUD-u örtmür', async ({ browser }) => {
  test.setTimeout(180_000);
  for (const lang of ['az', 'ru']) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await fresh(page, lang);
    await startMode(page, RACE);
    await waitStep(page, 'drive', 20_000);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(DIR, `m-${lang}-drive.png`) });
    const hit = await page.evaluate(() => {
      const c = document.querySelector('.coach').getBoundingClientRect();
      const over = (sel) => [...document.querySelectorAll(sel)].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && !(r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom);
      }).map((e) => e.className);
      return { coach: [Math.round(c.left), Math.round(c.top), Math.round(c.right), Math.round(c.bottom)], buttons: over('.tbtn'), inView: c.left >= 0 && c.right <= innerWidth && c.top >= 0 && c.bottom <= innerHeight, text: document.querySelector('.coach').textContent };
    });
    console.log(lang, JSON.stringify(hit));
    expect(hit.buttons, 'toxunma düymələri ilə üst-üstə düşmür').toEqual([]);
    expect(hit.inView).toBe(true);
    expect(hit.text, 'telefon mətni düymə adları ilədir (klaviş yox)').not.toMatch(/Space|\bW\b/);
    await ctx.close();
  }
});
