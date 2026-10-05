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

// Zen filtrləri: heç bir filtr HUD düymələrini örtməməlidir (Kino lentbox zolaqları
// yuxarıdakı düymələrin yarısını gizlədirdi). Hər filtrdə hər düymənin 4 küncü və
// mərkəzi üçün ən üstdəki GÖRÜNƏN element yoxlanır (pointer-events nəzərə alınmadan).
for (const [tag, use] of [['masaüstü', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false }], ['mobil', {}]]) {
  test.describe(`zen filtrləri ${tag}`, () => {
    test.use(use);
    test(`zen filtrləri HUD-u örtmür (${tag})`, async ({ page }) => {
      await boot(page);
      await startMode(page, MODES.find((m) => m.name === 'zen').config);
      await page.waitForTimeout(2500);
      const names = await page.evaluate(() => window.__active.constructor.FILTERS.map((f) => f.ad));
      const bad = [];
      for (let i = 0; i < names.length; i++) {
        await page.evaluate((k) => window.__active._applyFilter(k, true), i);
        await page.waitForTimeout(250);
        const hidden = await page.evaluate(() => {
          const out = [];
          const els = [...document.querySelectorAll('#ui-root .ehud__btn, #ui-root .ehud__score, #ui-root .ehud__speed, #ui-root .touch button')]
            .filter((el) => el.offsetParent && getComputedStyle(el).display !== 'none');
          // Örtən qatları tap: pointer-events:none olan tam ekran qatlar da sayılır
          const covers = [...document.querySelectorAll('#filter-fx, #retro-lines')].filter((c) => getComputedStyle(c).display !== 'none');
          for (const el of els) {
            const r = el.getBoundingClientRect();
            for (const c of covers) {
              // zolaq hündürlüyü qatın ÖZ fonundan oxunur (qara lentin bitdiyi piksel) —
              // HUD-un necə sürüşdürüldüyündən asılı deyil
              const stops = [...getComputedStyle(c).backgroundImage.matchAll(/rgb\(0, 0, 0\) ([\d.]+)(px|vh)/g)]
                .map((m) => parseFloat(m[1]) * (m[2] === 'vh' ? innerHeight / 100 : 1));
              const px = stops.length ? Math.max(...stops) : 0;
              if (c.id === 'filter-fx' && px > 0 && (r.top < px - 0.5 || r.bottom > innerHeight - px + 0.5)) {
                out.push(`${el.id || el.dataset.t || el.className} y=${Math.round(r.top)}..${Math.round(r.bottom)} zolaq=${Math.round(px)}`);
              }
            }
          }
          return out;
        });
        if (hidden.length) bad.push(`${names[i]}: ${hidden.join(', ')}`);
      }
      await page.evaluate(() => window.__active._applyFilter(0, true));
      expect(bad, 'filtr zolağının altında qalan HUD elementləri').toEqual([]);
    });
  });
}
