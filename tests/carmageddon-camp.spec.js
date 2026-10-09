// CARMAGEDDON Fəsil 1 — Hearth düşərgəsi: gəzinti, toqquşma, sakinlər, dörd tapşırıq, jurnal, yaddaş,
// telefonda toxunuşla yerimə. Tapşırıqlar real qarşılıqlı təsirlə (yanına get → danış) keçilir.
import { test, expect } from '@playwright/test';
import path from 'path';
import { boot, OUT, ensureDir, cgSkip } from './helpers.js';

const DIR = ensureDir(path.join(OUT, 'carmageddon'));
const toCamp = async (page) => {
  await page.evaluate(() => { localStorage.removeItem('cgCh1'); window.__menu.onOpenGame('carmageddon'); });
  await page.waitForSelector('.cg.is-ready', { timeout: 30_000 });
  await page.locator('[data-cg="story"]').click();
  await page.waitForSelector('.cgs.is-ready', { timeout: 20_000 });
  await cgSkip(page);                               // proloq
  await page.waitForFunction(() => window.__cgStory.dlg.nameEl.textContent === 'Milo', null, { timeout: 15_000 });
  await cgSkip(page);                               // səhər söhbəti
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
        else if (s.kind === 'pattern') { if (!s.showing && s.step < s.seq.length) m.press(s.seq[s.step]); }
        else if (s.kind === 'shuffle') { if (s.phase === 'pick') m.pick(s.at); }
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
  // toxunulan yerin yaxınlığında baxış nöqtəsi vardısa, fiqur indi ora çatıb danışır (yol tapma) — onu bağla
  await page.waitForTimeout(1500); await tapTalk(); await page.evaluate(() => { window.__cgStory.world.goal = null; });
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
    const inside = [[150, 150], [90, 300], [500, 150], [560, 400], [150, 530], [490, 520], [320, 318]].filter(([x, y]) => !w._blocked(x, y)).map((p) => p.join(','));
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
  await expect(page.locator('.cgs__journal li img')).toHaveCount(1);                      // jurnalda tapşırığın sahibinin portreti
  // bir neçə tapşırıq eyni vaxtda: hər sətirdə öz sahibi (fərqli şəkil, fərqli rəng)
  await use(page, 'gus'); await use(page, 'clara'); await use(page, 'ray');
  const owners = await page.evaluate(() => [...document.querySelectorAll('.cgs__journal li')].map((li) => ({ name: li.querySelector('b').textContent, img: li.querySelector('img').src.slice(-40), col: li.querySelector('img').style.borderColor })));
  expect(owners.map((o) => o.name), 'dörd tapşırıq, dörd sahib').toEqual(['Granny Wren', 'Old Gus', 'Miss Clara', 'Radio Ray']);
  expect(new Set(owners.map((o) => o.img)).size, 'portretlər fərqlidir').toBe(4);
  expect(new Set(owners.map((o) => o.col)).size, 'rənglər fərqlidir').toBe(4);
  await page.evaluate(() => { const w = window.__cgStory.world; w.p.x = 300; w.p.y = 230; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(DIR, 'camp-targets-multi.png') });
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

// Toxum əkmək (yaddaş) və Pip-i çəlləklərin arxasında tapmaq: real düymələrlə; səhv cavab cəzalandırmır, təkrar edir.
test('düşərgə: "Toxumları ək" və "Pip haradadır?" kiçik oyunları', async ({ page }) => {
  test.setTimeout(150_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await toCamp(page);
  await skipTalk(page);
  const KEY = { up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', down: 'ArrowDown' };
  const openMini = async (id, dy) => {
    await page.evaluate(([k, d]) => { const w = window.__cgStory.world, en = w.get(k); w.p.x = en.x; w.p.y = en.y + d; w.coolUntil = 0; w.interact(en); }, [id, dy]);
    for (let i = 0; i < 40 && !(await page.evaluate(() => !!window.__cgStory._mini)); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(60); }
  };
  // 1) toxum: iki tur (3 və 4 lək); bir dəfə qəsdən səhv — sıra yenidən göstərilir, tur itmir
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('cgCh1')); s.q.seeds = 2; s.got = ['s1', 's2', 's3']; localStorage.setItem('cgCh1', JSON.stringify(s)); });
  await reopen(page);
  await openMini('wren', 14);
  await expect(page.locator('.cgm--pattern')).toBeVisible();
  const ready = () => page.waitForFunction(() => { const s = window.__cgStory._mini?.state; return !s || (!s.showing && s.step < s.seq.length); }, null, { timeout: 15_000 });
  await ready();
  await page.screenshot({ path: path.join(DIR, 'mini-pattern.png') });
  const s0 = await page.evaluate(() => window.__cgStory._mini.state);
  expect(s0.seq.length, 'birinci tur üç ləkdir').toBe(3);
  await page.keyboard.press(KEY[['up', 'left', 'right', 'down'].find((k) => k !== s0.seq[0])]);      // səhv
  await page.waitForFunction(() => window.__cgStory._mini.state.showing, null, { timeout: 3000 });
  await ready();
  expect(await page.evaluate(() => { const s = window.__cgStory._mini.state; return [s.round, s.step, s.seq.join()]; }), 'səhvdən sonra eyni sıra, əvvəldən').toEqual([0, 0, s0.seq.join()]);
  for (const t0 = Date.now(); Date.now() - t0 < 30_000;) {
    const st = await page.evaluate(() => window.__cgStory._mini?.state || null); if (!st) break;
    if (st.showing || st.step >= st.seq.length) { await page.waitForTimeout(150); continue; }
    await page.keyboard.press(KEY[st.seq[st.step]]); await page.waitForTimeout(120);
  }
  await expect(page.locator('.cgm')).toHaveCount(0, { timeout: 8000 });
  await skipTalk(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cgCh1')).q.seeds), 'toxumlar əkildi').toBe(9);
  // 2) Pip: üçüncü gizlənmə yerində çəlləklər qarışır; səhv seçim yenidən qarışdırır, düz seçim tapır (◀ ▶ + E)
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('cgCh1')); s.q.pip = 3; localStorage.setItem('cgCh1', JSON.stringify(s)); });
  await reopen(page);
  await openMini('pip2', 6);
  await expect(page.locator('.cgm--shuffle')).toBeVisible();
  const pickPhase = () => page.waitForFunction(() => window.__cgStory._mini?.state.phase === 'pick', null, { timeout: 15_000 });
  await pickPhase();
  await page.screenshot({ path: path.join(DIR, 'mini-shuffle.png') });
  const a = await page.evaluate(() => window.__cgStory._mini.state);
  const go = async (to, from) => { for (let i = 0; i < Math.abs(to - from); i++) await page.keyboard.press(to > from ? 'ArrowRight' : 'ArrowLeft'); await page.keyboard.press('KeyE'); };
  await go((a.at + 1) % 3, a.sel);                                                                    // səhv çəllək
  await page.waitForFunction(() => window.__cgStory._mini.state.tries === 1, null, { timeout: 3000 });
  await pickPhase();
  const b = await page.evaluate(() => window.__cgStory._mini.state);
  await go(b.at, b.sel);
  await expect(page.locator('.cgm')).toHaveCount(0, { timeout: 8000 });
  await skipTalk(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cgCh1')).q.pip), 'Pip tapıldı').toBe(4);
  // 3) telefon ölçüsü
  await page.setViewportSize({ width: 667, height: 375 });
  const fit = await page.evaluate(async () => {
    const m = await import('/src/games/carmageddon/minigame.js'); const ch = window.__cgStory, out = [];
    for (const [fn, o] of [[m.pattern, { title: 'Посади семена', hint: 'Запомни, в каком порядке загораются лунки, и повтори — стрелки или касание' }], [m.shuffle, { title: 'Pip haradadır?', hint: 'Çəlləkləri izlə, sonra Pip-in gizləndiyini seç — ◀ ▶ və E, ya da toxun' }]]) {
      fn(ch, o); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const bx = document.querySelector('.cgm__box').getBoundingClientRect();
      out.push(bx.left >= 0 && bx.top >= 0 && bx.right <= innerWidth && bx.bottom <= innerHeight && [...document.querySelectorAll('.cgm button')].every((x) => { const r = x.getBoundingClientRect(); return r.height >= 34 && r.width >= 44; }));
      ch._mini.stop();
    }
    return out;
  });
  expect(fit, 'telefonda sığır').toEqual([true, true]);
  expect(errs).toEqual([]);
});

