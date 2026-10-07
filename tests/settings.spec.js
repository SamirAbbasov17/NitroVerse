import { test, expect } from '@playwright/test';
import path from 'node:path';
import { OUT, boot, ensureDir } from './helpers.js';

// AYARLAR EKRANI (Faza 5.4): hər bölmə açılır, seçim dərhal tətbiq olunur və yadda qalır.
// Kadrlar: tests/out/settings/{d,m}-<bölmə>.png
const DIR = ensureDir(path.join(OUT, 'settings'));
const TABS = ['sound', 'gfx', 'ctl', 'lang'];

// boot() hər yüklənmədə dili az-a qaytarır; dil testində başlanğıc dəyərlər yalnız İLK yüklənmədə yazılır
async function bootOnce(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('nvInit')) return;
    sessionStorage.setItem('nvInit', '1');
    localStorage.setItem('apexLang', 'az');
    localStorage.setItem('apexMuted', '1');
  });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__menu && !!window.__showcase, null, { timeout: 60_000 });
}

test('ayarlar: masaüstü — bölmələr, qrafika və kamera seçimi tətbiq olunur', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page);
  await page.click('[data-settings]');
  await expect(page.locator('.menu-title')).toHaveText('Ayarlar');
  for (const tab of TABS) {
    await page.click(`[data-set-tab="${tab}"]`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(DIR, `d-${tab}.png`) });
  }
  // qrafika: keyfiyyət pilləsi piksel nisbətini dəyişir
  await page.click('[data-set-tab="gfx"]');
  const ratio = () => page.evaluate(() => window.__game.renderer.getPixelRatio());
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  await page.click('[data-q="low"]');
  expect(await ratio()).toBe(Math.min(dpr, 1));
  expect(await page.evaluate(() => localStorage.getItem('apexQuality'))).toBe('low');
  await page.click('[data-q="high"]');
  expect(await ratio()).toBe(Math.min(dpr, 2));
  // cila və sürət effektləri
  const fx = () => page.evaluate(() => ({ post: window.__game.post.enabled, speed: window.__game.post.speedFx, ls: [localStorage.getItem('apexPost'), localStorage.getItem('apexSpeedFx')] }));
  await page.click('[data-tg="speedFx:0"]');
  expect(await fx()).toEqual({ post: true, speed: false, ls: ['1', '0'] });
  await page.click('[data-tg="post:0"]');
  expect((await fx()).post).toBe(false);
  await page.screenshot({ path: path.join(DIR, 'd-gfx-off.png') });
  await page.click('[data-tg="speedFx:1"]');   // sürət effekti cilasız işləmir → cila da açılır
  expect(await fx()).toEqual({ post: true, speed: true, ls: ['1', '1'] });
  // səs sürgüsü
  await page.click('[data-set-tab="sound"]');
  await page.locator('[data-vol="music"]').fill('40');
  expect(await page.evaluate(() => window.__audio.vol.music)).toBeCloseTo(0.4, 2);
  await page.locator('[data-vol="music"]').fill('100');
  // kamera: seçim yarışda işlənir
  await page.click('[data-set-tab="ctl"]');
  await page.click('[data-cam="hood"]');
  await expect(page.locator('[data-cam="hood"]')).toHaveClass(/is-selected/);
  await page.evaluate(() => window.__menu.onStart({ mode: 'race', trackId: 'desert', carId: 'blaze', laps: 3, difficulty: 'normal' }));
  await page.waitForFunction(() => window.__active && window.__active !== window.__showcase && !!window.__active.scene, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__active._camMode)).toBe('hood');
  await page.evaluate(() => localStorage.setItem('apexCamMode', 'tps'));
});

test('ayarlar: dil dəyişəndə oyunçu ayarlara qayıdır', async ({ page }) => {
  test.setTimeout(120_000);
  await bootOnce(page);
  await page.evaluate(() => window.__menu.showSettings('lang'));
  await page.click('[data-l="en"]');
  await page.waitForFunction(() => !!window.__menu && document.querySelector('.menu-title')?.textContent === 'Settings', null, { timeout: 60_000 });
  await expect(page.locator('[data-l="en"]')).toHaveClass(/is-selected/);
  await page.screenshot({ path: path.join(DIR, 'd-lang-en.png') });
  await page.evaluate(() => localStorage.setItem('apexLang', 'az'));
});

test('ayarlar: telefon (844×390) — bölmələr sığır, üfüqi daşma yoxdur', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await bootOnce(page);
  await page.tap('[data-settings]');
  for (const [lang, title] of [['az', 'Ayarlar'], ['ru', 'Настройки'], ['tr', 'Ayarlar'], ['en', 'Settings']]) {
    if (lang !== 'az') {
      await page.tap('[data-set-tab="lang"]');
      await page.tap(`[data-l="${lang}"]`);
      await page.waitForFunction(([l, tt]) => localStorage.getItem('apexLang') === l && !!window.__menu && document.querySelector('.menu-title')?.textContent === tt && !!document.querySelector('[data-set-tab]'), [lang, title], { timeout: 60_000 });
    }
    for (const tab of TABS) {
      await page.tap(`[data-set-tab="${tab}"]`);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(DIR, `m-${lang}-${tab}.png`) });
      const fit = await page.evaluate(() => {
        const panel = document.querySelector('.menu-panel').getBoundingClientRect();
        const bad = [...document.querySelectorAll('.set-tabs *, .set-body *, .menu-nav *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > panel.right + 1 || r.left < panel.left - 1); }).length;
        const nav = document.querySelector('.menu-nav [data-back]').getBoundingClientRect();
        const body = document.querySelector('.set-body');
        return { bad, navVisible: nav.bottom <= window.innerHeight + 1, scroll: body.scrollHeight - body.clientHeight };
      });
      expect([lang, tab, fit.bad, fit.navVisible], 'panel daxilində qalır, Geri görünür').toEqual([lang, tab, 0, true]);
      expect([lang, tab, fit.scroll <= 1], 'sürüşdürmədən sığır').toEqual([lang, tab, true]);
    }
  }
  expect(await page.evaluate(() => document.querySelectorAll('[data-tg]').length), 'telefonda cila açarları göstərilmir').toBe(0);
  await ctx.close();
});
