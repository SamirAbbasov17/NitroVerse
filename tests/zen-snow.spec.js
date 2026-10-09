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
//  C) QAR HAVASI ≠ QARLIQ ƏRAZİ: başqa biomda "qar" seçəndə nazik, sabit çən düşür (tam örtük və buz yoxdur);
//  D) qarlıq ərazi açıq havada da qarlıq qalır.
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
    return { snow: +s._snow.toFixed(3), rain: +s._weather.rain.toFixed(2), mats: mats.length, off, vergeMin: verge.length ? +Math.min(...verge.map((m) => Math.min(m.color.r, m.color.g, m.color.b))).toFixed(3) : null, ground: +Math.min(g.r, g.g, g.b).toFixed(3), flakes: s._rain.mesh.visible ? s._rain.mesh.count : 0, frost: +(s._frost || 0).toFixed(3), ice: +s.water.material.emissiveIntensity.toFixed(3) };
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
  expect(settled[0].flakes, 'qarlıq ərazidə qar sıxdır').toBeGreaterThanOrEqual(1500);
  expect([settled[0].frost, settled[0].ice > 0.3], 'qarlıq ərazidə göl donub').toEqual([1, true]);
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

  // ——— C) QAR HAVASI qarlıq ərazi DEYİL: başqa biomda "qar" seçəndə qar yağır və yerə nazik çən düşür, amma ərazi
  //        qarlığa çevrilmir (tam örtük yox, göl donmur, qar o qədər sıx deyil); "açıq" seçəndə çən tam əriyir ———
  await page.evaluate(() => { const s = window.__active; s._biomeOverride = 1; s._setWeather('clear'); });
  let c = null; for (let i = 0; i < 70; i++) { await page.waitForTimeout(500); c = await sample(); if (c.snow === 0 && c.frost === 0) break; }
  expect([c.snow, c.frost, c.ice], 'qarlıq ərazidən çıxanda (açıq hava) örtük və buz tam gedir').toEqual([0, 0, 0]);
  await page.evaluate(() => window.__active._setWeather('snow'));
  const cs = []; for (let i = 0; i < 44; i++) { await page.waitForTimeout(500); cs.push(await sample()); }
  c = cs[cs.length - 1];
  console.log('C alp + qar havası:', JSON.stringify(c));
  expect([c.snow, c.off, c.frost, c.ice], 'qar havası: nazik çən (0.4), göl donmur, hamısı birlikdə').toEqual([0.4, 0, 0, 0]);
  expect(Math.max(...cs.map((x) => x.snow)), 'çən heç vaxt tam örtüyə çevrilmir').toBeLessThanOrEqual(0.4);
  expect(new Set(cs.slice(20).map((x) => x.snow)).size, 'çənin səviyyəsi sabit qalır').toBe(1);
  expect(c.flakes, 'qar havasında dənələr qarlıq ərazidəkindən seyrəkdir').toBe(560);
  await page.screenshot({ path: path.join(DIR, `snow-${TAG}-alpine.png`) });
  await page.evaluate(() => window.__active._setWeather('clear'));
  for (let i = 0; i < 70; i++) { await page.waitForTimeout(500); c = await sample(); if (c.snow === 0) break; }
  expect([c.snow, c.off, c.flakes], 'açıq seçəndə çən tam əriyir, qar kəsilir').toEqual([0, 0, 0]);
  // ——— D) qarlıq ərazidə havanı "açıq" seçəndə qar yağmır, amma ərazi qarlıq qalır ———
  await page.evaluate(() => { const s = window.__active; s._biomeOverride = 4; s._setWeather('clear'); });
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(500); c = await sample(); if (c.snow === 1 && c.frost === 1 && c.flakes === 0) break; }
  console.log('D qarlıq ərazi + açıq hava:', JSON.stringify(c));
  expect([c.snow, c.frost, c.flakes], 'qarlıq ərazi açıq havada da qarlıqdır; göydən qar yağmır').toEqual([1, 1, 0]);
  await page.screenshot({ path: path.join(DIR, `snow-${TAG}-clear.png`) });
  expect(errs).toEqual([]);
});