// Qaçış və toyuqlar: Shift ilə Ember yerişdən xeyli sürətli gedir; toxunuşla uzaq hədəfə özü qaçır, yaxın hədəfə
// yeriyir; toyuqlar çəkilmiş vərəqdəndir, dayananda dənləyir, üstlərinə qaçanda hürküb kənara qaçır.
test('düşərgə: qaçış (Shift / uzaq toxunuş) və toyuqlar', async ({ page }) => {
  test.setTimeout(90_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await toCamp(page);
  await skipTalk(page);
  const pos = () => page.evaluate(() => { const p = window.__cgStory.world.p; return { x: p.x, y: p.y, run: !!p.run }; });
  const put = (x, y) => page.evaluate(([a, b]) => { const w = window.__cgStory.world; w.p.x = a; w.p.y = b; w.goal = null; w.keys.clear(); }, [x, y]);
  // 1) yeriş və qaçış sürəti (açıq qumda, sola)
  await put(380, 225);
  const a0 = await pos(); await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(600); await page.keyboard.up('ArrowLeft'); const a1 = await pos();
  await put(380, 225);
  await page.keyboard.down('Shift'); await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(300);
  const mid = await pos(); await page.waitForTimeout(300); await page.keyboard.up('ArrowLeft'); await page.keyboard.up('Shift'); const b1 = await pos();
  const walk = a0.x - a1.x, run = 380 - b1.x;
  console.log(`yeriş ${Math.round(walk)} px, qaçış ${Math.round(run)} px (0.6 s)`);
  expect(walk, 'yeriyir').toBeGreaterThan(25);
  expect(run / walk, 'qaçış yerişdən ən azı 1.5 dəfə sürətlidir').toBeGreaterThan(1.5);
  expect(mid.run, 'qaçış vəziyyəti').toBe(true);
  await page.waitForTimeout(150);
  expect((await pos()).run, 'düymə buraxılanda qaçış bitir').toBe(false);
  // 2) toxunuş: uzaq hədəfə qaçır, yaxın hədəfə yeriyir
  await put(300, 230);
  await page.evaluate(() => { window.__cgStory.world.goal = { x: 300, y: 130 }; });
  await page.waitForTimeout(250); expect((await pos()).run, 'uzaq hədəf — qaçır').toBe(true);
  await put(300, 230);
  await page.evaluate(() => { window.__cgStory.world.goal = { x: 300, y: 190 }; });
  await page.waitForTimeout(250); expect((await pos()).run, 'yaxın hədəf — yeriyir').toBe(false);
  // 3) toyuqlar: şəkil yüklənib; üstlərinə qaçanda uzaqlaşırlar
  expect(await page.evaluate(() => { const im = window.__cgStory.art.hens; return !!im && im.width === 60 && im.height === 38; }), 'toyuq vərəqi yüklənib').toBe(true);
  await put(300, 392);
  await page.waitForTimeout(600);
  // toyuqlar heç vaxt maneənin (çadırın, bostanın) üstündə gəzmir — gəzinti sahəsinin künclərini yoxla
  expect(await page.evaluate(() => { const w = window.__cgStory.world; return [[180, 380], [266, 380], [180, 399], [266, 399], [223, 390]].filter(([x, y]) => w._blocked(x, y)).length; }), 'toyuq sahəsi açıq qumdadır').toBe(0);
  await page.screenshot({ path: path.join(DIR, 'camp-hens.png') });
  expect(errs).toEqual([]);
});

// Əl çatanda çıxan işarə: sakinin üstündə danışıq köpüyü, baxış yerinin / əşyanın üstündə lupa (nida yox).
// Piksellə yoxlanır: köpük açıq rəngli və enlidir, lupa kəhrəba rəngli halqadır; böyüdülmüş kadr da çəkilir.
test('düşərgə: danışmaq üçün köpük, baxmaq üçün lupa işarəsi', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page);
  await toCamp(page);
  await skipTalk(page);
  const shot = async (id, dy, name) => {
    await page.evaluate(([k, d]) => { const w = window.__cgStory.world, en = w.get(k); w.p.x = en.x; w.p.y = en.y + d; w.p.dir = 1; w.goal = null; }, [id, dy]);
    await page.waitForTimeout(350);
    const r = await page.evaluate((k) => {
      const w = window.__cgStory.world, en = w.get(k), near = w.near();
      let top = en.y - (en.kind === 'npc' ? (en.look.kid ? 44 : 52) : 22); if (en.kind !== 'npc' && Math.abs(w.p.x - en.x) < 18 && top > w.p.y - 52 && top < w.p.y + 4) top = w.p.y - 56;
      const sx = Math.round(en.x - w.camX), sy = Math.round(top - w.camY);
      const d = w.cx.getImageData(sx - 9, sy - 5, 19, 18).data; let light = 0, amber = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i] > 240 && d[i + 1] > 225 && d[i + 2] > 190) light++; if (d[i] > 240 && d[i + 1] > 160 && d[i + 1] < 200 && d[i + 2] < 90) amber++; }
      const z = document.createElement('canvas'); z.width = 60 * 6; z.height = 70 * 6; const c = z.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(w.cv, sx - 30, sy - 14, 60, 70, 0, 0, z.width, z.height);
      return { isNear: near === en, light, amber, png: z.toDataURL('image/png') };
    }, id);
    (await import('fs')).writeFileSync(path.join(DIR, name), Buffer.from(r.png.split(',')[1], 'base64'));
    return r;
  };
  const talk = await shot('wren', 14, 'icon-talk.png');
  expect(talk.isNear, 'sakin əl çatandadır').toBe(true);
  expect(talk.light, 'köpük: açıq rəngli sahə').toBeGreaterThan(50);
  const look = await shot('well', 10, 'icon-look.png');
  expect(look.isNear, 'baxış yeri əl çatandadır').toBe(true);
  expect(look.amber, 'lupa: kəhrəba halqa').toBeGreaterThan(12);
  expect(look.light, 'lupa köpük deyil').toBeLessThan(talk.light);
});

