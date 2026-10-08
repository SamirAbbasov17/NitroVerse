// Bildiriş zolağı: dalbadal çoxlu bildiriş çıxanda səhifə donmur, yığın 3-dən böyümür.
// (Buq: 4-cü fərqli bildirişdə `while (children.length > 3)` sonsuz dövrə düşürdü — bağlı
//  maşınlara dalbadal toxunan qonaq oyunçuda oyun "çökürdü".)
import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

test('bildirişlər: 4+ bağlı maşına dalbadal toxunuş səhifəni dondurmur', async ({ page }) => {
  test.setTimeout(90_000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await boot(page, { lang: 'az' });
  await page.evaluate(() => window.__menu.showCars());
  const locked = page.locator('.mrow--car.is-locked');
  const n = await locked.count();
  expect(n, 'qonaqda bağlı maşın var').toBeGreaterThan(4);
  for (let i = 0; i < 6; i++) await locked.nth(i).click({ timeout: 5000 });
  // səhifə cavab verir (sonsuz dövrdə evaluate geri qayıtmır)
  const live = await page.evaluate(() => [...document.querySelectorAll('.notices .notice')].filter((c) => !c._out).length);
  expect(live, 'ekranda ən çox 3 bildiriş').toBe(3);
  await page.waitForTimeout(400);
  expect(await page.locator('.notices .notice').count(), 'köhnələr DOM-dan silindi').toBe(3);
  // eyni əşyaya təkrar toxunuş yeni bildiriş yaratmır
  await locked.nth(5).click();
  expect(await page.locator('.notices .notice').count()).toBe(3);
  expect(errs).toEqual([]);
});
