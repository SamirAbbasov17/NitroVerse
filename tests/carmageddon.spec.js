import { test, expect } from '@playwright/test';
import path from 'node:path';
import { OUT, boot, ensureDir } from './helpers.js';

// CARMAGEDDON başlıq ekranı: NitroVerse menyusundan ayrıca oyun kimi açılır, qəhrəman canlıdır
// (qırpır, kursoru izləyir, toxunuşa cavab verir), menyu klaviatura ilə işləyir, geri qayıdır.
// Kadrlar: tests/out/carmageddon/
const DIR = ensureDir(path.join(OUT, 'carmageddon'));

async function openCg(page) {
  await page.click('[data-mode="carmageddon"]');
  await page.waitForSelector('.cg.is-ready', { timeout: 30_000 });
  await page.waitForTimeout(700);
}

test('carmageddon: menyudan açılır, qəhrəman canlıdır, geri qayıdır (masaüstü)', async ({ page }) => {
  test.setTimeout(120_000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page);
  await expect(page.locator('[data-mode="carmageddon"]')).toContainText('CARMAGEDDON');
  await page.screenshot({ path: path.join(DIR, 'd-nitroverse-menu.png') });
  await openCg(page);
  await page.screenshot({ path: path.join(DIR, 'd-title.png') });
  // ayrı oyun: 3D kətan gizlidir, NitroVerse menyusu yoxdur, öz şriftləri yüklənib
  const st = await page.evaluate(() => ({
    canvasHidden: getComputedStyle(document.getElementById('game-canvas')).visibility === 'hidden',
    nvMenu: document.querySelectorAll('.menu-panel').length,
    fonts: [document.fonts.check('32px "Black Ops One"'), document.fonts.check('16px "Tiny5"'), document.fonts.check('16px "Pixelify Sans"')],
    logoInk: (() => { const c = document.querySelector('.cg__logo'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let o = 3; o < d.length; o += 4) if (d[o]) n++; return n; })(),
    hasScene: !!window.__active?.scene,
  }));
  expect(st.canvasHidden, '3D kətan gizlidir').toBe(true);
  expect(st.nvMenu, 'NitroVerse menyusu bağlanıb').toBe(0);
  expect(st.logoInk, 'loqo çəkilib').toBeGreaterThan(3000);
  expect(st.fonts, 'üç şrift də yüklənib').toEqual([true, true, true]);
  console.log(JSON.stringify(st));
  // canlılıq: 6 saniyədə gözlər ən azı bir dəfə qırpır; saç hərəkət edir (kadrlar fərqlidir)
  const life = await page.evaluate(async () => {
    const s = window.__cg, cv = s.cv, cx = s.cx;
    const snap = () => Array.from(cx.getImageData(300, 62, 60, 100).data).reduce((a, v, i) => (a + v * ((i % 7) + 1)) % 1e9, 0);
    const seen = new Set(); let blinked = false;
    const t0 = performance.now();
    while (performance.now() - t0 < 6500) { await new Promise((r) => requestAnimationFrame(r)); if (s.blink > 0) blinked = true; seen.add(snap()); }
    return { blinked, hairFrames: seen.size, w: cv.width, h: cv.height };
  });
  expect(life.blinked, 'gözünü qırpır').toBe(true);
  expect(life.hairFrames, 'saç yellənir (fərqli kadrlar)').toBeGreaterThan(4);
  // baxış: kursor solda → sol kadr, sağda → sağ kadr (göz yamağının piksellərindən)
  const eyeSig = () => page.evaluate(() => { const s = window.__cg; const hx = Math.round(300 - (s.pointer.x - 0.5) * 8); return Array.from(s.cx.getImageData(hx + 64, 62 + 56, 12, 3).data).join(','); });
  await page.mouse.move(120, 450); await page.waitForTimeout(500);
  const left = await page.evaluate(() => window.__cg.blink) ? null : await eyeSig();
  await page.mouse.move(1420, 450); await page.waitForTimeout(500);
  const right = await eyeSig();
  if (left) expect(left, 'gözlər kursoru izləyir').not.toBe(right);
  // toxunuş: qəhrəmana klik → söz balonu
  const r = await page.evaluate(() => { const b = window.__cg.cv.getBoundingClientRect(); return { x: b.left + (390 / 480) * b.width, y: b.top + (170 / 270) * b.height }; });
  await page.mouse.click(r.x, r.y);
  await expect(page.locator('.cg__bubble')).toBeVisible();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(DIR, 'd-title-poke.png') });
  // klaviatura: ↑ ilə "Hekayəyə başla" → Enter → "tezliklə" qeydi; Esc → NitroVerse
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.cg__btn.is-selected')).toContainText('Hekayəyə başla');
  await page.keyboard.press('Enter');
  await expect(page.locator('.cg__note')).toContainText('Hekayə hələ yazılır');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.menu-list .mrow', { timeout: 30_000 });
  expect(await page.locator('.cg').count(), 'Carmageddon ekranı bağlandı').toBe(0);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('game-canvas')).visibility)).toBe('visible');
  expect(errs).toEqual([]);
});

