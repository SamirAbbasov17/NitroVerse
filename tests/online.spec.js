import { spawn } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

// ONLAYN YARIŞ — iki ayrı brauzer konteksti, real PeerJS/WebRTC bağlantısı.
// Signaling üçün yerli broker qaldırılır (peerserver/, port 9123) — canlı serverə toxunulmur.
// Yoxlanan: yarışın sonu axını (finiş bildirişi, "Yarışı bitir", 30 s gözləmə, nəticə).
const PEER = { host: 'localhost', port: 9123, path: '/peer', key: 'nitroverse', secure: false };
let broker;

test.beforeAll(async () => {
  broker = spawn('node', ['peerserver/server.js'], { env: { ...process.env, PORT: String(PEER.port) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`http://localhost:${PEER.port}/health`)).ok) return; } catch { /* hələ qalxmayıb */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('yerli PeerJS broker qalxmadı');
});
test.afterAll(() => { broker?.kill(); });

async function open(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript((p) => { window.__PEER_OVERRIDE = p; }, PEER);
  await boot(page);
  await page.waitForFunction(() => !!window.__online);
  return { ctx, page };
}

// Host otaq yaradır, qonaq qoşulur, host yarışı başladır; hər iki səhnə "racing" olana qədər gözləyir
async function startRace(browser) {
  const host = await open(browser);
  const guest = await open(browser);
  const code = await host.page.evaluate(async () => {
    const net = new window.__online.NetRoom();
    window.__net = net;
    net.on('start', (msg) => window.__online.start(net, msg));
    return net.createRoom('Test otağı', 'Ev sahibi');
  });
  await guest.page.evaluate(async (c) => {
    const net = new window.__online.NetRoom();
    window.__net = net;
    net.on('start', (msg) => window.__online.start(net, msg));
    await net.joinRoom(c, 'Qonaq');
    net.setReady(true);
  }, code);
  await host.page.waitForFunction(() => window.__net.players.length === 2 && window.__net.players.every((p) => p.isHost || p.ready), null, { timeout: 15_000 });
  await host.page.evaluate(() => { window.__net.setLobby('desert', 1); window.__net.startGame(); });
  for (const p of [host.page, guest.page]) {
    await p.waitForFunction(() => window.__active?.raceManager?.state === 'racing', null, { timeout: 45_000 });
  }
  return { host, guest };
}

// Yerli oyunçunu finişə çatmış kimi işarələ (real finişin çağırdığı eyni qarmaqlar)
const finishLocal = (page) => page.evaluate(() => {
  const sc = window.__active;
  const rm = sc.raceManager;
  const me = rm.getPlayer();
  me.finished = true; me.finishTime = rm.elapsed; me.finishPos = ++rm._finishOrder;
  rm.onFinish(me, me.finishPos);
  rm.onPlayerFinish(me);
});
const done = (page) => page.waitForFunction(() => window.__active?._state === 'done', null, { timeout: 10_000 });

test('onlayn: host finişə çatır → qonaq "uduzdun" görür → Enter → hamı bitib, nəticə dərhal gəlir', async ({ browser }) => {
  test.setTimeout(120_000);
  const { host, guest } = await startRace(browser);
  await finishLocal(host.page);

  // Qonaq: uduzdun zolağı, qalibin adı ilə
  await expect(guest.page.locator('#hud-end')).toHaveClass(/is-visible/, { timeout: 8000 });
  await expect(guest.page.locator('#hud-end')).toHaveClass(/is-lost/);
  await expect(guest.page.locator('#hud-end-sub')).toContainText('Ev sahibi');
  // Host: "digərləri gözlənilir" (düyməsiz)
  await expect(host.page.locator('#hud-end')).toHaveClass(/is-visible/);
  await expect(host.page.locator('#hud-end')).not.toHaveClass(/is-lost/);
  await expect(host.page.locator('#hud-end-btn')).toBeHidden();
  expect(await host.page.evaluate(() => window.__active._state), 'nəticə hələ gəlməyib — qonaq gözlənilir').toBe('run');

  // Qonaq yarışı bitirir → host hamının bitdiyini görür → nəticə hər ikisinə
  await guest.page.keyboard.press('Enter');
  await done(host.page);
  await done(guest.page);
  const rows = await guest.page.evaluate(() => [...document.querySelectorAll('.results__row, .results li, .results__item')].length);
  const txt = await guest.page.locator('#ui-root').innerText();
  expect(txt, 'nəticə ekranında hər iki oyunçu').toContain('Ev sahibi');
  expect(txt).toContain('Qonaq');
  console.log(`nəticə sətirləri: ${rows}`);
  await host.ctx.close(); await guest.ctx.close();
});

