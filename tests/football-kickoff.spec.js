// Futbol: başlanğıc zərbəsi "pulsuz qol" deyil. Oyunçu hər başlanğıcda dərhal nitro + zərbə
// (Q) ilə topa düz gedir; bu taktika hər dəfə qol verirdisə oyun sınır (oyunçu rəyi).
// Ölçü: N başlanğıcdan neçəsində top 5 s ərzində rəqib qapısına girir.
import { test, expect } from '@playwright/test';
import { boot, startMode, MODES, mergeJson } from './helpers.js';

test('futbol: başlanğıcda nitro + zərbə hər dəfə qol vermir', async ({ page }) => {
  test.setTimeout(240_000);
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'football').config);
  const res = await page.evaluate(async () => {
    const sc = window.__active, N = 10, out = [];
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    for (let i = 0; i < 600 && sc._state !== 'play'; i++) await frame();   // real geri sayım
    for (let k = 0; k < N; k++) {
      // oyunun ÖZ başlanğıcı (qol fasiləsinin sonu → _kickoff); hesab sıfırlanır ki, matç bitməsin
      sc.scores.blue = sc.scores.red = 0; sc._time = 5;
      sc._state = 'goal'; sc._goalT = 0.05;
      for (let i = 0; i < 60 && sc._state !== 'play'; i++) await frame();
      const car = sc.playerCar; car.nitroCharges = 1; car._lungeCd = 0;
      const b0 = sc.scores.blue; let lunged = false, t = 0, maxBall = 0, keeperGap = null;
      sc.input.touch.throttle = 1; sc.input.touch.steer = 0;
      sc._useNitro();
      const t0 = performance.now();
      while ((t = (performance.now() - t0) / 1000) < 5 && sc.scores.blue === b0 && sc._state === 'play') {
        // topa düz sür; çatanda zərbə
        const dx = sc.ballPos.x - car.position.x, dz = sc.ballPos.z - car.position.z;
        let e = Math.atan2(dx, dz) - car.heading; while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI;
        sc.input.touch.steer = lunged ? 0 : Math.max(-1, Math.min(1, -e * 2.4));
        if (!lunged && Math.hypot(dx, dz) < 9) { sc._lunge(); lunged = true; }
        maxBall = Math.max(maxBall, Math.hypot(sc.ballVel.x, sc.ballVel.z));
        await frame();
      }
      out.push({ goal: sc.scores.blue > b0, t: +t.toFixed(2), maxBall: +maxBall.toFixed(1) });
      sc.input.touch.throttle = 0; sc.input.touch.steer = 0;
    }
    return out;
  });
  const goals = res.filter((r) => r.goal).length;
  console.log(`futbol başlanğıc zərbəsi: ${goals}/${res.length} qol · ` + res.map((r) => `${r.goal ? 'QOL' : '—'} ${r.t}s v${r.maxBall}`).join(' | '));
  mergeJson('football.json', 'kickoff', { goals, n: res.length, res });
  expect(goals, 'başlanğıc zərbəsi əksər hallarda tutulur').toBeLessThanOrEqual(3);
});
