import { test } from '@playwright/test';
import { boot, startMode, mergeJson } from './helpers.js';

// ARENA / FUTBOL SÜRÜŞ MODELİ: köhnə model ('old') və v2 ('new') eyni sınaqla ölçülür — hökm vermir.
// Maşın oyunun real Car obyektidir, rejimin öz profili ilə; sabit addımla (1/60 s) boş meydanda sürülür.
//   npx playwright test tests/feel-arena.spec.js   → tests/out/feel-arena.json
for (const mode of ['arena', 'football']) {
  for (const variant of ['old', 'new']) {
    test(`sürüş: ${mode} (${variant})`, async ({ page }) => {
      await page.addInitScript((v) => { try { if (v === 'old') localStorage.setItem('apexArenaFeel', 'old'); else localStorage.removeItem('apexArenaFeel'); } catch { /* boş */ } }, variant);
      await boot(page);
      await startMode(page, { mode, trackId: 'desert', carId: 'blaze', laps: 3, difficulty: 'normal' });
      const r = await page.evaluate(() => {
        const sc = window.__active, car = sc.playerCar;
        const DT = 1 / 60;
        const flat = { halfWidth: 1e9, maxRadius: 1e9, getNearest: () => ({ index: 0, t: 0, lateral: 0, onRoad: true }) };
        const reset = () => { car.position.set(0, 0, 0); car.velocity.set(0, 0, 0); car.heading = 0; car.vF = 0; car._steerSmooth = 0; car.offRoad = 0; car.driftT = 0; car.driftBoostT = 0; car.boostTimer = 0; car.hitTimer = 0; };
        const run = (sec, throttle, steer, handbrake = false) => {
          const out = [];
          for (let i = 0; i < Math.round(sec / DT); i++) {
            const h0 = car.heading;
            car.update(DT, { throttle, steer, handbrake }, flat);
            const sp = Math.hypot(car.velocity.x, car.velocity.z);
            const vR = car.velocity.x * -Math.cos(car.heading) + car.velocity.z * Math.sin(car.heading);
            out.push({ t: (i + 1) * DT * 1000, v: car.vF, sp, vR, w: Math.abs(car.heading - h0) / DT, x: car.position.x, z: car.position.z });
          }
          return out;
        };
        const last = (a) => a[a.length - 1];
        const firstT = (a, f) => { const s = a.find(f); return s ? Math.round(s.t) : null; };
        const slip = (s) => Math.round(Math.atan2(Math.abs(s.vR), Math.abs(s.v)) * 180 / Math.PI);
        const R = { v2: !!car.feel, maxSpeed: +car.maxSpeed.toFixed(1) };
        reset(); const acc = run(6, 1, 0);
        R.top = +last(acc).sp.toFixed(1);
        R.to50 = firstT(acc, (s) => s.v >= R.top * 0.5); R.to90 = firstT(acc, (s) => s.v >= R.top * 0.9);
        const b0 = { x: car.position.x, z: car.position.z }; const stop = run(3, -1, 0).find((s) => s.v <= 0.5);
        R.brakeMs = stop ? Math.round(stop.t) : null; R.brakeM = stop ? +Math.hypot(stop.x - b0.x, stop.z - b0.z).toFixed(1) : null;
        reset(); run(6, 1, 0); R.coast2s = Math.round((last(run(2, 0, 0)).sp / R.top) * 100);
        reset(); run(6, 1, 0); const st = run(2, 1, 1);
        R.turnYaw = +last(st).w.toFixed(2); R.turnRadius = +(last(st).sp / last(st).w).toFixed(1); R.turnSpeedPct = Math.round((last(st).sp / R.top) * 100); R.turnSlip = slip(last(st));
        reset(); run(6, 1, 0); const dr = run(1.2, 1, 1, true);
        R.driftYaw = +last(dr).w.toFixed(2); R.driftRadius = +(last(dr).sp / Math.max(0.01, last(dr).w)).toFixed(1); R.driftSpeedPct = Math.round((last(dr).sp / R.top) * 100); R.driftSlip = slip(last(dr));
        const after = run(0.6, 1, 0); R.driftExitSlip = slip(last(after)); R.driftExitSpeedPct = Math.round((last(after).sp / R.top) * 100);
        // dayanıqdan 180° dönüş: tam sükan + qaz, başlıq π-ə çatana qədər vaxt
        reset(); let tt = 0; while (Math.abs(car.heading) < Math.PI && tt < 8) { car.update(DT, { throttle: 1, steer: 1, handbrake: false }, flat); tt += DT; }
        R.uTurnS = +tt.toFixed(2);
        reset();
        return R;
      });
      mergeJson('feel-arena.json', `${mode}-${variant}`, r);
      console.log(`${mode} ${variant}: tavan ${r.top} m/s · 50%/90% ${r.to50}/${r.to90} ms · əyləc ${r.brakeM} m (${r.brakeMs} ms) · süzmə 2s ${r.coast2s}% · dönmə R ${r.turnRadius} m (sürət ${r.turnSpeedPct}%, sürüşmə ${r.turnSlip}°) · drift R ${r.driftRadius} m, sürət ${r.driftSpeedPct}%, bucaq ${r.driftSlip}° → çıxış ${r.driftExitSlip}°/${r.driftExitSpeedPct}% · 180° dönüş ${r.uTurnS} s`);
    });
  }
}

