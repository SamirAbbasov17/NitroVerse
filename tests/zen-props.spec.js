// Zen: yol kənarı obyektlərinin YAXIN PLAN kadrları (vizual audit aləti — nəticəyə Read ilə baxılır).
// Hər biomda toqquşma siyahısındakı obyektlərdən (dekor, yoldaş daş/kol, kənd, şəhər, nişan…) nümunələr
// seçilir, dünya dondurulur və kamera hər birinə yoldan baxır. Kadrlar: tests/out/zen-props/.
import { test } from '@playwright/test';
import path from 'path';
import { boot, startMode, autopilot, MODES, ensureDir, OUT } from './helpers.js';

const DIR = ensureDir(path.join(OUT, 'zen-props'));
const BIOMES = ['desert', 'alpine', 'coast', 'canyon', 'snow'];

for (const [bi, biome] of BIOMES.entries()) {
  test(`zen obyektləri: ${biome}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 640, height: 360 });
    await boot(page);
    await startMode(page, MODES.find((m) => m.name === 'zen').config);
    await page.evaluate((k) => { const sc = window.__active; sc._setDayTime('day'); sc._biomeOverride = k; }, bi);
    await autopilot(page, true);
    await page.waitForTimeout(26_000);   // biom keçidi + yeni hissələr (köhnə biomun hissələri arxada qalsın)
    await autopilot(page, false);
    const picks = await page.evaluate(() => {
      const sc = window.__active, rd = sc.road, car = sc.playerCar.position;
      const ahead = rd.obstacles.filter((o) => Math.hypot(o.x - car.x, o.z - car.z) < 420);
      const by = {};
      for (const o of ahead) (by[o.kind] = by[o.kind] || []).push(o);
      const out = [];
      for (const [kind, list] of Object.entries(by)) {
        const n = kind === 'decor' ? 10 : kind === 'companion' ? 4 : 2;
        const step = Math.max(1, Math.floor(list.length / n));
        for (let i = 0; i < list.length && out.filter((p) => p.kind === kind).length < n; i += step) out.push({ kind, x: list[i].x, z: list[i].z, r: list[i].r || 1 });
      }
      sc.__upd = sc.update;
      return out;
    });
    let n = 0;
    for (const p of picks) {
      await page.evaluate((o) => {
        const sc = window.__active, rd = sc.road;
        const near = rd.getNearest({ x: o.x, y: 0, z: o.z });
        const i = Math.max(0, Math.min(rd.points.length - 1, near.index - rd.base));
        const c = rd.points[i];
        const dx = c.x - o.x, dz = c.z - o.z, d = Math.hypot(dx, dz) || 1;
        const dist = Math.max(9, o.r * 5);
        sc.update = () => {
          sc.__upd.call(sc, 0);
          sc.camera.position.set(o.x + (dx / d) * dist + (dz / d) * dist * 0.35, c.y + 3.2 + o.r, o.z + (dz / d) * dist - (dx / d) * dist * 0.35);
          sc.camera.up.set(0, 1, 0);   // döngə meyli kadrı əyməsin
          sc.camera.lookAt(o.x, c.y + 1.2 + o.r * 0.6, o.z);
        };
      }, p);
      await page.waitForTimeout(260);
      await page.screenshot({ path: path.join(DIR, `${biome}-${String(n++).padStart(2, '0')}-${p.kind}.png`) });
    }
    console.log(biome, picks.length, 'kadr:', [...new Set(picks.map((p) => p.kind))].join(','));
  });
}
