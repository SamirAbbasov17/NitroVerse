// CARMAGEDDON Fəsil 1 — Hearth düşərgəsi: gəzinti, toqquşma, sakinlər, dörd tapşırıq, jurnal, yaddaş,
// telefonda toxunuşla yerimə. Tapşırıqlar real qarşılıqlı təsirlə (yanına get → danış) keçilir.
import { test, expect } from '@playwright/test';
import path from 'path';
import { boot, OUT, ensureDir } from './helpers.js';

const DIR = ensureDir(path.join(OUT, 'carmageddon'));
const toCamp = async (page) => {
  await page.evaluate(() => { localStorage.removeItem('cgCh1'); window.__menu.onOpenGame('carmageddon'); });
  await page.waitForSelector('.cg.is-ready', { timeout: 30_000 });
  await page.locator('[data-cg="story"]').click();
  await page.waitForSelector('.cgs.is-ready', { timeout: 20_000 });
  await page.locator('.cgs__skip').click();                               // proloq
  await page.waitForFunction(() => window.__cgStory.dlg.nameEl.textContent === 'Milo', null, { timeout: 15_000 });
  await page.locator('.cgs__skip').click();                               // səhər söhbəti
  await page.waitForFunction(() => !!window.__cgStory.world, null, { timeout: 15_000 });
};
// açıq dialoqu sona qədər keç; kiçik oyun (motoru yığ / dalğanı tut) açılsa onu da oyna
const skipTalk = async (page) => {
  const t0 = Date.now();
  while (Date.now() - t0 < 45_000) {
    const st = await page.evaluate(() => {
      const ch = window.__cgStory, m = ch._mini;
      if (m) {
        const s = m.state;
        if (s.kind === 'timing') { if (s.pos > s.z0 + 0.02 && s.pos < s.z0 + s.zw - 0.02) m.hit(); }
        else { m.keys.clear(); const d = s.target - s.pos; if (Math.abs(d) > 0.02) m.keys.add(Math.sign(d)); }
        return 'mini';
      }
      return ch.world?.busy && !ch.dlg.el.hidden ? 'talk' : 'idle';
    });
    if (st === 'idle') break;
    if (st === 'talk') await page.keyboard.press('Enter');
    await page.waitForTimeout(st === 'mini' ? 25 : 35);
  }
  await page.waitForTimeout(300);
};
// varlığın yanına qoy və danış / götür
const use = async (page, id) => {
  const ok = await page.evaluate((k) => { const w = window.__cgStory.world, en = w.get(k); if (!en || en.hidden) return false; w.p.x = en.x; w.p.y = en.y + (en.kind === 'npc' ? 14 : 6); w.coolUntil = 0; w.interact(en); return true; }, id);
  await skipTalk(page);
  return ok;
};

