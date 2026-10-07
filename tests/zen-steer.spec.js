import { test, expect } from '@playwright/test';
import { MODES, boot, startMode, autopilot, mergeJson } from './helpers.js';

// ZEN SÜKANI: yolun hamarlığına uyğun olmalıdır. Kruiz sürətində (1) tam sükanda dönmə radiusu,
// (2) qısa toxunuşun (0.3 s) maşını nə qədər yana atdığı ölçülür — yarışdakı kimi ('old'), ilk sakit
// variant ('calm' — istifadəçi: "çox yavaşdır") və indiki orta tənzimlə ('new').
// Aşağı sürətdə manevr itməməlidir (dönmə radiusu dəyişmir).
for (const variant of ['old', 'calm', 'new']) {
  test(`zen sükanı: ${variant}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript((v) => { try { if (v !== 'new') localStorage.setItem('apexZenSteer', v); else localStorage.removeItem('apexZenSteer'); } catch { /* boş */ } }, variant);
    await boot(page);
    await startMode(page, MODES.find((m) => m.name === 'zen').config);
    await autopilot(page, true);
    await page.waitForTimeout(9000);
    await autopilot(page, false);
    const r = await page.evaluate(async () => {
      const sc = window.__active, car = sc.playerCar, inp = sc.input.touch;
      const frames = (n) => new Promise((res) => { const f = () => (--n <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      const wrap = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
      // maneələr və trafik qarışmasın
      sc.road.obstacles.length = 0;
      const out = {};
      // (1) kruizdə sabit tam sükan (sükan açılandan sonrakı 0.5 s)
      inp.throttle = 1; inp.steer = 1; await frames(25);
      { const h0 = car.heading, t0 = performance.now(); await frames(30);
        const w = Math.abs(wrap(car.heading - h0)) / ((performance.now() - t0) / 1000);
        out.cruise = +Math.abs(car.vF).toFixed(1); out.yaw = +w.toFixed(2); out.radius = +(Math.abs(car.vF) / w).toFixed(0); }
      inp.steer = 0;
      // yola qayıt və düzlən
      sc._rescue?.(true); await frames(20);
      // (2) qısa toxunuş: 0.3 s tam sükan, sonra burax; 1 s sonra yana sürüşmə
      inp.throttle = 1; inp.steer = 0;
      for (let i = 0; i < 240 && Math.abs(car.vF) < 36; i++) await frames(1);
      // yolun ortasından başla (əvvəlki sürüşmə ölçməyə qarışmasın)
      sc._rescue?.(true); await frames(10);
      for (let i = 0; i < 300 && Math.abs(car.vF) < 36; i++) await frames(1);
      const h0 = car.heading, x0 = car.position.x, z0 = car.position.z;
      inp.steer = 1; await new Promise((res) => setTimeout(res, 300)); inp.steer = 0;
      await new Promise((res) => setTimeout(res, 700));
      out.tapSpeed = +Math.abs(car.vF).toFixed(1);
      // ilkin istiqamətə nəzərən yana yerdəyişmə (yolun əyriliyindən asılı olmasın deyə həndəsi)
      out.tapLateral = +Math.abs((car.position.x - x0) * Math.cos(h0) - (car.position.z - z0) * Math.sin(h0)).toFixed(1);
      out.tapHeadingDeg = +(Math.abs(wrap(car.heading - h0)) * 180 / Math.PI).toFixed(1);
      // (3) aşağı sürətdə manevr: sürət ~8 m/s-də saxlanır, tam sükan
      sc._rescue?.(true); await frames(20);
      inp.steer = 0;
      const keep = setInterval(() => { inp.throttle = Math.abs(car.vF) < 8 ? 1 : (Math.abs(car.vF) > 9.5 ? -0.4 : 0); }, 16);
      for (let i = 0; i < 400 && !(Math.abs(car.vF) > 7 && Math.abs(car.vF) < 10); i++) await frames(1);
      await frames(20);
      inp.steer = 1; await frames(25);
      { const h1 = car.heading, t1 = performance.now(); await frames(30);
        const w = Math.abs(wrap(car.heading - h1)) / ((performance.now() - t1) / 1000);
        out.slowV = +Math.abs(car.vF).toFixed(1); out.slowRadius = +(Math.abs(car.vF) / w).toFixed(1); }
      clearInterval(keep);
      inp.throttle = 0; inp.steer = 0;
      return { ...out, roadHalf: sc.road.halfWidth };
    });
    mergeJson('zen-steer.json', variant, r);
    console.log(`${variant}: kruiz ${r.cruise} m/s · tam sükanda dönmə ${r.yaw} rad/s, radius ${r.radius} m · 0.3 s toxunuş → ${r.tapHeadingDeg}° dönmə, 1 s-də ${r.tapLateral} m yana (yolun yarım eni ${r.roadHalf} m) · aşağı sürətdə (${r.slowV} m/s) radius ${r.slowRadius} m`);
    if (variant === 'new') {
      expect(r.radius, 'kruizdə tam sükan radiusu yolun ən iti döngəsindən (≈180 m) xeyli kiçik qalır').toBeLessThan(120);
      expect(r.radius, 'amma yarışdakı qədər iti deyil').toBeGreaterThan(28);
      expect(r.tapLateral, 'qısa toxunuş maşını yoldan çıxarmır (m)').toBeLessThan(r.roadHalf);
      expect(r.slowRadius, 'aşağı sürətdə manevr qalır (m)').toBeLessThan(12);
    }
  });
}

// ZEN DRİFTİ: kruizdə əl əyləci + tam sükan 2 s saxlanır. Ölçülür: sürüşmə bucağı (burunla hərəkət
// istiqaməti arası), driftdə saxlanan sürət, burnun dönmə tempi, buraxandan sonra düzəlmə vaxtı,
// aşağı sürətdə (25 km/s) drift başlayırmı, yoldan kənarda saxlanan sürət. 'old' = yarış tənzimi.
for (const variant of ['old', 'new']) {
  test(`zen drifti: ${variant}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript((v) => { try { if (v === 'old') localStorage.setItem('apexZenFeel', 'old'); else localStorage.removeItem('apexZenFeel'); localStorage.setItem('apexZenRoad', 'old'); } catch { /* boş */ } }, variant);
    await boot(page);
    await startMode(page, MODES.find((m) => m.name === 'zen').config);
    await autopilot(page, true);
    await page.waitForTimeout(8000);
    await autopilot(page, false);
    const r = await page.evaluate(async () => {
      const sc = window.__active, car = sc.playerCar, inp = sc.input.touch;
      const frames = (n) => new Promise((res) => { const f = () => (--n <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      const wrap = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
      const slip = () => Math.abs(wrap(Math.atan2(car.velocity.x, car.velocity.z) - car.heading)) * 180 / Math.PI;
      const spd = () => Math.hypot(car.velocity.x, car.velocity.z);
      sc.road.obstacles.length = 0;
      sc._spawnTraffic = () => {};
      const out = {};
      const cruise = async (v) => { sc._rescue?.(true); await frames(10); inp.steer = 0; inp.handbrake = false; inp.throttle = 1; for (let i = 0; i < 400 && spd() < v; i++) await frames(1); };
      // (1) kruizdə 1.2 s drift, üç sükan dərəcəsində (2 s tam sükan artıq fırlanmadır, drift deyil)
      out.steps = {};
      for (const st of [0.4, 0.7, 1.0]) {
        await cruise(35);
        const v0 = spd();
        inp.handbrake = true; inp.steer = st;
        let maxSlip = 0, yawSum = 0, yawT = 0, hPrev = car.heading; const t0 = performance.now(); let tPrev = t0;
        while (performance.now() - t0 < 1200) {
          await frames(1);
          const now = performance.now();
          maxSlip = Math.max(maxSlip, slip());
          if (now - t0 > 600) { yawSum += Math.abs(wrap(car.heading - hPrev)); yawT += (now - tPrev) / 1000; }
          hPrev = car.heading; tPrev = now;
        }
        const yaw = yawSum / Math.max(0.01, yawT);
        out.steps[st] = { slip: +slip().toFixed(0), slipMax: +maxSlip.toFixed(0), kept: +(spd() / v0).toFixed(2), yaw: +yaw.toFixed(2), radius: +(spd() / Math.max(0.01, yaw)).toFixed(0), drifting: !!car.isDrifting };
        if (st === 1.0) {
          out.cruise = +v0.toFixed(1);
          // buraxandan sonra sürüşmə 5°-dən aşağı düşənə qədər vaxt
          inp.handbrake = false; inp.steer = 0;
          const t1 = performance.now();
          while (performance.now() - t1 < 3000 && slip() > 5) await frames(1);
          out.settle = +((performance.now() - t1) / 1000).toFixed(2);
        }
        inp.handbrake = false; inp.steer = 0;
      }
      // (2) aşağı sürətdə drift başlayırmı (7 m/s ≈ 25 km/s)
      sc._rescue?.(true); await frames(20);
      inp.throttle = 0.3; for (let i = 0; i < 300 && spd() < 7; i++) await frames(1);
      inp.throttle = 1; inp.handbrake = true; inp.steer = 1; await frames(50);
      out.lowSpeed = +spd().toFixed(1); out.lowDrift = !!car.isDrifting;
      inp.handbrake = false; inp.steer = 0;
      // (3) yoldan kənarda saxlanan sürət: 3 s torpaqda tam qaz
      await cruise(35);
      const vOn = spd();
      const li = Math.max(0, Math.min(sc.road.points.length - 1, Math.round(car.trackT) - sc.road.base));
      const n = sc.road.normals[li];
      car.position.x += n.x * 13; car.position.z += n.z * 13;
      await frames(180);
      out.offRoad = !car.onRoad; out.offKept = +(spd() / vOn).toFixed(2);
      inp.throttle = 0;
      return out;
    });
    mergeJson('zen-steer.json', 'drift-' + variant, r);
    const row = (k) => { const x = r.steps[k]; return `sükan ${k}: bucaq ${x.slip}° (ən çox ${x.slipMax}°), radius ${x.radius} m, sürət ${Math.round(x.kept * 100)}%`; };
    console.log(`drift ${variant}: ${row('0.4')} · ${row('0.7')} · ${row('1')} · düzəlmə ${r.settle} s · 25 km/s-də drift: ${r.lowDrift} · yoldan kənar sürət ${Math.round(r.offKept * 100)}%`);
    if (variant === 'new') {
      const full = r.steps['1'], mid = r.steps['0.7'];
      expect(full.drifting && mid.drifting, 'drift tutulur').toBe(true);
      expect(mid.slip, 'orta sükanda aydın sürüşmə (°)').toBeGreaterThan(18);
      expect(full.slipMax, 'tam sükanda fırlanıb getmir (°)').toBeLessThan(60);
      expect(mid.kept, 'drift sürəti yemir').toBeGreaterThan(0.9);
      expect(mid.radius, 'serpantin döngəsini (≈50 m) sığdırır (m)').toBeLessThan(50);
      expect(r.settle, 'buraxanda tez düzəlir (s)').toBeLessThan(1.5);
      expect(r.lowDrift, 'aşağı sürətdə də drift olur').toBe(true);
    }
  });
}
