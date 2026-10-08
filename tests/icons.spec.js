import { test, expect } from '@playwright/test';
import path from 'node:path';
import { OUT, boot, ensureDir } from './helpers.js';

// İKON DƏSTİ (Faza 5.1): menyu çərçivəsində emoji əvəzinə SVG ikonlar. Kadrlar: tests/out/icons/
const DIR = ensureDir(path.join(OUT, 'icons'));

for (const [name, vp, mobile] of [['d', { width: 1440, height: 900 }, false], ['m', { width: 844, height: 390 }, true]]) {
  test(`ikonlar: menyu (${name})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile });
    const page = await ctx.newPage();
    await boot(page);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(DIR, `${name}-modes.png`) });
    const r = await page.evaluate(() => {
      const emo = /[\u{1F300}-\u{1FAFF}☀-➿]/u;
      const zone = [...document.querySelectorAll('.menu-brandrow, .menu-list .mrow, .menu-foot')];
      return {
        svgs: document.querySelectorAll('.menu-brandrow .ic, .mrow__icon .ic, .menu-foot .ic').length,
        emojiLeft: zone.filter((e) => emo.test(e.textContent)).map((e) => e.textContent.trim().slice(0, 30)),
        sized: [...document.querySelectorAll('.ic')].every((e) => { const b = e.getBoundingClientRect(); return b.width >= 12 && b.width <= 40 && b.height >= 12; }),
      };
    });
    expect(r.svgs, 'başlıq + rejimlər + altlıq ikonları').toBeGreaterThanOrEqual(10);
    expect(r.emojiLeft, 'bu zonada emoji qalmayıb').toEqual([]);
    expect(r.sized, 'ikonlar ölçülüdür (CSS yüklənib)').toBe(true);
    await ctx.close();
  });
}
