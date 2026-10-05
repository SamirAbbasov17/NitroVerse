import { test, expect } from '@playwright/test';
import { MODES, boot, startMode, autopilot, collectErrors, mergeJson } from './helpers.js';

const race = (extra = {}) => ({ ...MODES.find((m) => m.name === 'race-desert').config, ...extra });
const racing = (page) => page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30_000 });

// ————— Bonus: götürülür, slota düşür, işlədiləndə slot boşalır —————
test('oynanış: bonus götürmə və işlətmə', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page);
  await startMode(page, race());
  await racing(page);
  await autopilot(page, true);
  await page.waitForFunction(() => window.__active.racers.find((r) => r.isPlayer).items.length > 0, null, { timeout: 45_000 });
  const before = await page.evaluate(() => window.__active.racers.find((r) => r.isPlayer).items.map((i) => i.id));
  expect(before.length).toBeGreaterThan(0);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__active.racers.find((r) => r.isPlayer).items.length);
  // üçlü atəş 3 yüklüdür — slot dərhal boşalmır, amma yük azalır
  const usedOrCharged = after < before.length || before[0] === 'trishot';
  expect(usedOrCharged, `işlətmədən sonra slot: ${before} → ${after}`).toBe(true);
});

// ————— Bot çətinliyi —————
// 40 s-də botların MEDİAN irəliləyişi və yoldan kənar vaxtı. ÖLÇMƏ testidir:
// tək qaçışın səs-küyü (bonus zərbələri, botların bir-birinə dəyməsi) böyükdür,
// ona görə yalnız ən möhkəm fərq tələb olunur (səhrada asan < çətin). Qalan
// rəqəmlər tests/out/gameplay.json-a yazılır — bot davranışı Faza 2.8-də
// (docs/UPGRADE-PLAN.md) nəzarətli ölçmə ilə tənzimlənəcək.
test('oynanış: bot çətinlik sırası', async ({ page }) => {
  test.setTimeout(400_000);
  const out = {};
  for (const trackId of ['desert', 'neon']) {
    out[trackId] = {};
    for (const difficulty of ['easy', 'normal', 'hard']) {
      await boot(page);
      await startMode(page, race({ trackId, difficulty }));
      await racing(page);
      out[trackId][difficulty] = await page.evaluate(async () => {
        const sc = window.__active;
        // Oyunçunun maşını startda dayanıb qalmasın: 1 dövrədən sonra botlar ona
        // çırpılıb yoldan çıxır və ölçmə korlanır (ilk ölçmədə belə oldu).
        sc.playerCar.reset(sc.playerCar.position.clone().set(5000, 0, 5000), 0);
        const bots = sc.racers.filter((r) => !r.isPlayer);
        let frames = 0;
        let off = 0;
        const t0 = performance.now();
        await new Promise((res) => {
          const tick = () => {
            frames++;
            for (const b of bots) if (!b.car.onRoad) off++;
            if (performance.now() - t0 < 40_000) requestAnimationFrame(tick); else res();
          };
          requestAnimationFrame(tick);
        });
        const p = bots.map((r) => r.progress).sort((x, y) => x - y);
        return { median: +p[Math.floor(p.length / 2)].toFixed(3), offRoadPct: +((off / (frames * bots.length)) * 100).toFixed(1) };
      });
    }
    console.log(`bot (${trackId}, 40 s):`, JSON.stringify(out[trackId]));
  }
  mergeJson('gameplay.json', 'botPace40s', out);
  expect(out.desert.easy.median, 'səhra: asan < çətin').toBeLessThan(out.desert.hard.median);
});

// ————— Pauza: vaxt dayanır, davamda irəliləyir —————
test('oynanış: pauza vaxtı və maşını dayandırır', async ({ page }) => {
  await boot(page);
  await startMode(page, race());
  await racing(page);
  await autopilot(page, true);
  await page.waitForTimeout(2500);
  const snap = () => page.evaluate(() => {
    const sc = window.__active;
    return { t: sc.raceManager.elapsed, x: sc.playerCar.position.x, z: sc.playerCar.position.z, state: sc._state };
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const a = await snap();
  await page.waitForTimeout(1500);
  const b = await snap();
  expect(a.state).toBe('paused');
  expect(b.t).toBeCloseTo(a.t, 3);
  expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.01);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  const c = await snap();
  expect(c.state).toBe('run');
  expect(c.t).toBeGreaterThan(b.t + 0.5);
});

// ————— Pəncərə ölçüsü: kətan və kamera nisbəti yenilənir (4 rejim) —————
for (const name of ['race-desert', 'zen', 'football', 'arena']) {
  test(`oynanış: ölçü dəyişmə — ${name}`, async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);
    await startMode(page, MODES.find((m) => m.name === name).config);
    await page.waitForTimeout(1500);
    for (const [w, h] of [[844, 390], [390, 844], [1600, 900], [1280, 720]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(350);
      const r = await page.evaluate(() => {
        const sc = window.__active;
        const cv = sc.renderer.domElement;
        return { aspect: sc.camera.aspect, cw: cv.clientWidth, ch: cv.clientHeight, iw: window.innerWidth, ih: window.innerHeight };
      });
      expect(r.cw, `kətan eni ${w}×${h}`).toBe(r.iw);
      expect(r.ch, `kətan hündürlüyü ${w}×${h}`).toBe(r.ih);
      expect(r.aspect).toBeCloseTo(r.iw / r.ih, 2);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

// ————— Sürətli keçid: rejimlər arasında dayanmadan keçid xəta vermir —————
test('oynanış: rejimlər arasında sürətli keçid', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await boot(page);
  const order = ['race-neon', 'zen', 'football', 'arena', 'race-zavod', 'zen', 'arena', 'race-alpine'];
  for (const name of order) {
    await startMode(page, MODES.find((m) => m.name === name).config);
    await page.waitForTimeout(700); // səhnə hələ istiləşərkən çıx
    await page.evaluate(() => window.__active.onQuit());
    await page.waitForFunction(() => window.__active === window.__showcase);
  }
  // sonda normal açılış işləməlidir
  await startMode(page, race());
  await racing(page);
  expect(errors, errors.join('\n')).toEqual([]);
});
