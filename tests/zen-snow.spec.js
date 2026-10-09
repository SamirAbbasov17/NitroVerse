// ZEN — qar biomu: qalın, sıx qar (yarışdakı "Buz Zirvəsi" treki kimi). Ölçülür: qar yağırmı və nə qədər sıxdır,
// yerdəki örtük, qarlı dekor, performans (draw < 110; üçbucaq əvvəlkindən pis deyil); kadr çəkilir.
import { test, expect } from '@playwright/test';
import path from 'path';
import { boot, startMode, autopilot, measure, MODES, OUT, ensureDir } from './helpers.js';

const DIR = ensureDir(path.join(OUT, 'zen-snow'));
const TAG = process.env.SNOW_TAG || 'now';

test('zen qar biomu: sıx qar yağır, yer qalın örtülüdür, büdcə daxilindədir', async ({ page }) => {
  test.setTimeout(180_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'zen').config);
  await page.evaluate(() => { const s = window.__active; s._setDayTime('day'); s._biomeOverride = 4; });
  await autopilot(page, true);
  await page.waitForTimeout(26_000);                       // biom keçidi, yeni yol hissələri, qarın yığılması
  const perf = await measure(page, 3000);
  const m = await page.evaluate(() => {
    const s = window.__active;
    return { rain: +s._weather.rain.toFixed(2), flakes: s._rain.mesh.visible ? s._rain.mesh.count : 0, snow: +(s._snow || 0).toFixed(2), auto: s._weatherOverride ?? 'auto', style: s.road.style?.id, decor: s.road.style?.decor.join(), fogNear: Math.round(s.scene.fog.near), fogFar: Math.round(s.scene.fog.far) };
  });
  Object.assign(m, { calls: perf.drawCallsP50, callsMax: perf.drawCalls, tris: perf.triangles, p99: perf.intervalP99, fps: perf.fps });
  console.log(`zen qar [${TAG}]:`, JSON.stringify(m));
  await page.screenshot({ path: path.join(DIR, `snow-${TAG}-a.png`) });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(DIR, `snow-${TAG}-b.png`) });
  expect(m.style, 'qar biomundayıq').toBe('snow');
  if (TAG !== 'before') expect(m.decor, 'meşə qarlı şam, qarlı qaya və buz kristalındandır (yaşıl şam yoxdur)').toMatch(/^(snowpine|snowrock|icecrystal)(,(snowpine|snowrock|icecrystal))*$/);
  if (TAG !== 'before') {
    expect(m.rain, 'qar biomunda həmişə qar yağır (güclü)').toBeGreaterThanOrEqual(0.8);
    expect(m.flakes, 'qar dənələri sıxdır').toBeGreaterThanOrEqual(1200);
    expect(m.snow, 'yer qalın qarla örtülüdür').toBeGreaterThanOrEqual(0.95);
    expect(m.calls, 'draw call büdcəsi (zen < 110)').toBeLessThan(110);
    // Üçbucaq: zen-in ümumi həddi 90 000-dir, amma zen bu həddi qar biomundan ƏVVƏL də aşırdı (eyni ölçmə ilə köhnə qar
    // biomu 95–106 min, draw 135–149 idi; yenisi 82–95 min, draw 97–106). Burada yalnız pisləşmənin olmadığı yoxlanır.
    expect(m.tris, 'üçbucaq: köhnə qar biomundan (95–106 min; relyefdən asılı olaraq oynayır) xeyli pis deyil').toBeLessThan(112_000);
  }
  expect(errs).toEqual([]);
});