test('carmageddon: telefon (844×390) — dörd dildə sığır, düymələr əlçatandır', async ({ browser }) => {
  test.setTimeout(180_000);
  for (const lang of ['az', 'en', 'ru', 'tr']) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await boot(page, { lang });
    // zolaq sürüşdürmədən görünür
    const vis = await page.evaluate(() => { const r = document.querySelector('[data-mode="carmageddon"]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.height > 20; });
    expect([lang, vis], 'Carmageddon zolağı ana menyuda görünür').toEqual([lang, true]);
    if (lang === 'az') await page.screenshot({ path: path.join(DIR, 'm-nitroverse-menu.png') });
    await page.tap('[data-mode="carmageddon"]');
    await page.waitForSelector('.cg.is-ready', { timeout: 30_000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(DIR, `m-${lang}.png`) });
    const fit = await page.evaluate(() => {
      const out = [...document.querySelectorAll('.cg__ui *, .cg__foot')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1); }).map((e) => e.className);
      const btns = [...document.querySelectorAll('.cg__btn')].map((b) => { const r = b.getBoundingClientRect(); return Math.round(r.height); });
      // ə kimi hərflər piksel şriftində varmı (yoxdursa ehtiyat şriftə düşür — görünüş pozulur)
      // Azərbaycan/türk/rus hərfləri düymə şriftində varmı: yoxdursa brauzer ehtiyat şriftə düşür —
      // hərfin şəkli ehtiyat şriftdəki ilə eyni çıxır.
      const cv = document.createElement('canvas'); cv.width = 60; cv.height = 60; const g = cv.getContext('2d', { willReadFrequently: true });
      const sig = (font, ch) => { g.clearRect(0, 0, 60, 60); g.font = font; g.textBaseline = 'top'; g.fillText(ch, 4, 4); return g.getImageData(0, 0, 60, 60).data.reduce((a, v, i) => (a + v * (i % 13 + 1)) % 1e9, 0); };
      const capsMissing = [...'ƏŞĞİÖÜÇЖЯЫ'].filter((ch) => sig('40px "Tiny5", serif', ch) === sig('40px serif', ch)).join('');
      return { out, btns, capsMissing };
    });
    console.log(lang, JSON.stringify(fit));
    expect([lang, fit.out], 'ekrandan daşan element yoxdur').toEqual([lang, []]);
    expect(Math.min(...fit.btns), 'düymələr toxunmaq üçün kifayət qədər hündürdür').toBeGreaterThanOrEqual(30);
    expect([lang, fit.capsMissing], 'düymə şriftində bütün hərflər var').toEqual([lang, '']);
    await page.tap('.cg__btn[data-cg="exit"]');
    await page.waitForSelector('.menu-list .mrow', { timeout: 30_000 });
    await ctx.close();
  }
});
