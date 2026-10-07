import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { OUT, boot, startMode, ensureDir } from './helpers.js';
import { TRACKS } from '../src/data/tracks.js';

// TREK XƏRİTƏSİ: hər trekin yuxarıdan sxemi (tests/out/maps/<id>.png) + həndəsə yoxlaması —
// yol öz-özünə və şaxələrinə yaxınlaşmır (yol kənarları arasında ən azı 6 m boşluq).
// Nəzarət nöqtələrinin t dəyərləri də çap olunur (şaxənin t0/t1-ni seçmək üçün).
const DIR = ensureDir(path.join(OUT, 'maps'));
const ONLY = process.env.TRACK;

for (const tr of TRACKS.filter((t) => !ONLY || ONLY.split(',').includes(t.id))) {
  test(`xəritə: ${tr.id}`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page);
    await startMode(page, { mode: 'race', trackId: tr.id, carId: 'blaze', laps: 3, difficulty: 'normal' });
    const r = await page.evaluate((cps) => {
      const sc = window.__active, t = sc.track, N = t.N, hw = t.halfWidth;
      const P = t.points;
      // 1) əsas yol öz-özünə yaxınlaşmır (yol boyu ≥ 60 m aralı nöqtələr)
      const step = t.length / N, gapIdx = Math.ceil(60 / step);
      let minSelf = Infinity, selfAt = null;
      for (let i = 0; i < N; i += 2) {
        for (let j = i + gapIdx; j < N; j += 2) {
          if (N - j + i < gapIdx) continue;
          const d = Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z);
          if (d < minSelf) { minSelf = d; selfAt = [+(i / N).toFixed(3), +(j / N).toFixed(3)]; }
        }
      }
      // 2) şaxə əsas yola yalnız uclarında toxunur
      let minBr = Infinity;
      const brInfo = [];
      for (const b of t.branches) {
        let m = Infinity, len = 0, at = null;
        const n = b.points.length;
        for (let k = 0; k < n; k++) {
          if (k) len += Math.hypot(b.points[k].x - b.points[k - 1].x, b.points[k].z - b.points[k - 1].z);
        }
        // qovşaqlar (hər ucdan 90 m: paralel zolaq + ayrılma) sayılmır
        let run = 0;
        for (let k = 0; k < n; k++) {
          if (k) run += Math.hypot(b.points[k].x - b.points[k - 1].x, b.points[k].z - b.points[k - 1].z);
          if (run < 90 || run > len - 90) continue;
          for (let i = 0; i < N; i += 2) { const d = Math.hypot(P[i].x - b.points[k].x, P[i].z - b.points[k].z); if (d < m) { m = d; at = { run: Math.round(run), t: +(i / N).toFixed(3) }; } }
        }
        const mainLen = ((b.i1 - b.i0 + N) % N) * step;
        brInfo.push({ t0: +(b.i0 / N).toFixed(3), t1: +(b.i1 / N).toFixed(3), len: Math.round(len), mainLen: Math.round(mainLen), clear: +m.toFixed(1), at });
        minBr = Math.min(minBr, m);
      }
      // 3) döngə radiusu (ən iti)
      let minRad = Infinity;
      for (let i = 0; i < N; i++) {
        const a = P[(i - 4 + N) % N], b2 = P[i], c = P[(i + 4) % N];
        const A = Math.hypot(b2.x - a.x, b2.z - a.z), B = Math.hypot(c.x - b2.x, c.z - b2.z), C = Math.hypot(c.x - a.x, c.z - a.z);
        const area = Math.abs((b2.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b2.z - a.z)) / 2;
        if (area > 1e-6) minRad = Math.min(minRad, (A * B * C) / (4 * area));
      }
      // nəzarət nöqtələrinin t dəyəri
      const sc2 = sc.trackData.scale;
      const cpT = cps.map(([x, z]) => +(t.getNearest({ x: x * sc2, z: z * sc2 }, null).index / N).toFixed(3));
      // sxem
      const S = 720, R = t.maxRadius + 40, k = S / (2 * R);
      const cv = document.createElement('canvas'); cv.width = cv.height = S;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#14161c'; cx.fillRect(0, 0, S, S);
      const X = (x) => S / 2 + x * k, Z = (z) => S / 2 - z * k;
      const line = (pts, w, col, close) => {
        cx.strokeStyle = col; cx.lineWidth = w; cx.lineJoin = 'round'; cx.beginPath();
        pts.forEach((p, i) => (i ? cx.lineTo(X(p.x), Z(p.z)) : cx.moveTo(X(p.x), Z(p.z))));
        if (close) cx.closePath();
        cx.stroke();
      };
      for (const b of t.branches) line(b.points, b.halfWidth * 2 * k, '#c9862e', false);
      line(P, hw * 2 * k, '#d8dbe4', true);
      cx.fillStyle = '#41d37a'; cx.beginPath(); cx.arc(X(P[0].x), Z(P[0].z), 6, 0, 7); cx.fill();
      cx.fillStyle = '#ff5a5a'; cx.font = '11px sans-serif';
      cps.forEach(([x, z], i) => cx.fillText(`${i}:${cpT[i]}`, X(x * sc2) + 4, Z(z * sc2) - 4));
      for (const o of (sc._obstacles || [])) { if (o.r > 6) continue; cx.fillStyle = 'rgba(120,160,255,0.5)'; cx.fillRect(X(o.x) - 1, Z(o.z) - 1, 2, 2); }
      return { len: Math.round(t.length), hw, minSelf: +minSelf.toFixed(1), selfAt, minBr: +minBr.toFixed(1), minRad: +minRad.toFixed(1), brInfo, cpT, png: cv.toDataURL('image/png') };
    }, tr.controlPoints);
    fs.writeFileSync(path.join(DIR, `${tr.id}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    console.log(`${tr.id}: uzunluq ${r.len} m · yol eni ${r.hw * 2} · öz-özünə ən yaxın ${r.minSelf} m @${r.selfAt} · ən iti döngə R=${r.minRad} m · şaxələr ${JSON.stringify(r.brInfo)}`);
    console.log(`  nəzarət nöqtələri t: ${r.cpT.join(' ')}`);
    expect.soft(r.minSelf, 'yol öz-özünə yaxınlaşmır (mərkəzlər arası, m)').toBeGreaterThan(r.hw * 2 + 6);
    if (r.brInfo.length) expect.soft(r.minBr, 'şaxə əsas yoldan aralıdır (m)').toBeGreaterThan(18);
    expect.soft(r.minRad, 'ən iti döngənin radiusu (m)').toBeGreaterThan(10);
  });
}
