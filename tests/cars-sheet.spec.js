import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { OUT, boot, ensureDir } from './helpers.js';
import { CARS } from '../src/data/cars.js';

// MAŞIN CƏDVƏLİ (Faza 3.8): bütün maşınlar eyni işıqda, eyni iki bucaqdan (ön-yan, arxa-yan)
// → tests/out/cars/sheet-front.png, sheet-rear.png. Siluetlərin və detalların müqayisəsi üçün.
const DIR = ensureDir(path.join(OUT, 'cars'));
const VIEWS = [['front', 5.2, 2.3, 5.6], ['rear', -5.0, 2.6, -5.8]];

test('maşın cədvəli: bütün maşınlar iki bucaqdan', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 640, height: 400 });
  await boot(page);
  // yalnız oyun kətanı qalsın
  await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    document.querySelectorAll('body *').forEach((e) => { if (e !== cv && !e.contains(cv)) e.style.visibility = 'hidden'; });
  });
  const shots = { front: [], rear: [] };
  for (const car of CARS) {
    for (const [view, side, up, fwd] of VIEWS) {
      await page.evaluate(([c, sd, h, fw]) => {
        const sc = window.__showcase;
        sc.setCar(c);
        sc.__upd = sc.__upd || sc.update;
        sc.update = (dt) => {
          sc.__upd.call(sc, dt);
          const p = sc.carRoot.position, a = sc._carHeading;
          const s = Math.sin(a), co = Math.cos(a);
          sc.camera.position.set(p.x + co * sd + s * fw, h, p.z - s * sd + co * fw);
          sc.camera.lookAt(p.x, 0.75, p.z);
        };
      }, [car, side, up, fwd]);
      await page.waitForTimeout(350);
      const buf = await page.screenshot({ type: 'jpeg', quality: 88 });
      shots[view].push({ id: car.id, name: car.name, model: car.model, b64: buf.toString('base64') });
    }
  }
  // cədvəl: 6 sütun
  for (const view of Object.keys(shots)) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const cells = shots[view].map((s) => `<figure><img src="data:image/jpeg;base64,${s.b64}"><figcaption>${s.name} · <b>${s.model}</b></figcaption></figure>`).join('');
    await page.setContent(`<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:4px;font:13px sans-serif;color:#eee}
      figure{margin:0;position:relative;align-self:start}img{width:100%;display:block}figcaption{position:absolute;left:6px;bottom:4px;text-shadow:0 0 4px #000}</style>${cells}`);
    await page.waitForTimeout(400);
    fs.writeFileSync(path.join(DIR, `sheet-${view}.png`), await page.screenshot({ fullPage: true }));
  }
});

// SINAQ GÖVDƏLƏRİ (Faza 3.8b): `tools/models/build_cars.py` ilə qurulan yeni gövdə hələ oyuna
// qoşulmadan, əvəz edəcəyi maşınla YAN-YANA — tests/out/cars/pilot-<maşın>.png (4 bucaq × köhnə/yeni).
//   PILOT=inferno:coupe,titan:hyper npx playwright test tests/cars-sheet.spec.js -g sınaq
const PILOT = (process.env.PILOT || 'inferno:coupe').split(',').map((x) => x.split(':'));
test('maşın cədvəli: sınaq gövdələri köhnə ilə yan-yana', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 640, height: 400 });
  await boot(page);
  await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    document.querySelectorAll('body *').forEach((e) => { if (e !== cv && !e.contains(cv)) e.style.visibility = 'hidden'; });
  });
  const ANG = [['ön-yan', 4.4, 2.0, 4.8], ['yan', 7.0, 1.3, 0.2], ['arxa-yan', -4.4, 2.4, -5.0], ['üstdən', 2.5, 7.5, -2.5]];
  for (const [carId, model] of PILOT) {
    const car = CARS.find((c) => c.id === carId);
    await page.evaluate((mdl) => window.__showcase.library.loadCars([mdl]), model);
    const cells = [];
    for (const [label, data] of [['köhnə · ' + car.model, car], ['YENİ · ' + model, { ...car, model, kit: null }]]) {
      for (const [view, side, up, fwd] of ANG) {
        await page.evaluate(([c, sd, h, fw]) => {
          const sc = window.__showcase;
          sc.setCar(c);
          sc.__upd = sc.__upd || sc.update;
          sc.update = (dt) => {
            sc.__upd.call(sc, dt);
            const p = sc.carRoot.position, a = sc._carHeading;
            const s = Math.sin(a), co = Math.cos(a);
            sc.camera.clearViewOffset?.();
            sc.camera.position.set(p.x + co * sd + s * fw, h, p.z - s * sd + co * fw);
            sc.camera.lookAt(p.x, 0.7, p.z);
          };
        }, [data, side, up, fwd]);
        await page.waitForTimeout(350);
        cells.push({ cap: `${label} · ${view}`, b64: (await page.screenshot({ type: 'jpeg', quality: 90 })).toString('base64') });
      }
    }
    const tris = await page.evaluate((mdl) => {
      let n = 0;
      window.__showcase.library.cars.get(mdl).object.traverse((o) => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
      return n;
    }, model);
    console.log(`${carId}: yeni gövdə "${model}" — ${tris} üçbucaq (təkərlərlə)`);
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.setContent(`<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:4px;font:14px sans-serif;color:#eee}
      figure{margin:0;position:relative}img{width:100%;display:block}figcaption{position:absolute;left:6px;bottom:4px;text-shadow:0 0 4px #000}</style>`
      + cells.map((c) => `<figure><img src="data:image/jpeg;base64,${c.b64}"><figcaption>${c.cap}</figcaption></figure>`).join(''));
    await page.waitForTimeout(400);
    fs.writeFileSync(path.join(DIR, `pilot-${carId}.png`), await page.screenshot({ fullPage: true }));
    await page.setViewportSize({ width: 640, height: 400 });
    await boot(page);
    await page.evaluate(() => {
      const cv = document.querySelector('canvas');
      document.querySelectorAll('body *').forEach((e) => { if (e !== cv && !e.contains(cv)) e.style.visibility = 'hidden'; });
    });
  }
});

