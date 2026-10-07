import { test, expect } from '@playwright/test';
import { MODES, boot, startMode, autopilot, mergeJson } from './helpers.js';

// ZEN YOLUNUN RİTMİ: yol boyu döngə radiusu zonalara görə ölçülür (sakit / uzun S / serpantin),
// avtopilotun yolda qalması və toqquşmaları sayılır. 'old' = ritmsiz əvvəlki yol.
//   npx playwright test tests/zen-road.spec.js   → tests/out/zen-road.json
for (const variant of ['old', 'new']) {
  test(`zen yolu: ${variant}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript((v) => { try { if (v === 'old') localStorage.setItem('apexZenRoad', 'old'); else localStorage.removeItem('apexZenRoad'); } catch { /* boş */ } }, variant);
    await boot(page);
    await startMode(page, MODES.find((m) => m.name === 'zen').config);
    await page.evaluate(() => {
      const sc = window.__active, road = sc.road;
      const S = (window.__zr = { seen: new Map(), off: 0, n: 0, hits: 0, maxDist: 0 });
      const hit0 = sc.impact.hit.bind(sc.impact);
      sc.impact.hit = (...a) => { S.hits++; return hit0(...a); };
      setInterval(() => {
        const car = sc.playerCar;
        S.n++; if (!car.onRoad) S.off++;
        S.maxDist = Math.max(S.maxDist, sc._odo || 0);
        // pəncərədəki bütün nöqtələrin radiusu (mütləq indeksə görə bir dəfə yazılır)
        const P = road.points;
        for (let i = 1; i < P.length - 1; i++) {
          const abs = road.base + i;
          if (S.seen.has(abs) || abs < 4) continue;
          const a = P[i - 1], b = P[i], c = P[i + 1];
          const h1 = Math.atan2(b.x - a.x, b.z - a.z), h2 = Math.atan2(c.x - b.x, c.z - b.z);
          let d = h2 - h1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          S.seen.set(abs, { r: Math.abs(d) < 1e-4 ? 9999 : 8 / Math.abs(d), kind: road.sectionAt(abs) || 'calm', sign: Math.sign(d) });
        }
      }, 200);
    });
    await autopilot(page, true);
    await page.waitForTimeout(85_000);
    const r = await page.evaluate(() => {
      const S = window.__zr, out = { km: +(S.maxDist / 1000).toFixed(2), offPct: +((100 * S.off) / S.n).toFixed(1), hits: S.hits, zones: {} };
      const by = {};
      for (const [abs, v] of S.seen) { if (abs * 8 > 2700) continue; (by[v.kind] ||= []).push(v); }
      out.sharp = [...S.seen].filter(([abs, v]) => abs * 8 <= 2700 && v.r < 40).map(([abs, v]) => `${abs * 8}:${Math.round(v.r)}`).join(' ');
      for (const [k, list] of Object.entries(by)) {
        const rs = list.map((x) => x.r).sort((a, b) => a - b);
        let flips = 0; for (let i = 1; i < list.length; i++) if (list[i].sign && list[i - 1].sign && list[i].sign !== list[i - 1].sign) flips++;
        out.zones[k] = { m: list.length * 8, minR: Math.round(rs[0]), p10R: Math.round(rs[Math.floor(rs.length * 0.1)]), medR: Math.round(rs[Math.floor(rs.length / 2)]), flips };
      }
      return out;
    });
    mergeJson('zen-road.json', variant, r);
    console.log(variant, JSON.stringify(r));
    if (variant === 'new') {
      expect(r.zones.serp.p10R, 'serpantin: drift tələb edən döngələr (m)').toBeLessThan(60);
      expect(r.zones.serp.minR, 'amma keçilməz deyil (m)').toBeGreaterThan(28);
      expect(r.zones.sweep.p10R, 'uzun S: orta döngələr (m)').toBeLessThan(110);
      expect(r.zones.calm.p10R, 'sakit hissə əvvəlki kimi geniş qalır (m)').toBeGreaterThan(100);
    }
  });
}