// GECƏ: qaranlıqda qar ağ (ay işığında açıq mavi-ağ) görünür — yer tünd boz qalmır.
test('zen qar: gecə qar ağ görünür', async ({ page }) => {
  test.setTimeout(200_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'zen').config);
  await page.evaluate(() => { const s = window.__active; s._setDayTime('night'); s._biomeOverride = 4; });
  await autopilot(page, true);
  await page.waitForTimeout(24_000);
  await page.screenshot({ path: path.join(DIR, `snow-${TAG}-night.png`) });
  // ekrandan ölç: yolun kənarındakı qarlı yerin və qar dənələrinin parlaqlığı
  const px = await page.evaluate(() => {
    const s = window.__active, g = s._groundMat.color, lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    return { night: +(s._dayNow?.night ?? 0).toFixed(2), groundLum: +lum(g).toFixed(3), groundBlueOverRed: +(g.b / Math.max(1e-3, g.r)).toFixed(2), flakeOpacity: +s._rain.mesh.material.opacity.toFixed(2), flakeColor: '#' + s._rain.mesh.material.color.getHexString(), glow: +s._groundMat.emissiveIntensity.toFixed(2) };
  });
  console.log(`gecə qar [${TAG}]:`, JSON.stringify(px));
  if (TAG !== 'before') {
    expect(px.night, 'gecədir').toBeGreaterThan(0.8);
    expect(px.groundLum, 'gecə qarlı yer açıqdır (tünd boz deyil)').toBeGreaterThan(1.05);
    expect(px.glow, 'gecə qarlı yer öz işığı ilə görünür').toBeGreaterThan(0.25);
    expect(px.flakeColor, 'dənələr ağdır').toBe('#ffffff');
  }
  expect(errs).toEqual([]);
});

