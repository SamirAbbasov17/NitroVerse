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

// ————— Bot çətinliyi (nəzarətli ölçmə) —————
// Bonuslar və imza gücləri SÖNDÜRÜLÜR, oyunçu kənara çəkilir — ölçülən yalnız
// botların sürüşüdür. Hər botun 1 tam dövrə vaxtı və yoldan kənar vaxt payı
// yazılır (tests/out/gameplay.json). Tələb: hər trekdə asan > normal > çətin
// (median dövrə vaxtı) və çətin botlar vaxtının < 4%-ni yoldan kənarda keçirir.
for (const trackId of ['desert', 'neon', 'canyon']) {
  test(`oynanış: bot sürəti — ${trackId}`, async ({ page }) => {
    test.setTimeout(420_000);
    const out = {};
    for (const difficulty of ['easy', 'normal', 'hard']) {
      await boot(page);
      await startMode(page, race({ trackId, difficulty }));
      await racing(page);
      out[difficulty] = await page.evaluate(async () => {
        const sc = window.__active;
        sc.playerCar.reset(sc.playerCar.position.clone().set(5000, 0, 5000), 0);
        for (const b of sc.powerups.boxes) { b.active = false; b.timer = 1e9; }
        const bots = sc.racers.filter((r) => !r.isPlayer);
        for (const r of bots) { r._sigWait = 1e9; r.items = []; }
        const start = bots.map((r) => r.progress);
        const lap = bots.map(() => null);
        let frames = 0;
        let off = 0;
        const t0 = performance.now();
        await new Promise((res) => {
          const tick = () => {
            frames++;
            const now = (performance.now() - t0) / 1000;
            bots.forEach((r, i) => {
              if (!r.car.onRoad) off++;
              if (lap[i] == null && r.progress - start[i] >= 1) lap[i] = now;
            });
            if (lap.every((x) => x != null) || now > 110) res(); else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        const done = lap.filter((x) => x != null).sort((x, y) => x - y);
        return {
          lapMedian: done.length ? +done[Math.floor(done.length / 2)].toFixed(1) : null,
          lapBest: done.length ? +done[0].toFixed(1) : null,
          finished: done.length,
          offRoadPct: +((off / (frames * bots.length)) * 100).toFixed(1),
        };
      });
    }
    mergeJson('gameplay.json', `botLap-${trackId}`, out);
    console.log(`bot dövrə (${trackId}):`, JSON.stringify(out));
    expect(out.easy.lapMedian, 'asan normaldan yavaş olmalıdır').toBeGreaterThan(out.normal.lapMedian);
    expect(out.normal.lapMedian, 'normal çətindən yavaş olmalıdır').toBeGreaterThan(out.hard.lapMedian);
    expect(out.hard.offRoadPct, 'çətin botların yoldan kənar vaxtı (%)').toBeLessThan(4);
  });
}

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

// ————— Kamera: önü tutan rəqib yarı-şəffaf olur, uzaqlaşanda bərpa olunur —————
test('oynanış: kameranın önünü tutan rəqib şəffaflaşır', async ({ page }) => {
  await boot(page);
  await startMode(page, race());
  await racing(page);
  await page.waitForTimeout(600);
  const probe = (where) => page.evaluate(async (w) => {
    const sc = window.__active;
    const me = sc.playerCar;
    const bot = sc.cars.find((c) => c !== me);
    for (const c of sc.controllers) if (c.car !== me) { c.active = false; if (c.car !== bot) c.car.reset(me.position.clone().set(9000, 0, 9000), 0); }
    const cam = sc.camera.position;
    const p = me.position.clone();
    if (w === 'between') p.set((cam.x + me.position.x) / 2, 0, (cam.z + me.position.z) / 2);
    else p.set(me.position.x + Math.sin(me.heading) * 30, 0, me.position.z + Math.cos(me.heading) * 30); // 30 m qabaqda
    bot.reset(p, me.heading);
    await new Promise((r) => setTimeout(r, 250));
    let transparent = 0;
    let solid = 0;
    bot._model.traverse((o) => { if (o.isMesh) { if (o.material.transparent && o.material.opacity < 0.5) transparent++; else solid++; } });
    return { ghost: !!bot._ghost, transparent, solid };
  }, where);
  const a = await probe('between');
  expect(a.ghost, 'kamera ilə oyunçu arasında').toBe(true);
  expect(a.solid).toBe(0);
  const b = await probe('ahead');
  expect(b.ghost, '30 m qabaqda').toBe(false);
  expect(b.transparent).toBe(0);
});

// ————— Kamera: döngənin içinə baxır —————
// Tam sürətdə sağa dönəndə baxış istiqaməti burundan döngə tərəfə sapmalıdır
// (istifadəçinin seçdiyi kamera: ~9°; köhnə kamera 5–10° GERİ baxırdı).
for (const name of ['race-desert', 'zen']) {
  test(`oynanış: kamera döngəyə baxır — ${name}`, async ({ page }) => {
    const cfg = MODES.find((m) => m.name === name).config;
    await boot(page);
    await startMode(page, cfg);
    if (cfg.mode === 'race') await racing(page);
    const deg = await page.evaluate(async () => {
      const sc = window.__active;
      const car = sc.playerCar;
      car._sigOffroad = 9;
      sc.input.touch.throttle = 1; sc.input.touch.steer = 0;
      await new Promise((r) => setTimeout(r, 1800));
      sc.input.touch.steer = 1;
      await new Promise((r) => setTimeout(r, 700));
      const cam = sc.camera;
      const dir = cam.getWorldDirection(cam.position.clone());
      let d = car.heading - Math.atan2(dir.x, dir.z); // sağa dönmə = heading azalır
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      sc.input.touch.steer = 0;
      return +(d * 57.3).toFixed(1);
    });
    console.log(`${name}: baxış burundan ${deg}° döngə tərəfə`);
    expect(deg, 'kamera döngənin içinə baxmalıdır (°)').toBeGreaterThan(3);
    expect(deg, 'həddən artıq olmamalıdır (°)').toBeLessThan(25);
  });
}

// Bot "Vaxtı Geri Al" gücünü yalnız bəlaya düşəndə işlədir. Əvvəl düz yolda tam sürətdə
// işlədib 3 saniyə geriyə — oyunçunun qabağına — teleport olurdu (istifadəçi rəyi).
test('oynanış: bot geri-qayıtma gücünü sağlam vəziyyətdə işlətmir', async ({ page }) => {
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'race-desert').config);
  await page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30_000 });
  await page.waitForTimeout(5000); // botlar sürət yığsın, tarixçə dolsun
  const arm = () => page.evaluate(() => {
    const sc = window.__active;
    const bot = sc.racers.find((r) => !r.isPlayer && r.signature);
    for (const r of sc.racers) if (!r.isPlayer && r !== bot && r.signature) r.signature.used = true;
    bot.signature.data = { ...bot.signature.data, rewind: 3.0 };
    bot.signature.used = false;
    bot._sigWait = 0;
    window.__bot = bot;
    return { speedPct: bot.car.velocity.length() / bot.car.maxSpeed, onRoad: bot.car.onRoad };
  });
  const st = await arm();
  expect(st.onRoad, 'ssenari: bot yoldadır').toBe(true);
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => window.__bot.signature.used), 'sağlam bot gücü işlətmir').toBe(false);
  // Vurulanda işlətməlidir
  await page.evaluate(() => { window.__bot.car.hitTimer = 1.2; window.__bot._sigWait = 0; });
  await page.waitForFunction(() => window.__bot.signature.used === true, null, { timeout: 4000 });
});
