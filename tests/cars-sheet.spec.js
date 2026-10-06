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
