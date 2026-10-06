import { test, expect } from '@playwright/test';
import { MODES, boot, startMode, mergeJson } from './helpers.js';

// Silahların can zərəri. Hər silah oyunun öz yolu ilə tətbiq olunur (mina yerə qoyulur və
// maşın onun üstündədir; raket/şimşək/güllə PowerUpManager-in dəymə funksiyaları ilə).
const CFG = (carId) => ({ ...MODES.find((m) => m.name === 'race-desert').config, carId });

async function setup(page, carId = 'blaze') {
  await boot(page);
  await startMode(page, CFG(carId));
  await page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30_000 });
  await page.evaluate(() => {
    const sc = window.__active;
    // rəqiblər uzağa: yalnız sınaq silahı təsir etsin; imza gücləri sönsün
    for (const r of sc.racers) {
      if (r.isPlayer) continue;
      r.car.position.set(9000, 0, 9000); r.car.velocity.set(0, 0, 0);
      if (r.controller) r.controller.active = false;
      if (r.signature) r.signature.used = true;
    }
  });
}

test('zərər: mina oyunçunun canını aparır', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const sc = window.__active;
    const car = sc.playerCar;
    const hp0 = car.hp;
    car._dmgCd = 0; car._invuln = 0; car.shieldTimer = 0;
    sc.powerups.spawnNetMine('test-mine', car.position.x, car.position.z, null);
    await new Promise((res) => setTimeout(res, 600));
    return { hp0, hp1: car.hp, max: car.maxHp ?? sc.hz.hp };
  });
  console.log(`mina: can ${r.hp0} → ${r.hp1} (maks ${r.max})`);
  expect(r.hp1, 'mina can aparır').toBeLessThan(r.hp0);
});

// Hədəf: ən güclü silahla (raket) orta maşın ~4 vuruşa partlayır; şimşək ən zəifdir; ağır
// maşın daha çox dözür; silah zərəri "zərər fasiləsi"nə düşmür (ardıcıl vuruşların hamısı sayılır).
test('zərər: silahların gücü və maşına görə vuruş sayı', async ({ page }) => {
  const table = {};
  for (const carId of ['titan', 'blaze', 'cargo']) { // zireh 35 / 55 / 95
    await setup(page, carId);
    table[carId] = await page.evaluate(() => {
      const sc = window.__active;
      const me = sc.racers.find((r) => r.isPlayer);
      const car = sc.playerCar;
      const fresh = () => { car.hp = car.maxHp; car._dmgCd = 0; car._invuln = 0; car.shieldTimer = 0; };
      const out = { armor: car.data.stats.armor, maxHp: car.maxHp, dmg: {} };
      // hər silahın bir vuruşu (oyunun öz dəymə yolu ilə)
      fresh(); sc.powerups._applyMissileHit(me, null); out.dmg.missile = car.maxHp - car.hp;
      for (const kind of ['mine', 'trishot', 'bolt']) { fresh(); sc.powerups.onHit(me, kind); out.dmg[kind] = car.maxHp - car.hp; }
      // raketlə partlayana qədər neçə vuruş (ardıcıl, fasiləsiz — cooldown mane olmamalıdır)
      fresh();
      let hits = 0;
      const boom = sc._explodeRespawn.bind(sc);
      let dead = false;
      sc._explodeRespawn = (c) => { dead = true; boom(c); };
      while (!dead && hits < 12) { sc.powerups._applyMissileHit(me, null); hits++; car._invuln = dead ? car._invuln : 0; }
      out.missileHitsToExplode = hits;
      // lazerdən dərhal sonra mina: fasilə silah zərərini udmamalıdır
      fresh();
      sc._damage(car, 5);                 // davamlı təhlükə → 0.5 s fasilə başlayır
      const before = car.hp;
      sc.powerups.onHit(me, 'mine');
      out.mineRightAfterHazard = before - car.hp;
      return out;
    });
  }
  mergeJson('damage.json', 'race', table);
  for (const [id, r] of Object.entries(table)) {
    console.log(`${id.padEnd(12)} zireh ${r.armor} · can ${r.maxHp} · raket ${r.dmg.missile} · mina ${r.dmg.mine} · güllə ${r.dmg.trishot} · şimşək ${r.dmg.bolt} · raketlə ${r.missileHitsToExplode} vuruşa partlayır · təhlükədən dərhal sonra mina ${r.mineRightAfterHazard}`);
  }
  const b = table.blaze;
  expect(b.dmg.missile, 'raket ən güclüdür').toBeGreaterThan(b.dmg.mine - 0.01);
  expect(b.dmg.mine, 'mina şimşəkdən güclüdür').toBeGreaterThan(b.dmg.bolt);
  expect(b.dmg.bolt, 'şimşək raketin yarısından azdır').toBeLessThan(b.dmg.missile / 2);
  expect(b.missileHitsToExplode, 'orta maşın raketlə 4 vuruşa partlayır').toBe(4);
  expect(table.cargo.maxHp, 'ağır maşının canı çoxdur').toBeGreaterThan(table.titan.maxHp + 20);
  expect(table.cargo.missileHitsToExplode, 'ağır maşın daha çox dözür').toBeGreaterThan(table.titan.missileHitsToExplode);
  expect(b.mineRightAfterHazard, 'zərər fasiləsi minanı udmur').toBeGreaterThan(20);
});
