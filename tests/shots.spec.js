import path from 'node:path';
import { test } from '@playwright/test';
import { MODES, OUT, boot, startMode, drive, ensureDir } from './helpers.js';

// Kadr toplayıcı — heç nə təsdiqləmir, yalnız baxmaq üçün material yaradır.
// Kadrlara BAXMADAN vizual iş "hazır" sayılmır (docs/TESTING.md).
// SHOTS_DIR: müqayisə üçün ayrı qovluq (məs. POST=0 SHOTS_DIR=shots-off)
const DIR = ensureDir(path.join(OUT, process.env.SHOTS_DIR || 'shots'));
const shot = (page, name) => page.screenshot({ path: path.join(DIR, `${name}.png`) });

const MOBILE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

test.describe('masaüstü oyun kadrları', () => {
  for (const m of MODES) {
    test(`shots: ${m.name}`, async ({ page }) => {
      await boot(page);
      await startMode(page, m.config);
      await page.waitForTimeout(1500);
      await shot(page, `d-${m.name}-0start`);
      await drive(page, 8000);
      await shot(page, `d-${m.name}-1drive`);
      await page.waitForTimeout(7000);
      await shot(page, `d-${m.name}-2later`);
      await page.waitForTimeout(8000);
      await shot(page, `d-${m.name}-3later`);
    });
  }

  test('shots: zen günün vaxtları', async ({ page }) => {
    await boot(page);
    await startMode(page, MODES.find((m) => m.name === 'zen').config);
    await drive(page, 4000);
    for (const tod of ['dawn', 'day', 'dusk', 'night']) {
      await page.evaluate((id) => window.__active._setDayTime(id), tod);
      await page.waitForTimeout(6000); // keçid ~3.5 s
      await shot(page, `d-zen-tod-${tod}`);
    }
  });

  // Yol üstü landmarklar: neon — estakada və nəhəng ekran; zavod — portal kran və boru estakadaları; səhra — qaya tağı
  for (const lm of ['race-neon', 'race-zavod', 'race-desert', 'race-alpine', 'race-canyon']) test(`shots: ${lm.replace('race-', '')} landmarkları`, async ({ page }) => {
    await boot(page);
    await startMode(page, MODES.find((m) => m.name === lm).config);
    await page.waitForTimeout(1500);
    const views = await page.evaluate(() => {
      const sc = window.__active;
      sc._updateCamera = () => {};
      sc.update = () => {};
      document.querySelector('#ui-root').style.display = 'none';
      const tr = sc.track;
      const out = [];
      // Estakada dayaqları toqquşma siyahısında r = 1.6 ilə yazılır
      const legs = sc._obstacles.filter((o) => Math.abs(o.r - 1.6) < 1e-6 || Math.abs(o.r - 3.4) < 1e-6 || Math.abs(o.r - 3.9) < 1e-6); // 3.4: səhra qaya tağı · 3.9: kanyon asma körpüsü
      for (let k = 0; k < legs.length; k += 2) {
        const i = tr.getNearest(new window.__THREE.Vector3(legs[k].x, 0, legs[k].z)).index;
        const p = tr.points[(i - 16 + tr.N) % tr.N], q = tr.points[i];
        out.push({ px: p.x, py: 4.2, pz: p.z, lx: q.x, ly: 5, lz: q.z });
      }
      let screen = null;
      sc.scene.traverse((o) => { if (o.isMesh && o.geometry?.parameters?.width === 30) screen = o; });
      if (screen) {
        const fx = Math.sin(screen.rotation.y), fz = Math.cos(screen.rotation.y);
        out.push({ px: screen.position.x + fx * 75, py: 5, pz: screen.position.z + fz * 75,
          lx: screen.position.x, ly: 12, lz: screen.position.z });
      }
      return out;
    });
    for (const [i, v] of views.entries()) {
      await page.evaluate((c) => {
        const cam = window.__active.camera;
        cam.position.set(c.px, c.py, c.pz);
        cam.lookAt(c.lx, c.ly, c.lz);
      }, v);
      await page.waitForTimeout(300);
      await shot(page, `d-${lm}-landmark${i}`);
    }
  });

  // Riviera: sahil (dəniz, günəş, mayak) və təpə-qəsəbə — yoldan baxış
  test('shots: riviera sahili və qəsəbə', async ({ page }) => {
    await boot(page);
    await startMode(page, MODES.find((m) => m.name === 'race-riviera').config);
    await page.waitForTimeout(1500);
    const views = await page.evaluate(() => {
      const sc = window.__active;
      sc._updateCamera = () => {};
      sc.update = () => {};
      // günəş diski kameranı izləyir (oyunda GameplayScene edir)
      window.__glit = () => sc.environment.celestial?.position.set(sc.camera.position.x, 0, sc.camera.position.z);
      document.querySelector('#ui-root').style.display = 'none';
      const tr = sc.track;
      let mi = 0;
      for (let i = 0; i < tr.N; i++) if (tr.points[i].z < tr.points[mi].z) mi = i;
      const q = tr.points[mi];
      const out = [{ px: q.x + 40, py: 5, pz: q.z + 6, lx: q.x - 90, ly: 14, lz: q.z - 160 }];
      const town = sc._obstacles.find((o) => o.r === 31);
      if (town) {
        const i = tr.getNearest(new window.__THREE.Vector3(town.x, 0, town.z)).index;
        for (const d of [-40, 40]) {
          const p = tr.points[(i + d + tr.N) % tr.N];
          out.push({ px: p.x, py: 4.5, pz: p.z, lx: town.x, ly: 7, lz: town.z });
        }
      }
      return out;
    });
    for (const [i, v] of views.entries()) {
      await page.evaluate((c) => {
        const cam = window.__active.camera;
        cam.position.set(c.px, c.py, c.pz);
        cam.lookAt(c.lx, c.ly, c.lz);
        window.__glit();
      }, v);
      await page.waitForTimeout(300);
      await shot(page, `d-race-riviera-view${i}`);
    }
  });

  // Zen biomları: hər biom gündüz (əl ilə seçim — `_biomeOverride`)
  test('shots: zen biomları', async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);
    await startMode(page, MODES.find((m) => m.name === 'zen').config);
    await page.evaluate(() => window.__active._setDayTime('day'));
    await drive(page, 3000);
    for (const [i, id] of ['desert', 'alpine', 'coast', 'canyon', 'snow'].entries()) {
      await page.evaluate((k) => { window.__active._biomeOverride = k; }, i);
      await page.waitForTimeout(9000); // biom keçidi + yeni yol seqmentləri
      await shot(page, `d-zen-biome-${id}`);
    }
  });

  // Çay/göl olan treklər: körpü (hər iki tərəfə) və göl — su, sahil və relyefin
  // bir-birinin içindən çıxmadığına baxmaq üçün sabit baxış nöqtələri.
  for (const name of ['race-alpine', 'race-riviera']) {
    test(`shots: su ${name}`, async ({ page }) => {
      await boot(page);
      await startMode(page, MODES.find((m) => m.name === name).config);
      await page.waitForTimeout(1500);
      const views = await page.evaluate(() => {
        const sc = window.__active;
        sc._updateCamera = () => {};
        document.querySelector('#ui-root').style.display = 'none';
        const tr = sc.track;
        const i = Math.round((sc.trackData.river.t ?? 0.5) * tr.N) % tr.N;
        const c = tr.points[i], t = tr.tangents[i], n = tr.normals[i];
        const out = [];
        for (const side of [1, -1]) {
          out.push({ px: c.x - t.x * 16 - n.x * 4 * side, py: 6.5, pz: c.z - t.z * 16 - n.z * 4 * side,
            lx: c.x + n.x * 30 * side, lz: c.z + n.z * 30 * side });
        }
        for (const lake of sc.environment.keepOut.filter((o) => o.r > 18)) {
          const k = 1 + 34 / Math.hypot(lake.x - c.x, lake.z - c.z);
          out.push({ px: c.x + (lake.x - c.x) * k, py: 9, pz: c.z + (lake.z - c.z) * k, lx: lake.x, lz: lake.z });
        }
        return out;
      });
      for (const [k, v] of views.entries()) {
        await page.evaluate((q) => {
          const cam = window.__active.camera;
          cam.position.set(q.px, q.py, q.pz);
          cam.fov = 58; cam.updateProjectionMatrix();
          cam.lookAt(q.lx, 0.5, q.lz);
        }, v);
        await page.waitForTimeout(250);
        await shot(page, `d-${name}-su${k}`);
      }
    });
  }

  // Effektlər: partlayış, tüstü, qığılcım, konfeti — geri sayımda (maşın dayanıb),
  // kamera sabitdir, ona görə əvvəl/sonra müqayisəsi mümkündür.
  test('shots: effektlər', async ({ page }) => {
    await boot(page);
    await startMode(page, MODES.find((m) => m.name === 'race-alpine').config);
    await page.waitForTimeout(1200);
    const fire = () => page.evaluate(() => {
      const sc = window.__active;
      const c = sc.playerCar.position;
      const h = sc.playerCar.heading;
      const at = (d, side, y) => ({ x: c.x + Math.sin(h) * d - Math.cos(h) * side, y, z: c.z + Math.cos(h) * d + Math.sin(h) * side });
      const v = (p) => sc.playerCar.position.clone().set(p.x, p.y, p.z);
      sc.effects.spawnExplosion(v(at(9, -4, 1)));
      for (let i = 0; i < 10; i++) sc.effects.spawnSmoke(at(6 + i * 0.5, 3, 0.4), i % 2 === 0, i > 5 ? 0xff5a2a : null, 1);
      sc.effects.spawnSparkle(v(at(5, 0, 1.6)));
      sc.effects.spawnConfetti(v(at(8, 1, 1)), true);
    });
    await fire();
    await page.waitForTimeout(140);
    await shot(page, 'd-fx-0');
    await page.waitForTimeout(260);
    await shot(page, 'd-fx-1');
  });

  test('shots: pauza menyusu (yarış)', async ({ page }) => {
    await boot(page);
    await startMode(page, MODES[0].config);
    await drive(page, 5000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await shot(page, 'd-race-pause');
  });
});