// TUNEL (real tunel: yolun 1480–1710-cu metrləri) və QAR ↔ YAĞIŞ keçidi:
//  • tunelə yaxınlaşdıqca qar azalır, girişdə artıq yoxdur, içəridə heç yağmır, çıxandan sonra qayıdır;
//  • qardan yağışa (və əksinə) keçid birdən olmur: əvvəlki yağıntı sönür, sonra yenisi güclənir.
test('zen qar: tunelə yaxınlaşdıqca azalır, içəridə yağmır; qar ↔ yağış tədricən keçir', async ({ page }) => {
  test.setTimeout(240_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'zen').config);
  await page.evaluate(() => { const s = window.__active; s._setDayTime('day'); s._biomeOverride = 4; });
  await autopilot(page, true);
  const where = () => page.evaluate(() => { const s = window.__active, m = ((s.road.getNearest(s.playerCar.position, s.playerCar.wpHint).index * 8) % 2600 + 2600) % 2600; return { m, vis: s._rain.mesh.visible, op: +s._rain.mesh.material.opacity.toFixed(3), rain: +s._weather.rain.toFixed(2), type: s._fallType }; });
  // tunelə 150 m qalana qədər sür
  let w = await where(); const t0 = Date.now();
  while (!(w.m > 1330 && w.m < 1420) && Date.now() - t0 < 120_000) { await page.waitForTimeout(250); w = await where(); }
  expect(w.m, 'tunelə yaxınlaşdıq').toBeGreaterThan(1330);
  const log = []; let shotIn = false, shotNear = false;
  for (let i = 0; i < 260; i++) {
    w = await where(); log.push(w);
    if (!shotNear && w.m > 1455) { shotNear = true; await page.screenshot({ path: path.join(DIR, `snow-${TAG}-tunnel-entry.png`) }); }
    if (!shotIn && w.m > 1560) { shotIn = true; await page.screenshot({ path: path.join(DIR, `snow-${TAG}-tunnel-inside.png`) }); }
    if (w.m > 1800 || w.m < 1300) break;
    await page.waitForTimeout(60);
  }
  const far = log.filter((x) => x.m < 1400), near = log.filter((x) => x.m >= 1462 && x.m < 1478), inside = log.filter((x) => x.m >= 1490 && x.m <= 1700), after = log.filter((x) => x.m > 1760);
  const mx = (a) => Math.max(...a.map((x) => x.op)), mn = (a) => Math.min(...a.map((x) => x.op));
  console.log('tunel:', JSON.stringify({ far: [mn(far), mx(far)], near: [mn(near), mx(near)], inside: [mn(inside), mx(inside)], after: mx(after), n: log.length }));
  expect(mn(far), 'tuneldən uzaqda qar tam gücdədir').toBeGreaterThan(0.85);
  expect(mx(near), 'girişə 18 m qalmış qar xeyli azalıb').toBeLessThan(0.35);
  expect(mx(log.filter((x) => x.m >= 1440 && x.m < 1452)), 'girişə ~35 m qalmış artıq azalıb').toBeLessThan(0.8);
  expect(mx(inside), 'tunelin içində qar yağmır').toBeLessThan(0.02);
  expect(inside.some((x) => x.vis), 'içəridə hissəciklər çəkilmir').toBe(false);
  expect(mx(after), 'çıxandan sonra qar qayıdır').toBeGreaterThan(0.85);
  const ap = log.filter((x) => x.m >= 1400 && x.m <= 1480).map((x) => x.op);
  expect(ap.every((v, i) => !i || v <= ap[i - 1] + 0.02), 'yaxınlaşdıqca qar yalnız azalır (geri-irəli oynamır)').toBe(true);

  // geri-geri getmək: yaxınlıq yalnız mövqedən asılıdır və hər iki ağızda eynidir (istiqamətdən asılı deyil)
  const sym = await page.evaluate(() => {
    const r = window.__active.road, orig = r.getNearest, at = (m) => { r.getNearest = () => ({ index: m / 8 }); const v = r.tunnelNear({}); r.getNearest = orig; return +v.toFixed(3); };
    return { before: [at(1480 - 16), at(1480 - 40), at(1480 - 64)], after: [at(1710 + 16), at(1710 + 40), at(1710 + 64)], inside: at(1600) };
  });
  console.log('tunel ağızları:', JSON.stringify(sym));
  expect(sym.before, 'giriş və çıxış ağzında eyni məsafədə eyni yaxınlıq (geri çıxanda da eyni)').toEqual(sym.after);
  expect([sym.inside, sym.before[2]], 'içəridə 1, 64 m-də 0').toEqual([1, 0]);

  // ——— QAR → YAĞIŞ → QAR: növ birdən dəyişmir ———
  const watch = async (weather, ms) => {
    await page.evaluate((k) => window.__active._setWeather(k), weather);
    const out = []; const t1 = Date.now();
    while (Date.now() - t1 < ms) { const x = await where(); if (x.m < 1380 || x.m > 1800) out.push({ t: (Date.now() - t1) / 1000, type: x.type, op: x.op }); await page.waitForTimeout(50); }
    return out;
  };
  const check = (seq, from, to, label) => {
    const k = seq.findIndex((x) => x.type === to);
    console.log(label, JSON.stringify({ switchAt: k < 0 ? null : +seq[k].t.toFixed(1), opBefore: k > 0 ? seq[k - 1].op : null, opAfter: k >= 0 ? seq[k].op : null, end: seq[seq.length - 1] }));
    expect(k, `${label}: növ dəyişdi`).toBeGreaterThan(0);
    expect(seq[k].t, `${label}: dəyişmə tələsik deyil (əvvəlki yağıntı sönməlidir)`).toBeGreaterThan(1.8);
    expect(Math.max(seq[k - 1].op, seq[k].op), `${label}: növ dəyişən anda yağıntı görünmür`).toBeLessThan(0.06);
    expect(seq.slice(0, k).every((x) => x.type === from), `${label}: sönənə qədər əvvəlki növ qalır`).toBe(true);
    expect(seq[seq.length - 1].op, `${label}: sonda yeni yağıntı güclənib`).toBeGreaterThan(0.3);
  };
  check(await watch('rain', 9000), 1, 0, 'qar → yağış');
  check(await watch('snow', 9000), 0, 1, 'yağış → qar');
  expect(errs).toEqual([]);
});
