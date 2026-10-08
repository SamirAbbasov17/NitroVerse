// Yarış: yolu kəsdirmək və xətdən geri-irəli getmək dövrə/mövqe qazandırmır (sektor nəzarəti —
// bax RaceManager). Qanuni dövrə və trekin öz qısayolları (şaxələr) əvvəlki kimi sayılır.
// Maşın trek boyu addım-addım yerləşdirilir (scene._place) — sürmə bacarığı yox, sayma məntiqi yoxlanır.
import { test, expect } from '@playwright/test';
import { boot, startMode, TRACKS } from './helpers.js';

const HELPERS = () => {
  const sc = window.__active, rm = sc.raceManager, tr = sc.track, N = tr.points.length;
  const me = rm.getPlayer(), car = sc.playerCar;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const put = (p, tg) => sc._place(car, { position: p.clone(), heading: Math.atan2(tg.x, tg.z) });
  const at = (t) => { const i = ((Math.round(t * N) % N) + N) % N; put(tr.points[i], tr.tangents[i]); };
  // trek boyu a → b (b < a ola bilər: geriyə); hər kadr 0.008
  const walk = async (a, b) => { const n = Math.ceil(Math.abs(b - a) / 0.008); for (let i = 0; i <= n; i++) { at(a + ((b - a) * i) / n); await frame(); await frame(); } };
  const wait = async (s) => { const t0 = performance.now(); while (performance.now() - t0 < s * 1000) await frame(); };
  return { sc, rm, tr, me, car, frame, at, walk, wait, put };
};

test('yarış: kəsdirmə və geri-irəli hiyləsi dövrə vermir; qanuni dövrə sayılır', async ({ page }) => {
  test.setTimeout(240_000);
  await boot(page);
  await startMode(page, { mode: 'race', trackId: 'desert', carId: 'blaze', laps: 9, difficulty: 'normal' });
  await page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30_000 });
  await page.evaluate(`window.__H = (${HELPERS.toString()})()`);
  const r = await page.evaluate(async () => {
    const { sc, me, car, walk, at, wait } = window.__H, out = {};
    sc.playerCar.controller = null;
    await walk(0.97, 1.04);                                  // xətti qanuni keç
    out.start = { lap: me.lap, sec: me.sec };
    // 1) KƏSDİRMƏ: 4-cü faizdən 45-ə atıl və dövrəni "tamamla"
    at(0.45); await wait(1.3);
    out.cut = { cut: me.cut, lap: me.lap, progress: +me.progress.toFixed(3), hud: document.querySelector('.hud__rescue')?.textContent || '', shown: document.querySelector('.hud__rescue')?.classList.contains('is-visible') };
    out.rank = me.position;
    // "yola qayıt" irəli aparmır — buraxılmış hissənin başına qoyur
    sc._rescueCooldown = 0; sc._rescuePlayer(true); await wait(0.2);
    out.rescueT = +car.trackT.toFixed(3);
    at(0.45); await wait(0.3);
    await walk(0.45, 1.03);
    out.afterCutLap = me.lap;
    // 2) GERİ-İRƏLİ: xətdən geri 30% get, qayıt
    await walk(1.03, 0.70); await walk(0.70, 1.03);
    out.afterReverseLap = me.lap;
    // 3) QANUNİ DÖVRƏ: bütün trek sıra ilə
    await walk(0.03, 1.03);
    out.legitLap = me.lap; out.lapTimes = me.lapTimes.length; out.cutEnd = me.cut;
    return out;
  });
  console.log('kəsdirmə:', JSON.stringify(r));
  expect(r.start.lap, 'ilk xətt keçidi').toBe(0);
  expect(r.cut.cut, 'kəsdirmə tanınır').toBe(true);
  expect(r.cut.progress, 'proqres təsdiqlənmiş sektorda dayanır').toBeLessThan(0.1);
  expect(r.cut.shown, 'xəbərdarlıq görünür').toBe(true);
  expect(r.cut.hud).toContain('Yolu kəsdin');
  expect(r.rescueT, '"yola qayıt" buraxılmış hissənin başına qoyur').toBeLessThan(0.12);
  expect(r.afterCutLap, 'kəsdirib xətti keçmək dövrə vermir').toBe(0);
  expect(r.afterReverseLap, 'geri-irəli dövrə vermir').toBe(0);
  expect(r.legitLap, 'qanuni dövrə sayılır').toBe(1);
  expect(r.cutEnd).toBe(false);
});

for (const trackId of TRACKS) {
  test(`yarış: qısayollar qanunidir — ${trackId}`, async ({ page }) => {
    test.setTimeout(240_000);
    await boot(page);
    await startMode(page, { mode: 'race', trackId, carId: 'blaze', laps: 9, difficulty: 'normal' });
    await page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30_000 });
    await page.evaluate(`window.__H = (${HELPERS.toString()})()`);
    const r = await page.evaluate(async () => {
      const { tr, me, walk, put, frame } = window.__H, out = [];
      await walk(0.97, 1.02);
      let pos = 0.02;
      for (const b of [...(tr.branches || [])].sort((x, y) => x.t0 - y.t0)) {
        await walk(pos, b.t0 - 0.01);
        let cutFrames = 0;
        for (let i = 0; i < b.points.length; i += 2) { put(b.points[i], b.tangents[i]); await frame(); await frame(); if (me.cut) cutFrames++; }
        await walk(b.t1 + 0.005, b.t1 + 0.03);
        out.push({ t0: b.t0, t1: b.t1, cutFrames, cut: me.cut, sec: me.sec, want: Math.floor((b.t1 + 0.03) * 12) });
        pos = b.t1 + 0.03;
      }
      await walk(pos, 1.03);
      return { branches: out, lap: me.lap };
    });
    console.log(trackId, JSON.stringify(r));
    for (const b of r.branches) {
      expect(b.cut, `${trackId} şaxə ${b.t0}: kəsdirmə sayılmır`).toBe(false);
      expect(b.cutFrames, `${trackId} şaxə ${b.t0}: yol boyu da`).toBeLessThan(20);
      expect(b.sec).toBe(b.want);
    }
    expect(r.lap, `${trackId}: dövrə sayıldı`).toBe(1);
  });
}

test('yarış: "yolu kəsdin" xəbərdarlığı telefonda sığır (ru — ən uzun mətn)', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await boot(page, { lang: 'ru' });
  await startMode(page, { mode: 'race', trackId: 'desert', carId: 'blaze', laps: 9, difficulty: 'normal' });
  await page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30_000 });
  await page.evaluate(`window.__H = (${HELPERS.toString()})()`);
  const r = await page.evaluate(async () => {
    const { walk, at, wait } = window.__H;
    await walk(0.97, 1.04); at(0.45); await wait(1.3);
    const el = document.querySelector('.hud__rescue'), b = el.getBoundingClientRect();
    return { shown: el.classList.contains('is-visible'), text: el.textContent.trim(), left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), w: innerWidth, h: innerHeight };
  });
  await page.screenshot({ path: 'tests/out/shots/m-race-cut-ru.png' });
  console.log('telefon:', JSON.stringify(r));
  expect(r.shown).toBe(true);
  expect(r.left).toBeGreaterThanOrEqual(0); expect(r.right).toBeLessThanOrEqual(r.w);
  expect(r.top).toBeGreaterThanOrEqual(0); expect(r.bottom).toBeLessThanOrEqual(r.h);
  await ctx.close();
});