// SABİTLİK (istifadəçi rəyi: "qar birdən aşağıdan yuxarı getdi", "yer gah tam ağardı, gah yox"):
//  A) qar biomuna keçəndə örtük TAM olur və elə qalır; yol çiyni, təpə və dağlar — əvvəlki biomda qurulmuş hissələr də —
//     hamısı birlikdə ağarır;
//  B) dənələr həmişə maşının ətrafındadır (eniş-yoxuşda da) və kameraya nisbətən heç vaxt yuxarı getmir; sayı sabitdir;
//  C) başqa biomda "qar" seçəndə yer tam ağarır, "açıq" seçəndə tam əriyir — yarımçıq hal qalmır.
test('zen qar: sabitlik — dənələr aşağı düşür, örtük hər yerdə birlikdə və tam ağarır', async ({ page }) => {
  test.setTimeout(240_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'zen').config);
  await page.evaluate(() => { const s = window.__active; s._setDayTime('day'); s._biomeOverride = 0; s._setWeather('clear'); });
  await autopilot(page, true);
  await page.waitForTimeout(7000);
  const sample = () => page.evaluate(() => {
    const s = window.__active, T = window.__THREE, cover = new T.Color(0xe9eff6), tmp = new T.Color();
    const mats = s.road.snowMats.filter((m) => !m.userData.dead), sv = Math.round(s._snow * 200) / 200;
    // hər materialın rəngi gözlənilən örtük səviyyəsindədirmi (əsas rəng → örtük rəngi)
    const off = mats.filter((m) => { tmp.copy(m.userData.snowBase).lerp(cover, sv * m.userData.snowK); return Math.abs(tmp.r - m.color.r) + Math.abs(tmp.g - m.color.g) + Math.abs(tmp.b - m.color.b) > 0.02; }).length;
    const verge = mats.filter((m) => m.userData.snowK > 0.9), g = s._groundMat.color;
    return { snow: +s._snow.toFixed(3), rain: +s._weather.rain.toFixed(2), mats: mats.length, off, vergeMin: verge.length ? +Math.min(...verge.map((m) => Math.min(m.color.r, m.color.g, m.color.b))).toFixed(3) : null, ground: +Math.min(g.r, g.g, g.b).toFixed(3), flakes: s._rain.mesh.visible ? s._rain.mesh.count : 0 };
  });
  const dry = await sample();
  expect([dry.snow, dry.flakes], 'səhrada açıq hava: qar yoxdur').toEqual([0, 0]);

  // ——— A) qar biomuna keç ———
  await page.evaluate(() => { const s = window.__active; s._biomeOverride = 4; s._setWeather(null); });
  const a = []; for (let i = 0; i < 40; i++) { await page.waitForTimeout(450); a.push(await sample()); }
  const settled = a.slice(22);                              // ~10 s-dən sonra
  console.log('A qar biomu:', JSON.stringify({ first: a[0], mid: a[12], last: a[39] }));
  expect(Math.min(...settled.map((x) => x.snow)), 'örtük tamdır və elə qalır').toBe(1);
  expect(Math.max(...a.map((x) => x.off)), 'heç bir çiyin/təpə/dağ materialı örtükdən geri qalmır').toBe(0);
  expect(Math.min(...settled.map((x) => x.vergeMin)), 'yol çiyni ağdır (köhnə hissələrdə də)').toBeGreaterThan(0.72);                 // örtük rəngi xətti fəzada ≈0.81, çiyin 96% örtülür
  const gs = settled.map((x) => x.ground);
  expect(Math.max(...gs) - Math.min(...gs), 'yerin rəngi oynamır').toBeLessThan(0.03);
  expect(new Set(settled.map((x) => x.flakes)).size, 'dənələrin sayı sabitdir').toBe(1);
  expect(settled[0].flakes, 'qar sıxdır').toBeGreaterThanOrEqual(1500);
  expect(Math.min(...a.slice(32).map((x) => x.rain)), 'qar güclənib qalır (≈14 s-dən sonra), kəsilmir').toBeGreaterThanOrEqual(0.85);
  expect(a.every((x, i) => !i || x.rain >= a[i - 1].rain - 0.02), 'qarın gücü keçid zamanı geri-irəli oynamır').toBe(true);

  // ——— B) dənələrin hərəkəti: 6 s (eniş-yoxuşlu yolda) ———
  const fl = await page.evaluate(async () => {
    const s = window.__active, T = window.__THREE, m4 = new T.Matrix4(), N = 240; let prev = null, up = 0, far = 0, total = 0, carMin = 1e9, carMax = -1e9, frames = 0;
    await new Promise((res) => { const t0 = performance.now(); const f = (now) => {
      const cam = s.camera.position.y, car = s.playerCar.position.y, cur = new Float32Array(N); carMin = Math.min(carMin, car); carMax = Math.max(carMax, car);
      for (let i = 0; i < N; i++) { s._rain.mesh.getMatrixAt(i, m4); const y = m4.elements[13]; cur[i] = y - cam; if (y < car - 8 || y > car + 20) far++; if (prev) { const dy = cur[i] - prev[i]; if (dy > 0.25 && dy < 6) up++; } total++; }
      prev = cur; frames++;
      if (now - t0 < 6000) requestAnimationFrame(f); else res();
    }; requestAnimationFrame(f); });
    return { frames, total, up, far, climb: +(carMax - carMin).toFixed(1) };
  });
  console.log('B dənələr:', JSON.stringify(fl));
  expect(fl.up / fl.total, 'dənə kameraya nisbətən yuxarı getmir').toBeLessThan(0.003);
  expect(fl.far / fl.total, 'dənələr həmişə maşının ətrafındadır').toBeLessThan(0.003);

  // ——— C) başqa biomda əl ilə qar, sonra açıq hava ———
  await page.evaluate(() => { const s = window.__active; s._biomeOverride = 1; s._setWeather('clear'); });
  let c = null; for (let i = 0; i < 70; i++) { await page.waitForTimeout(500); c = await sample(); if (c.snow === 0) break; }
  expect(c.snow, 'qar biomundan çıxanda (açıq havada) örtük tam əriyir').toBe(0);
  await page.evaluate(() => window.__active._setWeather('snow'));
  for (let i = 0; i < 50; i++) { await page.waitForTimeout(500); c = await sample(); if (c.snow === 1) break; }
  console.log('C alp + qar:', JSON.stringify(c));
  expect([c.snow, c.off], 'qar seçəndə yer TAM ağarır, bütün materiallar birlikdə').toEqual([1, 0]);
  expect(c.flakes, 'əl ilə qar da sıxdır').toBeGreaterThanOrEqual(1500);
  await page.screenshot({ path: path.join(DIR, `snow-${TAG}-alpine.png`) });
  await page.evaluate(() => window.__active._setWeather('clear'));
  for (let i = 0; i < 70; i++) { await page.waitForTimeout(500); c = await sample(); if (c.snow === 0) break; }
  expect([c.snow, c.off, c.flakes], 'açıq seçəndə tam əriyir').toEqual([0, 0, 0]);
  expect(errs).toEqual([]);
});
