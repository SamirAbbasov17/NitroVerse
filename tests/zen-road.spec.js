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
    await page.evaluate(() => { window.__active._trafNextT = 0; });
    if (variant === 'new') {
      // xəbərdarlıq nişanı: serpantindən ~90 m əvvəl, sağda (kadr: zen-sign.png)
      await page.waitForFunction(() => window.__active.playerCar.trackT >= 79, null, { timeout: 60_000 });
      await page.screenshot({ path: 'tests/out/zen-sign.png' });
      const firstSign = await page.evaluate(() => { const rd = window.__active.road; return rd.obstacles.filter((ob) => ob.kind === 'sign').map((ob) => rd.getNearest({ x: ob.x, y: 0, z: ob.z }).index).filter((ix) => ix >= 84 && ix <= 89); });
      expect(firstSign.length, 'ilk serpantindən əvvəl bir nişan').toBe(1);
      // serpantinin kadrı: maşın zonaya girəndən bir az sonra (adi kamera + yuxarıdan baxış)
      await page.waitForFunction(() => { const sc = window.__active; return sc.road.sectionAt(Math.round(sc.playerCar.trackT) + 6) === 'serp'; }, null, { timeout: 60_000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: 'tests/out/zen-serp.png' });
      await page.evaluate(() => {
        const sc = window.__active; sc.__upd = sc._updateCamera; const car = sc.playerCar;
        sc._updateCamera = () => { const h = car.heading; sc.camera.position.set(car.position.x - Math.sin(h) * 40, car.position.y + 150, car.position.z - Math.cos(h) * 40); sc.camera.lookAt(car.position.x + Math.sin(h) * 110, car.position.y, car.position.z + Math.cos(h) * 110); };
      });
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'tests/out/zen-serp-top.png' });
      await page.evaluate(() => { const sc = window.__active; sc._updateCamera = sc.__upd; });
    }
    await page.waitForTimeout(variant === 'new' ? 60_000 : 85_000);
    const r = await page.evaluate(() => {
      const sc0 = window.__active, rd = sc0.road;
      const signs = rd.obstacles.filter((o) => o.kind === 'sign').map((o) => rd.getNearest({ x: o.x, y: 0, z: o.z }).index).filter((ix) => rd.sectionAt(ix + 11) && !rd.sectionAt(ix));
      const S = window.__zr, out = { signs, passes: sc0.passes | 0,  km: +(S.maxDist / 1000).toFixed(2), offPct: +((100 * S.off) / S.n).toFixed(1), hits: S.hits, zones: {} };
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
    expect(r.passes, 'trafikin yanından keçmə tanınır (kamera yellənməsi)').toBeGreaterThan(0);
    if (variant === 'new') {
      expect(r.zones.serp.p10R, 'serpantin: aydın döngələr (m)').toBeLessThan(90);
      expect(r.zones.serp.minR, 'serpantinin ən iti döngəsi (m)').toBeLessThan(75);
      expect(r.zones.serp.minR, 'amma sərt deyil — rahat sürüş (m)').toBeGreaterThan(48);
      expect(r.zones.sweep.p10R, 'uzun S: geniş döngələr (m)').toBeLessThan(150);
      expect(r.zones.sweep.minR, 'uzun S serpantin qədər iti deyil (m)').toBeGreaterThan(70);
      expect(r.zones.calm.p10R, 'sakit hissə əvvəlki kimi geniş qalır (m)').toBeGreaterThan(100);
    }
  });
}

// YOL ÖZÜNƏ YAXINLAŞMIR: generator oyunsuz, ayrıca işlədilir (hər variant üçün 6 yol × 16 km) və yeni
// nöqtələrin pəncərədəki KÖHNƏ nöqtələrə (≥ 40 indeks əvvəl) ən kiçik məsafəsi ölçülür. Yol öz köhnə
// hissəsinin üstündən keçəndə dirəklər/dekor asfaltın üstündə qalır.
test('zen yolu: yol özünə yaxınlaşmır (generator, 6 × 16 km)', async ({ page }) => {
  test.setTimeout(400_000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const { EndlessRoad } = await import('/src/world/EndlessRoad.js');
    const T = window.__THREE;
    const out = {};
    for (const rhythm of [false, true]) {
      const runs = [];
      for (let k = 0; k < 6; k++) {
        const road = new EndlessRoad(new T.Scene(), { rhythm });
        let minD = 1e9, at = 0, seenTip = road.base + road.points.length, turn = 0, maxTurn = 0, h0 = null, kinks = 0, minR = 1e9, zoneMinR = 1e9;
        for (let dist = 0; dist <= 16000; dist += 40) {
          road.ensure(dist);
          const P = road.points, tip = road.base + P.length;
          for (let a = Math.max(seenTip, road.base + 41); a < tip; a++) {
            const p = P[a - road.base];
            for (let q = 0; q < a - road.base - 40; q++) {
              const d = Math.hypot(P[q].x - p.x, P[q].z - p.z);
              if (d < minD) { minD = d; at = a * 8; }
            }
            if (a - road.base >= 1) {
              const pp = P[a - road.base - 1]; const h = Math.atan2(p.x - pp.x, p.z - pp.z);
              if (h0 != null) {
                let dd = h - h0; while (dd > Math.PI) dd -= 2 * Math.PI; while (dd < -Math.PI) dd += 2 * Math.PI; turn += dd; maxTurn = Math.max(maxTurn, Math.abs(turn));
                const R = Math.abs(dd) < 1e-4 ? 9999 : 8 / Math.abs(dd);
                if (road.sectionAt(a)) zoneMinR = Math.min(zoneMinR, R); else { minR = Math.min(minR, R); if (R < 40) kinks++; }
              }
              h0 = h;
            }
          }
          seenTip = tip;
          if (dist % 400 === 0) await new Promise((res) => setTimeout(res, 0));
        }
        road.dispose?.();
        runs.push({ minD: Math.round(minD), atM: at, maxTurnDeg: Math.round(maxTurn * 180 / Math.PI), kinks, calmMinR: Math.round(minR), zoneMinR: Math.round(zoneMinR) });
      }
      out[rhythm ? 'new' : 'old'] = runs;
    }
    return out;
  });
  mergeJson('zen-road.json', 'selfDistance', r);
  for (const k of ['old', 'new']) console.log(k, 'ən kiçik məsafə (m):', r[k].map((x) => x.minD).join(' '), '· ən böyük ümumi dönmə (°):', r[k].map((x) => x.maxTurnDeg).join(' '), '· sakit hissədə R<40 m nöqtə sayı:', r[k].map((x) => x.kinks).join(' '), '· sakit ən kiçik R:', r[k].map((x) => x.calmMinR).join(' '), '· zona ən kiçik R:', r[k].map((x) => x.zoneMinR).join(' '));
  // yolun eni 15 m + çiyin/dirək: 30 m-dən yaxın keçid artıq üst-üstə düşmədir
  expect(Math.min(...r.new.map((x) => x.minD)), 'yeni yol özünə 30 m-dən yaxın gəlmir').toBeGreaterThan(30);
});
