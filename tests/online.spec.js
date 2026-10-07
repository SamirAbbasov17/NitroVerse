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

// ————— ONLAYN ARENA —————
// İki brauzer: host + qonaq (botlar hostun simulyasiyasındadır). Yoxlanan: bir oyunçunun
// işlətdiyi silah o birinin ekranında GÖRÜNÜR (raket, üçlü atəş, mina, şimşək), zərər qurbanın
// tərəfində tətbiq olunur və canı hər iki tərəfdə eynidir, mina hər iki tərəfdə partlayıb
// silinir, elenmə və vuruş sayğacı sinxrondur.
async function startArena(browser) {
  const host = await open(browser);
  const guest = await open(browser);
  const code = await host.page.evaluate(async () => {
    const net = new window.__online.NetRoom();
    window.__net = net;
    net.on('start', (msg) => window.__online.start(net, msg));
    return net.createRoom('Arena otağı', 'Ev sahibi');
  });
  await guest.page.evaluate(async (c) => {
    const net = new window.__online.NetRoom();
    window.__net = net;
    net.on('start', (msg) => window.__online.start(net, msg));
    await net.joinRoom(c, 'Qonaq');
    net.setReady(true);
  }, code);
  await host.page.waitForFunction(() => window.__net.players.length === 2 && window.__net.players.every((p) => p.isHost || p.ready), null, { timeout: 15_000 });
  await host.page.evaluate(() => { window.__net.setMode('arena'); window.__net.startGame(); });
  for (const p of [host.page, guest.page]) {
    await p.waitForFunction(() => window.__active?._state === 'play' && !!window.__active.racers, null, { timeout: 60_000 });
  }
  // Sınaq şəraiti: botlar və bonuslar qarışmasın, zona və lazer hələ uzaqdadır
  await host.page.evaluate(() => {
    const sc = window.__active;
    sc._botDrive = (r) => { r.car.velocity.set(0, 0, 0); r.car.vF = 0; };
    sc._hostSpawnPickups = () => {};
    sc.racers.filter((x) => x.isBot).forEach((b, i) => { b.car.position.set(-85 + i * 5, 0, -40); });
  });
  for (const p of [host.page, guest.page]) {
    await p.evaluate(() => {
      const sc = window.__active;
      sc.obstacles.length = 0;
      sc.pickups.forEach((pk, i) => { sc.scene.remove(pk.mesh); sc.pickups.delete(i); });
      window.__seen = { proj: 0, mines: 0, bolts: 0 };
      const f = sc._applyEffect.bind(sc);
      sc._applyEffect = (it, r, n) => { if (n) window.__seen[it] = (window.__seen[it] || 0) + 1; return f(it, r, n); };
    });
  }
  return { host, guest };
}

// Öz maşınını verilən yerə qoy və orada saxla (hər kadr — şəbəkə vəziyyəti də bunu daşıyır)
const hold = (page, x, z, h = 0) => page.evaluate(([px, pz, hh]) => {
  const sc = window.__active, me = sc.racers.find((r) => r.isLocal);
  clearInterval(window.__hold);
  const put = () => { me.car.position.set(px, 0, pz); me.car.heading = hh; me.car.velocity.set(0, 0, 0); me.car.vF = 0; };
  put(); window.__hold = setInterval(put, 16);
}, [x, z, h]);
const peerHp = (page, who) => page.evaluate((w) => {
  const sc = window.__active;
  const r = sc.racers.find((x) => (w === 'me' ? x.isLocal : !x.isLocal && !x.isBot));
  return { hp: Math.round(r.car.hp), alive: r.car.alive, x: +r.car.position.x.toFixed(1), z: +r.car.position.z.toFixed(1), kills: r.kills || 0 };
}, who);

