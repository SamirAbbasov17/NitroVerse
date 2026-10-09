// CARMAGEDDON Fəsil 1 (demo): proloq + dialoq. Yoxlanır: mətn hərf-hərf yazılır; klik yazını DƏRHAL
// tamamlayır, növbəti klik keçir; portret və ad danışana görə dəyişir; "Keç" səhnəni ötürür; sonda
// başlıq ekranı qayıdır; telefonda dialoq qutusu ekrana sığır.
import { test, expect } from '@playwright/test';
import path from 'path';
import { boot, OUT, ensureDir } from './helpers.js';

const DIR = ensureDir(path.join(OUT, 'carmageddon'));
const open = async (page) => {
  await page.evaluate(() => window.__menu.onOpenGame('carmageddon'));
  await page.waitForSelector('.cg.is-ready', { timeout: 30_000 });
  await page.locator('[data-cg="story"]').click();
  await page.waitForSelector('.cgs.is-ready', { timeout: 20_000 });
  await page.waitForSelector('.cgd:not([hidden])', { timeout: 10_000 });
};
const state = (page) => page.evaluate(() => { const d = window.__cgStory.dlg; return { n: d.n, len: d.full.length, typing: d.typing, name: d.nameEl.textContent, shown: d.shown.textContent, face: !d.faceBox.hidden }; });

test('hekayə: yazı, kliklə tamamlama və keçid, portret, sonda başlıq ekranı', async ({ page }) => {
  test.setTimeout(180_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await open(page);
  // 1) hərf-hərf yazılır
  const a = await state(page);
  await page.waitForTimeout(250);
  const b = await state(page);
  expect(a.typing, 'yazı gedir').toBe(true);
  expect(b.n, 'hərflər artır').toBeGreaterThan(a.n);
  expect(b.n, 'amma hələ bitməyib').toBeLessThan(b.len);
  expect(b.face, 'proloqda portret yoxdur').toBe(false);
  // 2) klik DƏRHAL tamamlayır (keçmir)
  await page.locator('.cgd').click();
  const c = await state(page);
  expect([c.typing, c.n === c.len, c.shown === (await page.evaluate(() => window.__cgStory.dlg.full))], 'klik yazını tamamladı').toEqual([false, true, true]);
  const first = c.shown;
  // 3) növbəti klik keçir
  await page.locator('.cgd').click();
  await page.waitForFunction((f) => window.__cgStory.dlg.full !== f, first, { timeout: 5000 });   // kadr dəyişirsə qısa qaralma olur
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(DIR, 'story-prologue.png') });
  // 4) proloqu ötür → fəsil kartı → dialoq: ad və portret danışana görə
  await page.locator('.cgs__skip').click();
  await page.waitForFunction(() => window.__cgStory.dlg.nameEl.textContent === 'Milo', null, { timeout: 15_000 });
  const m = await state(page);
  expect(m.face, 'dialoqda portret var').toBe(true);
  await page.keyboard.press('Enter');                 // tamamla
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(DIR, 'story-milo.png') });
  await page.keyboard.press('Enter');                 // keç
  await page.waitForFunction(() => window.__cgStory.dlg.nameEl.textContent === 'Ember', null, { timeout: 5000 });
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(DIR, 'story-ember.png') });
  // 5) bütün dialoqu kliklə keç → son kart → başlıq ekranı
  for (let i = 0; i < 80 && (await page.locator('.cgd:not([hidden])').count()); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(40); }
  await page.waitForSelector('.cgs__card:not([hidden])', { timeout: 10_000 });
  await page.locator('.cgs__card').click();
  await expect(page.locator('.cgs')).toHaveCount(0, { timeout: 8000 });
  await expect(page.locator('.cg__btn.is-selected')).toBeVisible();
  expect(errs).toEqual([]);
});

test('hekayə: telefonda dialoq qutusu sığır (ən uzun sətir)', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const [w, h] of [[844, 390], [667, 375], [740, 340]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await boot(page);
    await open(page);
    // ən uzun sətri birbaşa göstər
    const r = await page.evaluate(async () => {
      const s = window.__cgStory, d = s.dlg;
      d.say({ who: 'ember', emo: 'side', text: 'Mənsiz başlamır, çünki sonuncu dəfə sən "kömək edəndə" sükan arxa oturacaqdan çıxdı.' });
      d.advance();
      await new Promise((q) => requestAnimationFrame(q));
      const b = d.box.getBoundingClientRect(), tx = d.el.querySelector('.cgd__text').getBoundingClientRect(), sk = document.querySelector('.cgs__skip').getBoundingClientRect();
      return { box: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)], textInBox: tx.bottom <= b.bottom + 1 && tx.right <= b.right + 1, skipH: Math.round(sk.height), W: innerWidth, H: innerHeight };
    });
    console.log(`${w}×${h}`, JSON.stringify(r));
    if (w === 667) await page.screenshot({ path: path.join(DIR, 'story-m-667.png') });
    expect(r.box[0] >= 0 && r.box[2] <= r.W && r.box[3] <= r.H && r.box[1] >= 0, 'qutu ekrandadır').toBe(true);
    expect(r.textInBox, 'mətn qutuya sığır').toBe(true);
    expect(r.skipH).toBeGreaterThanOrEqual(34);
    await ctx.close();
  }
});
