// Arena: sütun lazerləri — oyunun əvvəlindən işləyir, zona daraldıqca bir-bir sönür, sonda yalnız
// mərkəzi lazer qalır. Şüanın içindəki maşın zərər alır, sönmüş lazer zərər vermir.
import { test, expect } from '@playwright/test';
import path from 'path';
import { boot, startMode, MODES, OUT, ensureDir } from './helpers.js';

test('arena: sütun lazerləri işləyir, zona ilə sönür, mərkəzi lazer qalır', async ({ page }) => {
  test.setTimeout(120_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'arena').config);
  await page.waitForFunction(() => window.__active._playT > 0.6, null, { timeout: 30_000 });
  const r = await page.evaluate(async () => {
    const sc = window.__active, out = {};
    const frame = () => new Promise((res) => requestAnimationFrame(res));
    const me = sc.racers.find((x) => x.isLocal), car = sc.playerCar;
    const live = () => sc.turrets.filter((T) => T.on).length;
    const shown = () => sc.turrets.filter((T) => T.g?.visible).length;
    out.count = sc.turrets.length; out.startLive = live(); out.startShown = shown();
    // 1) xəbərdarlıq vaxtı (5 s-dək) zərər yoxdur; sonra şüanın içində zərər var
    const inBeam = (T) => { const a = T.ang, d = 12; car.position.set(T.x + Math.sin(a) * d, 0, T.z + Math.cos(a) * d); car.velocity.set(0, 0, 0); };
    const hpAt = async (T, frames) => { const h0 = me.hp ?? car.hp; for (let i = 0; i < frames; i++) { inBeam(T); await frame(); } return h0 - (me.hp ?? car.hp); };
    sc._playT = 2; await frame();
    out.warnDmg = await hpAt(sc.turrets[0], 20);
    sc._playT = 8; await frame(); me._turCd = 0;
    out.liveDmg = await hpAt(sc.turrets[0], 20);
    // 2) zona daralır → bir-bir sönür (vaxt irəli çəkilir; zona vaxtdan hesablanır)
    const at = async (t) => { sc._playT = t; car.position.set(0, 0, 0); for (let i = 0; i < 4; i++) await frame(); return { t, safeR: Math.round(sc.safeR), live: live(), shown: shown() }; };
    out.steps = [await at(40), await at(56), await at(76), await at(96)];
    // 3) sönmüş lazer zərər vermir; mərkəzi lazer görünür
    me._turCd = 0; const T0 = sc.turrets[0]; T0.ang = T0.ang ?? 0;
    out.offDmg = await hpAt(T0, 20);
    out.sweepVisible = !!sc._sweep?.g.visible;
    out.capDim = sc.turrets.map((T) => +T.cap.material.emissiveIntensity.toFixed(2));
    return out;
  });
  console.log('sütun lazerləri:', JSON.stringify(r));
  expect(r.count).toBe(3);
  expect(r.startLive, 'başlanğıcdan aktivdir').toBe(3);
  expect(r.startShown, 'başlanğıcdan görünür (xəbərdarlıq)').toBe(3);
  expect(r.warnDmg, 'ilk 5 s xəbərdarlıqdır — zərər yoxdur').toBe(0);
  expect(r.liveDmg, 'şüa zərər verir').toBeGreaterThan(0);
  expect(r.steps.map((s) => s.live), 'zona ilə bir-bir sönür').toEqual([3, 2, 1, 0]);
  expect(r.offDmg, 'sönmüş lazer zərər vermir (yalnız zona xaricində ola bilər)').toBeLessThanOrEqual(0);
  expect(r.sweepVisible, 'mərkəzi lazer qalır').toBe(true);
  expect(errs).toEqual([]);
});

test('arena: lazer kadrları (sütun, mərkəz, oyunçu gözündən)', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'arena').config);
  await page.waitForFunction(() => window.__active._playT > 7, null, { timeout: 60_000 });
  const dir = ensureDir(path.join(OUT, 'shots'));
  // botlar kadrı qarışdırmasın, zərər oyunu bitirməsin
  await page.evaluate(() => { const sc = window.__active; sc._botDrive = (r) => { r.car.velocity.set(0, 0, 0); }; sc._damage = () => {}; sc.__upd = sc.update; });
  const view = (fn) => page.evaluate(`(() => { const sc = window.__active, T = sc.turrets[0]; const cam = ${fn}; sc.update = (dt) => { sc.__upd.call(sc, dt); sc.camera.position.set(cam.p[0], cam.p[1], cam.p[2]); sc.camera.up.set(0, 1, 0); sc.camera.lookAt(cam.l[0], cam.l[1], cam.l[2]); }; })()`);
  await view('({ p: [T.x * 1.75, 22, T.z * 1.75], l: [T.x * 0.8, 0, T.z * 0.8] })');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(dir, 'd-arena-turrets.png') });
  // oyunçu gözündən: şüa maşının qabağından keçir
  await page.evaluate(() => { const sc = window.__active, T = sc.turrets[0], c = sc.playerCar; sc.update = (dt) => { c.position.set(T.x + 16, 0, T.z - 20); c.heading = -0.5; c.velocity.set(0, 0, 0); T.phase = Math.atan2(c.position.x - T.x, c.position.z - T.z) - 0.55 - (sc._playT - 5) * 0.5 * T.dir;   /* şüa maşının qabağından keçir */ sc.__upd.call(sc, dt); }; });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(dir, 'd-arena-turrets-chase.png') });
  // mərkəzi lazer (40-cı saniyə)
  await page.evaluate(() => { window.__active._playT = 40; });
  await view('({ p: [34, 20, -52], l: [0, 0, 0] })');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(dir, 'd-arena-sweeper.png') });
});
