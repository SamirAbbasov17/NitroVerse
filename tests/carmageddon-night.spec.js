// CARMAGEDDON Fəsil 1 — GECƏ: axtarış (alov, fənər işığı, fara zolağı, yaddaş nöqtəsi), Milo səhnəsi,
// Hush-un təqdimatı, Jackal ilə döyüş (səhv düymə / gecikmə can aparır, üç səhv — əvvəldən), maska.
import { test, expect } from '@playwright/test';
import path from 'path';
import { boot, OUT, ensureDir } from './helpers.js';

const DIR = ensureDir(path.join(OUT, 'carmageddon'));
const openNight = async (page) => {
  await page.evaluate(() => { localStorage.setItem('cgCh1', JSON.stringify({ stage: 'night', q: {}, got: [], seen: [] })); window.__menu.onOpenGame('carmageddon'); });
  await page.waitForSelector('.cg.is-ready', { timeout: 30_000 });
  await page.locator('[data-cg="story"]').click();
  await page.waitForSelector('.cgs.is-ready', { timeout: 20_000 });
};
// dialoq və kartları keç; `until` doğru olanda dayan
const pass = async (page, until, seen = null) => {
  for (let i = 0; i < 700; i++) {
    const s = await page.evaluate((u) => {
      const st = window.__cgStory; if (!st) return { gone: true };
      const intro = document.querySelector('.cgs__intro'), card = document.querySelector('.cgs__card');
      return { stop: u === 'world' ? !!st.world : u === 'duel' ? !!st._duel : false, intro: intro ? intro.querySelector('b').textContent : null, card: card && !card.hidden ? card.textContent : null, dlg: !st.dlg.el.hidden, name: st.dlg.nameEl.textContent, typing: st.dlg.typing, text: st.dlg.full || '' };
    }, until);
    if (s.gone || s.stop) return s;
    if (s.intro) { seen?.push('intro:' + s.intro); await page.locator('.cgs__intro').click().catch(() => {}); await page.waitForTimeout(60); continue; }
    if (s.card) { seen?.push('card:' + s.card); if (until === 'card') return s; await page.locator('.cgs__card').click().catch(() => {}); await page.waitForTimeout(80); continue; }
    if (s.dlg) { if (!s.typing && s.name) seen?.push(s.name + ':' + s.text.slice(0, 18)); await page.keyboard.press('Enter'); await page.waitForTimeout(28); continue; }
    await page.waitForTimeout(50);
  }
  return {};
};

