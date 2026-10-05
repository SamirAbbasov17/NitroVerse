import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { MODES, OUT, boot, startMode, autopilot, ensureDir, mergeJson } from './helpers.js';

// Z-fighting ("yanıb-sönən", iç-içə keçən səthlər) detektoru.
// Üsul: avtopilot sürərkən hər 1.5 s-də EYNİ kadr iki dəfə render olunur —
// ikincidə yalnız kameranın uzaq müstəvisi azca dəyişir (+9%). Ekran
// koordinatları eyni qalır, yalnız dərinlik dəqiqliyi sürüşür: düzgün səhnədə
// şəkil dəyişmir, üst-üstə düşən (eyni dərinlikdə) səthlər isə "yer dəyişir".
// Fərqlənən piksellərin payı = həmin baxışda yanıb-sönən sahə.
const DIR = ensureDir(path.join(OUT, 'zfight'));
const LIMIT_PCT = 0.05; // ekranın 0.05%-dən çoxu qeyri-sabitdirsə pozuntu sayılır

for (const m of MODES.filter((x) => x.config.mode === 'race' || x.config.mode === 'free')) {
  test(`zfight: ${m.name}`, async ({ page }) => {
    test.setTimeout(180_000);
    await boot(page);
    await startMode(page, m.config);
    if (m.config.mode === 'race') {
      await page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30_000 });
    }
    await autopilot(page, true);
    const samples = [];
    for (let i = 0; i < 36; i++) {
      await page.waitForTimeout(1500);
      const s = await page.evaluate(({ wantImage }) => {
        const sc = window.__active;
        const r = sc.renderer;
        const cam = sc.camera;
        const gl = r.getContext();
        const w = gl.drawingBufferWidth;
        const h = gl.drawingBufferHeight;
        const grab = () => {
          r.render(sc.scene, cam);
          const px = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
          return px;
        };
        // UZAQ müstəvi dəyişdirilir, yaxın yox: yaxın müstəvi dəyişəndə kameraya
        // dəyən iri effektlər (şimşək şüası, bulud) fərqli kəsilir və saxta
        // "pozuntu" verirdi (kanyonda 18%).
        const far0 = cam.far;
        const a = grab();
        cam.far = far0 * 1.09; cam.updateProjectionMatrix();
        const b = grab();
        cam.far = far0; cam.updateProjectionMatrix();
        r.render(sc.scene, cam);
        let bad = 0;
        let img = null;
        const cv = wantImage ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : null;
        const id = cv ? cv.getContext('2d').createImageData(w, h) : null;
        for (let p = 0; p < w * h; p++) {
          const o = p * 4;
          const d = Math.max(Math.abs(a[o] - b[o]), Math.abs(a[o + 1] - b[o + 1]), Math.abs(a[o + 2] - b[o + 2]));
          const hit = d > 28;
          if (hit) bad++;
          if (id) {
            // şəkil alt-üst gəlir (GL koordinatı) — sətri çevir; pozuntu qırmızı
            const y = h - 1 - Math.floor(p / w);
            const q = (y * w + (p % w)) * 4;
            id.data[q] = hit ? 255 : a[o] * 0.45;
            id.data[q + 1] = hit ? 0 : a[o + 1] * 0.45;
            id.data[q + 2] = hit ? 40 : a[o + 2] * 0.45;
            id.data[q + 3] = 255;
          }
        }
        if (cv) { cv.getContext('2d').putImageData(id, 0, 0); img = cv.toDataURL('image/jpeg', 0.8); }
        const car = sc.playerCar;
        return { pct: +((bad / (w * h)) * 100).toFixed(3), x: Math.round(car.position.x), z: Math.round(car.position.z), img };
      }, { wantImage: true });
      samples.push({ i, pct: s.pct, x: s.x, z: s.z, img: s.img });
    }
    // Ən pis 3 baxışın fərq şəklini saxla (qırmızı = yanıb-sönən piksellər)
    const worst = [...samples].sort((p, q) => q.pct - p.pct).slice(0, 3);
    worst.forEach((s, k) => {
      if (s.pct <= 0) return;
      fs.writeFileSync(path.join(DIR, `${m.name}-${k}-${s.pct}pct.jpg`), Buffer.from(s.img.split(',')[1], 'base64'));
    });
    const over = samples.filter((s) => s.pct > LIMIT_PCT);
    const summary = {
      max: Math.max(...samples.map((s) => s.pct)),
      over: over.length,
      of: samples.length,
      worst: worst.map((s) => ({ pct: s.pct, x: s.x, z: s.z })),
    };
    mergeJson('zfight.json', m.name, summary);
    console.log(`${m.name.padEnd(13)} maks ${summary.max}% · pozuntulu baxış ${summary.over}/${summary.of}`);
    expect.soft(summary.over, `yanıb-sönən sahə > ${LIMIT_PCT}% olan baxışlar`).toBe(0);
  });
}