// Yeni gövdələrin hamısı bir cədvəldə (hər biri 3 bucaqdan, nəzərdə tutulan maşının rəngində):
//   NEW=titan:hyper,lagoon:gt npx playwright test tests/cars-sheet.spec.js -g "yeni gövdələr"
const NEW = (process.env.NEW || '').split(',').filter(Boolean).map((x) => x.split(':'));
test('maşın cədvəli: yeni gövdələr', async ({ page }) => {
  test.skip(!NEW.length, 'NEW=maşın:model,… ilə');
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 640, height: 400 });
  await boot(page);
  await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    document.querySelectorAll('body *').forEach((e) => { if (e !== cv && !e.contains(cv)) e.style.visibility = 'hidden'; });
  });
  await page.evaluate((mdls) => window.__showcase.library.loadCars(mdls), [...new Set(NEW.map((x) => x[1]))]);
  const cells = [];
  for (const [carId, model] of NEW) {
    const car = CARS.find((c) => c.id === carId);
    for (const [view, side, up, fwd] of [['ön-yan', 4.4, 2.0, 4.8], ['yan', 7.0, 1.3, 0.2], ['arxa-yan', -4.4, 2.4, -5.0]]) {
      await page.evaluate(([c, sd, h, fw]) => {
        const sc = window.__showcase;
        sc.setCar(c);
        sc.__upd = sc.__upd || sc.update;
        sc.update = (dt) => {
          sc.__upd.call(sc, dt);
          const p = sc.carRoot.position, a = sc._carHeading;
          const s = Math.sin(a), co = Math.cos(a);
          sc.camera.position.set(p.x + co * sd + s * fw, h, p.z - s * sd + co * fw);
          sc.camera.lookAt(p.x, 0.7, p.z);
        };
      }, [{ ...car, model, kit: null }, side, up, fwd]);
      await page.waitForTimeout(300);
      cells.push({ cap: `${car.name} · ${model} · ${view}`, b64: (await page.screenshot({ type: 'jpeg', quality: 88 })).toString('base64') });
    }
  }
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.setContent(`<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(6,1fr);gap:3px;padding:3px;font:12px sans-serif;color:#eee}
    figure{margin:0;position:relative}img{width:100%;display:block}figcaption{position:absolute;left:5px;bottom:3px;text-shadow:0 0 4px #000}</style>`
    + cells.map((c) => `<figure><img src="data:image/jpeg;base64,${c.b64}"><figcaption>${c.cap}</figcaption></figure>`).join(''));
  await page.waitForTimeout(400);
  fs.writeFileSync(path.join(DIR, 'new-bodies.png'), await page.screenshot({ fullPage: true }));
});