test('düşərgə: gəzinti, toqquşma, tapşırıqlar, jurnal, yaddaş, son', async ({ page }) => {
  test.setTimeout(240_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await toCamp(page);
  await skipTalk(page);                                                    // giriş sözü
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(DIR, 'camp-start.png') });
  // 1) klaviatura ilə yeriş və toqquşma: yuxarı gedəndə ev çadırına girmir (çadırın alt kənarı y = 560)
  const p0 = await page.evaluate(() => ({ ...window.__cgStory.world.p }));
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(700); await page.keyboard.up('ArrowLeft');
  const p1 = await page.evaluate(() => ({ ...window.__cgStory.world.p }));
  expect(p0.x - p1.x, 'sola yeridi').toBeGreaterThan(25);
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1500); await page.keyboard.up('ArrowUp');
  const p2 = await page.evaluate(() => ({ ...window.__cgStory.world.p }));
  expect(p2.y, 'çadırın içinə girmir (kontur bu x-də y≈552-dir)').toBeGreaterThan(546);
  // 2) tapşırıqlar
  expect(await use(page, 'wren')).toBe(true);
  for (const id of ['s1', 's2', 's3']) expect(await use(page, id), id).toBe(true);
  await use(page, 'wren');
  await use(page, 'gus');
  for (const id of ['p1', 'p2', 'p3']) expect(await use(page, id), id).toBe(true);
  await use(page, 'gus');
  await use(page, 'clara');
  for (const id of ['pip0', 'pip1', 'pip2']) expect(await use(page, id), id).toBe(true);
  await use(page, 'clara');
  await page.screenshot({ path: path.join(DIR, 'camp-journal.png') });
  const j3 = await page.evaluate(() => ({ done: document.querySelectorAll('.cgs__journal li.is-done').length, text: document.querySelector('.cgs__journal').textContent }));
  expect(j3.done, 'üç tapşırıq jurnalda bitmiş görünür').toBe(3);
  expect(j3.text).toContain('Elder Amos');
  // dördüncü (könüllü): radio
  await use(page, 'ray'); await use(page, 'gus'); await use(page, 'mast'); await use(page, 'ray');
  expect(await page.evaluate(() => document.querySelectorAll('.cgs__journal li.is-done').length)).toBe(4);
  // baxıla bilən yerlər xəta vermir
  for (const id of ['well', 'garden', 'fire', 'buggy', 'home', 'school', 'rock', 'barrels', 'milo', 'pip', 'carrier', 'lookout', 'kid1', 'kid2']) expect(await use(page, id), id).toBe(true);
  // hiss qatı: sevinən portret hoppanır və üstündə işarə çıxır
  const emo = await page.evaluate(async () => {
    const s = window.__cgStory, w = s.world; w.busy = true;
    s.dlg.say({ who: 'pip', emo: 'laugh', text: 'Hihihi!' }); s.dlg.advance();
    await new Promise((r) => setTimeout(r, 120));
    const out = { anim: s.dlg.faceBox.className, icon: !s.dlg.emote.hidden, cls: s.dlg.emote.className };
    return out;
  });
  expect(emo.anim).toContain('cgd-a-hop2');
  expect(emo.icon, 'hiss işarəsi görünür').toBe(true);
  await page.screenshot({ path: path.join(DIR, 'camp-emote.png') });
  await page.evaluate(() => { const s = window.__cgStory; s.dlg.skip(); s.dlg.hide(); s.world.busy = false; });
  // xəritədə bir neçə sakin birlikdə (fiqurların detalları üçün kadr)
  await page.evaluate(() => { const w = window.__cgStory.world; w.p.x = 470; w.p.y = 262; w.p.dir = 0; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(DIR, 'camp-sprites.png') });
  // ANİMASİYA: yeriyəndə kadr dəyişir (yeriş kadrları 2..5) və addım tozu qalxır; dayananda nəfəs (0/1)
  const anim = await page.evaluate(async () => {
    const w = window.__cgStory.world, frames = new Set(); let dust = 0;
    w.p.x = 330; w.p.y = 440; w.keys.add('ArrowRight');
    for (let i = 0; i < 50; i++) { await new Promise((r) => requestAnimationFrame(r)); frames.add(2 + Math.floor(w.p.walk * 8) % 4); dust = Math.max(dust, w.dust.length); }
    w.keys.clear();
    const kids = ['kid1', 'kid2'].map((id) => { const e = w.get(id); return { x: e.x, y: e.y }; });
    // gəzişmə təsadüfi fasilələrlədir — 15 s ərzində ən azı biri yerindən tərpənməlidir
    let far = 0;
    for (let i = 0; i < 30 && far <= 2; i++) { await new Promise((r) => setTimeout(r, 500)); far = Math.max(far, ...['kid1', 'kid2'].map((id, k) => { const e = w.get(id); return Math.hypot(e.x - kids[k].x, e.y - kids[k].y); })); }
    return { walkFrames: frames.size, dust, kidsMoved: far };
  });
  console.log('animasiya:', JSON.stringify(anim));
  expect(anim.walkFrames, 'yerişin dörd kadrı').toBe(4);
  expect(anim.dust, 'addım tozu').toBeGreaterThan(0);
  expect(anim.kidsMoved, 'uşaqlar gəzişir').toBeGreaterThan(1);
  // 3) yaddaş: səhifə yenilənəndən sonra düşərgədən davam edir, tapşırıqlar yerindədir
  await page.reload();
  await page.waitForFunction(() => !!window.__menu, null, { timeout: 60_000 });
  await page.evaluate(() => window.__menu.onOpenGame('carmageddon'));
  await page.waitForSelector('.cg.is-ready', { timeout: 30_000 });
  await page.locator('[data-cg="story"]').click();
  await page.waitForFunction(() => !!window.__cgStory?.world, null, { timeout: 25_000 });
  expect(await page.evaluate(() => document.querySelectorAll('.cgs__journal li.is-done').length), 'yaddaşdan sonra').toBe(4);
  // 4) Elder Amos → səhnə bitir
  await use(page, 'amos');
  await page.waitForSelector('.cgs__card:not([hidden])', { timeout: 15_000 });
  expect(errs).toEqual([]);
});

