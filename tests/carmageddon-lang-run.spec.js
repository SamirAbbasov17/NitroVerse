// CARMAGEDDON Fəsil 1 — BAŞQA DİLDƏ TAM KEÇİD: oyun ingilis, rus və türk dillərində başdan sona oynanır — proloq, səhər,
// düşərgənin bütün sakinləri və halları, axşam, hücum, gecə, döyüş, qaçışın ara səhnələri, final — və ekrana çıxan
// HƏR mətn izlənir. Yoxlanır: (1) heç bir hekayə sətri tərcüməsiz qalmır (tx.js: missed); (2) göstərilən hər dialoq
// sətri həmin dilin lüğətindədir; (3) ekranda Azərbaycan əlifbasına xas hərf (ə) olan söz görünmür.
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { boot } from './helpers.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'carmageddon');
// düşərgədə hər sakinlə hər halda danış: tapşırıqdan əvvəl, ortasında (ipucu), sonunda, sonra (iki fərqli söhbət)
const CAMP = ['amos', 'amos', 'milo', 'wren', 'wren', 's1', 's2', 's3', 'wren', 'wren', 'wren', 'gus', 'gus', 'buggy', 'p1', 'p2', 'p3', 'gus', 'gus', 'gus', 'buggy',
  'clara', 'clara', 'pip0', 'pip1', 'pip2', 'pip', 'clara', 'clara', 'clara', 'pip', 'ray', 'ray', 'mast', 'gus', 'ray', 'mast', 'ray', 'ray', 'ray', 'mast',
  'well', 'garden', 'fire', 'home', 'school', 'rock', 'barrels', 'milo', 'milo', 'milo', 'milo', 'carrier', 'carrier', 'lookout', 'lookout', 'kid1', 'kid1', 'kid2', 'kid2', 'amos'];

for (const lang of ['en', 'ru', 'tr']) {
  test(`${lang}: bütün oyun boyu tərcüməsiz və ya Azərbaycanca mətn çıxmır`, async ({ page }) => {
    test.setTimeout(540_000);
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    const dict = (await import(pathToFileURL(path.join(SRC, `lang/ch1.${lang}.js`)).href)).default, known = new Set(Object.values(dict));
    await boot(page, { lang });
    await page.evaluate(() => {
      localStorage.removeItem('cgCh1'); window.__seen = new Set(); window.__az = new Set(); window.__lines = new Set();
      // ekrandakı bütün mətni müntəzəm izlə: Azərbaycan əlifbasına xas "ə" hərfi olan söz varsa — yadda saxla
      setInterval(() => {
        const root = document.querySelector('.cg'); if (!root) return;
        const txt = root.innerText || ''; for (const w of txt.split(/\s+/)) if (/[əƏ]/.test(w)) window.__az.add(w + ' ← ' + txt.slice(Math.max(0, txt.indexOf(w) - 30), txt.indexOf(w) + 40).replace(/\n/g, ' '));
        const d = window.__cgStory?.dlg; if (d && !d.el.hidden && d.full) window.__lines.add(d.full);
        document.querySelectorAll('.cgs__journal li span, .cgq__text, .cgf__sub').forEach((e) => { if (e.textContent) window.__lines.add('~' + e.textContent); });
      }, 60);
      window.__menu.onOpenGame('carmageddon');
    });
    await page.waitForSelector('.cg.is-ready', { timeout: 30_000 });
    await page.locator('[data-cg="story"]').click();
    await page.waitForSelector('.cgs.is-ready', { timeout: 20_000 });
    let ci = 0, lastSec = -1, done = false; const t0 = Date.now();
    while (Date.now() - t0 < 500_000) {
      const s = await page.evaluate(([queue, idx]) => {
        const st = window.__cgStory; if (!st) return { gone: true };
        if (st._finale) return { finale: st._finale.plan.flatMap((p) => p.lines.map((l) => l.text)) };
        const m = st._mini;
        if (m) { const q = m.state; if (q.kind === 'timing') { if (q.pos > q.z0 + 0.02 && q.pos < q.z0 + q.zw - 0.02) m.hit(); } else if (q.kind === 'pattern') { if (!q.showing && q.step < q.seq.length) m.press(q.seq[q.step]); } else if (q.kind === 'shuffle') { if (q.phase === 'pick') m.pick(q.at); } else { m.keys.clear(); const d = q.target - q.pos; if (Math.abs(d) > 0.02) m.keys.add(Math.sign(d)); } return { wait: 25 }; }
        if (st._duel) { const q = st._duel.state; if (q.open) st._duel.answer(q.want); return { wait: 60 }; }
        const intro = document.querySelector('.cgs__intro'), card = document.querySelector('.cgs__card');
        if (intro) { intro.click(); return { wait: 50 }; }
        if (card && !card.hidden) { card.click(); return { wait: 70 }; }
        if (!st.dlg.el.hidden) return { enter: true };
        if (st._chase) { const c = st._chase; return { chase: c.si, d: c.G ? c.G.d : 0 }; }
        const w = st.world;
        if (w && !w.busy && !w.paused) {
          if (st._night) { w.p.x = st._night.GOAL.x; w.p.y = st._night.GOAL.y + 6; return { wait: 120 }; }
          if (idx < queue.length) { const en = w.get(queue[idx]); if (en && !en.hidden) { w.p.x = en.x; w.p.y = en.y + (en.kind === 'npc' ? 14 : 6); w.goal = null; w.coolUntil = 0; w.interact(en); } return { next: true, wait: 90 }; }
        }
        return { wait: 60 };
      }, [CAMP, ci]);
      if (s.gone) break;
      if (s.finale) { for (const l of s.finale) await page.evaluate((x) => window.__lines.add(x), l); done = true; break; }
      if (s.next) ci++;
      if (s.enter) { await page.keyboard.press('Enter'); await page.waitForTimeout(24); continue; }
      if (s.chase !== undefined) {
        // qaçış: hissənin başlığı və göstəriciləri bir an görünsün, sonra hissəni ötür (mətnlər ara səhnələrdədir)
        if (s.chase !== lastSec && s.d > 150) { lastSec = s.chase; await page.waitForTimeout(700); await page.evaluate(() => window.__cgStory?._chase?.skip()); }
        await page.waitForTimeout(120); continue;
      }
      await page.waitForTimeout(s.wait || 50);
    }
    const r = await page.evaluate(() => ({ missed: [...(window.__cgMissed || [])], az: [...window.__az].slice(0, 30), lines: [...window.__lines] }));
    const story = r.lines.filter((l) => !l.startsWith('~')), unknown = story.filter((l) => !known.has(l));
    console.log(`${lang}: ${story.length} dialoq sətri göründü, ${r.lines.length - story.length} jurnal/alt yazı; düşərgə addımları ${ci}/${CAMP.length}`);
    expect(done, 'oyun finala qədər oynandı').toBe(true);
    expect(ci, 'düşərgədə bütün söhbətlər edildi').toBe(CAMP.length);
    expect(story.length, 'hekayənin əsas hissəsi göründü').toBeGreaterThan(230);
    expect(r.missed, 'tərcüməsi olmayan hekayə sətirləri').toEqual([]);
    expect(unknown, 'lüğətdə olmayan (Azərbaycanca qalan) dialoq sətirləri').toEqual([]);
    expect(r.az, 'ekranda Azərbaycanca söz').toEqual([]);
    expect(errs).toEqual([]);
  });
}