// KOSMETİKA CƏDVƏLİ: altı əfsanəvi örtük (iki maşında) və hər maşının iki öz skini —
// tests/out/cars/legendary.png, skins.png. Bir-birindən seçilirlərmi? (istifadəçi tələbi)
test('maşın cədvəli: əfsanəvi örtüklər və maşına xas skinlər', async ({ page }) => {
  test.setTimeout(400_000);
  const { EFFECTS, carSkinsFor } = await import('../src/data/cosmetics.js');
  await page.setViewportSize({ width: 1000, height: 620 });
  await boot(page);
  await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    document.querySelectorAll('body *').forEach((e) => { if (e !== cv && !e.contains(cv)) e.style.visibility = 'hidden'; });
  });
  const snap = async (data, side, up, fwd) => {
    await page.evaluate(([c, sd, h, fw]) => {
      const sc = window.__showcase;
      sc.setCar(c);
      sc.__upd = sc.__upd || sc.update;
      sc.update = (dt) => {
        sc.__upd.call(sc, dt);
        const p = sc.carRoot.position, a = sc._carHeading;
        const s = Math.sin(a), co = Math.cos(a);
        sc.camera.position.set(p.x + co * sd + s * fw, h, p.z - s * sd + co * fw);
        sc.camera.lookAt(p.x, 0.7, p.z);
      };
    }, [data, side, up, fwd]);
    await page.waitForTimeout(450);
    return (await page.screenshot({ type: 'jpeg', quality: 88, clip: { x: 250, y: 150, width: 500, height: 320 } })).toString('base64');
  };
  const sheet = async (cells, cols, file) => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.setContent(`<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},1fr);gap:3px;padding:3px;font:13px sans-serif;color:#eee}
      figure{margin:0;position:relative}img{width:100%;display:block}figcaption{position:absolute;left:5px;bottom:3px;text-shadow:0 0 4px #000}</style>`
      + cells.map((c) => `<figure><img src="data:image/jpeg;base64,${c.b64}"><figcaption>${c.cap}</figcaption></figure>`).join(''));
    await page.waitForTimeout(400);
    fs.writeFileSync(path.join(DIR, file), await page.screenshot({ fullPage: true }));
    await page.setViewportSize({ width: 1000, height: 620 });
    await boot(page);
    await page.evaluate(() => {
      const cv = document.querySelector('canvas');
      document.querySelectorAll('body *').forEach((e) => { if (e !== cv && !e.contains(cv)) e.style.visibility = 'hidden'; });
    });
  };
  const leg = [];
  for (const carId of ['inferno', 'ranger']) {
    const car = CARS.find((c) => c.id === carId);
    for (const fx of EFFECTS) {
      leg.push({ cap: `${fx.name} · ${car.name}`, b64: await snap({ ...car, cosmetics: { fx } }, 4.6, 2.3, 5.0) });
    }
  }
  await sheet(leg, 6, 'legendary.png');
  const sk = [];
  for (const car of CARS) {
    for (const skin of carSkinsFor(car.id)) {
      sk.push({ cap: `${car.name} · ${skin.name}`, b64: await snap({ ...car, cosmetics: { skin, paint: skin.colA } }, 4.6, 2.6, 4.6) });
    }
  }
  await sheet(sk, 6, 'skins.png');
});

