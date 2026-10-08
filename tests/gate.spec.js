// Telefonda başlanğıc qapısı: menyudan əvvəl bir toxunuş → tam ekran istənir → qapı açılır.
// Bildirişlər: düyməsiz bildiriş 5 s-dən çox qalmır, toxunuşla dərhal bağlanır.
import { test, expect } from '@playwright/test';
import path from 'path';

const DIR = path.join('tests', 'out', 'shots', 'gate');

test('telefon: qapı görünür, toxunuş tam ekran istəyir və menyunu açır (4 dil)', async ({ browser }) => {
  test.setTimeout(180_000);
  for (const lang of ['az', 'en', 'ru', 'tr']) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript((l) => {
      localStorage.setItem('apexLang', l); localStorage.setItem('apexMuted', '1'); localStorage.setItem('apexGate', '1');
      window.__fs = 0;
      const orig = Element.prototype.requestFullscreen;
      Element.prototype.requestFullscreen = function (...a) { window.__fs++; return orig ? orig.apply(this, a).catch(() => {}) : Promise.resolve(); };
    }, lang);
    await page.goto('/');
    const gate = page.locator('#start-gate');
    await expect(gate).toBeVisible();
    await page.waitForFunction(() => !!window.__menu, null, { timeout: 60_000 });   // oyun arxada yüklənir
    await expect(gate, 'toxunuşa qədər açıq qalır').toBeVisible();
    const fit = await gate.evaluate((g) => [...g.children].every((c) => { const r = c.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && c.scrollWidth <= c.clientWidth + 1; }));
    expect(fit, `${lang}: yazılar ekrana sığır`).toBe(true);
    if (lang === 'az' || lang === 'ru') await page.screenshot({ path: path.join(DIR, `gate-${lang}.png`) });
    await gate.tap();
    await expect(gate).toHaveCount(0, { timeout: 5000 });
    expect(await page.evaluate(() => window.__fs), 'tam ekran toxunuşla istəndi').toBeGreaterThan(0);
    await expect(page.locator('.menu-list .mrow').first()).toBeVisible();
    expect(errs).toEqual([]);
    await ctx.close();
  }
});

test('masaüstü: qapı yoxdur', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('apexGate', '1'); localStorage.setItem('apexMuted', '1'); });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__menu, null, { timeout: 60_000 });
  expect(await page.locator('#start-gate').count()).toBe(0);
});

test('bildiriş: düyməsiz olan 5 s-dən tez gedir, toxunuşla dərhal bağlanır', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('apexMuted', '1'));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__notices, null, { timeout: 60_000 });
  await page.evaluate(() => window.__notices.show({ icon: '🔒', text: 'Qısa məlumat', life: 14 }));
  await expect(page.locator('.notice')).toHaveCount(1);
  await page.waitForTimeout(3600);
  await expect(page.locator('.notice'), 'qısa mətn ~3 s').toHaveCount(0);
  await page.evaluate(() => window.__notices.show({ icon: '🔒', text: 'Uzun məlumat '.repeat(12), life: 14 }));
  await page.waitForTimeout(4200);
  await expect(page.locator('.notice'), 'uzun mətn hələ oxunur').toHaveCount(1);
  await page.waitForTimeout(1400);
  await expect(page.locator('.notice'), 'amma 5 s-dən çox yox').toHaveCount(0);
  await page.evaluate(() => window.__notices.show({ icon: '🎮', text: 'Dəvət', life: 25, actions: [{ label: 'Qəbul et', onClick: () => {} }] }));
  await page.locator('.notice__text').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.notice'), 'toxunuş bağlayır').toHaveCount(0);
});
