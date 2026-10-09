// CARMAGEDDON Fəsil 1 — axşam ocağı və hücum: saxlanmış "axşam" mərhələsindən açılır, bütün sətirlər
// keçilir; yeddi baronun hər biri təqdimat kartı ilə çıxır; sonra gecə axtarışı başlayır.
import { test, expect } from '@playwright/test';
import path from 'path';
import { boot, OUT, ensureDir, cgLeave } from './helpers.js';

const DIR = ensureDir(path.join(OUT, 'carmageddon'));
const openEvening = async (page) => {
  await page.evaluate(() => { localStorage.setItem('cgCh1', JSON.stringify({ stage: 'evening', q: {}, got: [], seen: [] })); window.__menu.onOpenGame('carmageddon'); });
  await page.waitForSelector('.cg.is-ready', { timeout: 30_000 });
  await page.locator('[data-cg="story"]').click();
  await page.waitForSelector('.cgs.is-ready', { timeout: 20_000 });
};

test('axşam ocağı və hücum: bütün səhnə, yeddi baronun təqdimatı, son kart', async ({ page }) => {
  test.setTimeout(300_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await openEvening(page);
  const seen = { intros: [], speakers: new Set(), lines: 0, long: 0 };
  let shotE = false, shotI = false, shotH = false;
  for (let i = 0; i < 900; i++) {
    const s = await page.evaluate(() => {
      const st = window.__cgStory; if (!st) return { gone: true };
      const intro = document.querySelector('.cgs__intro'), card = document.querySelector('.cgs__card');
      const box = st.dlg.box.getBoundingClientRect(), tx = st.dlg.el.querySelector('.cgd__text').getBoundingClientRect();
      return { intro: intro ? intro.querySelector('b').textContent : null, card: card && !card.hidden ? card.textContent : null, dlg: !st.dlg.el.hidden, name: st.dlg.nameEl.textContent, typing: st.dlg.typing, text: st.dlg.full || '', fits: tx.bottom <= box.bottom + 1 };
    });
    if (s.gone) break;
    if (s.intro) { if (!seen.intros.includes(s.intro)) { seen.intros.push(s.intro); if (!shotI && s.intro === 'Butcher') { await page.waitForTimeout(400); await page.screenshot({ path: path.join(DIR, 'attack-intro.png') }); shotI = true; } } await page.locator('.cgs__intro').click().catch(() => {}); await page.waitForTimeout(60); continue; }
    if (s.card) { await page.locator('.cgs__card').click().catch(() => {}); await page.waitForTimeout(80); continue; }
    if (await page.evaluate(() => !!window.__cgStory?.world)) break;      // hücum bitdi — gecə axtarışı başladı (ətraflı: carmageddon-night.spec.js)
    if (s.dlg) {
      if (s.typing) { await page.keyboard.press('Enter'); await page.waitForTimeout(30); continue; }
      seen.lines++; if (s.name) seen.speakers.add(s.name);
      expect(s.fits, `mətn qutuya sığır: ${s.text.slice(0, 40)}`).toBe(true);
      if (!shotE && s.name === 'Elder Amos') { await page.screenshot({ path: path.join(DIR, 'evening-amos.png') }); shotE = true; }
      if (!shotH && /əlini qaldırdı/.test(s.text)) { await page.screenshot({ path: path.join(DIR, 'attack-hush.png') }); shotH = true; }
      await page.keyboard.press('Enter'); await page.waitForTimeout(30); continue;
    }
    await page.waitForTimeout(60);
  }
  console.log('hücum:', JSON.stringify({ intros: seen.intros, speakers: [...seen.speakers], lines: seen.lines }));
  expect(seen.intros, 'yeddi baron təqdim olundu').toEqual(['Judge', 'Madam Crude', 'Butcher', 'Doctor Rust', 'Preacher', 'The Twins', 'Jackal']);
  expect(seen.lines, 'sətirlər oynandı').toBeGreaterThan(45);
  for (const n of ['Milo', 'Ember', 'Elder Amos', 'Radio Ray', 'Old Gus', 'Miss Clara', 'Judge', 'Jackal']) expect([...seen.speakers]).toContain(n);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cgCh1')).stage), 'mərhələ yadda saxlandı').toBe('night');
  await cgLeave(page);
  await expect(page.locator('.cgs')).toHaveCount(0, { timeout: 10_000 });
  expect(errs).toEqual([]);
});

test('hücum telefonda: təqdimat kartı və ən uzun təhkiyə sətri sığır', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const [w, h] of [[667, 375], [740, 340]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await boot(page);
    await openEvening(page);
    await page.waitForFunction(() => !window.__cgStory.dlg.el.hidden, null, { timeout: 15_000 });
    const r = await page.evaluate(async () => {
      const st = window.__cgStory;
      st.dlg.say({ text: 'Ondan sonra baş verənləri Ember heç vaxt sıra ilə xatırlaya bilmədi. Yaddaşında yalnız qırıqlar qaldı: alovun işığında hələ də yaşıl görünən bostan. Yanan məktəb çadırı. Kəsilmiş ağac kimi yavaş-yavaş aşan radio dirəyi.' }); st.dlg.advance();
      await new Promise((q) => requestAnimationFrame(q));
      const b = st.dlg.box.getBoundingClientRect(), tx = st.dlg.el.querySelector('.cgd__text').getBoundingClientRect();
      const out = { boxTop: Math.round(b.top), boxBottom: Math.round(b.bottom), textFits: tx.bottom <= b.bottom + 1 && tx.top >= b.top - 1, H: innerHeight };
      st._intro('twins', 'Bir kürsü, iki kölgə');
      await new Promise((q) => setTimeout(q, 500));
      const i = document.querySelector('.cgs__intro').getBoundingClientRect(), nb = document.querySelector('.cgs__intro b').getBoundingClientRect();
      out.intro = { top: Math.round(i.top), bottom: Math.round(i.bottom), nameRight: Math.round(nb.right), W: innerWidth };
      return out;
    });
    console.log(`${w}×${h}`, JSON.stringify(r));
    if (w === 667) await page.screenshot({ path: path.join(DIR, 'attack-m-intro.png') });
    expect(r.textFits, 'uzun təhkiyə qutuya sığır').toBe(true);
    expect(r.boxTop, 'qutu ekranın yuxarısından çıxmır').toBeGreaterThanOrEqual(0);
    expect(r.intro.top >= 0 && r.intro.bottom <= r.H && r.intro.nameRight <= r.intro.W, 'təqdimat kartı ekrandadır').toBe(true);
    await ctx.close();
  }
});
