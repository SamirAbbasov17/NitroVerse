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
