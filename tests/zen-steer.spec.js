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