test('düşərgə telefonda: toxunuşla yeriyir, sakinə toxunanda yanına gedib danışır; jurnal sığır', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await boot(page);
  await toCamp(page);
  // açıq dialoqu toxunuşla keç (qutu görünürsə ekranın ortasına toxun)
  const tapTalk = async () => { for (let i = 0; i < 40; i++) { if (!(await page.evaluate(() => window.__cgStory.world.busy && !window.__cgStory.dlg.el.hidden))) break; await page.touchscreen.tap(420, 200); await page.waitForTimeout(60); } await page.waitForTimeout(320); };
  await page.waitForFunction(() => !window.__cgStory.dlg.el.hidden, null, { timeout: 8000 });
  await tapTalk();                                                         // giriş sözü
  await page.waitForFunction(() => !window.__cgStory.world.busy, null, { timeout: 10_000 });
  // boş yerə toxunuş → ora yeriyir
  const a = await page.evaluate(() => ({ ...window.__cgStory.world.p }));
  await page.touchscreen.tap(250, 300);
  await page.waitForTimeout(1500);
  const b = await page.evaluate(() => ({ ...window.__cgStory.world.p }));
  expect(Math.hypot(a.x - b.x, a.y - b.y), 'toxunuşla yeridi').toBeGreaterThan(30);
  // ekrandakı sakinə (Milo deyil — ən yaxın görünən) toxunuş: yanına gedir və dialoq açılır
  const tgt = await page.evaluate(() => {
    const w = window.__cgStory.world, r = w.cv.getBoundingClientRect();
    w.p.x = 300; w.p.y = 470;                                 // məktəbin yanı — Miss Clara ekrandadır
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => { const en = w.get('clara'); res({ x: r.left + ((en.x - w.camX) / 480) * r.width, y: r.top + ((en.y - 8 - w.camY) / 270) * r.height }); })));
  });
  await page.touchscreen.tap(tgt.x, tgt.y);
  await page.waitForFunction(() => window.__cgStory.dlg.nameEl.textContent === 'Miss Clara' && !window.__cgStory.dlg.el.hidden, null, { timeout: 8000 });
  await page.screenshot({ path: path.join(DIR, 'camp-m-talk.png') });
  await tapTalk();
  await page.waitForFunction(() => !window.__cgStory.world.busy, null, { timeout: 10_000 });
  const j = await page.evaluate(() => { const r = document.querySelector('.cgs__journal').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, W: innerWidth, H: innerHeight, n: document.querySelectorAll('.cgs__journal li').length }; });
  expect(j.n, 'tapşırıq jurnala düşdü').toBe(1);
  expect(j.l >= 0 && j.t >= 0 && j.r <= j.W && j.b <= j.H, 'jurnal ekrandadır').toBe(true);
  await page.screenshot({ path: path.join(DIR, 'camp-m.png') });
  await ctx.close();
});