test('gecə: axtarışın təhlükələri, Milo, Hush, Jackal ilə döyüş, maska', async ({ page }) => {
  test.setTimeout(300_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await openNight(page);
  await pass(page, 'world');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(DIR, 'night-search.png') });
  // 1) nəzərdə tutulan yol açıqdır: nə maneə, nə alov
  const route = await page.evaluate(() => {
    const st = window.__cgStory, w = st.world, n = st._night;
    const pts = [[300, 404], [340, 402], [400, 400], [450, 400], [462, 372], [462, 330], [462, 280], [448, 246], [440, 236]];
    w.ents.forEach((e) => { e.hidden = true; });               // gəzən gözətçilər sabit maneə deyil
    const bad = pts.map(([x, y]) => ({ x, y, blocked: w._blocked(x, y), fire: n.FIRES.some(([fx, fy, fr]) => Math.hypot(x - fx, y - fy) < fr + 2) })).filter((p) => p.blocked || p.fire);
    w.ents.forEach((e) => { e.hidden = false; });
    return bad;
  });
  expect(route, 'yol açıqdır').toEqual([]);
  const failAt = async (x, y) => { await page.evaluate(([px, py]) => { const w = window.__cgStory.world; w.p.x = px; w.p.y = py; }, [x, y]); await page.waitForTimeout(250); const on = await page.evaluate(() => document.querySelector('.cgs__caught').classList.contains('is-on') ? document.querySelector('.cgs__caught').textContent : ''); await page.waitForTimeout(1200); return on; };
  // 2) alov yandırır → başlanğıca qayıdır
  expect(await failAt(386, 290), 'alov').toBe('Alov');
  expect(await page.evaluate(() => Math.round(window.__cgStory.world.p.x)), 'başlanğıca qaytarıldı').toBe(300);
  // 3) fənər işığı tutur
  const lit = await page.evaluate(() => { const n = window.__cgStory._night, L = n.light(n.patrols[0]); return [L.x, L.y + 2]; });
  expect(await failAt(lit[0], lit[1]), 'fənər').toBe('Səni gördülər');
  // 4) yaddaş nöqtəsi: dəhlizə girəndən sonra uğursuzluq dəhlizin əvvəlinə qaytarır
  await page.evaluate(() => { const w = window.__cgStory.world; w.p.x = 462; w.p.y = 370; });
  await page.waitForTimeout(200);
  await page.waitForFunction(() => window.__cgStory._night.beamOn(), null, { timeout: 8000, polling: 30 });
  expect(await failAt(462, 300), 'fara zolağı').toBe('Səni gördülər');
  expect(await page.evaluate(() => [Math.round(window.__cgStory.world.p.x), Math.round(window.__cgStory.world.p.y)]), 'dəhlizin əvvəlinə qaytarıldı').toEqual([462, 372]);
  // zolaq sönəndə keçmək olur
  await page.waitForFunction(() => { const n = window.__cgStory._night; return !n.beamOn(); }, null, { timeout: 8000, polling: 30 });
  await page.evaluate(() => { const w = window.__cgStory.world; w.p.x = 462; w.p.y = 300; });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.querySelector('.cgs__caught').classList.contains('is-on')), 'sönmüş zolaq tutmur').toBe(false);
  // 5) emalatxana → Milo səhnəsi → Hush → Old Gus → Jackal
  await page.evaluate(() => { const w = window.__cgStory.world; w.p.x = 442; w.p.y = 240; });
  const seen = [];
  await pass(page, 'duel', seen);
  expect(seen.some((s) => s === 'intro:Hush'), 'Hush təqdim olundu').toBe(true);
  expect(seen.some((s) => s.startsWith('Hush:Qorxma, Ember')), 'Hush-un cümləsi').toBe(true);
  for (const n of ['Milo:', 'Butcher:', 'Old Gus:', 'Jackal:']) expect(seen.some((s) => s.startsWith(n)), n).toBe(true);
  // 6) döyüş: səhv düymə can aparır; üç səhvdən sonra əvvəldən; düzgün ardıcıllıq qalib gətirir
  await page.waitForFunction(() => window.__cgStory._duel?.state.open, null, { timeout: 5000 });
  await page.screenshot({ path: path.join(DIR, 'night-duel.png') });
  const wrong = { left: 'ArrowRight', right: 'ArrowLeft', up: 'KeyE', hit: 'ArrowUp' }, right = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', hit: 'KeyE' };
  const want = () => page.evaluate(() => window.__cgStory._duel?.state);
  let s = await want();
  await page.keyboard.press(wrong[s.want]);
  await page.waitForTimeout(150);
  expect((await want()).hp, 'səhv düymə can aparır').toBe(2);
  // gecikmə də can aparır
  await page.waitForFunction(() => window.__cgStory._duel.state.open, null, { timeout: 4000 });
  await page.waitForFunction(() => window.__cgStory._duel.state.hp === 1, null, { timeout: 5000 });
  await page.waitForFunction(() => window.__cgStory._duel.state.open, null, { timeout: 4000 });
  s = await want(); await page.keyboard.press(wrong[s.want]);
  await page.waitForFunction(() => window.__cgStory._duel.state.hp === 3 && window.__cgStory._duel.state.i === 0 && window.__cgStory._duel.state.open, null, { timeout: 6000 });   // əvvəldən
  for (let k = 0; k < 7; k++) {
    await page.waitForFunction((i) => window.__cgStory._duel && window.__cgStory._duel.state.open && window.__cgStory._duel.state.i === i, k, { timeout: 5000 });
    s = await want(); await page.keyboard.press(right[s.want]);
  }
  await page.waitForFunction(() => !window.__cgStory._duel, null, { timeout: 5000 });
  // 7) maska və son
  const seen2 = [];
  const end = await pass(page, 'card', seen2);
  expect(seen2.some((x) => x.startsWith('Ember:Altısı qaldı')), 'son replika').toBe(true);
  expect(end.card, 'gecədən sonra qaçış başlayır (ətraflı: carmageddon-chase.spec.js)').toMatch(/Qaçış/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.cgs')).toHaveCount(0, { timeout: 10_000 });
  // başlıq ekranı: yarımçıq oyun var → "Davam et" və "Yenidən başla"; yenidən başlayanda proloq açılır
  await expect(page.locator('[data-cg="story"]')).toContainText('Davam et');
  await expect(page.locator('[data-cg="new"]')).toBeVisible();
  await page.locator('[data-cg="new"]').click();
  await page.waitForFunction(() => window.__cgStory && !window.__cgStory.dlg.el.hidden && /Deyirlər/.test(window.__cgStory.dlg.full || ''), null, { timeout: 15_000 });
  expect(await page.evaluate(() => localStorage.getItem('cgCh1')), 'yaddaş silindi').toBeNull();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-cg="new"]')).toBeHidden();
  expect(errs).toEqual([]);
});

test('gecə telefonda: döyüş düymələri sığır və toxunuşla işləyir', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await boot(page);
  await openNight(page);
  await pass(page, 'world');
  await page.evaluate(() => { const w = window.__cgStory.world; w.p.x = 442; w.p.y = 240; });
  await pass(page, 'duel');
  await page.waitForFunction(() => window.__cgStory._duel?.state.open, null, { timeout: 5000 });
  const fit = await page.evaluate(() => [...document.querySelectorAll('.cgq__pad button, .cgq__ring, .cgq__text, .cgq__hp')].every((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }) && Math.min(...[...document.querySelectorAll('.cgq__pad button')].map((b) => b.getBoundingClientRect().height)) >= 44);
  expect(fit, 'döyüş elementləri ekrandadır, düymələr ≥ 44 px').toBe(true);
  await page.screenshot({ path: path.join(DIR, 'night-duel-m.png') });
  const k = await page.evaluate(() => window.__cgStory._duel.state.want);
  await page.locator(`.cgq__pad [data-k="${k}"]`).tap();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__cgStory._duel.state.i), 'toxunuş vuruşu sayır').toBe(1);
  await ctx.close();
});