test('onlayn arena: silahlar hər iki tərəfdə görünür, zərər və elenmə sinxrondur', async ({ browser }) => {
  test.setTimeout(180_000);
  const { host, guest } = await startArena(browser);
  const errs = [];
  for (const p of [host.page, guest.page]) p.on('pageerror', (e) => errs.push(e.message));
  // host (60, 0) şimala baxır; qonaq 18 m qabağında
  await hold(host.page, 60, 0, 0);
  await hold(guest.page, 60, 18, 0);
  await host.page.waitForFunction(() => { const g = window.__active.racers.find((x) => !x.isLocal && !x.isBot); return Math.abs(g.car.position.z - 18) < 2.5 && Math.abs(g.car.position.x - 60) < 2.5; }, null, { timeout: 15_000 });
  const use = (page, it) => page.evaluate((item) => { const sc = window.__active; sc.racers.find((r) => r.isLocal).item = item; sc._useItem(); }, it);

  // 1) RAKET: host atır → qonaq raketi görür, 30 can itirir, host da qonağın canını 70 görür
  await use(host.page, 'missile');
  await guest.page.waitForFunction(() => window.__seen.missile >= 1, null, { timeout: 5000 });
  await guest.page.waitForFunction(() => window.__active.racers.find((r) => r.isLocal).car.hp <= 70, null, { timeout: 6000 });
  await host.page.waitForFunction(() => window.__active.racers.find((x) => !x.isLocal && !x.isBot).car.hp <= 70, null, { timeout: 6000 });
  const afterMissile = { guest: await peerHp(guest.page, 'me'), hostSees: await peerHp(host.page, 'peer') };

  // 2) ÜÇLÜ ATƏŞ: qonaq 3 güllə görür
  await use(host.page, 'trishot');
  await guest.page.waitForFunction(() => window.__seen.trishot >= 1, null, { timeout: 5000 });
  await guest.page.waitForTimeout(900);
  const afterTri = await peerHp(guest.page, 'me');

  // 3) ŞİMŞƏK: qonaqda ildırım effekti + 14 zərər
  await use(host.page, 'bolt');
  await guest.page.waitForFunction(() => window.__seen.bolt >= 1, null, { timeout: 5000 });
  await guest.page.waitForTimeout(700);
  const afterBolt = await peerHp(guest.page, 'me');

  // 4) MİNA: host atır (arxasına, z ≈ −3.2) → qonaqda mina görünür → qonaq üstünə gedir →
  //    hostun simulyasiyası partladır → hər iki tərəfdə silinir, qonaq zərər alır
  await use(host.page, 'mine');
  await guest.page.waitForFunction(() => window.__active.mines.length === 1, null, { timeout: 5000 });
  const mine = await guest.page.evaluate(() => ({ x: window.__active.mines[0].x, z: window.__active.mines[0].z }));
  await hold(host.page, 60, 40, 0);                 // host uzaqlaşır (öz minasından zərər almasın)
  await host.page.waitForTimeout(1000);             // mina qurulsun
  const beforeMine = await peerHp(guest.page, 'me');
  await hold(guest.page, mine.x, mine.z, 0);
  await guest.page.waitForFunction(() => window.__active.mines.length === 0, null, { timeout: 8000 });
  await host.page.waitForFunction(() => window.__active.mines.length === 0, null, { timeout: 5000 });
  await guest.page.waitForTimeout(700);
  const afterMine = await peerHp(guest.page, 'me');

  // 5) ELENMƏ + VURUŞ SAYĞACI: qonağın canı 5-ə endirilir, host şimşəklə bitirir
  await hold(guest.page, 60, 58, 0);
  await guest.page.evaluate(() => { const sc = window.__active; const me = sc.racers.find((r) => r.isLocal); me.car.hp = 5; sc._sendHp(me); });
  await host.page.waitForFunction(() => { const g = window.__active.racers.find((x) => !x.isLocal && !x.isBot); return Math.abs(g.car.position.z - 58) < 3; }, null, { timeout: 8000 });
  await use(host.page, 'bolt');
  await guest.page.waitForFunction(() => !window.__active.racers.find((r) => r.isLocal).car.alive, null, { timeout: 8000 });
  await host.page.waitForFunction(() => !window.__active.racers.find((x) => !x.isLocal && !x.isBot).car.alive, null, { timeout: 8000 });
  const hostMe = await peerHp(host.page, 'me');
  const guestSeesHost = await peerHp(guest.page, 'peer');
  const res = { afterMissile, tri: afterMissile.guest.hp - afterTri.hp, bolt: afterTri.hp - afterBolt.hp, mine: beforeMine.hp - afterMine.hp, hostKills: hostMe.kills, guestSeesHostKills: guestSeesHost.kills, errs };
  console.log(JSON.stringify(res));
  expect(errs, 'səhifə xətası yoxdur').toEqual([]);
  expect(afterMissile.guest.hp, 'raket: qonağın canı').toBe(70);
  expect(afterMissile.hostSees.hp, 'raket: host qonağın canını eyni görür').toBe(70);
  expect(res.tri, 'üçlü atəş zərəri (12-nin misli)').toBeGreaterThanOrEqual(12);
  expect(res.tri % 12, 'üçlü atəş: tam güllə sayı').toBe(0);
  expect(res.bolt, 'şimşək zərəri').toBe(14);
  expect(res.mine, 'mina zərəri').toBe(26);
  expect(res.hostKills, 'hostun vuruş sayı (öz ekranında)').toBe(1);
  expect(res.guestSeesHostKills, 'qonaq hostun vuruş sayını eyni görür').toBe(1);
  await host.ctx.close(); await guest.ctx.close();
});