// Toqquşma konturları: (1) başlanğıcdan hər sakinə, əşyaya və baxış nöqtəsinə piyada çatmaq olur (əl məsafəsinə
// qədər); (2) obyektlərin ortasına girmək olmur; (3) açıq qumun ortası bağlı deyil. Önbaxış kadrı da çəkilir.
test('düşərgə: toqquşma konturları — hər şeyə çatmaq olur, obyektin içinə girmək olmur', async ({ page }) => {
  test.setTimeout(120_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await toCamp(page);
  await skipTalk(page);
  const r = await page.evaluate(() => {
    const w = window.__cgStory.world, S = 640, G = 2, N = S / G;
    const wander = w.ents.filter((e) => e.kind === 'npc'); const hid = wander.map((e) => e.hidden); wander.forEach((e) => { e.hidden = true; });   // sakinlər sabit maneə deyil
    const free = new Uint8Array(N * N); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) free[j * N + i] = w._blocked(i * G + 1, j * G + 1) ? 0 : 1;
    const seen = new Uint8Array(N * N), q = [[Math.round(w.p.x / G), Math.round(w.p.y / G)]]; seen[q[0][1] * N + q[0][0]] = 1;
    while (q.length) { const [i, j] = q.pop(); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = i + a, y = j + b; if (x < 0 || y < 0 || x >= N || y >= N) continue; const k = y * N + x; if (!seen[k] && free[k]) { seen[k] = 1; q.push([x, y]); } } }
    wander.forEach((e, i) => { e.hidden = hid[i]; });
    const reach = (ex, ey, d) => { for (let j = Math.max(0, Math.floor((ey - d) / G)); j <= Math.min(N - 1, Math.ceil((ey + d) / G)); j++) for (let i = Math.max(0, Math.floor((ex - d) / G)); i <= Math.min(N - 1, Math.ceil((ex + d) / G)); i++) if (seen[j * N + i] && Math.hypot(i * G + 1 - ex, j * G + 1 - ey) <= d) return true; return false; };
    const unreachable = w.ents.filter((e) => (e.use || e.kind === 'npc') && !reach(e.x, e.y, 24 + (e.r || 0))).map((e) => `${e.id}@${e.x},${e.y}`);
    const inside = [[150, 130], [90, 300], [500, 120], [560, 380], [150, 500], [490, 480], [320, 315], [320, 264]].filter(([x, y]) => !w._blocked(x, y)).map((p) => p.join(','));
    const open = [[320, 200], [320, 440], [260, 240], [420, 300], [330, 600], [300, 110]].filter(([x, y]) => w._blocked(x, y)).map((p) => p.join(','));
    return { unreachable, inside, open, share: Math.round((seen.reduce((a, b) => a + b, 0) / (N * N)) * 100) };
  });
  console.log('toqquşma:', JSON.stringify(r));
  expect(r.unreachable, 'çatılmayan varlıqlar').toEqual([]);
  expect(r.inside, 'obyektin içində açıq qalan nöqtələr').toEqual([]);
  expect(r.open, 'açıq qumda bağlı qalan nöqtələr').toEqual([]);
  expect(errs).toEqual([]);
});

// başlıq ekranına çıxıb yaddaşdan yenidən gir (köhnə hekayə obyekti ilə qarışmasın deyə yenisini gözlə)
const reopen = async (page) => {
  await page.evaluate(() => { window.__cgOld = window.__cgStory; });
  await page.keyboard.press('Escape'); await page.locator('[data-cgp="title"]').click();
  await page.locator('[data-cg="story"]').click();
  await page.waitForFunction(() => window.__cgStory !== window.__cgOld && !!window.__cgStory?.world && !window.__cgStory.world.dead, null, { timeout: 20_000 });
};

