import { test } from '@playwright/test';
import { boot, startMode, mergeJson } from './helpers.js';

// Sürüş modelinin RƏQƏMLƏRİ — hökm vermir, ölçür. Fizika/idarə dəyişikliyindən
// əvvəl və sonra işlədilir ki, "daha axıcı oldu" sözlə yox, rəqəmlə deyilsin.
//
// Üsul: oyunun real Car obyekti sinxron, sabit addımla (1/60 s) irəlilədilir —
// boş, maneəsiz, sonsuz enli "yol" üzərində. Yəni trekin forması, maneələr və
// kadr sürəti nəticəyə qarışmır; ölçülən yalnız Car.update modelidir.
// Sinif nümayəndələri: Formula, Hyper, Hot Hatch, Offroad, Van
const CARS = ['blaze', 'titan', 'venom', 'ranger', 'cargo'];

// Hər maşın iki modeldə ölçülür: 'v2' (standart — yarış və zen) və 'old'
// (köhnə model — arena və futbol hələ onu işlədir).
for (const model of ['v2', 'old']) {
for (const carId of CARS) {
  test(`feel: ${carId} (${model})`, async ({ page }) => {
    await boot(page);
    await startMode(page, { mode: 'race', trackId: 'desert', carId, laps: 3, difficulty: 'normal' });

    const res = await page.evaluate(async (useV2) => {
      const car = window.__active.playerCar;
      const { TUNING } = await import('/src/data/balance.js');
      car.feel = useV2 ? TUNING.feel2 : null;
      const DT = 1 / 60;
      const flat = { halfWidth: 1e9, maxRadius: 1e9, getNearest: () => ({ index: 0, t: 0, lateral: 0, onRoad: true }) };
      const rough = { ...flat, halfWidth: 0, getNearest: () => ({ index: 0, t: 0, lateral: 50, onRoad: false }) };
      const reset = () => {
        car.position.set(0, 0, 0); car.velocity.set(0, 0, 0);
        car.heading = 0; car.vF = 0; car._steerSmooth = 0; car.offRoad = 0;
        car.driftT = 0; car.driftBoostT = 0; car.boostTimer = 0;
      };
      // `sec` saniyə sabit girişlə irəlilət; hər addımın vəziyyətini qaytar
      const run = (sec, throttle, steer, handbrake = false, track = flat) => {
        const out = [];
        for (let i = 0; i < Math.round(sec / DT); i++) {
          const h0 = car.heading;
          car.update(DT, { throttle, steer, handbrake }, track);
          const vR = car.velocity.x * -Math.cos(car.heading) + car.velocity.z * Math.sin(car.heading);
          out.push({ t: (i + 1) * DT * 1000, v: car.vF, vR, w: Math.abs(car.heading - h0) / DT, x: car.position.x, z: car.position.z });
        }
        return out;
      };
      const firstT = (arr, pred) => { const s = arr.find(pred); return s ? Math.round(s.t) : null; };
      const last = (arr) => arr[arr.length - 1];
      const slipDeg = (s) => Math.round(Math.atan2(Math.abs(s.vR), Math.abs(s.v)) * 180 / Math.PI);
      const pct = (v) => Math.round((v / car.maxSpeed) * 100);
      const R = { car: car.data.id, maxSpeed: +car.maxSpeed.toFixed(1), kmhTop: Math.round(car.maxSpeed * 5.5) };

      // 1) Sürətlənmə
      reset();
      const acc = run(5, 1, 0);
      R.accel_ms_to_50 = firstT(acc, (s) => s.v >= car.maxSpeed * 0.5);
      R.accel_ms_to_90 = firstT(acc, (s) => s.v >= car.maxSpeed * 0.9);
      R.accel_ms_to_99 = firstT(acc, (s) => s.v >= car.maxSpeed * 0.99);

      // 2) Əyləc: maksimumdan dayanmağa; qazı buraxanda 2 s sonra qalan sürət
      const b0 = { x: car.position.x, z: car.position.z };
      const stop = run(3, -1, 0).find((s) => s.v <= 0.5);
      R.brake_ms = stop ? Math.round(stop.t) : null;
      R.brake_m = stop ? +Math.hypot(stop.x - b0.x, stop.z - b0.z).toFixed(1) : null;
      reset(); run(5, 1, 0);
      R.coast_2s_speed_pct = pct(last(run(2, 0, 0)).v);

      // 3) Sükan cavabı — tam sürətdə
      reset(); run(5, 1, 0);
      const st = run(1.5, 1, 1);
      const steady = last(st).w;
      R.steer_yaw_rad_s = +steady.toFixed(2);
      R.steer_ms_to_50 = firstT(st, (s) => s.w >= steady * 0.5);
      R.steer_ms_to_90 = firstT(st, (s) => s.w >= steady * 0.9);
      R.turn_radius_m = +(Math.abs(last(st).v) / steady).toFixed(1);
      R.turn_speed_kept_pct = pct(last(st).v);
      R.turn_slip_deg = slipDeg(last(st));
      R.steer_release_ms_to_10 = firstT(run(1, 1, 0), (s) => s.w <= steady * 0.1);

      // 4) Aşağı sürətdə dönmə radiusu (qaz 30%)
      reset(); run(4, 0.3, 0);
      const lo = last(run(1.5, 0.3, 1));
      R.low_speed_pct = pct(lo.v);
      R.low_turn_radius_m = +(lo.v / lo.w).toFixed(1);

      // 5) Drift: tam sürətdə 1 s əl əyləci + sükan, sonra buraxılır
      reset(); run(5, 1, 0);
      const dr = last(run(1, 1, 1, true));
      R.drift_speed_kept_pct = pct(dr.v);
      R.drift_total_speed_kept_pct = pct(Math.hypot(dr.v, dr.vR)); // hərəkət istiqamətində qalan sürət
      R.drift_slip_deg = slipDeg(dr);
      R.drift_yaw_rad_s = +dr.w.toFixed(2);
      const exit = run(2, 1, 0);
      R.drift_exit_ms_slip_under_5deg = firstT(exit, (s) => slipDeg(s) < 5);
      R.drift_exit_ms_to_95_speed = firstT(exit, (s) => s.v >= car.maxSpeed * 0.95);
      // müqayisə: eyni 1 s-i driftsiz, sadəcə sükanla dönəndə istiqamət dəyişməsi (dərəcə)
      reset(); run(5, 1, 0);
      R.plain_turn_1s_deg = Math.round(run(1, 1, 1).reduce((a, x) => a + x.w * DT, 0) * 180 / Math.PI);
      reset(); run(5, 1, 0);
      R.drift_turn_1s_deg = Math.round(run(1, 1, 1, true).reduce((a, x) => a + x.w * DT, 0) * 180 / Math.PI);

      // 6) Yoldan kənar: tarazlıq sürəti və ora düşmə vaxtı
      reset(); run(5, 1, 0);
      const off = run(4, 1, 0, false, rough);
      R.offroad_speed_pct = pct(last(off).v);
      R.offroad_ms_to_60pct = firstT(off, (s) => s.v <= car.maxSpeed * 0.6);

      // 7) Nitro
      reset(); run(5, 1, 0);
      car.boostTimer = 3;
      const bo = run(3, 1, 0);
      R.boost_top_pct = pct(Math.max(...bo.map((s) => s.v)));
      R.boost_ms_to_peak = firstT(bo, (s) => s.v >= car.maxSpeed * 1.44);
      return R;
    }, model === 'v2');
    console.log(model, JSON.stringify(res));
    mergeJson('feel.json', `${carId}-${model}`, res);
  });
}
}