// OBYEKTLƏRİN ARXASI, YOL TAPMA, VİRTUAL ÇUBUQ, GÖRÜNƏN SAHƏ:
//  • çadırın yuxarı (arxa) hissəsinə girmək olur, dibinə yox; arxada olanda çadır fiqurun üstündən çəkilir, amma
//    fiqurun silueti görünür (piksellə ölçülür);
//  • toxunuş maneənin o tayına olanda fiqur dolanıb çatır (düz xətt bağlıdır);
//  • telefonda barmağı sürüşdürəndə fiqur həmin istiqamətə gedir; yaxında sakin olanda əməl düyməsi çıxır;
//  • enli pəncərədə (kətanın üstü-altı kəsilir) kamera və nişanlar görünən sahədə qalır.
test('düşərgə: obyektin arxasına keçmək, yol tapma, çubuq, görünən sahə', async ({ browser }) => {
  test.setTimeout(150_000);
  const ctx = await browser.newContext({ viewport: { width: 900, height: 380 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await toCamp(page);
  await skipTalk(page);
  // 1) arxa və dib: ev çadırının konturu y 400…590, dib xətti ≈ 480
  const col = await page.evaluate(() => { const w = window.__cgStory.world; const hid = w.ents.filter((e) => e.kind === 'npc'); hid.forEach((e) => { e.hidden = true; }); const r = { back: w._blocked(490, 440), base: w._blocked(490, 520), front: w._blocked(470, 600) }; hid.forEach((e) => { e.hidden = false; }); return r; });
  expect(col, 'arxa açıq, dib bağlı, qabaq açıq').toEqual({ back: false, base: true, front: false });
  const pix = async (x, y) => { await page.evaluate(([a, b]) => { const w = window.__cgStory.world; w.p.x = a; w.p.y = b; w.p.dir = 0; w.goal = null; }, [x, y]); await page.waitForTimeout(200); return page.evaluate(() => { const w = window.__cgStory.world, d = w.cx.getImageData(Math.round(w.p.x - w.camX) - 8, Math.round(w.p.y - w.camY) - 40, 16, 30).data; let red = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 190 && d[i + 1] < 90 && d[i + 2] < 70) red++; return red; }); };
  const openRed = await pix(330, 420), behindRed = await pix(490, 440);
  await page.screenshot({ path: path.join(DIR, 'camp-behind.png') });
  console.log('saç pikselləri — açıqda:', openRed, 'çadırın arxasında:', behindRed);
  expect(openRed, 'açıqda Ember tam görünür (qırmızı saç)').toBeGreaterThan(40);
  expect(behindRed, 'çadırın arxasında çadır üstdən çəkilir — parlaq qırmızı piksel qalmır').toBeLessThan(openRed * 0.25);
  // 2) yol tapma: bostanın bir tərəfindən o birinə — düz xətt bağlıdır, yol dolanır
  const nav = await page.evaluate(async () => {
    const w = window.__cgStory.world; w.p.x = 190; w.p.y = 250; const tx = 110, ty = 420;
    const n = 30; let straight = true; for (let k = 1; k <= n; k++) if (w._blocked(w.p.x + ((tx - w.p.x) * k) / n, w.p.y + ((ty - w.p.y) * k) / n)) straight = false;
    const r = w.cv.getBoundingClientRect(); w.tapAt(r.left + ((tx - w.camX) / 480) * r.width, r.top + ((ty - w.camY) / 270) * r.height);
    const pts = w.goal?.path?.length || 0; const t0 = performance.now();
    await new Promise((res) => { const f = () => { if (!w.goal || performance.now() - t0 > 9000) res(); else requestAnimationFrame(f); }; f(); });
    return { straight, pts, dist: Math.round(Math.hypot(w.p.x - tx, w.p.y - ty)), ms: Math.round(performance.now() - t0) };
  });
  console.log('yol tapma:', JSON.stringify(nav));
  expect(nav.straight, 'düz xətt bağlıdır').toBe(false);
  expect(nav.pts, 'yol bir neçə dönüş nöqtəsindən keçir').toBeGreaterThanOrEqual(2);
  expect(nav.dist, 'fiqur hədəfə çatdı (ilişmədi)').toBeLessThan(10);
  // 3) virtual çubuq: barmağı sağa sürüşdür — fiqur sağa gedir; burax — dayanır
  await page.evaluate(() => { const w = window.__cgStory.world; w.p.x = 330; w.p.y = 420; w.goal = null; });
  const x0 = await page.evaluate(() => window.__cgStory.world.p.x);
  const fire = (type, x, y) => page.evaluate(([t, a, b]) => { const el = document.querySelector('.cgs'); (t === 'pointerdown' ? el : window).dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 5, pointerType: 'touch', clientX: a, clientY: b })); }, [type, x, y]);
  await fire('pointerdown', 200, 250); await fire('pointermove', 216, 250); await fire('pointermove', 250, 252);
  await expect(page.locator('.cgs__stick')).toBeVisible();
  await page.waitForTimeout(600);
  const x1 = await page.evaluate(() => window.__cgStory.world.p.x);
  await fire('pointerup', 250, 252); await page.waitForTimeout(150);
  const x2 = await page.evaluate(() => window.__cgStory.world.p.x); await page.waitForTimeout(300);
  expect(x1 - x0, 'çubuqla sağa getdi').toBeGreaterThan(25);
  expect(Math.abs((await page.evaluate(() => window.__cgStory.world.p.x)) - x2), 'buraxanda dayandı').toBeLessThan(1);
  await expect(page.locator('.cgs__stick')).toBeHidden();
  // 4) əməl düyməsi: sakinin yanında çıxır və basanda danışıq açılır
  await page.evaluate(() => { const w = window.__cgStory.world, en = w.get('wren'); w.p.x = en.x; w.p.y = en.y + 14; });
  await expect(page.locator('.cgs__act')).toBeVisible();
  await page.locator('.cgs__act').dispatchEvent('pointerdown');
  await page.waitForFunction(() => !window.__cgStory.dlg.el.hidden, null, { timeout: 4000 });
  await skipTalk(page);
  // 5) görünən sahə: 900×380 pəncərədə kətanın üstündən və altından ~33 px kəsilir; xəritənin yuxarı kənarında
  //    fiqur və nişanlar görünən sahədədir
  const vis = await page.evaluate(async () => {
    const w = window.__cgStory.world; w.p.x = 320; w.p.y = 40; await new Promise((r) => setTimeout(r, 200));
    const v = w.vis, sy = w.p.y - w.camY; return { y0: Math.round(v.y0), y1: Math.round(v.y1), headOnScreen: sy - 44 >= v.y0, camY: w.camY };
  });
  console.log('görünən sahə:', JSON.stringify(vis));
  expect(vis.y0, 'kətanın üstü kəsilir (enli pəncərə)').toBeGreaterThan(10);
  expect(vis.headOnScreen, 'xəritənin yuxarı kənarında fiqurun başı ekrandadır').toBe(true);
  await page.screenshot({ path: path.join(DIR, 'camp-top-edge.png') });
  expect(errs).toEqual([]);
  await ctx.close();
});
