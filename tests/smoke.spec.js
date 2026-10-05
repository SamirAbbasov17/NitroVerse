import { test, expect } from '@playwright/test';
import { MODES, boot, startMode, drive, carState, collectErrors } from './helpers.js';

// Hər rejim açılır, 8 saniyə sürülür, konsolda xəta olmamalıdır.
for (const m of MODES) {
  test(`smoke: ${m.name}`, async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);
    await startMode(page, m.config);
    await drive(page, 8000);
    const alive = await page.evaluate(() => {
      const sc = window.__active;
      return !!sc && !!sc.scene && sc.scene.children.length > 0;
    });
    expect(alive, 'səhnə aktiv və dolu olmalıdır').toBe(true);
    const st = await carState(page);
    expect(st?.speed ?? 0, 'maşın hərəkət etməlidir').toBeGreaterThan(3);
    if (m.config.mode === 'race' || m.config.mode === 'free') {
      expect(st.onRoad, 'avtopilot yolda qalmalıdır').toBe(true);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('smoke: menyu açılır və rejim sətirləri görünür', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  for (const id of ['race', 'free', 'football', 'arena', 'online']) {
    await expect(page.locator(`[data-mode="${id}"]`)).toBeVisible();
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
