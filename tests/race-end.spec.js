import path from 'node:path';
import { test, expect } from '@playwright/test';
import { MODES, OUT, boot, startMode } from './helpers.js';

// Yarışın sonu (oflayn): bot birinci finişə çatanda oyunçuya "uduzdun" bildirişi və
// 30 saniyəlik geri sayım çıxır; "Yarışı bitir" düyməsi və ya vaxtın bitməsi nəticə
// ekranını açır. Onlayn axın iki brauzer tələb edir — burada yoxlanmır.
const CFG = MODES.find((m) => m.name === 'race-desert').config;
const MOBILE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

async function botWins(page) {
  await startMode(page, CFG);
  await page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30_000 });
  await page.evaluate(() => {
    const sc = window.__active;
    const rm = sc.raceManager;
    const bot = sc.racers.find((r) => !r.isPlayer);
    bot.finished = true; bot.finishTime = rm.elapsed; bot.finishPos = ++rm._finishOrder;
    rm.onFinish(bot, bot.finishPos);
  });
}

test('yarış sonu: bot qalib → bildiriş, geri sayım, düymə → nəticə ekranı', async ({ page }) => {
  await boot(page);
  await botWins(page);
  const banner = page.locator('#hud-end');
  await expect(banner).toHaveClass(/is-visible/);
  await expect(page.locator('#hud-end-title')).toHaveText('Yarışı uduzdun');
  const n1 = +(await page.locator('#hud-end-n').textContent());
  expect(n1).toBeGreaterThanOrEqual(29);
  await page.waitForTimeout(3400); // 3.4 s → ən azı 2 saniyə düşməlidir (sərhəd titrəməsinə ehtiyat)
  const n2 = +(await page.locator('#hud-end-n').textContent());
  expect(n2, 'geri sayım gedir').toBeLessThanOrEqual(n1 - 2);
  await page.screenshot({ path: path.join(OUT, 'race-end-desktop.png') });
  await page.locator('#hud-end-btn').click();
  await page.waitForFunction(() => window.__active?._state === 'done' || window.__active === window.__showcase, null, { timeout: 5000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'race-end-results.png') });
  // Nəticə ekranında oyunçu birinci deyil
  const txt = await page.locator('#ui-root').innerText();
  expect(txt.length).toBeGreaterThan(20);
});

test('yarış sonu: Enter düyməsi yarışı bitirir; zolaq yoxdursa heç nə etmir', async ({ page }) => {
  await boot(page);
  await startMode(page, CFG);
  await page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30_000 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__active._state), 'zolaqsız Enter yarışı bitirmir').toBe('run');
  await page.evaluate(() => {
    const sc = window.__active;
    const rm = sc.raceManager;
    const bot = sc.racers.find((r) => !r.isPlayer);
    bot.finished = true; bot.finishTime = rm.elapsed; bot.finishPos = ++rm._finishOrder;
    rm.onFinish(bot, bot.finishPos);
  });
  await expect(page.locator('#hud-end')).toHaveClass(/is-visible/);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__active?._state === 'done' || window.__active === window.__showcase, null, { timeout: 5000 });
});

test('yarış sonu: 30 saniyə bitəndə nəticə özü açılır', async ({ page }) => {
  await boot(page);
  await botWins(page);
  await page.evaluate(() => { window.__active._endT = 1.2; });
  await page.waitForFunction(() => window.__active?._state === 'done' || window.__active === window.__showcase, null, { timeout: 6000 });
});

test('yarış sonu: oyunçu qalibdirsə bildiriş çıxmır', async ({ page }) => {
  await boot(page);
  await startMode(page, CFG);
  await page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30_000 });
  await page.evaluate(() => {
    const sc = window.__active;
    const rm = sc.raceManager;
    const me = sc.racers.find((r) => r.isPlayer);
    me.finished = true; me.finishTime = rm.elapsed; me.finishPos = ++rm._finishOrder;
    rm.onFinish(me, me.finishPos);
    rm.onPlayerFinish(me);
  });
  await page.waitForTimeout(500);
  await expect(page.locator('#hud-end')).not.toHaveClass(/is-visible/);
});

test('yarış sonu: telefonda bildiriş HUD-u və idarəni örtmür', async ({ browser }) => {
  const ctx = await browser.newContext(MOBILE);
  const page = await ctx.newPage();
  await boot(page);
  await botWins(page);
  await expect(page.locator('#hud-end')).toHaveClass(/is-visible/);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'race-end-mobile.png') });
  const hit = await page.evaluate(() => {
    const a = document.querySelector('#hud-end').getBoundingClientRect();
    const over = [];
    for (const el of document.querySelectorAll('.hud-chip, .tbtn, #hud-speed, .hud__item, .hud__item2, .hud__sig, .hud canvas, .hud button:not(#hud-end-btn):not(#hud-rescue)')) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) over.push(el.className || el.id);
    }
    return { over, btnH: document.querySelector('#hud-end-btn').getBoundingClientRect().height, w: a.width, top: a.top, bottom: a.bottom };
  });
  console.log(JSON.stringify(hit));
  expect(hit.over, 'bildiriş başqa HUD elementinin üstünə düşmür').toEqual([]);
  expect(hit.btnH, 'düymə toxunuş üçün ən azı 40 px').toBeGreaterThanOrEqual(40);
  await ctx.close();
});

// Finişdən sonra maşın yol boyu özü gedir (əvvəl dümdüz gedib yoldan çıxırdı), oyunçu idarə edə bilmir.
// Oflayn nəticə ekranı 2.6 s-dən sonra açılır; burada o gecikdirilir ki, 10 saniyə izləyə bilək.
test('yarış sonu: finişdən sonra maşın yol boyu gedir, idarə bağlıdır', async ({ page }) => {
  await boot(page);
  await startMode(page, CFG);
  await page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30_000 });
  await page.evaluate(() => { window.__active.enableAutopilot(); });
  await page.waitForTimeout(6000); // sürət yığsın və döngəyə yaxınlaşsın
  await page.evaluate(() => {
    const sc = window.__active;
    const rm = sc.raceManager;
    const me = rm.getPlayer();
    me.finished = true; me.finishTime = rm.elapsed; me.finishPos = ++rm._finishOrder;
    rm.onFinish(me, me.finishPos);
    rm.onPlayerFinish(me);
    sc._finishTimer = 60; // nəticə ekranını gecikdir
    // oyunçu sükanı tam sola basır — təsir etməməlidir
    sc.input.touch = { throttle: 1, steer: -1 };
  });
  let off = 0;
  let minSpeed = 99;
  let dist = 0;
  let last = null;
  for (let i = 0; i < 50; i++) {
    await page.waitForTimeout(200);
    const s = await page.evaluate(() => {
      const c = window.__active.playerCar;
      return { on: c.onRoad, v: c.velocity.length(), x: c.position.x, z: c.position.z };
    });
    if (!s.on) off++;
    if (i > 5) minSpeed = Math.min(minSpeed, s.v);
    if (last) dist += Math.hypot(s.x - last.x, s.z - last.z);
    last = s;
  }
  console.log(`finişdən sonra 10 s: yoldan kənar nümunə ${off}/50 · min sürət ${minSpeed.toFixed(1)} m/s · məsafə ${dist.toFixed(0)} m`);
  expect(off, 'maşın yoldan çıxmır').toBe(0);
  expect(minSpeed, 'maşın getməyə davam edir').toBeGreaterThan(4);
  expect(dist, 'yol boyu irəliləyir').toBeGreaterThan(120);
});
