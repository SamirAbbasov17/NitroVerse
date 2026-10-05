import { test, expect } from '@playwright/test';
import { MODES, boot, startMode, drive, memoryInfo, writeJson } from './helpers.js';

// Səhnələr arasında dövr edir; hər dövrdən sonra menyuya qayıdıb GPU yaddaş
// sayğaclarını oxuyur. Sızma yoxdursa dəyərlər plato tutmalıdır.
test('leak: 18 səhnə dövründə tekstura və geometriya platosu', async ({ page }) => {
  test.setTimeout(300_000);
  await boot(page);
  const cycle = ['race-desert', 'zen', 'football', 'arena', 'race-neon', 'race-zavod'];
  const samples = [];
  for (let i = 0; i < cycle.length * 3; i++) {
    const m = MODES.find((x) => x.name === cycle[i % cycle.length]);
    await startMode(page, m.config);
    await drive(page, 3000);
    // Menyuya oyunun öz yolu ilə qayıt (səhifə yenilənmir — dispose yolu yoxlanır)
    await page.evaluate(() => window.__active.onQuit());
    await page.waitForFunction(() => window.__active === window.__showcase);
    await page.waitForTimeout(800);
    samples.push({ i, mode: m.name, ...(await memoryInfo(page)) });
  }
  writeJson('leak.json', samples);
  console.table(samples);
  // 1-ci tur keşləri doldurur (paylaşılan tekstura/model) — sızma 2-ci və 3-cü
  // turun müqayisəsində görünür: eyni rejimlər, sayğac artmamalıdır.
  const n = cycle.length;
  const round2 = samples.slice(n, n * 2);
  const round3 = samples.slice(n * 2, n * 3);
  const max = (arr, k) => Math.max(...arr.map((x) => x[k]));
  expect(max(round3, 'textures'), 'tekstura sayı turdan-tura artmamalıdır').toBeLessThanOrEqual(max(round2, 'textures') + 2);
  expect(max(round3, 'geometries'), 'geometriya sayı turdan-tura artmamalıdır').toBeLessThanOrEqual(max(round2, 'geometries') + 6);
});
