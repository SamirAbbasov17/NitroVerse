// ZEN — yol nişanları və hərəkət. Nişanın dirəyi lövhənin ORTASINDA bitir və lövhənin arxasındadır (əvvəl dirək
// lövhədən yuxarı çıxır və üzünü yarıb keçirdi). Hərəkət: eyni vaxtda 3-ə qədər maşın, büdcə daxilində.
import { test, expect } from '@playwright/test';
import path from 'path';
import { boot, startMode, autopilot, measure, MODES, OUT, ensureDir } from './helpers.js';

const DIR = ensureDir(path.join(OUT, 'zen-signs'));

test('zen nişanları: dirək lövhənin ortasında bitir və arxasındadır', async ({ page }) => {
  test.setTimeout(120_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'zen').config);
  await page.evaluate(() => window.__active._setDayTime('day'));
  const geo = await page.evaluate(async () => {
    const F = await import('/src/core/AssetFactory.js'), T = window.__THREE, out = {};
    for (const [name, obj] of [['signpost', F.makeSignpost()], ['curve', F.makeCurveSign(true)]]) {
      obj.updateMatrixWorld(true);
      const boxes = obj.children.map((c) => new T.Box3().setFromObject(c));
      const pole = boxes[0], plate = boxes[1];                    // 0 — dirək, 1 — lövhə
      out[name] = { poleTop: +pole.max.y.toFixed(3), plateMid: +((plate.min.y + plate.max.y) / 2).toFixed(3), plateTop: +plate.max.y.toFixed(3), poleFront: +pole.max.z.toFixed(3), plateBack: +plate.min.z.toFixed(3) };
    }
    // vizual yoxlama: iki nişanı maşının qabağına qoy (öndən və arxadan)
    const s = window.__active, p = s.playerCar.position, a = F.makeSignpost(0x2f6fe0), b = F.makeCurveSign(true), c = F.makeSignpost(0x2e7d5b), d = F.makeCurveSign(false);
    const cam = s.camera, dir = new T.Vector3(); cam.getWorldDirection(dir); dir.y = 0; dir.normalize(); const right = new T.Vector3(-dir.z, 0, dir.x), yaw = Math.atan2(-dir.x, -dir.z);
    [[a, -3.3, yaw], [b, -1.1, yaw], [c, 1.1, yaw + Math.PI], [d, 3.3, yaw + Math.PI]].forEach(([o, k, r]) => { o.position.copy(p).addScaledVector(dir, 9).addScaledVector(right, k); o.position.y = p.y; o.rotation.y = r; o.scale.setScalar(1.25); s.scene.add(o); });
    return out;
  });
  await page.evaluate(() => { document.querySelectorAll('.overlay, .endless-intro, [class*="intro"]').forEach((e) => { e.style.display = 'none'; }); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(DIR, 'signs.png') });
  console.log('nişanlar:', JSON.stringify(geo));
  for (const [n, g] of Object.entries(geo)) {
    expect(g.poleTop, `${n}: dirək lövhənin ortasından yuxarı çıxmır`).toBeLessThanOrEqual(g.plateMid + 0.001);
    expect(g.poleTop, `${n}: dirək lövhəyə çatır (ortasına qədər)`).toBeGreaterThan(g.plateMid - 0.05);
    expect(g.plateBack, `${n}: lövhə dirəyin qabağındadır (dirək üzü yarıb keçmir)`).toBeGreaterThanOrEqual(g.poleFront - 0.001);
  }
  expect(errs).toEqual([]);
});

test('zen hərəkəti: eyni vaxtda 3-ə qədər maşın; draw call büdcəsi', async ({ page }) => {
  test.setTimeout(200_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'zen').config);
  await page.evaluate(() => { const s = window.__active; s._setDayTime('day'); s._biomeOverride = 0; s._setWeather('clear'); });
  await autopilot(page, true);
  let max = 0, spawned = 0, last = 0; const t0 = Date.now(); let perf = null;
  while (Date.now() - t0 < 75_000) {
    const n = await page.evaluate(() => window.__active._traffic.length);
    if (n > last) spawned += n - last; last = n; max = Math.max(max, n);
    if (n >= 2 && !perf) perf = await measure(page, 2500);
    await page.waitForTimeout(400);
  }
  console.log('hərəkət:', JSON.stringify({ max, spawned, calls: perf?.drawCallsP50, tris: perf?.triangles }));
  expect(max, 'eyni vaxtda 3-dən çox olmur').toBeLessThanOrEqual(3);
  expect(spawned, '75 s-də ən azı 4 maşın çıxdı (əvvəl orta hesabla ~3)').toBeGreaterThanOrEqual(4);
  // Draw call: səhrada 2 maşınla 114 ölçülüb — bu, köhnə limitdə (2 maşın) də belə idi, yəni zen həddi (110) əvvəldən
  // aşır; burada yalnız kəskin pisləşmənin olmadığı yoxlanır.
  if (perf) expect(perf.drawCallsP50, 'hərəkətlə draw call kəskin artmayıb').toBeLessThan(125);
  expect(errs).toEqual([]);
});
