// CARMAGEDDON Fəsil 1 — FİNAL: mahnı son səhnənin əvvəlində başlayır, təhkiyə özü irəliləyir, yekun
// yazıları (başlıq → müəlliflər → Hearth-in xatirəsinə → altı ad → təşəkkür) mahnının qalan vaxtına
// görə vaxtlanır; sonda başlıq ekranı və təmiz yaddaş. Telefonda yazılar ekrana sığır.
import { test, expect } from '@playwright/test';
import path from 'path';
import { boot, OUT, ensureDir } from './helpers.js';

const DIR = ensureDir(path.join(OUT, 'carmageddon'));
const toFinale = async (page) => {
  await page.evaluate(() => { localStorage.setItem('cgCh1', JSON.stringify({ stage: 'chase', sec: 4, q: {}, got: [], seen: [] })); window.__menu.onOpenGame('carmageddon'); });
  await page.waitForSelector('.cg.is-ready', { timeout: 30_000 });
  await page.locator('[data-cg="story"]').click();
  await page.waitForSelector('.cgs.is-ready', { timeout: 20_000 });
  await page.locator('.cgs__card').click({ timeout: 10_000 }).catch(() => {});
  await page.waitForFunction(() => !!window.__cgStory?._chase?.G, null, { timeout: 15_000 });
  await page.evaluate(() => window.__cgStory._chase.skip());            // son hissəni ötür
  await page.waitForFunction(() => !!window.__cgStory?._finale, null, { timeout: 15_000 });
};

test('final: mahnı, özü irəliləyən son səhnə, yekun yazıları, təşəkkür', async ({ page }) => {
  test.setTimeout(240_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await page.evaluate(() => { localStorage.setItem('apexMuted', '0'); });
  await page.mouse.click(5, 5);                                         // səs kilidi açılsın
  await toFinale(page);
  // 1) son səhnə özü irəliləyir (heç bir klik etmirik)
  await page.waitForFunction(() => !window.__cgStory.dlg.el.hidden, null, { timeout: 12_000 });
  const first = await page.evaluate(() => window.__cgStory.dlg.full);
  await page.waitForFunction((f) => window.__cgStory.dlg.full !== f, first, { timeout: 25_000 });
  const song = await page.evaluate(() => ({ playing: window.__cgStory._finale.playing, total: Math.round(window.__cgStory._finale.total()), silent: window.__cgStory.dlg.silent }));
  console.log('mahnı:', JSON.stringify(song));
  expect(song.total, 'mahnının uzunluğu').toBe(106);
  expect(song.silent, 'mahnının üstündə mırıltı yoxdur').toBe(true);
  // qalan sətirləri tezləşdir (kliklə keçmək də olur)
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!document.querySelector('.cgf'))); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(60); }
  // 2) başlıq
  await page.waitForSelector('.cgf__title.is-on', { timeout: 15_000 });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(DIR, 'finale-title.png') });
  expect(await page.locator('.cgf__title').textContent()).toContain('CARMAGEDDON');
  // 3) yekun yazıları: müəllif, xatirə, altı ad; müddət mahnıya görə
  await page.waitForSelector('.cgf__roll.is-on', { timeout: 15_000 });
  const roll = await page.evaluate(() => { const st = window.__cgStory._finale, r = document.querySelector('.cgf__in'); return { dur: parseFloat(r.style.animationDuration), left: st.total() - st.elapsed(), text: r.textContent }; });
  console.log('yekun yazıları:', JSON.stringify({ dur: roll.dur, left: Math.round(roll.left) }));
  expect(roll.dur).toBeGreaterThanOrEqual(30); expect(roll.dur).toBeLessThanOrEqual(70);
  expect(Math.abs(roll.dur + 9 - roll.left), 'yazılar mahnının sonuna hesablanıb').toBeLessThan(6);
  for (const s of ['Samir Abbasov', 'HEÇ KİM BİLMİR', 'Hearth-in xatirəsinə', 'Milo', 'Old Gus', 'Altı ad qalır', 'Butcher', 'Ember qayıdacaq']) expect(roll.text).toContain(s);
  await page.waitForTimeout(Math.min(14_000, roll.dur * 300));
  await page.screenshot({ path: path.join(DIR, 'finale-roll.png') });
  // 4) təşəkkür kartı (yazıları gözləmədən: iki kliklə ötürmək olur)
  await page.locator('.cgf').click(); await page.locator('.cgf').click();
  await page.waitForSelector('.cgf__thanks.is-on', { timeout: 10_000 });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(DIR, 'finale-thanks.png') });
  expect(await page.locator('.cgf__thanks').textContent()).toContain('Oynadığınız üçün təşəkkür edirik');
  await page.locator('.cgf__thanks').click();
  await expect(page.locator('.cgs')).toHaveCount(0, { timeout: 15_000 });
  expect(await page.evaluate(() => localStorage.getItem('cgCh1')), 'fəsil bitdi — yaddaş təmizdir').toBeNull();
  await expect(page.locator('[data-cg="new"]')).toBeHidden();
  expect(errs).toEqual([]);
});

test('final telefonda: yazılar ekrana sığır (4 dil)', async ({ browser }) => {
  test.setTimeout(240_000);
  for (const lang of ['az', 'en', 'ru', 'tr']) {
    const ctx = await browser.newContext({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await boot(page, { lang });
    await toFinale(page);
    for (let i = 0; i < 80 && !(await page.evaluate(() => !!document.querySelector('.cgf'))); i++) { await page.touchscreen.tap(330, 200); await page.waitForTimeout(70); }
    await page.waitForSelector('.cgf__title.is-on', { timeout: 15_000 });
    const fitT = await page.evaluate(() => [...document.querySelectorAll('.cgf__title > *')].every((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
    expect([lang, fitT], 'başlıq sığır').toEqual([lang, true]);
    await page.waitForSelector('.cgf__roll.is-on', { timeout: 15_000 });
    const wide = await page.evaluate(() => [...document.querySelectorAll('.cgf__in p, .cgf__in h5')].filter((e) => { const r = e.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth; }).map((e) => e.textContent.slice(0, 30)));
    expect([lang, wide], 'heç bir sətir yandan kəsilmir').toEqual([lang, []]);
    await page.touchscreen.tap(330, 200); await page.waitForTimeout(150); await page.touchscreen.tap(330, 200);
    await page.waitForSelector('.cgf__thanks.is-on', { timeout: 10_000 });
    const fitK = await page.evaluate(() => [...document.querySelectorAll('.cgf__thanks > *')].every((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
    expect([lang, fitK], 'təşəkkür kartı sığır').toEqual([lang, true]);
    if (lang === 'ru') await page.screenshot({ path: path.join(DIR, 'finale-m-ru.png') });
    await ctx.close();
  }
});
