import { test, expect } from '@playwright/test';
import path from 'node:path';
import { MODES, OUT, boot, startMode, mergeJson } from './helpers.js';

// Toqquşma hissi — rəqəmlə. Səhnə dondurulur, maşınlar əl ilə yerləşdirilir və
// `_resolveCollisions` bir dəfə çağırılır (deterministik, sürücüdən asılı deyil).
// Ölçülən: zərbədən sonra qalan sürət, geri sıçrayış, rəqibə ötürülən sürət.
// Nəticə → tests/out/impact.json (toqquşma koduna toxunanda əvvəl/sonra müqayisə et).
test('impact: maneə və maşın toqquşması', async ({ page }) => {
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'race-desert').config);
  await page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30_000 });
  const res = await page.evaluate(() => {
    const sc = window.__active;
    sc.update = () => {};
    const car = sc.playerCar;
    const rival = sc.cars.find((c) => c !== car);
    const others = sc.cars.filter((c) => c !== car && c !== rival);
    const park = () => others.forEach((c, i) => { c.position.set(9000 + i * 50, 0, 9000); c.velocity.set(0, 0, 0); });
    // Ətrafında başqa maneə olmayan orta ölçülü maneə
    const o = sc._obstacles.find((a) => a.r > 0.8 && a.r < 3 &&
      !sc._obstacles.some((b) => b !== a && Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r + 8));
    const R = o.r + 1.5;
    const out = {};
    const wall = (deg, speed) => {
      park();
      rival.position.set(8000, 0, 8000);
      // deg: zərbə bucağı (90 = düz üstünə, 20 = sürtünərək)
      const a = (deg * Math.PI) / 180;
      car.position.set(o.x + (R - 0.05), 0, o.z);
      car.velocity.set(-Math.sin(a) * speed, 0, Math.cos(a) * speed);
      car._airT = 0;
      sc._obsHitT = 0;
      sc._resolveCollisions();
      const vx = car.velocity.x, vz = car.velocity.z;
      return {
        keptPct: +((Math.hypot(vx, vz) / speed) * 100).toFixed(1),
        bounce: +vx.toFixed(2), // müsbət = maneədən geri (m/s)
        along: +vz.toFixed(2),
      };
    };
    out.wallHeadOn30 = wall(90, 30);
    out.wallGlance30 = wall(20, 30);
    out.wallGlance45 = wall(20, 45);
    // Arxadan rəqibə: oyunçu 34 m/s, rəqib 20 m/s, eyni istiqamət (+z)
    park();
    car.position.set(7000, 0, 7000); rival.position.set(7000, 0, 7002.8);
    car.velocity.set(0, 0, 34); rival.velocity.set(0, 0, 20);
    car._airT = 0; rival._airT = 0;
    sc._resolveCollisions();
    out.rearEnd = { player: +car.velocity.z.toFixed(2), rival: +rival.velocity.z.toFixed(2), gap: +(rival.position.z - car.position.z).toFixed(2) };
    // Yandan sürtünmə: yan-yana, oyunçu rəqibə doğru 6 m/s yan sürətlə
    car.position.set(7000, 0, 7100); rival.position.set(7002.8, 0, 7100);
    car.velocity.set(6, 0, 30); rival.velocity.set(0, 0, 30);
    sc._resolveCollisions();
    out.sideSwipe = { playerSide: +car.velocity.x.toFixed(2), rivalSide: +rival.velocity.x.toFixed(2), playerFwd: +car.velocity.z.toFixed(2) };
    // ƏKS-ƏLAQƏ: 30 m/s düz zərbə → qığılcım yaranır, kamera itələnir və geri qayıdır
    park();
    rival.position.set(8000, 0, 8000);
    const n0 = sc.effects.list.length;
    sc.impact._cool = 0;
    sc.impact.x = sc.impact.z = sc.impact.vx = sc.impact.vz = 0;
    car.position.set(o.x + (R - 0.05), 0, o.z);
    car.velocity.set(-30, 0, 0);
    sc._resolveCollisions();
    let peak = 0;
    let settle = -1;
    for (let i = 1; i <= 90; i++) {
      sc.impact.update(1 / 60);
      const d = Math.hypot(sc.impact.x, sc.impact.z);
      peak = Math.max(peak, d);
      if (settle < 0 && i > 5 && d < 0.01) settle = +(i / 60).toFixed(2);
    }
    out.feedback = {
      particles: sc.effects.list.length - n0,
      camKickPeak: +peak.toFixed(3),
      camSettleSec: settle,
      bodyJolt: +Math.abs(car._jPitchV).toFixed(2),
    };
    // Zəif toxunuş (2 m/s) heç nə etməməlidir
    const n1 = sc.effects.list.length;
    sc.impact._cool = 0;
    car.position.set(o.x + (R - 0.05), 0, o.z);
    car.velocity.set(-2, 0, 0);
    sc._resolveCollisions();
    out.feedback.softTouchParticles = sc.effects.list.length - n1;
    return out;
  });
  // Baxmaq üçün kadr: oyun davam edir, oyunçu 30 m/s ilə maneəyə çırpılır
  await page.evaluate(() => {
    const sc = window.__active;
    delete sc.update;
    const car = sc.playerCar;
    const o = sc._obstacles.find((a) => a.r > 0.8 && a.r < 3 &&
      !sc._obstacles.some((b) => b !== a && Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r + 8));
    // 45 m aralıdan gəlir ki, kamera maşının arxasına otursun
    car.position.set(o.x + o.r + 45, 0, o.z);
    car.heading = -Math.PI / 2;
    car.velocity.set(-32, 0, 0);
    sc.impact._cool = 0;
    sc.impact.vx = 0;
  });
  await page.waitForFunction(() => Math.abs(window.__active.impact.vx) > 1, null, { timeout: 8000 });
  await page.waitForTimeout(70);
  await page.screenshot({ path: path.join(OUT, 'impact-hit.png') });
  mergeJson('impact.json', 'race', res);
  console.log(JSON.stringify(res, null, 1));
  // Maneədən geri sıçrayış yumşaq olmalıdır (zen-də istifadəçi rəyi: "güllə kimi geri atılır")
  expect.soft(res.wallHeadOn30.bounce, 'düz zərbədə geri sıçrayış (m/s)').toBeLessThan(6);
  // Sürtünərək keçəndə sürətin çoxu qalmalıdır
  expect.soft(res.wallGlance30.keptPct, 'sürtünmədə qalan sürət %').toBeGreaterThan(85);
  // Arxadan vuranda rəqib itələnməlidir, oyunçu onun içində qalmamalıdır
  expect.soft(res.rearEnd.rival, 'arxadan vurulan rəqibin sürəti').toBeGreaterThan(24);
  expect.soft(res.rearEnd.player, 'vuran oyunçunun sürəti').toBeLessThan(31);
  expect.soft(res.feedback.particles, 'güclü zərbədə hissəcik').toBeGreaterThan(5);
  expect.soft(res.feedback.softTouchParticles, 'zəif toxunuşda hissəcik').toBe(0);
  expect.soft(res.feedback.camKickPeak, 'kamera itələnməsi (m)').toBeGreaterThan(0.15);
  expect.soft(res.feedback.camKickPeak, 'kamera itələnməsi çox olmasın (m)').toBeLessThan(0.6);
  expect.soft(res.feedback.camSettleSec, 'kamera qayıdır (s)').toBeGreaterThan(0);
  expect.soft(res.feedback.camSettleSec, 'kamera tez qayıdır (s)').toBeLessThan(0.7);
});

