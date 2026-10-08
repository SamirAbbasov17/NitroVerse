// Kölgə titrəmir: kölgə kamerasının hədəfi işıq fəzasında tam teksel addımlarındadır və işığın
// istiqaməti kadrlar arasında dəyişmir (yarış, zen). Əks halda maşın hərəkət etdikcə kölgənin kənarı
// hər kadr başqa teksellərə düşür — "maşının altında kölgə oynayır".
import { test, expect } from '@playwright/test';
import { boot, startMode, autopilot, MODES } from './helpers.js';

for (const name of ['race-autumn', 'race-canyon', 'zen']) {
  test(`kölgə sabitdir: ${name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);
    await startMode(page, MODES.find((m) => m.name === name).config);
    await page.evaluate(() => window.__active._setDayTime?.('day'));
    await autopilot(page, true);
    await page.waitForTimeout(6000);
    const r = await page.evaluate(async () => {
      const sc = window.__active, sun = sc.environment?.sun || sc.sun, V = sun.position.constructor;
      const frame = () => new Promise((res) => requestAnimationFrame(res));
      const cam = sun.shadow.camera, tex = (cam.right - cam.left) / sun.shadow.mapSize.x;
      let maxFrac = 0, maxDirChange = 0, prevDir = null, moved = 0, prevT = null;
      for (let i = 0; i < 150; i++) {
        await frame();
        const d = new V().subVectors(sun.position, sun.target.position).normalize();
        const right = new V(0, 1, 0).cross(d).normalize(), up = new V().crossVectors(d, right);
        for (const ax of [right, up]) { const q = sun.target.position.dot(ax) / tex; maxFrac = Math.max(maxFrac, Math.abs(q - Math.round(q))); }
        if (prevDir) maxDirChange = Math.max(maxDirChange, prevDir.angleTo(d));
        if (prevT) moved += prevT.distanceTo(sun.target.position);
        prevDir = d; prevT = sun.target.position.clone();
      }
      return { tex: +tex.toFixed(3), maxFrac: +maxFrac.toFixed(4), maxDirChange: +maxDirChange.toFixed(5), moved: +moved.toFixed(1) };
    });
    console.log(`kölgə ${name}:`, JSON.stringify(r));
    expect(r.moved, 'maşın hərəkət edirdi (ölçmə mənalıdır)').toBeGreaterThan(20);
    expect(r.maxFrac, 'hədəf teksel şəbəkəsindədir').toBeLessThan(0.02);
    expect(r.maxDirChange, 'işığın istiqaməti kadrdan kadra dəyişmir').toBeLessThan(0.002);
  });
}
