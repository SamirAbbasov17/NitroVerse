// CARMAGEDDON Fəsil 1: hekayə mətnləri dörd dildə. Yoxlanır: hər Azərbaycanca sətrin en/ru/tr tərcüməsi
// var (boş deyil, {n} yer tutucusu qorunub, artıq açar yoxdur); oyun seçilmiş dildə danışır; hər dilin
// ən uzun sətirləri telefonda (844×390) dialoq qutusuna və ekrana sığır.
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { boot, OUT, ensureDir } from './helpers.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'carmageddon');
const DIR = ensureDir(path.join(OUT, 'carmageddon'));
const LANGS = ['en', 'ru', 'tr'];
const mod = (f) => import(pathToFileURL(path.join(SRC, f)).href);

// Bütün Azərbaycanca hekayə sətirləri: script.js — data; camp.js — mənbə mətnindəki sətirlər
async function corpus() {
  const S = await mod('script.js');
  const out = [];
  const add = (s) => { if (typeof s === 'string' && s && !out.includes(s)) out.push(s); };
  for (const k of ['PROLOGUE', 'MORNING', 'EVENING', 'ATTACK', 'NIGHT_INTRO', 'FOUND', 'AFTER_DUEL', 'ENDING']) for (const st of S[k]) { if (st.text) add(st.text.az); if (st.title) add(st.title); }
  for (const sc of S.CHASE_CUTS) for (const st of sc) if (st.text) add(st.text.az);
  for (const st of S.CHASE_END) if (st.text) add(st.text.az);
  for (const b of S.DUEL) add(b.az);
  const camp = fs.readFileSync(path.join(SRC, 'camp.js'), 'utf8');
  // (a) L(kim, hiss, MƏTN) çağırışlarının üçüncü arqumentindəki BÜTÜN sətirlər — şərtli ifadənin hər qolu, tək sözlük
  //     replikalar da ("Taparam.", "Pip." — əvvəl boşluqsuz olduqları üçün əhatədən düşmüşdülər); once('açar') istisna
  let i = 0;
  while ((i = camp.indexOf('L(', i)) >= 0) {
    if (/[A-Za-z_$.]/.test(camp[i - 1] || ' ')) { i += 2; continue; }
    let depth = 0, j = i + 1, q = null, esc = false; const commas = [];
    for (; j < camp.length; j++) { const c = camp[j]; if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = null; continue; } if (c === "'" || c === '"' || c === '`') q = c; else if (c === '(') depth++; else if (c === ')') { depth--; if (!depth) break; } else if (c === ',' && depth === 1) commas.push(j); }
    if (commas.length >= 2) { const arg = camp.slice(commas[1] + 1, j); for (const m of arg.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) { if (arg.slice(0, m.index).endsWith('once(')) continue; add(m[1].replace(/\\'/g, "'")); } }
    i = j;
  }
  // (b) qalan mətn sətirləri (jurnal: T('…')) — Azərbaycan hərfi və ya boşluğu olanlar
  for (const m of camp.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
    const s = m[1].replace(/\\'/g, "'");
    if (/[əğıöüşçƏĞİÖÜŞÇ]/.test(s) || (/ /.test(s) && /[a-z]{3}/.test(s) && !/^[#.\w-]+$/.test(s) && !/cgs__|rgba|\$\{|^ ?is-/.test(s))) add(s);
  }
  return out;
}
const dict = async (l) => (await mod(`lang/ch1.${l}.js`)).default;
const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join();

test('hər hekayə sətrinin en/ru/tr tərcüməsi var', async () => {
  const az = await corpus();
  expect(az.length, 'korpus boş deyil').toBeGreaterThan(250);
  for (const l of LANGS) {
    const d = await dict(l);
    const missing = az.filter((s) => typeof d[s] !== 'string' || !d[s].trim());
    expect(missing, `${l}: tərcüməsiz sətirlər`).toEqual([]);
    expect(az.filter((s) => holes(s) !== holes(d[s])), `${l}: yer tutucusu itib`).toEqual([]);
    expect(Object.keys(d).filter((k) => !az.includes(k)), `${l}: mənbədə olmayan (köhnəlmiş) açarlar`).toEqual([]);
    // uzun sətir tərcümə olunmadan köçürülməməlidir (xüsusi isimlər və qısa nidalar istisna)
    expect(az.filter((s) => s.length > 30 && d[s] === s), `${l}: tərcümə olunmadan qalan`).toEqual([]);
  }
});

// İnterfeys açarları (i18n.js): Carmageddon-un hər açarı dörd dilin hamısında var — olmayan açar Azərbaycancaya düşür
// (t() ehtiyatı), yəni başqa dildə oynayanın qarşısına Azərbaycanca söz çıxır.
test('interfeys açarları: hər cg.* açarı dörd dildə var və başqa dildə Azərbaycanca qalmayıb', async () => {
  const vm = await import('vm');
  const src = fs.readFileSync(path.join(SRC, '..', '..', 'core', 'i18n.js'), 'utf8').replace(/^export /gm, '').replace(/^import .*$/gm, '');
  const ctx = { localStorage: { getItem: () => 'az', setItem() {} }, navigator: { language: 'az' }, document: { documentElement: {} }, location: { reload() {} } };
  vm.createContext(ctx); vm.runInContext(src + '\nthis.__D = D;', ctx);
  const D = ctx.__D, keys = [...new Set(Object.values(D).flatMap((d) => Object.keys(d)))].filter((k) => k.startsWith('cg.') || k === 'mode.cg.d');
  expect(keys.length, 'açarlar tapıldı').toBeGreaterThan(80);
  for (const l of ['az', ...LANGS]) expect(keys.filter((k) => typeof D[l][k] !== 'string' || !D[l][k]), `${l}: çatışmayan açarlar`).toEqual([]);
  for (const l of ['en', 'ru']) expect(keys.filter((k) => D[l][k] === D.az[k] && /[əğıöşçƏĞİÖŞÇ]/.test(D.az[k]) && D.az[k].length > 6), `${l}: Azərbaycancadan köçürülmüş mətnlər`).toEqual([]);
  // kodda işlənən hər sabit açar lüğətdə var
  const used = new Set();
  for (const f of fs.readdirSync(SRC).filter((n) => n.endsWith('.js'))) for (const m of fs.readFileSync(path.join(SRC, f), 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'\s*[,)]/g)) used.add(m[1]);
  expect([...used].filter((k) => !(k in D.az)), 'lüğətdə olmayan açarlar').toEqual([]);
});

for (const l of LANGS) {
  test(`${l}: oyun bu dildə danışır və ən uzun sətirlər telefonda sığır`, async ({ page }) => {
    test.setTimeout(120_000);
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    const az = await corpus(); const d = await dict(l);
    await page.setViewportSize({ width: 844, height: 390 });
    await boot(page, { lang: l });
    await page.evaluate(() => { localStorage.removeItem('cgCh1'); window.__menu.onOpenGame('carmageddon'); });
    await page.waitForSelector('.cg.is-ready', { timeout: 30_000 });
    await page.locator('[data-cg="story"]').click();
    await page.waitForSelector('.cgs.is-ready', { timeout: 20_000 });
    await page.waitForSelector('.cgd:not([hidden])', { timeout: 10_000 });
    expect(await page.evaluate(() => window.__cgStory.dlg.full), 'proloqun ilk sətri seçilmiş dildədir').toBe(d[az[0]]);

    // ən uzun sətirlər: həm təhkiyə kimi, həm də portretli nitq kimi (portret eni azaldır)
    const longest = Object.values(d).sort((a, b) => b.length - a.length).slice(0, 8);
    const fit = await page.evaluate(async (lines) => {
      const dlg = window.__cgStory.dlg; const out = [];
      for (const text of lines) for (const who of [null, 'milo']) {
        dlg.say({ who, emo: 'neutral', text }); dlg.advance();          // yazını dərhal tamamla
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const b = dlg.box.getBoundingClientRect(); const p = dlg.box.querySelector('.cgd__text');
        const pr = p.getBoundingClientRect();
        out.push({ n: text.length, who, top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), inside: pr.top >= b.top - 1 && pr.bottom <= b.bottom + 1, clipX: p.scrollWidth > p.clientWidth + 1 });
      }
      return { out, w: innerWidth, h: innerHeight };
    }, longest);
    await page.screenshot({ path: path.join(DIR, `i18n-${l}-longest.png`) });
    for (const r of fit.out) {
      expect([r.top >= 0, r.bottom <= fit.h, r.left >= 0, r.right <= fit.w], `${l}: qutu ekrandadır (${r.n} hərf, ${r.who || 'təhkiyə'}) ${JSON.stringify(r)}`).toEqual([true, true, true, true]);
      expect([r.inside, r.clipX], `${l}: mətn qutunun içindədir (${r.n} hərf, ${r.who || 'təhkiyə'})`).toEqual([true, false]);
      expect(r.bottom - r.top, `${l}: qutu ekranın 60%-dən çoxunu tutmur (${r.n} hərf)`).toBeLessThanOrEqual(fit.h * 0.6);
    }
    expect(errs, 'konsol xətası yoxdur').toEqual([]);
  });
}
