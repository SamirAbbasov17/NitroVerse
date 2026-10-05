import { test, expect } from '@playwright/test';
import { MODES, boot, startMode, mergeJson } from './helpers.js';

// Bərk obyektlərin içindən keçmək olmaz. Hər trekdə yola ən yaxın 14 maneə
// seçilir; maşın hər birinə 14 m-dən tam qazla sürülür (real oyun dövrü ilə,
// 1.6 s) və bu müddətdə maneənin mərkəzinə nə qədər yaxınlaşdığı ölçülür.
// Maşın maneənin radiusunun yarısından içəri girə bilməməlidir.
for (const m of MODES.filter((x) => x.config.mode === 'race')) {
  test(`collide: ${m.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);
    await startMode(page, m.config);
    await page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30_000 });
    const res = await page.evaluate(async () => {
      const sc = window.__active;
      const car = sc.playerCar;
      const tr = sc.track;
      const inp = sc.input.touch;
      // rəqiblər qarışmasın
      for (const c of sc.controllers) { if (c.car !== car) { c.active = false; c.car.reset(car.position.clone().set(9000, 0, 9000), 0); } }
      const near = sc._obstacles
        .filter((o) => !o.water && o.r >= 0.5 && o.r <= 12)
        .map((o) => ({ o, lat: Math.abs(tr.getNearest({ x: o.x, z: o.z }, null).lateral) }))
        .filter((x) => x.lat > tr.halfWidth + x.o.r + 0.5 && x.lat < tr.halfWidth + 40)
        .sort((a, b) => a.lat - b.lat)
        .slice(0, 14)
        .map((x) => x.o);
      const out = [];
      for (const o of near) {
        // yola tərəfdən yaxınlaş (obyektdən yolun mərkəzinə doğru 14 m geridə)
        const n = tr.getNearest({ x: o.x, z: o.z }, null);
        const c = tr.points[n.index];
        const dx = c.x - o.x, dz = c.z - o.z;
        const L = Math.hypot(dx, dz) || 1;
        const sx = o.x + (dx / L) * (o.r + 14), sz = o.z + (dz / L) * (o.r + 14);
        car.reset(car.position.clone().set(sx, 0, sz), Math.atan2(o.x - sx, o.z - sz));
        car.wpHint = n.index;
        car._sigOffroad = 5; // yoldan kənar yavaşlaması testə qarışmasın
        inp.throttle = 1; inp.steer = 0;
        let min = Infinity;
        const t0 = performance.now();
        await new Promise((res2) => {
          const tick = () => {
            min = Math.min(min, Math.hypot(car.position.x - o.x, car.position.z - o.z));
            if (performance.now() - t0 < 1600) requestAnimationFrame(tick); else res2();
          };
          requestAnimationFrame(tick);
        });
        out.push({ r: +o.r.toFixed(1), min: +min.toFixed(2), x: Math.round(o.x), z: Math.round(o.z) });
      }
      inp.throttle = 0;
      return out;
    });
    const through = res.filter((x) => x.min < x.r * 0.5);
    // Test özü işləyirmi: maşın maneəyə həqiqətən çatmalıdır (kənarından ≤ 3.5 m)
    const reached = res.filter((x) => x.min < x.r + 3.5).length;
    expect(reached, 'maşın maneələrin əksəriyyətinə çatmalıdır').toBeGreaterThanOrEqual(Math.floor(res.length * 0.8));
    mergeJson('collide.json', m.name, { tested: res.length, through });
    console.log(`${m.name.padEnd(13)} yoxlanıldı ${res.length} · çatılan ${reached} · içindən keçilən ${through.length} ${through.length ? JSON.stringify(through) : ''}`);
    expect(res.length, 'yoxlanacaq maneə tapılmalıdır').toBeGreaterThan(5);
    expect(through, 'içindən keçilən maneələr').toEqual([]);
  });
}
