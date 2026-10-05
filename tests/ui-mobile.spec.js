import { test, expect } from '@playwright/test';
import { MODES, boot, startMode, mergeJson } from './helpers.js';

// Mobil HUD auditi (844×390): görünən düymələr bir-birini örtməməli və
// ekrandan kənara çıxmamalıdır. docs/MOBILE.md-dəki buq sinfini tutur.
test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

for (const name of ['race-desert', 'zen', 'football', 'arena']) {
  test(`mobil HUD örtüşməsi: ${name}`, async ({ page }) => {
    await boot(page);
    await startMode(page, MODES.find((m) => m.name === name).config);
    await page.waitForTimeout(6000);
    const res = await page.evaluate(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const label = (el) => (el.dataset.t ? `[data-t=${el.dataset.t}]` : '')
        || (el.id ? `#${el.id}` : '') || `.${[...el.classList].join('.')}` || el.tagName;
      const els = [...document.querySelectorAll('#ui-root button, #mute-btn')].filter((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && r.width > 4 && r.height > 4
          && !!el.offsetParent;
      });
      const boxes = els.map((el) => ({ el, name: label(el), r: el.getBoundingClientRect() }));
      const offscreen = boxes.filter((b) => b.r.left < -1 || b.r.top < -1 || b.r.right > vw + 1 || b.r.bottom > vh + 1)
        .map((b) => b.name);
      const overlaps = [];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (w > 4 && h > 4) overlaps.push(`${a.name} × ${b.name} (${Math.round(w)}×${Math.round(h)})`);
        }
      }
      const small = boxes.filter((b) => b.r.width < 36 || b.r.height < 36)
        .map((b) => `${b.name} ${Math.round(b.r.width)}×${Math.round(b.r.height)}`);
      return { buttons: boxes.length, offscreen, overlaps, small };
    });
    mergeJson('ui-mobile.json', name, res);
    console.log(name, JSON.stringify(res));
    expect.soft(res.overlaps, 'örtüşən düymələr').toEqual([]);
    expect.soft(res.offscreen, 'ekrandan kənar düymələr').toEqual([]);
  });
}
