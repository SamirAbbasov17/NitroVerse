import path from 'node:path';
import { test } from '@playwright/test';
import { MODES, OUT, boot, startMode, drive, ensureDir } from './helpers.js';

// Kadr toplayıcı — heç nə təsdiqləmir, yalnız baxmaq üçün material yaradır.
// Kadrlara BAXMADAN vizual iş "hazır" sayılmır (docs/TESTING.md).
const DIR = ensureDir(path.join(OUT, 'shots'));
const shot = (page, name) => page.screenshot({ path: path.join(DIR, `${name}.png`) });

const MOBILE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

test.describe('masaüstü oyun kadrları', () => {
  for (const m of MODES) {
    test(`shots: ${m.name}`, async ({ page }) => {
      await boot(page);
      await startMode(page, m.config);
      await page.waitForTimeout(1500);
      await shot(page, `d-${m.name}-0start`);
      await drive(page, 8000);
      await shot(page, `d-${m.name}-1drive`);
      await page.waitForTimeout(7000);
      await shot(page, `d-${m.name}-2later`);
      await page.waitForTimeout(8000);
      await shot(page, `d-${m.name}-3later`);
    });
  }

  test('shots: zen günün vaxtları', async ({ page }) => {
    await boot(page);
    await startMode(page, MODES.find((m) => m.name === 'zen').config);
    await drive(page, 4000);
    for (const tod of ['dawn', 'day', 'dusk', 'night']) {
      await page.evaluate((id) => window.__active._setDayTime(id), tod);
      await page.waitForTimeout(6000); // keçid ~3.5 s
      await shot(page, `d-zen-tod-${tod}`);
    }
  });

  test('shots: pauza menyusu (yarış)', async ({ page }) => {
    await boot(page);
    await startMode(page, MODES[0].config);
    await drive(page, 5000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await shot(page, 'd-race-pause');
  });
});

// Menyu ekranları — hər biri masaüstü və mobil ölçüdə.
const SCREENS = [
  ['modes', (m) => m.showModes()],
  ['tracks', (m) => { m.sel.mode = 'race'; m.showTracks(); }],
  ['cars', (m) => { m.sel.mode = 'race'; m.showCars(); }],
  ['garage', (m) => m.showGarage()],
  ['cosmetics', (m) => m.showCosmetics()],
  ['online', (m) => m.showOnline()],
  ['auth', (m) => m.showAuth()],
  ['signup', (m) => m.showSignup()],
  ['bugreport', (m) => m.showBugReport()],
];

async function menuShots(page, prefix) {
  await boot(page);
  for (const [name, fn] of SCREENS) {
    await page.evaluate(`(${fn.toString()})(window.__menu)`);
    await page.waitForTimeout(900);
    await shot(page, `${prefix}-menu-${name}`);
  }
}

test('shots: menyu ekranları (masaüstü)', async ({ page }) => {
  await menuShots(page, 'd');
});

test.describe('mobil', () => {
  test.use(MOBILE);

  test('shots: menyu ekranları (mobil)', async ({ page }) => {
    await menuShots(page, 'm');
  });

  for (const name of ['race-desert', 'zen', 'football', 'arena']) {
    test(`shots: mobil HUD ${name}`, async ({ page }) => {
      await boot(page);
      await startMode(page, MODES.find((m) => m.name === name).config);
      await drive(page, 7000);
      await shot(page, `m-${name}-hud`);
    });
  }
});
