// Telefonda başlanğıc qapısı: menyudan əvvəl bir toxunuş → tam ekran istənir → qapı açılır.
// Bildirişlər: düyməsiz bildiriş 5 s-dən çox qalmır, toxunuşla dərhal bağlanır.
import { test, expect } from '@playwright/test';
import path from 'path';

const DIR = path.join('tests', 'out', 'shots', 'gate');

test('telefon: başlanğıc ekranı görünür, toxunuş tam ekran istəyir və menyunu açır (4 dil)', async ({ browser }) => {
  test.setTimeout(180_000);
  for (const [lang, w, h] of [['az', 844, 390], ['en', 740, 340], ['ru', 667, 375], ['tr', 844, 390], ['ru', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript((l) => {
      localStorage.setItem('apexLang', l); localStorage.setItem('apexMuted', '1'); localStorage.setItem('apexGate', '1');
      // sorğular sayılır, tam ekran isə "alınmır" — sonrakı toxunuşların yenidən cəhd etdiyi də yoxlanır
      window.__fs = 0;
      Element.prototype.requestFullscreen = function () { window.__fs++; return Promise.resolve(); };
    }, lang);
    await page.goto('/');
    const gate = page.locator('#start-gate');
    await expect(gate).toBeVisible();
    await page.waitForFunction(() => !!window.__menu && !!window.__showcase, null, { timeout: 60_000 });   // oyun arxada yüklənir
    await expect(gate, 'toxunuşa qədər açıq qalır').toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('ui-root')).visibility), 'menyu arxada görünmür').toBe('hidden');
    const fit = await page.evaluate(() => [...document.querySelectorAll('.start-gate__box > *')].filter((c) => { const r = c.getBoundingClientRect(); return !(r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && (c.classList.contains('start-gate__btn') || c.scrollWidth <= c.clientWidth + 1)); }).map((c) => c.className));   // düymənin nəbz halqası (::after) daşma sayılmır
    expect([lang, w, fit], 'yazılar ekrana sığır').toEqual([lang, w, []]);
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(DIR, `gate-${lang}-${w}.png`) });
    if (h > w) { await ctx.close(); continue; }   // şaquli: yalnız görünüş yoxlanır
    await page.locator('.start-gate__btn').tap();
    await expect(gate).toHaveCount(0, { timeout: 5000 });
    const n1 = await page.evaluate(() => window.__fs);
    expect(n1, 'tam ekran toxunuşla istəndi').toBeGreaterThanOrEqual(1);
    await expect(page.locator('.menu-list .mrow').first()).toBeVisible();
    // TAM EKRAN İTİBSƏ növbəti toxunuş yenidən istəyir
    await page.locator('.menu-list .mrow').first().tap();
    expect(await page.evaluate(() => window.__fs), 'sonrakı toxunuş yenidən cəhd edir').toBeGreaterThan(n1);
    expect(errs).toEqual([]);
    await ctx.close();
  }
});

test('masaüstü: qapı yoxdur', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('apexGate', '1'); localStorage.setItem('apexMuted', '1'); });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__menu, null, { timeout: 60_000 });
  expect(await page.locator('#start-gate').count()).toBe(0);
});

test('bildiriş: 3 s-də gedir, toxunuş və sürüşdürmə bağlayır', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('apexMuted', '1'));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__notices, null, { timeout: 60_000 });
  const N = page.locator('.notice');
  await page.evaluate(() => window.__notices.show({ icon: '🔒', text: 'Qısa məlumat', life: 14 }));
  await expect(N).toHaveCount(1);
  await page.waitForTimeout(2500);
  await expect(N, '2.5 s-də hələ oxunur').toHaveCount(1);
  await page.waitForTimeout(1000);
  await expect(N, '3 s + sönmə: getdi').toHaveCount(0);
  // düyməli (cavab gözləyən) ən çox 8 s
  await page.evaluate(() => window.__notices.show({ icon: '🎮', text: 'Dəvət', life: 25, actions: [{ label: 'Qəbul et', onClick: () => {} }] }));
  await page.waitForTimeout(8500);
  await expect(N, 'düyməli 8 s-dən çox qalmır').toHaveCount(0);
  // toxunuş bağlayır
  await page.evaluate(() => window.__notices.show({ icon: '🎮', text: 'Toxunuş', life: 25, actions: [{ label: 'Qəbul et', onClick: () => {} }] }));
  await page.locator('.notice__text').click();
  await page.waitForTimeout(400);
  await expect(N, 'toxunuş bağlayır').toHaveCount(0);
  // sürüşdürmə: az çəkiləndə qayıdır, çox çəkiləndə gedir
  await page.evaluate(() => window.__notices.show({ icon: '🎮', text: 'Sürüşdür', life: 25, actions: [{ label: 'Qəbul et', onClick: () => {} }] }));
  const b = await page.locator('.notice__text').boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 25, y, { steps: 4 }); await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(N, 'az çəkildi — qalır').toHaveCount(1);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 120, y, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(N, 'yana sürüşdürüldü — getdi').toHaveCount(0);
  await page.evaluate(() => window.__notices.show({ icon: '🎮', text: 'Yuxarı', life: 25, actions: [{ label: 'Qəbul et', onClick: () => {} }] }));
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 70, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(N, 'yuxarı sürüşdürüldü — getdi').toHaveCount(0);
});