// KAMERALAR × GÖVDƏLƏR: kapot və sükan arxası kamerası hər gövdədə düzgün yerdədirmi (kamera
// gövdənin içində qalmır, kapot kadrı örtmür)? Masaüstü və telefon ölçüsündə →
// tests/out/cars/cams-desktop.png, cams-mobile.png. Örtüklü (lava) və skinli maşın da daxildir.
for (const [label, vp, touch] of [['desktop', { width: 1280, height: 720 }, false], ['mobile', { width: 844, height: 390 }, true]]) {
  test.describe(`kameralar ${label}`, () => {
    test.use({ viewport: vp, hasTouch: touch, isMobile: touch });
    test(`maşın cədvəli: kameralar (${label})`, async ({ page }) => {
      test.setTimeout(600_000);
      const cells = [];
      const ids = (process.env.CAMS || 'blaze,titan,inferno,sunburst,sequoia,crimson,midnight,violetta,frost,ranger').split(',');
      for (const carId of ids) {
        for (const mode of ['tps', 'hood', 'fps']) {
          await page.addInitScript((m) => { try { localStorage.setItem('apexCamMode', m); } catch { /* boş */ } }, mode);
          await boot(page);
          await page.evaluate((cid) => window.__menu.onStart({ mode: 'race', trackId: 'alpine', carId: cid, laps: 3, difficulty: 'normal' }), carId);
          await page.waitForFunction(() => window.__active?.raceManager?.state === 'racing', null, { timeout: 40_000 });
          await page.evaluate(async () => {
            const sc = window.__active;
            // sınaq: oyunçu maşınına lava örtüyü (iz + yer işığı telefonda da görünsün)
            if (sc.playerCar.data?.id === 'inferno') {
              const mod = await import('/src/core/LegendaryFx.js');
              sc.playerCar._fx = mod.applyLegendaryFx(sc.playerCar._model, 'fire');
            }
            sc.input.touch.throttle = 1;
          });
          await page.waitForTimeout(2600);
          cells.push({ cap: `${carId} · ${mode}`, b64: (await page.screenshot({ type: 'jpeg', quality: 80 })).toString('base64') });
        }
      }
      await page.setViewportSize({ width: 1920, height: 1000 });
      await page.setContent(`<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(6,1fr);gap:3px;padding:3px;font:12px sans-serif;color:#eee}
        figure{margin:0;position:relative}img{width:100%;display:block}figcaption{position:absolute;left:5px;top:3px;background:#000a;padding:1px 4px}</style>`
        + cells.map((c) => `<figure><img src="data:image/jpeg;base64,${c.b64}"><figcaption>${c.cap}</figcaption></figure>`).join(''));
      await page.waitForTimeout(400);
      fs.writeFileSync(path.join(DIR, `cams-${label}.png`), await page.screenshot({ fullPage: true }));
    });
  });
}

// TƏKƏR YAXIN PLANI: hər maşının ön təkəri yandan, 3 fırlanma bucağında — təkərin/qanadın
// rəng qüsurlarını (dönəndə görünən başqa rəngli parça, gövdəyə girən təkər) görmək üçün.
// → tests/out/cars/wheels.png
test('maşın cədvəli: təkər yaxın planı', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 420, height: 300 });
  await boot(page);
  await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    document.querySelectorAll('body *').forEach((e) => { if (e !== cv && !e.contains(cv)) e.style.visibility = 'hidden'; });
  });
  const ANG = [0, 0.45, 0.9, 1.6, 2.2, 3.0];
  const only = (process.env.CARS || '').split(',').filter(Boolean);
  const shots = [];
  for (const car of CARS.filter((c) => !only.length || only.includes(c.id))) {
    for (const ang of ANG) {
      await page.evaluate(([c, an]) => {
        const sc = window.__showcase, T = window.__THREE;
        sc.setCar(c);
        sc.__upd = sc.__upd || sc.update;
        sc.update = (dt) => {
          sc.__upd.call(sc, dt);
          let wheel = null;
          sc.carRoot.traverse((o) => { if (o.name === 'wheel-front-left') wheel = o; if (/^wheel-(front|back)-(left|right)$/.test(o.name)) o.rotation.x = an; });
          if (!wheel) return;
          sc.carRoot.updateMatrixWorld(true);
          const w = wheel.getWorldPosition(new T.Vector3());
          const p = sc.carRoot.position;
          const out = new T.Vector3(w.x - p.x, 0, w.z - p.z);
          const a = sc._carHeading, fw = new T.Vector3(Math.sin(a), 0, Math.cos(a));
          out.addScaledVector(fw, -out.dot(fw)).normalize();   // yalnız yan istiqamət
          sc.camera.position.set(w.x + out.x * 2.3 + fw.x * 0.5, w.y + 0.75, w.z + out.z * 2.3 + fw.z * 0.5);
          sc.camera.clearViewOffset?.();
          sc.camera.lookAt(w.x, w.y + 0.12, w.z);
        };
      }, [car, ang]);
      await page.waitForTimeout(300);
      const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
      shots.push({ name: car.name, model: car.model, ang, b64: buf.toString('base64') });
    }
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  const cells = shots.map((s) => `<figure><img src="data:image/jpeg;base64,${s.b64}"><figcaption>${s.name} · <b>${s.model}</b> · ${s.ang}</figcaption></figure>`).join('');
  await page.setContent(`<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:4px;font:13px sans-serif;color:#eee}
    figure{margin:0;position:relative;align-self:start}img{width:100%;display:block}figcaption{position:absolute;left:6px;bottom:4px;text-shadow:0 0 4px #000}</style>${cells}`);
  await page.waitForTimeout(400);
  fs.writeFileSync(path.join(DIR, 'wheels.png'), await page.screenshot({ fullPage: true }));
});
