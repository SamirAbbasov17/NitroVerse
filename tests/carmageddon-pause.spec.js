// CARMAGEDDON Fəsil 1 — FASİLƏ və yaddaş nöqtələri. Yoxlanır: Esc / künc düyməsi fasilə pəncərəsini açır;
// fasilədə klaviatura səhnəyə çatmır (dialoq keçmir, maşın getmir); "Davam et" qaytarır; "Başlıq ekranı"
// çıxarır (telefonda hekayədən çıxışın yeganə yolu); axtarışdan sonrakı 'found' mərhələsi axtarışı təkrar
// oynatmır; pəncərə fokusdan çıxanda basılı sükan ilişib qalmır.
import { test, expect } from '@playwright/test';
import path from 'path';
import { boot, OUT, ensureDir } from './helpers.js';

const DIR = ensureDir(path.join(OUT, 'carmageddon'));
const open = async (page, save) => {
  await page.evaluate((s) => { if (s) localStorage.setItem('cgCh1', JSON.stringify(s)); else localStorage.removeItem('cgCh1'); window.__menu.onOpenGame('carmageddon'); }, save);
  await page.waitForSelector('.cg.is-ready', { timeout: 30_000 });
  await page.locator('[data-cg="story"]').click();
  await page.waitForSelector('.cgs.is-ready', { timeout: 20_000 });
};

test('fasilə: dialoqda və qaçışda dayandırır, davam etdirir, başlıq ekranına çıxarır', async ({ page }) => {
  test.setTimeout(120_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await open(page, null);
  await page.waitForSelector('.cgd:not([hidden])', { timeout: 10_000 });
  await page.locator('.cgd').click();                                   // ilk sətir tam yazıldı
  const line = await page.evaluate(() => window.__cgStory.dlg.full);
  // Esc → fasilə; Enter dialoqu KEÇİRMİR
  await page.keyboard.press('Escape');
  await expect(page.locator('.cgs__pause')).toBeVisible();
  await page.screenshot({ path: path.join(DIR, 'pause.png') });
  // böyük hərflər Azərbaycan qaydası ilə: i → İ (əvvəl "FASILƏ" çıxırdı — yarı ingiliscə görünürdü)
  expect(await page.evaluate(() => [document.documentElement.lang, document.querySelector('.cgs__pause b').innerText]), 'böyük hərf çevrilməsi').toEqual(['az', 'FASİLƏ']);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__cgStory.dlg.full), 'fasilədə dialoq yerində qalır').toBe(line);
  // Esc yenə → davam
  await page.keyboard.press('Escape');
  await expect(page.locator('.cgs__pause')).toBeHidden();
  await page.keyboard.press('Enter');
  await page.waitForFunction((f) => window.__cgStory.dlg.full !== f, line, { timeout: 5000 });
  // künc düyməsi → "Başlıq ekranı"
  await page.locator('.cgs__menu').click();
  await expect(page.locator('.cgs__pause')).toBeVisible();
  await page.locator('[data-cgp="title"]').click();
  await expect(page.locator('.cgs')).toHaveCount(0, { timeout: 8000 });

  // qaçış: fasilədə maşın getmir, yanacaq azalmır; fokus itəndə düymələr buraxılır
  await page.evaluate(() => { localStorage.setItem('cgCh1', JSON.stringify({ stage: 'chase', sec: 0, q: {}, got: [], seen: [] })); });
  await page.locator('[data-cg="story"]').click();
  await page.waitForSelector('.cgs.is-ready', { timeout: 20_000 });
  await page.locator('.cgs__card').click({ timeout: 10_000 }).catch(() => {});
  await page.waitForFunction(() => !!window.__cgStory?._chase?.G, null, { timeout: 15_000 });
  await page.evaluate(() => { window.__cgStory._chase.G.ents.length = 0; });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  const a = await page.evaluate(() => { const c = window.__cgStory._chase; return { d: c.G.d, fuel: c.G.fuel, keys: c.keys.size }; });
  await page.waitForTimeout(700);
  const b = await page.evaluate(() => { const c = window.__cgStory._chase; return { d: c.G.d, fuel: c.G.fuel, keys: c.keys.size }; });
  expect(a.keys, 'fasilədə sükan buraxılır').toBe(0);
  expect([b.d, b.fuel], 'fasilədə qaçış donur').toEqual([a.d, a.fuel]);
  await page.keyboard.up('ArrowRight');
  await page.locator('[data-cgp="resume"]').click();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__cgStory._chase.G.d), 'davam edəndə qaçış gedir').toBeGreaterThan(b.d + 20);
  await page.evaluate(() => { window.__cgStory._chase.keys.add('left'); window.dispatchEvent(new Event('blur')); });
  expect(await page.evaluate(() => window.__cgStory._chase.keys.size), 'fokus itəndə düymələr buraxılır').toBe(0);
  expect(errs).toEqual([]);
});

test('yaddaş: axtarış keçildikdən sonra çıxıb qayıdan onu təkrar oynamır', async ({ page }) => {
  test.setTimeout(90_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await open(page, { stage: 'found', q: {}, got: [], seen: [] });
  await expect(page.locator('[data-cg="story"]')).toHaveCount(1);
  await page.locator('.cgs__card').click({ timeout: 10_000 }).catch(() => {});
  await page.waitForFunction(() => /Onu baqqinin yanında tapdı/.test(window.__cgStory?.dlg?.full || ''), null, { timeout: 15_000 });
  expect(await page.evaluate(() => !!window.__cgStory.world), 'axtarış səhnəsi açılmadı').toBe(false);
  expect(errs).toEqual([]);
});

test('fasilə telefonda: düymə görünür, pəncərə ekrana sığır (4 dil)', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const lang of ['az', 'en', 'ru', 'tr']) {
    const ctx = await browser.newContext({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await boot(page, { lang });
    await open(page, { stage: 'camp', q: {}, got: [], seen: [] });
    await page.waitForFunction(() => !!window.__cgStory?.world, null, { timeout: 20_000 });
    const btn = await page.locator('.cgs__menu').boundingBox();
    expect(btn.width >= 34 && btn.height >= 34 && btn.x + btn.width <= 667 && btn.y >= 0, `${lang}: fasilə düyməsi əlçatandır`).toBe(true);
    await page.locator('.cgs__menu').tap();
    await expect(page.locator('.cgs__pause')).toBeVisible();
    const fit = await page.evaluate(() => { const r = document.querySelector('.cgs__pause > div').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && [...document.querySelectorAll('.cgs__pause button')].every((b) => b.getBoundingClientRect().height >= 40 && b.scrollWidth <= b.clientWidth + 1); });
    expect(fit, `${lang}: pəncərə sığır, düymələr iridir`).toBe(true);
    if (lang === 'ru') await page.screenshot({ path: path.join(DIR, 'pause-m-ru.png') });
    // fasilədə dünya donur
    await page.touchscreen.tap(120, 200);
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => { const w = window.__cgStory.world; return [w.goal, w.paused]; }), `${lang}: fasilədə toxunuş Ember-i yeritmir`).toEqual([null, true]);
    await page.locator('[data-cgp="resume"]').tap();
    await expect(page.locator('.cgs__pause')).toBeHidden();
    await page.locator('.cgs__menu').tap();
    await page.locator('[data-cgp="title"]').tap();
    await expect(page.locator('.cgs')).toHaveCount(0, { timeout: 8000 });
    await ctx.close();
  }
});