// BOTLAR YENİ MODELDƏ: 70 s oyun (oyunçu yerində durur), botların orta sürəti, yerində ilişmə payı,
// arenada ölümlər / futbolda qollar — köhnə və yeni modellə. Botlar eyni girişləri verir, maşın
// modeli dəyişib; rəqəmlər yaxın qalmalıdır (bot "ağıllı" qalsın).
for (const mode of ['arena', 'football']) {
  for (const variant of ['old', 'new']) {
    test(`botlar: ${mode} (${variant})`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.addInitScript((v) => { try { if (v === 'old') localStorage.setItem('apexArenaFeel', 'old'); else localStorage.removeItem('apexArenaFeel'); } catch { /* boş */ } }, variant);
      await boot(page);
      await startMode(page, { mode, trackId: 'desert', carId: 'blaze', laps: 3, difficulty: 'normal' });
      await page.evaluate(() => {
        const sc = window.__active;
        const S = (window.__bs = { n: 0, slow: 0, sp: 0, stuckRuns: 0, _still: new Map() });
        setInterval(() => {
          if (sc._state && sc._state !== 'run' && sc._state !== 'play') return;
          for (const r of sc.racers) {
            if (!r.isBot || r.car.alive === false) continue;
            const v = Math.hypot(r.car.velocity.x, r.car.velocity.z);
            S.n++; S.sp += v; if (v < 3) S.slow++;
            const k = (S._still.get(r) || 0); if (v < 1.5) { S._still.set(r, k + 1); if (k + 1 === 15) S.stuckRuns++; } else S._still.set(r, 0);   // 3 s yerində
          }
        }, 200);
      });
      await page.waitForTimeout(70_000);
      const r = await page.evaluate(() => {
        const sc = window.__active, S = window.__bs;
        return {
          samples: S.n, avgSpeed: +(S.sp / Math.max(1, S.n)).toFixed(1), slowPct: +((100 * S.slow) / Math.max(1, S.n)).toFixed(1), stuck3s: S.stuckRuns,
          alive: sc.racers.filter((x) => x.car.alive !== false).length, kills: sc.racers.reduce((a, x) => a + (x.kills || 0), 0),
          score: sc.scores ? `${sc.scores.blue}:${sc.scores.red}` : null,
          state: sc._state,
        };
      });
      mergeJson('feel-arena.json', `bots-${mode}-${variant}`, r);
      console.log(`botlar ${mode} ${variant}: orta sürət ${r.avgSpeed} m/s · yavaş (<3 m/s) ${r.slowPct}% · 3 s ilişmə ${r.stuck3s} dəfə · sağ ${r.alive} · ölüm ${r.kills} · hesab ${r.score} (${r.state})`);
    });
  }
}
