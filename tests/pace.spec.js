import { test, expect } from '@playwright/test';
import { boot, startMode, mergeJson } from './helpers.js';
// ————— MAŞIN SÜRƏTİ BALANSI —————
// Eyni sürücü məntiqi (bot, bonussuz, tək) hər maşını sürür; dövrənin 60%-nin vaxtı
// ölçülür. Məqsəd: heç bir maşın yalnız statlarına görə çox geri qalmasın — fərq
// gücləri və üstünlükləri ilə bağlana bilən həddə olmalıdır (ən sürətli ilə ən yavaş
// arasında ≤ 10%). CARS=… mühit dəyişəni ilə başqa maşınlar ölçülə bilər.
const CARS = (process.env.CARS || 'blaze,titan,frost,venom,cruiser,ranger,cargo,crimson').split(',');
for (const trackId of ['desert', 'canyon']) {
  test(`sürət balansı: ${trackId}`, async ({ page }) => {
    test.setTimeout(1200000);
    const out = {};
    for (const carId of CARS) {
      await boot(page);
      await startMode(page, { mode: 'race', trackId, carId, laps: 3, difficulty: 'normal' });
      await page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30000 });
      out[carId] = await page.evaluate(async () => {
        const sc = window.__active; const car = sc.playerCar; const me = sc.racers.find((r) => r.isPlayer);
        const botCtrl = sc.controllers.find((c) => c.car !== car);
        const AI = botCtrl.constructor;
        for (const b of sc.powerups.boxes) { b.active = false; b.timer = 1e9; }
        for (const r of sc.racers) if (!r.isPlayer) { r._sigWait = 1e9; r.controller.active = false; r.car.reset(car.position.clone().set(7000 + Math.random() * 40, 0, 7000), 0); }
        const ai = new AI(car, { skill: 0.9, brave: 1.0 });
        ai._startDelay = 0;
        const idx = sc.controllers.findIndex((c) => c.car === car);
        sc.controllers[idx] = ai; me.controller = ai;
        const t0 = performance.now(); let tA = null; let off = 0; let n = 0;
        return new Promise((res) => {
          const tick = () => {
            n++; if (!car.onRoad) off++;
            const now = (performance.now() - t0) / 1000;
            if (tA == null && me.progress >= 0.15) tA = now;
            if (me.progress >= 0.75 || now > 90) res({ t: tA != null ? +(now - tA).toFixed(2) : null, off: +(off / n * 100).toFixed(1) });
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      });
      console.log(trackId, carId, JSON.stringify(out[carId]));
    }
    mergeJson('pace.json', trackId, out);
    const ts = Object.values(out).map((o) => o.t);
    const spread = (Math.max(...ts) / Math.min(...ts) - 1) * 100;
    console.log(`${trackId}: ən sürətli ${Math.min(...ts)} s · ən yavaş ${Math.max(...ts)} s · fərq ${spread.toFixed(1)}%`);
    expect(spread, 'maşınlar arası sürət fərqi (%)').toBeLessThan(10);
    expect(Math.max(...Object.values(out).map((o) => o.off)), 'yoldan kənar vaxt (%)').toBeLessThan(3);
  });
}