// ARENA və FUTBOL: divara 26 m/s düz zərbə (real oyun dövrü). Ölçülən: geri sıçrayış sürəti və
// kameranın zərbə itələnməsi. Köhnə model: arena 1.4× silmə (≈ 10 m/s geri), futbol −0.35 (≈ 9 m/s).
for (const mode of ['arena', 'football']) {
  test(`impact: ${mode} divarı`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page);
    await startMode(page, MODES.find((m) => m.name === mode).config);
    await page.waitForFunction(() => ['play', 'run', 'fight'].includes(window.__active._state), null, { timeout: 40_000 });
    const r = await page.evaluate(async () => {
      const sc = window.__active, car = sc.playerCar;
      const frame = () => new Promise((res) => requestAnimationFrame(res));
      // rəqiblər və top qarışmasın
      for (const c of sc.cars) if (c !== car) { c.position.set(0, 0, -40); c.velocity.set(0, 0, 0); }
      if (sc.racers) for (const x of sc.racers) if (x.car !== car) x.isBot = false;
      sc._botDrive = () => {};
      sc.input.touch.throttle = 0; sc.input.touch.steer = 0;
      // +x divarına doğru: heading = +x
      const V = 26;
      if (sc.obstacles) sc.obstacles.length = 0;   // arena: yalnız xarici divar ölçülür
      car.position.set(20, 0, 0);
      car.heading = Math.PI / 2; car.vF = V; car.velocity.set(V, 0, 0);
      let minVx = V, cam = 0, n = 0, maxX = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 6000) {
        await frame(); n++;
        // sürəti saxla (sürtünmə divara çatana qədər yeməsin)
        if (car.velocity.x > 5) { car.vF = V; car.velocity.set(V, 0, 0); car.heading = Math.PI / 2; }
        maxX = Math.max(maxX, car.position.x);
        minVx = Math.min(minVx, car.velocity.x);
        if (sc.impact) cam = Math.max(cam, Math.hypot(sc.impact.x, sc.impact.z));
        if (car.velocity.x < 4 && n > 5 && performance.now() - t0 > 600 && minVx < 4) {
          // zərbədən sonra bir neçə kadr da izlə
          for (let i = 0; i < 20; i++) { await frame(); minVx = Math.min(minVx, car.velocity.x); if (sc.impact) cam = Math.max(cam, Math.hypot(sc.impact.x, sc.impact.z)); }
          break;
        }
      }
      return { wallX: +maxX.toFixed(1), bounce: +(-minVx).toFixed(2), camPush: +cam.toFixed(3) };
    });
    mergeJson('impact.json', mode, r);
    console.log(`${mode}: divar x=${r.wallX} · geri sıçrayış ${r.bounce} m/s · kamera itələnməsi ${r.camPush} m`);
    expect(r.wallX, 'maşın divara çatdı').toBeGreaterThan(40);
    expect(r.bounce, 'divardan güllə kimi geri atılmır (m/s)').toBeLessThan(5);
    expect(r.camPush, 'zərbə kamerada hiss olunur (m)').toBeGreaterThan(0.05);
    expect(r.camPush, 'kamera həddən artıq itələnmir (m)').toBeLessThan(0.5);
  });
}

