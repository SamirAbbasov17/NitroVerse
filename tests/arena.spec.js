import { test, expect } from '@playwright/test';
import { MODES, boot, startMode, mergeJson } from './helpers.js';

// ARENA silahları və təhlükələri (oflayn): hər silah gözlənilən zərəri verir, mina tətiklənir,
// şimşək ən yaxın rəqibi vurur, vuruş sayğacı artır, mərkəzi lazer 35-ci saniyədən zərər verir.
test('arena: silahlar, mina, şimşək, lazer, vuruş sayğacı', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'arena').config);
  await page.waitForFunction(() => window.__active._state === 'play', null, { timeout: 40_000 });
  const r = await page.evaluate(async () => {
    const sc = window.__active;
    const frames = (n) => new Promise((res) => { const f = () => (--n <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const me = sc.racers.find((x) => x.isLocal);
    const foes = sc.racers.filter((x) => !x.isLocal);
    sc._botDrive = () => {};                       // botlar tərpənməsin
    sc.obstacles.length = 0;
    sc.pickups.forEach((pk, i) => { sc.scene.remove(pk.mesh); sc.pickups.delete(i); });
    sc._hostSpawnPickups = () => {};
    const park = () => foes.forEach((f, i) => { f.car.position.set(-80 + i * 6, 0, -80); f.car.velocity.set(0, 0, 0); f.car.vF = 0; });
    const place = (car, x, z, h = 0) => { car.position.set(x, 0, z); car.heading = h; car.velocity.set(0, 0, 0); car.vF = 0; };
    const out = {};
    // 1) üçlü atəş: 14 m qabaqdakı rəqibə
    park(); place(me.car, 60, 0, 0); place(foes[0].car, 60, 14);
    let hp0 = foes[0].car.hp;
    me.item = 'trishot'; sc._useItem();
    out.trishotShots = sc.projectiles.length;
    await frames(40);
    out.trishotDmg = hp0 - foes[0].car.hp;
    // 2) raket
    park(); place(me.car, 60, 0, 0); place(foes[0].car, 60, 20);
    hp0 = foes[0].car.hp;
    me.item = 'missile'; sc._useItem();
    await frames(60);
    out.missileDmg = hp0 - foes[0].car.hp;
    // 3) mina: at, qurulmasını gözlə, rəqibi üstünə qoy
    park(); place(me.car, 60, 0, 0);
    me.item = 'mine'; sc._useItem();
    out.mineDropped = sc.mines.length;
    const mn = sc.mines[0];
    place(me.car, 60, 30);                         // özüm uzaqlaşıram
    await frames(60);
    hp0 = foes[1].car.hp;
    place(foes[1].car, mn.x, mn.z);
    await frames(10);
    out.mineDmg = hp0 - foes[1].car.hp;
    out.minesLeft = sc.mines.length;
    // 3b) ÖZ minan: qoyan kimi (2.5 s-dək) sənə toxunmur, sonra üstündən keçəndə yarı zərərlə partlayır
    park(); place(me.car, 60, 0, 0);
    me.item = 'mine'; sc._useItem();
    const own = sc.mines[0];
    await frames(60);                              // ~1 s: qurulub, amma sahibinə hələ toxunmur
    place(me.car, own.x, own.z); await frames(6);
    out.ownEarly = sc.mines.length;
    place(me.car, 60, 30); await frames(120);      // 2.5 s keçsin
    hp0 = me.car.hp;
    place(me.car, own.x, own.z); await frames(10);
    out.ownDmg = hp0 - me.car.hp; out.ownLeft = sc.mines.length;
    me.car.hp = 100;
    // 4) şimşək: ən yaxın rəqib
    park(); place(me.car, 60, 0, 0); place(foes[2].car, 62, 25);
    hp0 = foes[2].car.hp;
    me.item = 'bolt'; sc._useItem();
    await frames(3);
    out.boltDmg = hp0 - foes[2].car.hp;
    out.boltSlow = foes[2].car.hitTimer > 0;
    // 5) vuruş sayğacı: rəqibin canı 5-ə endirilir, şimşəklə bitirilir
    park(); place(me.car, 60, 0, 0); place(foes[3].car, 62, 20);
    foes[3].car.hp = 5;
    me.item = 'bolt'; sc._useItem();
    await frames(3);
    out.kills = me.kills || 0;
    out.killHud = document.querySelector('#ah-kills')?.textContent;
    out.foeDead = !foes[3].car.alive;
    // 6) lazer: 35-ci saniyədən əvvəl yoxdur, sonra qolun üstündəki maşına zərər verir
    park(); place(me.car, 80, 80);
    sc._playT = 20; await frames(3);
    out.sweepBefore = !!sc._sweep?.g.visible;
    sc._playT = 40; await frames(2);
    const ang = Math.max(0, sc._playT - 35) * 0.42;
    hp0 = me.car.hp;
    place(me.car, Math.sin(ang) * 20, Math.cos(ang) * 20);
    await frames(4);
    out.sweepOn = !!sc._sweep?.g.visible;
    out.sweepDmg = Math.round(hp0 - me.car.hp);
    return out;
  });
  mergeJson('arena.json', 'weapons', r);
  console.log(JSON.stringify(r));
  expect(errors, 'səhifə xətası yoxdur').toEqual([]);
  expect(r.trishotShots, 'üçlü atəş 3 güllə atır').toBe(3);
  expect(r.trishotDmg, 'üçlü atəş zərəri (ən azı bir güllə)').toBeGreaterThanOrEqual(12);
  expect(r.missileDmg, 'raket zərəri').toBe(30);
  expect(r.mineDropped, 'mina düşür').toBe(1);
  expect(r.mineDmg, 'mina zərəri').toBe(26);
  expect(r.minesLeft, 'mina partlayandan sonra silinir').toBe(0);
  expect(r.ownEarly, 'öz minan qoyulan kimi partlamır').toBe(1);
  expect(r.ownDmg, 'öz minan sonra yarı zərərlə partlayır').toBe(13);
  expect(r.ownLeft).toBe(0);
  expect(r.boltDmg, 'şimşək zərəri').toBe(14);
  expect(r.boltSlow, 'şimşək yavaşladır').toBe(true);
  expect(r.foeDead, 'rəqib elenir').toBe(true);
  expect(r.kills, 'vuruş sayğacı').toBe(1);
  expect(r.killHud, 'HUD-da vuruş sayı').toContain('1');
  expect(r.sweepBefore, '35 s-dən əvvəl lazer yoxdur').toBe(false);
  expect(r.sweepOn, 'lazer işə düşür').toBe(true);
  expect(r.sweepDmg, 'lazer zərəri').toBe(14);
});
