import { test, expect } from '@playwright/test';
import { MODES, boot, startMode, autopilot, mergeJson } from './helpers.js';

// Kadr donması (hitch) testi: sürüş zamanı günün vaxtı, hava və biom dəyişdirilir
// və hər kadrın CPU xərci (update + render) ölçülür. Şeyder kompilyasiyası kimi
// tək-tək böyük sıçrayışlar orta/p99 rəqəmlərində itir — burada ayrıca sayılır.
const LIMIT_MS = 33; // bundan uzun kadr hiss olunan ilişmədir (docs/DESIGN.md)

test('hitch: zen — gün vaxtı, hava və biom keçidləri', async ({ page }) => {
  test.setTimeout(300_000);
  await boot(page);
  await startMode(page, MODES.find((x) => x.name === 'zen').config);
  await autopilot(page, true);
  await page.waitForTimeout(4000); // ilk chunk-lar və istiləşmə ölçüyə düşmür
  const res = await page.evaluate(async () => {
    const sc = window.__active;
    const r = sc.renderer;
    const slow = [];
    let frame = 0;
    let tU = 0;
    let last = '';
    const oU = sc.update.bind(sc);
    const oR = r.render.bind(r);
    sc.update = (dt) => { const t = performance.now(); oU(dt); tU = performance.now() - t; };
    r.render = (s, c) => {
      frame++;
      const p0 = r.info.programs.length;
      const t = performance.now();
      oR(s, c);
      const tR = performance.now() - t;
      if (tU + tR > 20) slow.push({ frame, update: +tU.toFixed(1), render: +tR.toFixed(1), newPrograms: r.info.programs.length - p0, after: last });
    };
    const wait = (ms) => new Promise((q) => setTimeout(q, ms));
    const steps = [
      ['_setDayTime', 'dusk'], ['_setDayTime', 'night'], ['_cycleWeather'], ['_cycleWeather'],
      ['_cycleWeather'], ['_cycleWeather'], ['_cycleWeather'], ['_setDayTime', 'dawn'], ['_setDayTime', 'day'],
      ['_cycleBiome'], ['_cycleBiome'], ['_cycleBiome'], ['_cycleBiome'],
    ];
    for (const [fn, arg] of steps) {
      await wait(7000);
      last = `${fn}(${arg || ''})`;
      sc[fn]?.(arg);
    }
    await wait(7000);
    delete sc.update;
    r.render = oR;
    return { frames: frame, slow };
  });
  const over = res.slow.filter((s) => s.update + s.render > LIMIT_MS);
  mergeJson('hitch.json', 'zen', { frames: res.frames, over20: res.slow.length, over33: over.length, slow: res.slow });
  console.log(`zen: ${res.frames} kadr · >20 ms: ${res.slow.length} · >${LIMIT_MS} ms: ${over.length}`);
  for (const s of res.slow.filter((x) => x.update + x.render > 25)) console.log('  ', JSON.stringify(s));
  expect(over.length, `${LIMIT_MS} ms-dən uzun kadrlar`).toBe(0);
});

// Digər rejimlər: 45 s oyun (bonuslar, partlayışlar, imza gücləri öz axarı ilə).
for (const name of ['race-desert', 'race-neon', 'race-zavod', 'football', 'arena']) {
  test(`hitch: ${name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);
    await startMode(page, MODES.find((x) => x.name === name).config);
    await autopilot(page, true);
    await page.waitForTimeout(5000); // geri sayım + istiləşmə
    const res = await page.evaluate(async () => {
      const sc = window.__active;
      const r = sc.renderer;
      const slow = [];
      let frame = 0;
      let tU = 0;
      const oU = sc.update.bind(sc);
      const oR = r.render.bind(r);
      sc.update = (dt) => { const t = performance.now(); oU(dt); tU = performance.now() - t; };
      r.render = (s, c) => {
        frame++;
        const p0 = r.info.programs.length;
        const t = performance.now();
        oR(s, c);
        const tR = performance.now() - t;
        if (tU + tR > 20) slow.push({ frame, update: +tU.toFixed(1), render: +tR.toFixed(1), newPrograms: r.info.programs.length - p0 });
      };
      await new Promise((q) => setTimeout(q, 45000));
      delete sc.update;
      r.render = oR;
      return { frames: frame, slow };
    });
    const over = res.slow.filter((s) => s.update + s.render > LIMIT_MS);
    mergeJson('hitch.json', name, { frames: res.frames, over20: res.slow.length, over33: over.length, slow: res.slow });
    console.log(`${name}: ${res.frames} kadr · >20 ms: ${res.slow.length} · >${LIMIT_MS} ms: ${over.length}`);
    for (const s of res.slow) console.log('  ', JSON.stringify(s));
    expect(over.length, `${LIMIT_MS} ms-dən uzun kadrlar`).toBe(0);
  });
}