// Menyu ekranları — hər biri masaüstü və mobil ölçüdə.
const SCREENS = [
  ['modes', (m) => m.showModes()],
  ['tracks', (m) => { m.sel.mode = 'race'; m.showTracks(); }],
  ['cars', (m) => { m.sel.mode = 'race'; m.showCars(); }],
  ['garage', (m) => m.showGarage()],
  ['cosmetics', (m) => m.showCosmetics()],
  ['online', (m) => m.showOnline()],
  ['auth', (m) => m.showAuth()],
  ['signup', (m) => m.showSignup()],
  ['bugreport', (m) => m.showBugReport()],
];

async function menuShots(page, prefix) {
  await boot(page);
  for (const [name, fn] of SCREENS) {
    await page.evaluate(`(${fn.toString()})(window.__menu)`);
    await page.waitForTimeout(900);
    await shot(page, `${prefix}-menu-${name}`);
  }
}

test('shots: menyu ekranları (masaüstü)', async ({ page }) => {
  await menuShots(page, 'd');
});

test.describe('mobil', () => {
  test.use(MOBILE);

  test('shots: menyu ekranları (mobil)', async ({ page }) => {
    await menuShots(page, 'm');
  });

  for (const name of ['race-desert', 'zen', 'football', 'arena']) {
    test(`shots: mobil HUD ${name}`, async ({ page }) => {
      await boot(page);
      await startMode(page, MODES.find((m) => m.name === name).config);
      await drive(page, 7000);
      await shot(page, `m-${name}-hud`);
    });
  }
});