// Arena botları maneəyə söykənib qalmamalıdır (toqquşma artıq geri atmır — bot özü yayınır
// və ilişəndə geri çəkilir). Köhnə toqquşma ilə: pay 1%, ən uzun 0.6 s; yayınmasız yeni: 8.4%, 5.6 s.
test('impact: arena botları ilişmir', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'arena').config);
  const r = await page.evaluate(async () => {
    const sc = window.__active;
    let n = 0, slow = 0, longest = 0;
    const run = new Map();
    const end = performance.now() + 40000;
    while (performance.now() < end) {
      await new Promise((res) => setTimeout(res, 200));
      if (sc._state !== 'play') continue;
      for (const c of sc.cars) {
        if (c === sc.playerCar || c.alive === false) continue;
        n++;
        if (c.velocity.length() < 1.5) { slow++; run.set(c, (run.get(c) || 0) + 0.2); longest = Math.max(longest, run.get(c)); } else run.set(c, 0);
      }
    }
    return { n, slowShare: +(slow / Math.max(1, n)).toFixed(3), longestStuckS: +longest.toFixed(1) };
  });
  mergeJson('impact.json', 'arenaBots', r);
  console.log(`arena botları: nümunə ${r.n} · yavaş pay ${r.slowShare} · ən uzun ilişmə ${r.longestStuckS} s`);
  expect(r.n).toBeGreaterThan(300);
  expect(r.slowShare, 'botların dayanıq qaldığı vaxt payı').toBeLessThan(0.08);
  expect(r.longestStuckS, 'ən uzun ilişmə (s)').toBeLessThan(3);
});
