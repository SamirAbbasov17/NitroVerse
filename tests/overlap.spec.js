import { test, expect } from '@playwright/test';
import { MODES, boot, startMode, autopilot, mergeJson } from './helpers.js';

// Bərk obyektlərin (toqquşma siyahısı) bir-birinin içinə girməsi və yolun
// üstünə çıxması. Mərkəzlər arası məsafə radiusların cəminin 55%-indən azdırsa
// "dərin kəsişmə" sayılır (yüngül toxunma normaldır: şin yığını bariyerin yanında).
const scan = () => {
  const sc = window.__active;
  const tr = sc.track || sc.road;
  // r > 25: uzaq fon dağları — qəsdən üst-üstə düşən silsilədir, yoxlanmır
  const obs = (sc.environment?.obstacles || sc.road?.obstacles || []).filter((o) => o && o.r > 0 && o.r <= 25);
  const deep = [];
  for (let i = 0; i < obs.length; i++) {
    for (let j = i + 1; j < obs.length; j++) {
      const a = obs[i];
      const b = obs[j];
      if (a.water && b.water) continue; // çay gölə tökülür — su dairələri qəsdən üst-üstədir
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < (a.r + b.r) * 0.55 && d > 0.01) {
        deep.push({ x: Math.round(a.x), z: Math.round(a.z), d: +d.toFixed(1), ra: +a.r.toFixed(1), rb: +b.r.toFixed(1) });
      }
    }
  }
  const onRoad = [];
  for (const o of obs) {
    const n = tr.getNearest({ x: o.x, z: o.z }, null);
    const edge = Math.abs(n.lateral) - o.r; // obyektin yola ən yaxın kənarı
    if (edge < tr.halfWidth - 1.0) { // körpü məhəccəri kimi kənar maneələr (0.5 m içəri) normaldır
      onRoad.push({ x: Math.round(o.x), z: Math.round(o.z), r: +o.r.toFixed(1), lateral: +n.lateral.toFixed(1), half: tr.halfWidth });
    }
  }
  return { count: obs.length, deep, onRoad };
};

for (const m of MODES.filter((x) => x.config.mode === 'race')) {
  test(`overlap: ${m.name}`, async ({ page }) => {
    await boot(page);
    await startMode(page, m.config);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(scan);
    mergeJson('overlap.json', m.name, r);
    console.log(`${m.name.padEnd(13)} obyekt ${r.count} · dərin kəsişmə ${r.deep.length} · yolun üstündə ${r.onRoad.length}`);
    expect.soft(r.deep.length, 'iç-içə keçən obyekt cütləri').toBe(0);
    if (m.name !== 'race-zavod') expect.soft(r.onRoad.length, 'yolun üstündə obyekt').toBe(0); // zavodda konteynerlər qəsdəndir
  });
}

test('overlap: zen (60 s sürüş, 12 nümunə)', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page);
  await startMode(page, MODES.find((x) => x.name === 'zen').config);
  await autopilot(page, true);
  let deep = 0;
  let onRoad = 0;
  const examples = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(5000);
    const r = await page.evaluate(scan);
    deep = Math.max(deep, r.deep.length);
    onRoad = Math.max(onRoad, r.onRoad.length);
    if (examples.length < 6) examples.push(...r.deep.slice(0, 2), ...r.onRoad.slice(0, 2));
  }
  mergeJson('overlap.json', 'zen', { deep, onRoad, examples });
  console.log(`zen           dərin kəsişmə (maks) ${deep} · yolun üstündə (maks) ${onRoad}`);
  expect.soft(deep, 'iç-içə keçən obyekt cütləri').toBe(0);
  expect.soft(onRoad, 'yolun üstündə obyekt').toBe(0);
});
