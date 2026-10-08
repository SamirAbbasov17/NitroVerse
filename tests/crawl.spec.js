// TESTER KEÇİDİ: menyunun hər ekranı açılır və içindəki HƏR düymə bir-bir basılır (hər basışdan əvvəl
// ekran yenidən açılır). Axtarılan: JS xətası, konsol xətası, ekrandan daşan panel, üfüqi sürüşmə,
// toxunmaq üçün çox kiçik düymə (telefon). Masaüstü + telefon (844×390), qonaq kimi.
import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

const SCREENS = ['showModes', 'showOnline', 'showFriends', 'showInbox', 'showBugReport', 'showMessages', 'showTracks', 'showGarage',
  'showCosmetics', 'showCars', 'showLaps', 'showAuth', 'showSignup', 'showReset', 'showTop', 'showSettings'];
// oyunu başladan / səhifədən çıxaran düymələr basılmır (onların öz testləri var)
// dil düymələri səhifəni yenidən yükləyir — ayrıca yoxlanır (settings.spec)
const SKIP = /davam et|başla|yarışa|continue|start|play|carmageddon|dəstək ol|support|english|русский|türkçe|azərbaycan/i;

for (const [label, vp] of [['masaüstü', { width: 1280, height: 720 }], ['telefon', { width: 844, height: 390 }]]) {
  test(`crawl: bütün menyu düymələri — ${label}`, async ({ browser }) => {
    test.setTimeout(600_000);
    const mobile = label === 'telefon';
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile });
    const page = await ctx.newPage();
    const errs = [];
    let where = 'boot';
    page.on('pageerror', (e) => errs.push(`[${where}] ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource|peerjs|WebSocket/i.test(m.text())) errs.push(`[${where}] konsol: ${m.text().slice(0, 160)}`); });
    await boot(page);
    const issues = [];
    let clicks = 0;
    for (const scr of SCREENS) {
      const open = async () => { await page.evaluate((s) => window.__menu[s](), scr); await page.waitForTimeout(260); };
      where = scr;
      await open();
      // ekranın öz yoxlaması
      const audit = await page.evaluate((mob) => {
        const out = [];
        if (document.documentElement.scrollWidth > innerWidth + 1) out.push('üfüqi sürüşmə');
        const panel = document.querySelector('.menu-panel');
        if (panel) { const r = panel.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -8 /* giriş animasiyası */ || r.bottom > innerHeight + 1 || r.top < -1) out.push(`panel ekrandan daşır (${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)})`); }
        const btns = [...document.querySelectorAll('#ui-root button, #ui-root a, #ui-root input, #ui-root select')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden'; });
        for (const b of btns) {
          const r = b.getBoundingClientRect();
          // görünən sahədə olub ekrandan kənara çıxan (kəsilmiş) idarə elementi
          if (r.right > innerWidth + 2 || r.left < -2) out.push(`düymə yandan kəsilir: "${(b.textContent || b.placeholder || b.className).trim().slice(0, 24)}"`);
          // toxunuş sahəsi = düymə + görünməz genişlənmə (::after inset)
          const af = getComputedStyle(b, '::after'), ex = af.content !== 'none' && af.position === 'absolute';
          const th = r.height + (ex ? -parseFloat(af.top || 0) - parseFloat(af.bottom || 0) : 0), tw = r.width + (ex ? -parseFloat(af.left || 0) - parseFloat(af.right || 0) : 0);
          if (mob && (th < 34 || tw < 34) && !b.closest('.chat, .msgs')) out.push(`kiçik toxunuş hədəfi ${Math.round(r.width)}×${Math.round(r.height)}: "${(b.textContent || b.title || b.className).trim().slice(0, 24)}"`);
          if (b.tagName === 'BUTTON' && !(b.textContent || '').trim() && !b.title && !b.getAttribute('aria-label') && !b.querySelector('svg, img')) out.push(`boş düymə: ${b.className}`);
        }
        // mətni öz qutusundan daşan düymələr
        for (const b of btns) if (b.tagName === 'BUTTON' && b.scrollWidth > b.clientWidth + 3 && getComputedStyle(b).overflow !== 'visible') out.push(`mətn düyməyə sığmır: "${b.textContent.trim().slice(0, 24)}"`);
        return { out: [...new Set(out)], n: btns.filter((b) => b.tagName === 'BUTTON').length };
      }, mobile);
      for (const o of audit.out) issues.push(`${scr}: ${o}`);
      for (let i = 0; i < audit.n; i++) {
        await open();
        const info = await page.evaluate((k) => {
          const b = [...document.querySelectorAll('#ui-root button')].filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; })[k];
          if (!b) return null;
          return { text: (b.textContent || b.title || b.className).trim().slice(0, 30), disabled: b.disabled };
        }, i);
        if (!info || info.disabled || SKIP.test(info.text)) continue;
        where = `${scr} → "${info.text}"`;
        await page.evaluate((k) => {
          const b = [...document.querySelectorAll('#ui-root button')].filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; })[k];
          b?.click();
        }, i);
        clicks++;
        await page.waitForTimeout(90);
        // menyu sağ qalmalıdır (oyun təsadüfən başlamamalı, səhifə ağarmamalıdır)
        const alive = await page.evaluate(() => !!window.__menu && (!!document.querySelector('#ui-root').children.length || !!document.querySelector('.cg')));
        if (!alive) issues.push(`${where}: basışdan sonra ekran boş qaldı`);
        if (await page.evaluate(() => !!document.querySelector('.cg'))) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
        if (await page.evaluate(() => window.__active !== window.__showcase)) { issues.push(`${where}: oyun başladı (gözlənilmirdi)`); await page.reload(); await page.waitForFunction(() => !!window.__menu && !!window.__showcase, null, { timeout: 60_000 }); }
      }
    }
    console.log(`crawl ${label}: ${clicks} basış · xəta ${errs.length} · qeyd ${issues.length}`);
    for (const e of [...new Set(errs)]) console.log('  XƏTA', e);
    for (const e of [...new Set(issues)]) console.log('  QEYD', e);
    expect([...new Set(errs)], 'JS/konsol xətası yoxdur').toEqual([]);
    expect([...new Set(issues)], 'düzülüş/toxunuş qeydi yoxdur').toEqual([]);
    await ctx.close();
  });
}