// Hədəf oxları və kiçik oyunlar: oyunçu NƏ etməli və HARA getməli olduğunu görür; tapşırıq yalnız "get-gətir" deyil.
test('düşərgə: hədəf oxları, motoru yığ və dalğanı tut (klaviatura + telefon ölçüsü)', async ({ page }) => {
  test.setTimeout(150_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  // 1) təzə başlayanda dörd tapşırıq verən «!» ilə göstərilir; Granny Wren-dən sonra üç toxum hədəf olur
  await toCamp(page);
  await skipTalk(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(DIR, 'camp-targets-start.png') });
  await use(page, 'wren');
  expect(await page.evaluate(() => { const w = window.__cgStory.world; return ['s1', 's2', 's3'].map((id) => !w.get(id).hidden); }), 'toxumlar görünür').toEqual([true, true, true]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(DIR, 'camp-targets-seeds.png') });
  await expect(page.locator('.cgs__journal li i')).toHaveCount(1);
  // 2) motoru yığ: səhv vaxtda basış sayılmır, düz vaxtda sayılır (E düyməsi)
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('cgCh1')); s.q.parts = 2; s.got = ['p1', 'p2', 'p3']; localStorage.setItem('cgCh1', JSON.stringify(s)); });
  await reopen(page);
  await page.evaluate(() => { const w = window.__cgStory.world, en = w.get('gus'); w.p.x = en.x; w.p.y = en.y + 14; w.coolUntil = 0; w.interact(en); });
  for (let i = 0; i < 40 && !(await page.evaluate(() => !!window.__cgStory._mini)); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(60); }
  await expect(page.locator('.cgm--timing')).toBeVisible();
  await page.screenshot({ path: path.join(DIR, 'mini-timing.png') });
  // zonadan kənarda bas → irəliləmir
  await page.waitForFunction(() => { const s = window.__cgStory._mini.state; return s.pos < s.z0 - 0.05 || s.pos > s.z0 + s.zw + 0.05; }, null, { polling: 16 });
  await page.keyboard.press('KeyE');
  expect(await page.evaluate(() => window.__cgStory._mini.state.n), 'səhv basış sayılmır').toBe(0);
  for (let k = 0; k < 3; k++) {
    await page.waitForTimeout(350);
    await page.waitForFunction(() => { const s = window.__cgStory._mini?.state; return !s || (s.pos > s.z0 + 0.04 && s.pos < s.z0 + s.zw - 0.04); }, null, { polling: 'raf', timeout: 15_000 });
    await page.evaluate(() => window.__cgStory._mini?.hit());
  }
  await expect(page.locator('.cgm')).toHaveCount(0, { timeout: 5000 });
  await skipTalk(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cgCh1')).q.parts), 'baqqi yığıldı').toBe(9);
  // 3) dalğanı tut: ox düymələri ilə əqrəb çevrilir, dalğa iki dəfə tutulur
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('cgCh1')); s.q.radio = 2; localStorage.setItem('cgCh1', JSON.stringify(s)); });
  await reopen(page);
  await page.evaluate(() => { const w = window.__cgStory.world, en = w.get('mast'); w.p.x = en.x; w.p.y = en.y + 8; w.coolUntil = 0; w.interact(en); });
  for (let i = 0; i < 40 && !(await page.evaluate(() => !!window.__cgStory._mini)); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(60); }
  await expect(page.locator('.cgm--tuning')).toBeVisible();
  const p0 = await page.evaluate(() => window.__cgStory._mini.state.pos);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(400); await page.keyboard.up('ArrowRight');
  expect(await page.evaluate(() => window.__cgStory._mini.state.pos), 'ox düyməsi əqrəbi çevirir').toBeGreaterThan(p0 + 0.08);
  await page.screenshot({ path: path.join(DIR, 'mini-tuning.png') });
  await skipTalk(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cgCh1')).q.radio), 'dalğa tutuldu').toBe(3);
  // 4) telefon ölçüsü: hər iki oyunun qutusu ekrana sığır, düymələr iridir
  await page.setViewportSize({ width: 667, height: 375 });
  const fit = await page.evaluate(async () => {
    const { timing, tuning } = await import('/src/games/carmageddon/minigame.js'); const ch = window.__cgStory, out = [];
    for (const [fn, o] of [[timing, { title: 'Motoru yığ', hint: 'Göstərici yaşıl zonaya girəndə bas — E və ya toxun', rounds: 3 }], [tuning, { title: 'Поймай волну', hint: 'Крути стрелку ◀ ▶; держи там, где сигнал сильнее' }]]) {
      fn(ch, o); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const b = document.querySelector('.cgm__box').getBoundingClientRect();
      out.push(b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight && [...document.querySelectorAll('.cgm button')].every((x) => x.getBoundingClientRect().height >= 44));
      ch._mini.stop();
    }
    return out;
  });
  expect(fit, 'telefonda sığır').toEqual([true, true]);
  expect(errs).toEqual([]);
});

