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
  // İLK SİÇAN HƏRƏKƏTİ fonu sıçratmır: göstərici ekranın küncünə birdən keçir, paralaks isə
  // kadr-kadr yumşaq gedir (bir kadrda ən çox ekranın 12%-i qədər)
  const jump = await page.evaluate(async () => {
    const s = window.__cg; let prev = s.pointer.x, maxStep = 0;
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 4, clientY: 4 }));
    for (let i = 0; i < 40; i++) { await new Promise((r) => requestAnimationFrame(r)); maxStep = Math.max(maxStep, Math.abs(s.pointer.x - prev)); prev = s.pointer.x; }
    return { maxStep: +maxStep.toFixed(3), end: +s.pointer.x.toFixed(2) };
  });
  expect(jump.maxStep, 'paralaks bir kadrda sıçramır').toBeLessThan(0.12);
  expect(jump.end, 'amma göstəriciyə çatır').toBeLessThan(0.1);
  // SOLA hərəkətdə şəhər silueti başqa yerə TULLANMIR. Ekran təzə açılanda (tt kiçik) sürüşmə mənfi
  // olur; eyni göstərici hərəkəti siluetdə gec vaxtdakı (tt = 40) qədər dəyişiklik verməlidir —
  // tamam başqa binalar görünsə, pay təxminən iki dəfə böyük çıxır (düzəlişdən əvvəl 0.41 ↔ 0.20).
  const sky = await page.evaluate(() => {
    const s = window.__cg, keep = { a: { ...s.aim }, p: { ...s.pointer } };
    const grab = (tt, px) => { s.aim.x = s.pointer.x = px; s._draw(tt, 0); return s.cx.getImageData(0, 100, 290, 78).data; };
    const d = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++; return +(n / (a.length / 4)).toFixed(3); };
    const early = d(grab(0.1, 0.5), grab(0.1, 0.3)), late = d(grab(40, 0.5), grab(40, 0.3));
    Object.assign(s.aim, keep.a); Object.assign(s.pointer, keep.p);
    return { early, late };
  });
  console.log('siluet: sola hərəkətdə dəyişən piksel payı', JSON.stringify(sky));
  expect(sky.early, 'sola hərəkətdə siluet tullanmır').toBeLessThan(sky.late + 0.06);
  // baxış: kursor solda → sol kadr, sağda → sağ kadr (göz yamağının piksellərindən)
  const eyeSig = () => page.evaluate(() => { const s = window.__cg; const hx = Math.round(300 - (s.pointer.x - 0.5) * 8);   /* yumşaldılmış göstərici */ return Array.from(s.cx.getImageData(hx + 64, 62 + 56, 12, 3).data).join(','); });
  await page.mouse.move(120, 450); await page.waitForTimeout(900);
  const left = await page.evaluate(() => window.__cg.blink) ? null : await eyeSig();
  await page.mouse.move(1420, 450); await page.waitForTimeout(900);
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

// KİÇİK TELEFONLAR: alçaq landşaft ekranlarda (740×340, 667×375) üst nişan və son düymə kəsilirdi.
// Menyu bloku bütöv ekranın içində qalmalıdır; şaquli tutanda "telefonu yana çevir" ekranı çıxır.
test('carmageddon: kiçik telefon ekranlarında menyu kəsilmir', async ({ browser }) => {
  test.setTimeout(180_000);
  for (const [w, h, lang] of [[740, 340, 'az'], [740, 340, 'ru'], [667, 375, 'ru'], [640, 320, 'tr'], [915, 412, 'en']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await boot(page, { lang });
    await page.evaluate(() => window.__menu.onOpenGame('carmageddon'));
    await page.waitForSelector('.cg.is-ready', { timeout: 30_000 });
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const box = (e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
      const ui = box(document.querySelector('.cg__ui'));
      const btns = [...document.querySelectorAll('.cg__btn')].map(box);
      const foot = document.querySelector('.cg__foot'), fb = foot.getBoundingClientRect();
      const last = document.querySelectorAll('.cg__btn')[2].getBoundingClientRect();
      return { ui, btnMin: Math.min(...btns.map((b) => b.h)), footOverlap: fb.height > 0 && fb.top < last.bottom && fb.bottom > last.top, H: innerHeight };
    });
    console.log(`${w}×${h} ${lang}`, JSON.stringify(r));
    if (lang === 'ru' && w === 667) await page.screenshot({ path: path.join(DIR, 'm-small-ru.png') });
    expect([w, h, lang, r.ui.top >= 0], 'menyunun üstü ekrandadır').toEqual([w, h, lang, true]);
    expect([w, h, lang, r.ui.bottom <= r.H], 'menyunun altı ekrandadır').toEqual([w, h, lang, true]);
    expect(r.footOverlap, 'altbilgi düymənin üstünə düşmür').toBe(false);
    expect(r.btnMin, 'düymələr toxunmaq üçün kifayət qədər hündürdür').toBeGreaterThanOrEqual(30);
    await ctx.close();
  }
  // şaquli: oyun landşaftdır — "telefonu yana çevir" ekranı Carmageddon-un da üstündə görünür
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await boot(page);
  await page.evaluate(() => window.__menu.onOpenGame('carmageddon'));
  await page.waitForSelector('.cg.is-ready', { timeout: 30_000 });
  const top = await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('#rotate-hint') != null);
  expect(top, 'şaquli tutanda "yana çevir" ekranı üstdədir').toBe(true);
  await ctx.close();
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
