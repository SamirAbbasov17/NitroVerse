// Yağışlı trek (Payız Meşəsi): sürət xətləri yağışla QARIŞMIR. Yağışda sürət xətləri çəkilmir;
// sürət hissini yağış özü verir — sürət artdıqca damcılar kameraya doğru əyilir və uzanır.
import { test, expect } from '@playwright/test';
import path from 'path';
import { boot, startMode, autopilot, OUT, ensureDir } from './helpers.js';

test('yağışlı trek: sürət xətləri yoxdur, yağış sürətlə əyilir', async ({ page }) => {
  test.setTimeout(180_000);
  await boot(page);
  await startMode(page, { mode: 'race', trackId: 'autumn', carId: 'blaze', laps: 3, difficulty: 'normal' });
  await page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30_000 });
  // damcının orta uzunluğu və üfüqi (yerə paralel) payı — yağış geometriyasından
  const streak = () => page.evaluate(() => {
    const w = window.__active.weather, a = w.pos; let len = 0, hor = 0; const n = a.length / 6;
    for (let i = 0; i < n; i++) { const k = i * 6, dx = a[k + 3] - a[k], dy = a[k + 4] - a[k + 1], dz = a[k + 5] - a[k + 2]; len += Math.hypot(dx, dy, dz); hor += Math.hypot(dx, dz); }
    const sc = window.__active;
    return { len: +(len / n).toFixed(2), hor: +(hor / n).toFixed(2), lines: !!sc.speedLines?.lines.visible, kmh: Math.round(sc.playerCar.velocity.length() * 3.6) };
  });
  await page.waitForTimeout(400);
  const rest = await streak();
  await autopilot(page, true);
  await page.waitForFunction(() => { const sc = window.__active, c = sc.playerCar; return c.velocity.length() > (c.maxSpeed || c.data?.maxSpeed || 40) * 0.86; }, null, { timeout: 60_000, polling: 100 }).catch(() => {});
  await page.waitForTimeout(600);
  const fast = await streak();
  await page.screenshot({ path: path.join(ensureDir(path.join(OUT, 'shots')), 'd-race-autumn-rain-speed.png') });
  await autopilot(page, false);
  console.log('yağış:', JSON.stringify({ rest, fast }));
  expect(fast.kmh, 'ölçmə yüksək sürətdə aparılıb').toBeGreaterThan(100);
  expect(fast.lines, 'yağışda sürət xətləri çəkilmir').toBe(false);
  expect(rest.hor, 'dayananda yağış demək olar şaqulidir').toBeLessThan(0.35);
  expect(fast.hor, 'sürətdə damcılar əyilir').toBeGreaterThan(rest.hor + 0.5);
  expect(fast.len, 'və uzanır').toBeGreaterThan(rest.len * 1.25);
});
