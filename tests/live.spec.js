import { test, expect } from '@playwright/test';
// Canlı saytın tüstü yoxlaması (yalnız oxuyur): menyu açılır, rejimlər başlayır, konsol xətası yoxdur.
//   LIVE_URL=http://<server> npx playwright test tests/live.spec.js   (LIVE_URL verilməsə test ötürülür)
const URL = process.env.LIVE_URL;
test.skip(!URL, 'LIVE_URL verilməyib');
test('canlı: menyu, ayarlar, liderlər, zen və yarış açılır — xətasız', async ({ page }) => {
  test.setTimeout(180_000);
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
  await page.goto(URL);
  await page.waitForSelector('.menu-list .mrow', { timeout: 90_000 });
  expect(await page.locator('.mrow__icon svg.ic').count(), 'rejim ikonları SVG-dir').toBeGreaterThanOrEqual(5);
  await page.click('[data-settings]');
  await expect(page.locator('[data-set-tab]')).toHaveCount(4);
  await page.click('[data-back]');
  await page.click('[data-leaders]');
  await page.waitForSelector('#top-list', { timeout: 10_000 });
  await page.waitForFunction(() => !/…/.test(document.querySelector('#top-list').textContent), null, { timeout: 15_000 });
  const board = await page.locator('#top-list').innerText();
  await page.click('[data-back]');
  // zen
  await page.click('[data-mode="free"]');
  for (let i = 0; i < 4 && !(await page.locator('.ehud').count()); i++) {
    const next = page.locator('.menu-nav .btn--primary');
    if (await next.count()) await next.first().click();
    await page.waitForTimeout(900);
  }
  await page.waitForSelector('.ehud', { timeout: 60_000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'tests/out/live-zen.png' });
  await page.keyboard.press('Escape');
  await page.click('[data-quit]');
  await page.waitForSelector('.menu-list .mrow', { timeout: 30_000 });
  // yarış: rejim → trek → maşın → başla
  await page.click('[data-mode="race"]');
  for (let i = 0; i < 6 && !(await page.locator('.hud').count()); i++) {
    const next = page.locator('.menu-nav .btn--primary');
    if (await next.count()) await next.first().click();
    await page.waitForTimeout(900);
  }
  await page.waitForSelector('.hud', { timeout: 60_000 });
  await page.waitForTimeout(7000);
  await page.screenshot({ path: 'tests/out/live-race.png' });
  console.log(JSON.stringify({ board: board.slice(0, 80), errs }));
  expect(errs).toEqual([]);
});
