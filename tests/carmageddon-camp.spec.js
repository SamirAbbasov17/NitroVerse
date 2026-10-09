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
// açıq dialoqu sona qədər keç
const skipTalk = async (page) => { for (let i = 0; i < 60; i++) { if (!(await page.evaluate(() => window.__cgStory.world?.busy && !window.__cgStory.dlg.el.hidden))) break; await page.keyboard.press('Enter'); await page.waitForTimeout(35); } await page.waitForTimeout(300); };
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
  expect(p2.y, 'çadırın içinə girmir').toBeGreaterThan(560);
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
    await new Promise((r) => setTimeout(r, 6000));
    const moved = ['kid1', 'kid2'].map((id, i) => { const e = w.get(id); return Math.hypot(e.x - kids[i].x, e.y - kids[i].y); });
    return { walkFrames: frames.size, dust, kidsMoved: Math.max(...moved) };
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
