// CARMAGEDDON Fəsil 1 — QAÇIŞ və SON. Yoxlanır: mexanikalar (zədə, yanacaq, nitro, yaddaş nöqtəsi,
// Butcher-i nitrosuz ötmək olmur, körpüdən nitrosuz tullanmaq olmur), beş hissənin hamısı KEÇİLƏ
// BİLİR (sadə avtopilot real idarə ilə — düymələrlə — sürür), finala keçid, telefon.
import { test, expect } from '@playwright/test';
import path from 'path';
import { boot, OUT, ensureDir, cgLeave, cgSkip } from './helpers.js';

const DIR = ensureDir(path.join(OUT, 'carmageddon'));
const openChase = async (page, sec = 0) => {
  await page.evaluate((s) => { localStorage.setItem('cgCh1', JSON.stringify({ stage: 'chase', sec: s, q: {}, got: [], seen: [] })); window.__menu.onOpenGame('carmageddon'); }, sec);
  await page.waitForSelector('.cg.is-ready', { timeout: 30_000 });
  await page.locator('[data-cg="story"]').click();
  await page.waitForSelector('.cgs.is-ready', { timeout: 20_000 });
  await page.locator('.cgs__card').click({ timeout: 10_000 }).catch(() => {});
  await page.waitForFunction(() => !!window.__cgStory?._chase?.G, null, { timeout: 15_000 });
};

// Avtopilot: yalnız düymələrlə (keys / nitro) sürür — oyunçunun edə biləcəyindən artıq heç nə etmir.
const BOT = () => {
  const C = window.__cgStory._chase;
  window.__bot = { deaths: [0, 0, 0, 0, 0], last: -1, wasDead: false };
  const cxAt = (S, d) => 240 + Math.sin(d / S.wl) * S.amp + Math.sin(d / (S.wl * 0.37) + 1.3) * S.amp * 0.35;
  const tick = () => {
    const c = window.__cgStory?._chase; if (!c) return;
    window.__botRaf = requestAnimationFrame(tick);
    const G = c.G, S = c.S, B = window.__bot;
    if (G.dead > 0 && !B.wasDead) { B.deaths[c.si]++; } B.wasDead = G.dead > 0;
    if (G.dead || G.won) { c.keys.clear(); return; }
    const hw = S.hw(G.d), rc = cxAt(S, G.d + 30);
    // namizəd zolaqlar: hər biri üçün qabaqdakı təhlükələrə görə cərimə
    let best = rc, score = -1e9;
    for (let k = -1; k <= 1.001; k += 0.2) {
      const x = cxAt(S, G.d + 50) + k * (hw - 14); let sc = -Math.abs(x - G.x) * 0.25 - Math.abs(k) * 6;
      for (const e of G.ents) {
        const ahead = e.d - G.d; if (ahead < -20 || ahead > 150) continue;
        if (e.k === 'rock' || e.k === 'barrel' || (e.k === 'fall' && e.on)) { const dx = Math.abs(e.x - x); if (dx < 26) sc -= (26 - dx) * (160 - ahead) * 0.12; }
        else if (e.k === 'patch') { const dx = Math.abs(e.x - x); if (dx < e.r + 16) sc -= (e.r + 16 - dx) * 5; }
        else if (e.k === 'cloud') { const dx = Math.abs(e.x - x); if (dx < 42) sc -= (42 - dx) * 3; }
        else if (e.k === 'pole' && e.x0 !== undefined) { if (x > e.x0 - 10 && x < e.x1 + 10) sc -= 400; }
        else if (e.k === 'chain') { sc -= Math.abs(e.gap - x) * 4; }
        else if (e.k === 'chaser' && e.st !== 'sleep' && Math.abs(ahead) < 40) { const dx = Math.abs(e.x - x); if (dx < 30) sc -= (30 - dx) * 2; }
        else if ((e.k === 'fuel' || e.k === 'nitro' || e.k === 'fix') && ahead > 10) { const dx = Math.abs(e.x - x); if (dx < 16) sc += e.k === 'fuel' ? (G.fuel < 70 ? 60 : 15) : 30; }
      }
      if (G.truck?.slam && Math.abs(G.truck.x - x) < 46) sc -= 500;                      // Butcher əyləcə basır — arxasında qalma
      if (sc > score) { score = sc; best = x; }
    }
    c.keys.delete('left'); c.keys.delete('right'); c.keys.delete('down'); c.keys.delete('up');
    if (G.hook) { if (Math.floor(G.t * 4) % 2) c.keys.add('left'); else c.keys.add('right'); }        // qarmaq: ◀ ▶ növbə ilə (saniyədə 4 dəyişmə — insan sürəti)
    else { const pred = G.x + G.vx * 0.12; if (best < pred - 4) c.keys.add('left'); else if (best > pred + 4) c.keys.add('right'); }
    // kanyon: təqibçi nişan alanda əyləc (qabağa keçsin)
    if (G.ents.some((e) => e.k === 'chaser' && (e.st === 'aim' || e.st === 'ram') && Math.abs(e.d - G.d) < 44)) c.keys.add('down'); else if (G.y > 205) c.keys.add('up');
    if (S.id === 'truck' && G.d > S.len - 330 && G.boost <= 0) c.nitro();
    if (S.id === 'bridge' && G.d > S.len - 300 && G.boost <= 0 && !G.jump) c.nitro();
  };
  tick();
  return !!C;
};

