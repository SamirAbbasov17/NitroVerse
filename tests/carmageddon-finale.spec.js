// CARMAGEDDON Fəsil 1 — FİNAL (sinematik): mahnı ilk kadrla başlayır və çalır; yeddi kadr sıra ilə gedir
// (stansiya → Ember gedir → əl → dizləri üstə → yerdə uzanıb → yuxarıdan → sonsuz çöl), hər kadrda kamera
// hərəkət edir (iki ardıcıl görüntü fərqlidir), alt yazılar özü irəliləyir; sonra başlıq, yekun yazıları (mahnının
// qalan vaxtına görə) və təşəkkür; sonda başlıq ekranı və təmiz yaddaş. Telefonda alt yazı və yazılar sığır.
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
  // 1) sinematik səhnə özü başlayır; mahnı çalır
  await page.waitForSelector('.cgf__cine', { timeout: 12_000 });
  await page.waitForFunction(() => window.__cgStory._finale.state.tc > 2.6, null, { timeout: 15_000 });
  const song = await page.evaluate(() => { const f = window.__cgStory._finale; return { playing: f.playing, total: Math.round(f.total()), ctx: window.__audio?.ctx?.state, cineEnd: +f.cineEnd.toFixed(1), shots: f.plan.map((x) => x.art).join() }; });
  console.log('mahnı və plan:', JSON.stringify(song));
  expect(song.total, 'mahnının uzunluğu').toBe(106);
  expect(song.playing, 'final mahnısı çalır').toBe(true);
  expect(song.shots, 'yeddi kadr sıra ilə').toBe('g1,g2,g3,g4,g5,g6,g7');
  expect(song.cineEnd + 5.4 + 22 + 9, 'səhnə + başlıq + yazılar + təşəkkür mahnıya sığır').toBeLessThanOrEqual(106);
  // 2) hər kadr: şəkil yüklənib, kamera hərəkət edir (0.5 s ara ilə iki görüntü fərqlidir), alt yazı görünür
  const grab = () => page.evaluate(() => { const c = document.querySelector('.cgf__cine'), t = document.createElement('canvas'); t.width = 96; t.height = 54; const x = t.getContext('2d'); x.drawImage(c, 0, 0, 96, 54); return Array.from(x.getImageData(0, 0, 96, 54).data); });
  const seen = [];
  for (let guard = 0; guard < 40; guard++) {
    const st = await page.evaluate(() => window.__cgStory._finale.state);
    if (st.phase !== 'cine') break;
    if (!seen.some((x) => x.shot === st.shot)) {
      await page.waitForTimeout(1500);                                   // əriyib-keçmə bitsin
      const a = await grab(); await page.waitForTimeout(500); const b = await grab();
      let diff = 0, lum = 0; for (let i = 0; i < a.length; i += 4) { if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) diff++; lum += a[i] + a[i + 1] + a[i + 2]; }
      const sub = await page.evaluate(() => { const e = document.querySelector('.cgf__sub'); return { on: e.classList.contains('is-on'), text: e.textContent }; });
      seen.push({ shot: st.shot, moved: diff, lum: Math.round(lum / (a.length / 4)), sub: sub.on && sub.text.length > 10 });
      await page.screenshot({ path: path.join(DIR, `finale-${st.shot}.png`) });
    }
    await page.evaluate(() => window.__cgStory._finale.skip());         // növbəti alt yazıya (klik də eyni işi görür)
    await page.waitForTimeout(250);
  }
  console.log('kadrlar:', JSON.stringify(seen));
  expect(seen.map((x) => x.shot).join(), 'bütün kadrlar göründü').toBe('g1,g2,g3,g4,g5,g6,g7');
  for (const x of seen) { expect(x.lum, `${x.shot}: kadr boş deyil`).toBeGreaterThan(30); expect(x.moved, `${x.shot}: kamera hərəkət edir`).toBeGreaterThan(40); expect(x.sub, `${x.shot}: alt yazı görünür`).toBe(true); }
  // 3) başlıq — son kadrın üstündə
  await page.waitForSelector('.cgf__title.is-on', { timeout: 15_000 });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(DIR, 'finale-title.png') });
  expect(await page.locator('.cgf__title').textContent()).toContain('CARMAGEDDON');
  // 3) yekun yazıları: müəllif, xatirə, altı ad; müddət mahnıya görə
  await page.waitForSelector('.cgf__roll.is-on', { timeout: 15_000 });
  const roll = await page.evaluate(() => { const st = window.__cgStory._finale, r = document.querySelector('.cgf__in'); return { dur: parseFloat(r.style.animationDuration), left: st.total() - st.elapsed(), text: r.textContent }; });
  console.log('yekun yazıları:', JSON.stringify({ dur: roll.dur, left: Math.round(roll.left) }));
  expect(roll.dur).toBeGreaterThanOrEqual(22); expect(roll.dur).toBeLessThanOrEqual(70);
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
    await page.waitForSelector('.cgf__cine', { timeout: 12_000 });
    expect([lang, await page.evaluate(() => window.__cgStory._finale.cineEnd + 5.4 + 22 + 9 <= 106)], 'səhnə mahnıya sığır').toEqual([lang, true]);
    // alt yazılar: hər birini göstər (toxunuş növbətiyə keçirir) və ekrana, geniş ekran zolağından yuxarı sığdığını yoxla
    const subs = [];
    for (let i = 0; i < 40 && !(await page.evaluate(() => document.querySelector('.cgf__title').classList.contains('is-on'))); i++) {
      await page.waitForTimeout(650);
      const r = await page.evaluate(() => { const e = document.querySelector('.cgf__sub'); if (!e.classList.contains('is-on')) return null; const b = e.getBoundingClientRect(), bar = document.querySelector('.cgf__bar--b').getBoundingClientRect(); return { ok: b.left >= 0 && b.right <= innerWidth && b.top >= innerHeight * 0.4 && b.bottom <= bar.top + 2, n: e.textContent.length, h: Math.round(b.height) }; });
      if (r) subs.push(r);
      await page.touchscreen.tap(330, 200);
    }
    expect([lang, subs.length >= 6, subs.filter((x) => !x.ok)], 'alt yazılar sığır').toEqual([lang, true, []]);
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