test('onlayn: yarışı bitirən maşın yerində qalır; qalan oyunçu yoxdursa vaxt bitəndə nəticə gəlir', async ({ browser }) => {
  test.setTimeout(120_000);
  const { host, guest } = await startRace(browser);
  // Qonaq bir az sürsün ki, "yerində qalma" mənalı olsun
  await guest.page.evaluate(() => { window.__active.input.touch = { throttle: 1, steer: 0 }; });
  await guest.page.waitForTimeout(2500);
  await finishLocal(host.page);
  await expect(guest.page.locator('#hud-end')).toHaveClass(/is-lost/, { timeout: 8000 });

  // Host nəticəni müvəqqəti saxlayır ki, bitirən maşının yerində qaldığını ölçə bilək
  // (iki nəfərlik otaqda qonaq bitirən kimi nəticə dərhal gedir).
  await host.page.evaluate(() => {
    const sc = window.__active;
    window.__send = sc._hostSendResults.bind(sc);
    sc._hostSendResults = () => { window.__wanted = true; };
  });
  // Qonaq heç nə basmır: öz sayğacı bitəndə özü "bitirir" (sayğac 1 saniyəyə endirilir)
  await guest.page.evaluate(() => { window.__active._endT = 1.0; });
  await guest.page.waitForFunction(() => window.__active._gaveUp === true, null, { timeout: 5000 });
  await host.page.waitForFunction(() => window.__wanted === true, null, { timeout: 5000 });
  const remotePos = () => host.page.evaluate(() => {
    const r = window.__active.racers.find((x) => x.isRemote);
    return { x: r.car.position.x, z: r.car.position.z };
  });
  await host.page.waitForTimeout(700); // interpolyasiya otursun
  const a = await remotePos();
  await host.page.waitForTimeout(1200);
  const b = await remotePos();
  const moved = Math.hypot(a.x - b.x, a.z - b.z);
  console.log(`bitirən maşının 1.2 s-də yerdəyişməsi (host-un ekranında): ${moved.toFixed(2)} m`);
  expect(moved, 'bitirən maşın yerində qalır').toBeLessThan(0.5);
  const local = await guest.page.evaluate(() => window.__active.playerCar.velocity.length());
  expect(local, 'qonağın öz maşını dayanıb (m/s)').toBeLessThan(0.5);
  await host.page.evaluate(() => window.__send());
  await done(host.page);
  await done(guest.page);
  await host.ctx.close(); await guest.ctx.close();
});

test('onlayn: heç kim bitirmirsə host 30 s-dən sonra nəticəni özü göndərir', async ({ browser }) => {
  test.setTimeout(120_000);
  const { host, guest } = await startRace(browser);
  await finishLocal(host.page);
  await expect(guest.page.locator('#hud-end')).toHaveClass(/is-lost/, { timeout: 8000 });
  // Qonağın sayğacı dondurulur (heç vaxt özü bitirməsin) — yalnız host-un vaxtı işləsin
  await guest.page.evaluate(() => { const sc = window.__active; sc._updateRaceEnd = () => {}; });
  const t0 = await host.page.evaluate(() => window.__active._hostResultsTimer);
  expect(t0, 'host-un gözləmə vaxtı 30 s-dən başlayır').toBeGreaterThan(25);
  expect(t0).toBeLessThanOrEqual(30);
  await host.page.evaluate(() => { window.__active._hostResultsTimer = 1.5; });
  await done(host.page);
  await done(guest.page);
  await host.ctx.close(); await guest.ctx.close();
});