test('qaçış: mexanikalar və yaddaş nöqtəsi', async ({ page }) => {
  test.setTimeout(240_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await openChase(page, 0);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(DIR, 'chase-1.png') });
  const r = await page.evaluate(async () => {
    const c = window.__cgStory._chase, out = {}; const frames = (n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const clear = () => { c.G.ents.length = 0; };
    // 1) sükan və əyləc
    clear(); const x0 = c.G.x; c.keys.add('right'); await frames(20); c.keys.clear(); out.steer = c.G.x - x0;
    clear(); const y0 = c.G.y; c.keys.add('down'); await frames(30); out.back = c.G.y - y0; c.keys.clear(); c.keys.add('up'); await frames(60); out.fwd = y0 - c.G.y; c.keys.clear(); await frames(5); c.G.y = 200; c.G.vy = 0;
    // 2) nitro: yük xərclənir, sürət artır
    clear(); await frames(30); const n0 = c.G.nitro; c.nitro(); await frames(30); out.nitro = { used: n0 - c.G.nitro, v: +(c.G.v / c.S.speed).toFixed(2) };
    // 3) maneə zədələyir; kanistr yanacaq verir
    clear(); await frames(60); c.G.boost = 0; const hp0 = c.G.hp; c.G.ents.push({ k: 'rock', d: c.G.d + 30, x: c.G.x, r: 9 }); await frames(30); out.rockDmg = Math.round(hp0 - c.G.hp);
    clear(); c.G.fuel = 40; c.G.ents.push({ k: 'fuel', d: c.G.d + 30, x: c.G.x }); await frames(30); out.fuelAfter = Math.round(c.G.fuel);
    // 4) can bitəndə hissə əvvəldən (yaddaş nöqtəsi); yanacaq bitəndə də
    c.G.d = 900; c.G.hp = 5; c.G.ents.push({ k: 'rock', d: c.G.d + 20, x: c.G.x, r: 9 }); await frames(30); out.deadAfterHit = c.G.dead > 0;
    await new Promise((res) => setTimeout(res, 1800)); out.restart = { si: c.si, d: Math.round(c.G.d) < 200, hp: c.G.hp };
    clear(); c.G.fuel = 0.05; await frames(10); out.noFuelDead = c.G.dead > 0;
    await new Promise((res) => setTimeout(res, 1800));
    out.saved = JSON.parse(localStorage.getItem('cgCh1')).sec;
    return out;
  });
  console.log('qaçış mexanikaları:', JSON.stringify(r));
  expect(r.steer, 'sükan').toBeGreaterThan(15);
  expect(r.back, 'geri çəkilir').toBeGreaterThan(20); expect(r.fwd, 'irəli çıxır').toBeGreaterThan(30);
  expect(r.nitro.used).toBe(1); expect(r.nitro.v, 'nitro sürətləndirir').toBeGreaterThan(1.3);
  expect(r.rockDmg, 'maneə zədələyir').toBeGreaterThanOrEqual(15);
  expect(r.fuelAfter, 'kanistr yanacaq verir').toBeGreaterThan(70);
  expect(r.deadAfterHit).toBe(true);
  expect(r.restart, 'hissə əvvəldən başladı').toEqual({ si: 0, d: true, hp: 100 });
  expect(r.noFuelDead, 'yanacaq bitəndə uduzursan').toBe(true);
  expect(r.saved).toBe(0);
  // 5) Butcher-i nitrosuz ötmək olmur; körpüdən nitrosuz tullanmaq olmur
  const gates = await page.evaluate(async () => {
    const c = window.__cgStory._chase, out = {}; const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    c.start(3); c.G.ents.length = 0; c.G.nitro = 0; c.G.d = c.S.len - 170; await wait(500);
    out.truckBack = c.G.d < c.S.len - 300; out.truckHp = c.G.hp < 100;
    c.G.ents.length = 0; c.G.d = c.S.len - 170; c.G.boost = 1.4; await wait(400); out.truckPass = !!c.G.truck.pass;
    c.start(4); c.G.ents.length = 0; c.G.hooks.length = 0; c.G.nitro = 0; c.G.d = c.S.len - 90; await wait(400); out.bridgeFail = c.G.dead > 0;
    await wait(1700);
    c.G.ents.length = 0; c.G.hooks.length = 0; c.G.d = c.S.len - 90; c.G.boost = 1.4; await wait(300); out.bridgeJump = c.G.jump > 0;
    return out;
  });
  console.log('qapılar:', JSON.stringify(gates));
  expect(gates).toEqual({ truckBack: true, truckHp: true, truckPass: true, bridgeFail: true, bridgeJump: true });
  // 6) qaçış bitəndə final başlayır (ətraflı: carmageddon-finale.spec.js) və yaddaş silinir
  await page.waitForFunction(() => !!window.__cgStory?._finale, null, { timeout: 15_000 });
  expect(await page.evaluate(() => localStorage.getItem('cgCh1')), 'fəsil bitdi — yaddaş silindi').toBeNull();
  await cgLeave(page);
  await expect(page.locator('.cgs')).toHaveCount(0, { timeout: 10_000 });
  expect(errs).toEqual([]);
});