// Yeriş kadrları: hər fiqurun 4 istiqamət × 6 kadr vərəqi çəkilir (vizual yoxlama üçün PNG) və ölçülür:
// addım kadrları dayanma kadrından fərqlidir, sol və sağ addım bir-birindən fərqlidir, fiqur yerdən qopmur.
test('fiqurlar: yeriş kadrları (addım, qol, yandan qayçı) — hamısı üçün', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page);
  await toCamp(page);
  const r = await page.evaluate(async () => {
    const sheetFor = window.__cgSheetFor, w = window.__cgStory.world, looks = { [w.def.hero.art]: w.def.hero }; for (const e of w.ents) if (e.look?.art) looks[e.look.art] = e.look;
    const names = Object.keys(looks), out = document.createElement('canvas'), S = 3; let fw = 30, fh = 46;
    out.width = fw * 6 * S * 2 + 20; out.height = Math.ceil(names.length / 2) * (fh * 4 * S + 10); const o = out.getContext('2d'); o.imageSmoothingEnabled = false; o.fillStyle = '#d6aa6e'; o.fillRect(0, 0, out.width, out.height);
    const stats = {};
    names.forEach((n, i) => {
      const s = sheetFor(looks[n]); fw = s.fw; fh = s.fh;
      o.drawImage(s.cv, (i % 2) * (fw * 6 * S + 20), Math.floor(i / 2) * (fh * 4 * S + 10), fw * 6 * S, fh * 4 * S);
      const d = s.cv.getContext('2d').getImageData(0, 0, s.cv.width, s.cv.height).data;
      const diff = (dir, a, b) => { let k = 0; for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const p = ((dir * fh + y) * s.cv.width + a * fw + x) * 4, q = ((dir * fh + y) * s.cv.width + b * fw + x) * 4; if (d[p] !== d[q] || d[p + 1] !== d[q + 1] || d[p + 2] !== d[q + 2] || d[p + 3] !== d[q + 3]) k++; } return k; };
      const ground = (dir, f) => { let k = 0; for (let y = fh - 2; y < fh; y++) for (let x = 0; x < fw; x++) if (d[((dir * fh + y) * s.cv.width + f * fw + x) * 4 + 3] > 0) k++; return k; };
      stats[n] = { art: !!s.art, stepVsIdle: [0, 1, 2, 3].map((dir) => diff(dir, 0, 2)), leftVsRight: [0, 1, 2, 3].map((dir) => diff(dir, 2, 4)), grounded: [0, 1, 2, 3].every((dir) => [2, 3, 4, 5].every((f) => ground(dir, f) > 0)) };
    });
    return { png: out.toDataURL('image/png'), stats };
  });
  const fs = await import('fs');
  fs.writeFileSync(path.join(DIR, 'walk-frames.png'), Buffer.from(r.png.split(',')[1], 'base64'));
  for (const [n, s] of Object.entries(r.stats)) {
    expect(s.art, `${n}: çəkilmiş vərəqdəndir`).toBe(true);
    expect(Math.min(...s.stepVsIdle), `${n}: addım kadrı dayanmadan fərqlidir (hər istiqamətdə)`).toBeGreaterThan(12);
    expect(Math.min(...s.leftVsRight), `${n}: sol və sağ addım fərqlidir`).toBeGreaterThan(8);
    expect(s.grounded, `${n}: yeriyəndə yerdən qopmur`).toBe(true);
  }
});