test('qaçış: beş hissənin hamısı keçilə bilir (avtopilot düymələrlə sürür)', async ({ page }) => {
  test.setTimeout(900_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await openChase(page, 0);
  await page.evaluate(BOT);
  const shots = new Set();
  const t0 = Date.now();
  let done = false;
  let cuts = 0; const cutLines = [];
  while (Date.now() - t0 < 820_000) {
    // hissələr arası ara səhnə: ilk sətri yadda saxla, sonra "Keç"
    if (await page.locator('.cgs__skip').isVisible()) { await page.waitForTimeout(700); cutLines.push(await page.evaluate(() => window.__cgStory.dlg.full || '')); cuts++; await cgSkip(page); await page.waitForTimeout(900); continue; }
    const s = await page.evaluate(() => { const c = window.__cgStory?._chase; return c ? { si: c.si, d: Math.round(c.G.d), len: c.S.len, id: c.S.id } : null; });
    if (!s) { done = true; break; }
    if (!shots.has(s.id) && s.d > 700) { shots.add(s.id); await page.screenshot({ path: path.join(DIR, `chase-${s.id}.png`) }); }
    await page.waitForTimeout(400);
  }
  const bot = await page.evaluate(() => window.__bot);
  console.log(`avtopilot: ${done ? 'bitirdi' : 'BİTİRMƏDİ'} · ${Math.round((Date.now() - t0) / 1000)} s · qəzalar hissə üzrə ${JSON.stringify(bot.deaths)}`);
  expect(done, 'bütün hissələr keçildi').toBe(true);
  console.log('ara səhnələr:', cuts, cutLines.map((l) => l.slice(0, 28)));
  expect(cuts, 'hər iki hissə arasında ara səhnə oynandı').toBe(4);
  expect(cutLines.every((l) => l.length > 40), 'ara səhnənin mətni görünür').toBe(true);
  expect(Math.max(...bot.deaths), 'heç bir hissə avtopilot üçün ümidsiz çətin deyil').toBeLessThan(12);
  expect(errs).toEqual([]);
});

test('qaçış telefonda: düymələr görünür və işləyir', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await boot(page, { lang: 'ru' });
  await openChase(page, 1);
  await page.waitForTimeout(500);
  const fit = await page.evaluate(() => [...document.querySelectorAll('.cgc__pad button, .cgc__hud, .cgc__prog')].every((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }) && Math.min(...[...document.querySelectorAll('.cgc__pad button')].map((b) => b.getBoundingClientRect().width)) >= 56);
  expect(fit, 'düymələr və göstəricilər ekrandadır').toBe(true);
  await page.screenshot({ path: path.join(DIR, 'chase-m.png') });
  const x0 = await page.evaluate(() => { window.__cgStory._chase.G.ents.length = 0; return window.__cgStory._chase.G.x; });
  const b = await page.locator('.cgc__pad [data-k="left"]').boundingBox();
  await page.evaluate(([bx, by]) => { const el = document.elementFromPoint(bx, by); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, clientX: bx, clientY: by })); }, [b.x + b.width / 2, b.y + b.height / 2]);
  await page.waitForTimeout(350);
  const x1 = await page.evaluate(() => window.__cgStory._chase.G.x);
  await page.evaluate(() => document.querySelector('.cgc__pad [data-k="left"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 })));
  expect(x0 - x1, 'sol düymə maşını sola aparır').toBeGreaterThan(10);
  const n0 = await page.evaluate(() => window.__cgStory._chase.G.nitro);
  await page.evaluate(() => document.querySelector('.cgc__pad [data-k="nitro"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 8 })));
  expect(await page.evaluate(() => window.__cgStory._chase.G.nitro)).toBe(n0 - 1);
  await ctx.close();
});

// Hər hissənin kadrı (vizual yoxlama üçün): avtopilot sürür, 2.5 s sonra şəkil çəkilir
test('qaçış: beş hissənin kadrları', async ({ page }) => {
  test.setTimeout(120_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await openChase(page, 0);
  await page.evaluate(BOT);
  for (let i = 0; i < 5; i++) {
    const id = await page.evaluate((k) => { const c = window.__cgStory._chase; c.start(k); c.G.d = 600; return c.S.id; }, i);
    // kadr vaxtı: 2 s ərzində çəkilən kadrların sayı və ən uzun kadr
    const ft = await page.evaluate(() => new Promise((res) => { let n = 0, worst = 0, last = performance.now(); const t0 = last; const f = (now) => { n++; worst = Math.max(worst, now - last); last = now; if (now - t0 < 2000) requestAnimationFrame(f); else res({ fps: Math.round(n / 2), worst: Math.round(worst) }); }; requestAnimationFrame(f); }));
    console.log(`${id}: ${ft.fps} kadr/s, ən uzun kadr ${ft.worst} ms`);
    expect(ft.fps, `${id}: kadr sürəti`).toBeGreaterThan(45);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(DIR, `chase-look-${id}.png`) });
    const ok = await page.evaluate(() => { const a = window.__cgStory.art; return !!(a.cars && a.props && a['ground-camp'] && a['ground-canyon'] && a['ground-fog'] && a['ground-truck']); });
    expect(ok, 'maşın, obyekt və yer şəkilləri yüklənib').toBe(true);
  }
  expect(errs).toEqual([]);
});

// Genişlənmiş qaçış: hər hissədə üç mərhələ və ortada yaddaş nöqtəsi; yeni mexanikalar ölçülür, mərhələlərin kadrı çəkilir.
test('qaçış: yeni mexanikalar — yaxın keçid, nitro ilə dağıtma, uçqun, alov, deşik, əyləc, orta yaddaş nöqtəsi', async ({ page }) => {
  test.setTimeout(240_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await openChase(page, 0);
  const r = await page.evaluate(async () => {
    const c = window.__cgStory._chase, out = {}; const frames = (n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const clear = () => { c.G.ents.length = 0; c.G.y = 200; c.G.vy = 0; c.G.boost = 0; };
    out.lens = c.SECTIONS.map((s) => s.len);
    // 1) yaxın keçid: maneənin yanından (toxunmadan) üç dəfə keç → +1 nitro
    c.start(0); clear(); c.G.nitro = 1; await frames(5);
    for (let i = 0; i < 3; i++) { c.G.ents.push({ k: 'rock', d: c.G.d + 40, x: c.G.x + 28, r: 9 }); await frames(34); }
    out.near = { nitro: c.G.nitro, hp: c.G.hp };
    // 2) nitro ilə sipəri dağıtmaq zədələmir; nitrosuz zədələyir
    clear(); let d0 = Math.ceil(c.G.d / 3) * 3 + 60; c.G.boost = 1.4; const hpA = c.G.hp; c.G.ents.push({ k: 'rock', d: d0, x: c.G.x, r: 9 }); await frames(40); out.smashDmg = Math.round(hpA - c.G.hp);
    clear(); d0 = Math.ceil(c.G.d / 3) * 3 + 62; const hpB = c.G.hp; c.G.ents.push({ k: 'rock', d: d0, x: c.G.x, r: 9, hard: true }); c.G.boost = 1.4; await frames(40); out.hardDmg = Math.round(hpB - c.G.hp);
    // 3) uçqun: kölgə → düşür → yolda qaya qalır
    c.start(1); clear(); await frames(3); c.G.ents.push({ k: 'fall', d: c.G.d + 200, x: c.G.x + 50, r: 11, into: 'rock' }); await frames(20);
    out.fallOn = c.G.ents.some((e) => e.k === 'fall' && e.on); await frames(60);
    out.fallGone = !c.G.ents.some((e) => e.k === 'fall');
    // 4) yanan ləkə içində can azalır
    clear(); const hpC = c.G.hp; c.G.ents.push({ k: 'patch', d: c.G.d + 30, x: c.G.x, r: 22 }); await frames(30); out.patchDmg = +(hpC - c.G.hp).toFixed(1);
    // 5) orta yaddaş nöqtəsi: ortanı keç, sonra qəza → ortadan başla
    clear(); c.G.d = c.S.len * 0.5 - 20; c.G.hp = 80; await frames(20); out.cp = c.G.cp;
    clear(); c.G.hp = 4; c.G.ents.push({ k: 'rock', d: c.G.d + 20, x: c.G.x, r: 9, hard: true }); await frames(30);
    await new Promise((res) => setTimeout(res, 1800));
    out.midRestart = { si: c.si, from: c.G.d >= c.S.len * 0.5 && c.G.d < c.S.len * 0.5 + 400, hp: c.G.hp >= 55 };
    // 6) körpü: deşik zədələyir, amma yox olmur
    c.start(4); clear(); c.G.hooks.length = 0; await frames(3); const hpD = c.G.hp; c.G.ents.push({ k: 'rock', d: c.G.d + 30, x: c.G.x, r: 10, hole: true }); await frames(26); out.holeDmg = Math.round(hpD - c.G.hp);
    // 7) Butcher-in qəfil əyləci: arxasında qalan zədələnir
    c.start(3); clear(); await frames(3); c.G.d = 3900; c.G.truck.slamIn = 0.05; c.G.truck.next = 99; const hpE = c.G.hp;
    for (let i = 0; i < 110; i++) { c.G.x = c.G.truck.x; c.G.y = 150; c.G.ents.length = 0; await frames(1); }
    out.slamDmg = Math.round(hpE - c.G.hp);
    return out;
  });
  console.log('yeni mexanikalar:', JSON.stringify(r));
  expect(Math.min(...r.lens), 'hər hissə ən azı 5000 px-dir').toBeGreaterThanOrEqual(5000);
  expect(r.near, 'üç yaxın keçid: +1 nitro, zədəsiz').toEqual({ nitro: 2, hp: 100 });
  expect(r.smashDmg, 'nitro ilə sipər zədəsiz dağılır').toBe(0);
  expect(r.hardDmg, 'qaya nitro ilə də zədələyir').toBeGreaterThanOrEqual(15);
  expect([r.fallOn, r.fallGone], 'uçqun: kölgə, sonra düşür').toEqual([true, true]);
  expect(r.patchDmg, 'alov yandırır').toBeGreaterThan(5);
  expect(r.cp, 'orta yaddaş nöqtəsi alındı').toBe(true);
  expect(r.midRestart, 'qəzadan sonra ortadan').toEqual({ si: 1, from: true, hp: true });
  expect(r.holeDmg, 'deşik zədələyir').toBeGreaterThanOrEqual(10);
  expect(r.slamDmg, 'qəfil əyləc arxadakını əzir').toBeGreaterThanOrEqual(18);
  // mərhələlərin kadrları: B və C
  await page.evaluate(BOT);
  for (const [i, d, name] of [[0, 3900, 'camp-c'], [1, 2500, 'canyon-b'], [2, 2300, 'fog-b'], [3, 2400, 'truck-b'], [3, 4100, 'truck-c'], [4, 2400, 'bridge-b']]) {
    await page.evaluate(([k, dd]) => { const c = window.__cgStory._chase; c.start(k); c.G.d = dd; if (c.G.truck) c.G.truck.slamIn = 1.2; }, [i, d]);
    await page.waitForTimeout(2600);
    await page.screenshot({ path: path.join(DIR, `chase-phase-${name}.png`) });
  }
  expect(errs).toEqual([]);
});

// KÖRPÜ — qarmaq: (1) ◀ ▶ üç dəyişmə ilə qopur; (2) nitro dərhal qoparır; (3) nitro işləyərkən qarmaq tutmur;
// (4) heç nə etməsən 4.5 s-də özü qopur (bir dəfə kiçik zədə) — ilişib qalmaq yoxdur; (5) qarmaqda məhəccər zədələmir.
test('qaçış körpü: qarmaqdan qurtulmaq aydın və etibarlıdır', async ({ page }) => {
  test.setTimeout(120_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await openChase(page, 4);
  const r = await page.evaluate(async () => {
    const c = window.__cgStory._chase, out = {}; const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const hookNow = async () => { c.G.ents.length = 0; c.G.hooks.length = 0; c.G.hooks.push(c.G.d + 5); c.G.boost = 0; c.G.hp = 100; c.G.nitro = 2; await wait(250); return !!c.G.hook; };
    // 1) üç dəyişmə
    out.hooked = await hookNow();
    const tap = async (k) => { c.keys.add(k); await wait(140); c.keys.delete(k); await wait(60); };
    c.G.steerSign = 0; await tap('left'); await tap('right'); out.afterTwo = !!c.G.hook; await tap('left'); await wait(80);
    out.freeByShake = !c.G.hook; out.hpShake = c.G.hp;
    // 2) nitro qoparır
    await wait(1300); await hookNow(); c.nitro(); await wait(120); out.freeByNitro = !c.G.hook;
    // 3) nitro işləyərkən qarmaq tutmur
    await wait(300); c.G.boost = 1.2; c.G.hooks.push(c.G.d + 5); await wait(250); out.missWhileBoost = !c.G.hook;
    // 4) heç nə etmə: özü qopur, bir dəfə zədə; 5) bu müddətdə məhəccərə sıxılsa da əlavə zədə yoxdur
    await wait(1600); await hookNow(); const hp0 = c.G.hp; c.keys.add(c.G.hook.side > 0 ? 'right' : 'left');
    await wait(5200); c.keys.clear(); out.autoFree = !c.G.hook; out.autoDmg = Math.round(hp0 - c.G.hp);
    return out;
  });
  console.log('qarmaq:', JSON.stringify(r));
  expect(r.hooked, 'qarmaq tutdu').toBe(true);
  expect([r.afterTwo, r.freeByShake, r.hpShake], 'iki dəyişmə azdır, üçüncüdə qopur, zədəsiz').toEqual([true, true, 100]);
  expect(r.freeByNitro, 'nitro qoparır').toBe(true);
  expect(r.missWhileBoost, 'nitroda qarmaq tutmur').toBe(true);
  expect(r.autoFree, 'özü qopur').toBe(true);
  expect(r.autoDmg, 'özü qopanda yalnız bir zədə (məhəccər əlavə zədələmir)').toBe(10);
  expect(errs).toEqual([]);
});
