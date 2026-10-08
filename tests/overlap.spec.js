import { test, expect } from '@playwright/test';
import { MODES, boot, startMode, autopilot, mergeJson } from './helpers.js';

// Bərk obyektlərin (toqquşma siyahısı) bir-birinin içinə girməsi və yolun
// üstünə çıxması. Mərkəzlər arası məsafə radiusların cəminin 55%-indən azdırsa
// "dərin kəsişmə" sayılır (yüngül toxunma normaldır: şin yığını bariyerin yanında).
const scan = () => {
  const sc = window.__active;
  const tr = sc.track || sc.road;
  // r > 25: uzaq fon dağları — qəsdən üst-üstə düşən silsilədir, yoxlanmır
  const obs = (sc.environment?.obstacles || sc.road?.obstacles || []).filter((o) => o && o.r > 0 && o.r <= 25);
  // Zen: toqquşması olmayan uzaq dekor da yoxlanır (road.placed jurnalı)
  const all = [...obs];
  for (const p of sc.road?.placed || []) {
    if (p.r <= 25 && !all.some((o) => o.x === p.x && o.z === p.z)) all.push(p);
  }
  const deep = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (a.water && b.water) continue; // çay gölə tökülür — su dairələri qəsdən üst-üstədir
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < (a.r + b.r) * 0.55 && d > 0.01) {
        deep.push({ x: Math.round(a.x), z: Math.round(a.z), d: +d.toFixed(1), ra: +a.r.toFixed(1), rb: +b.r.toFixed(1), ka: a.kind, kb: b.kind });
      }
    }
  }
  const onRoad = [];
  // Yol yoxlaması iri obyektləri də əhatə edir (məs. Riviera təpə-qəsəbəsi, r = 31)
  const big = (sc.environment?.obstacles || sc.road?.obstacles || []).filter((o) => o && o.r > 0 && o.r <= 60);
  for (const o of big) {
    const n = tr.getNearest({ x: o.x, z: o.z }, null);
    // Zen: yol pəncərəsinin ucundakı obyektlər üçün "ən yaxın nöqtə" pəncərənin
    // kənarıdır və yan məsafə saxta kiçik çıxır (yol arxada silinib) — yoxlanmır
    if (tr.base != null) {
      const li = n.index - tr.base;
      if (li < 4 || li > tr.points.length - 5) continue;
    }
    let latAbs = Math.abs(n.lateral);
    // Zen-in iti döngələrində (serpantin, R ≈ 47 m) "ən yaxın NÖQTƏNİN normalına proyeksiya" yan
    // məsafəni kiçildir (dirək 9 m-dədir, 5.7 m oxunurdu) — orada ox xəttinin seqmentlərinə
    // HƏQİQİ məsafə götürülür
    if (tr.base != null) {
      const li = n.index - tr.base;
      let best = Infinity;
      for (let q = Math.max(0, li - 6); q < Math.min(tr.points.length - 1, li + 6); q++) {
        const a = tr.points[q], b = tr.points[q + 1];
        const ex = b.x - a.x, ez = b.z - a.z;
        const tt = Math.max(0, Math.min(1, ((o.x - a.x) * ex + (o.z - a.z) * ez) / (ex * ex + ez * ez || 1)));
        best = Math.min(best, Math.hypot(o.x - (a.x + ex * tt), o.z - (a.z + ez * tt)));
      }
      latAbs = best;
    }
    const edge = latAbs - o.r; // obyektin yola ən yaxın kənarı
    if (edge < tr.halfWidth - 1.0) { // körpü məhəccəri kimi kənar maneələr (0.5 m içəri) normaldır
      // diaqnostika: obyektin 12 m-liyindəki yol nöqtələrinin indeksləri (iki ayrı aralıq = yol öz yanından keçir)
      const nearIdx = tr.base != null ? tr.points.map((p, q) => (Math.hypot(p.x - o.x, p.z - o.z) < 12 ? tr.base + q : null)).filter((v) => v != null) : undefined;
      const chunk = tr.chunks?.find((c) => c.obstacles.includes(o));
      onRoad.push({ x: Math.round(o.x), z: Math.round(o.z), r: +o.r.toFixed(1), lateral: +n.lateral.toFixed(1), dist: +latAbs.toFixed(1), half: tr.halfWidth, kind: o.kind, nearIdx, chunk: chunk ? [chunk.startAbs, chunk.endAbs] : undefined, base: tr.base, tip: tr.base != null ? tr.base + tr.points.length : undefined });
    }
  }
  // Şaxə (yan) yollar: obyektin kənarı şaxə asfaltının içinə girməməlidir
  for (const b of tr.branches || []) {
    for (const o of big) {
      let d = Infinity;
      for (const p of b.points) d = Math.min(d, Math.hypot(p.x - o.x, p.z - o.z));
      if (d - o.r < b.halfWidth - 1.0) {
        onRoad.push({ x: Math.round(o.x), z: Math.round(o.z), r: +o.r.toFixed(1), lateral: +d.toFixed(1), half: b.halfWidth, kind: 'şaxə yolunda' });
      }
    }
  }
  return { count: obs.length, deep, onRoad };
};

for (const m of MODES.filter((x) => x.config.mode === 'race')) {
  test(`overlap: ${m.name}`, async ({ page }) => {
    await boot(page);
    await startMode(page, m.config);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(scan);
    mergeJson('overlap.json', m.name, r);
    console.log(`${m.name.padEnd(13)} obyekt ${r.count} · dərin kəsişmə ${r.deep.length} · yolun üstündə ${r.onRoad.length}`);
    expect.soft(r.deep.length, 'iç-içə keçən obyekt cütləri').toBe(0);
    if (m.name !== 'race-zavod') expect.soft(r.onRoad.length, 'yolun üstündə obyekt').toBe(0); // zavodda konteynerlər qəsdəndir
  });
}

test('overlap: zen (60 s sürüş, 12 nümunə)', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page);
  await startMode(page, MODES.find((x) => x.name === 'zen').config);
  await autopilot(page, true);
  let deep = 0;
  let onRoad = 0;
  const examples = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(5000);
    const r = await page.evaluate(scan);
    deep = Math.max(deep, r.deep.length);
    onRoad = Math.max(onRoad, r.onRoad.length);
    for (const e of [...r.deep, ...r.onRoad]) {
      if (examples.length < 12 && !examples.some((q) => q.x === e.x && q.z === e.z)) examples.push(e);
    }
  }
  mergeJson('overlap.json', 'zen', { deep, onRoad, examples });
  console.log(`zen           dərin kəsişmə (maks) ${deep} · yolun üstündə (maks) ${onRoad}`);
  if (examples.length) console.log('nümunələr:', JSON.stringify(examples)); // təsadüfi qırılanda səbəbi görünsün
  expect.soft(deep, 'iç-içə keçən obyekt cütləri').toBe(0);
  expect.soft(onRoad, 'yolun üstündə obyekt').toBe(0);
});

// Yer relyefi yolun (əsas və şaxə) üstünə çıxmamalıdır. Rivierada şaxə yolu 0.6 m-ə qədər
// torpağın altında qalırdı: relyefin "düz zona"sı yalnız əsas trekə görə hesablanırdı.
for (const m of MODES.filter((x) => x.config.mode === 'race')) {
  test(`relyef yolu örtmür: ${m.name}`, async ({ page }) => {
    await boot(page);
    await startMode(page, m.config);
    const r = await page.evaluate(() => {
      const sc = window.__active, T = window.__THREE, tr = sc.track;
      let ground = null;
      sc.scene.traverse((o) => { if (o.isMesh && o.geometry?.type === 'RingGeometry') ground = o; });
      ground.updateMatrixWorld(true);
      const rc = new T.Raycaster();
      const h = (x, z) => {
        rc.set(new T.Vector3(x, 50, z), new T.Vector3(0, -1, 0));
        const hit = rc.intersectObject(ground, false)[0];
        return hit ? hit.point.y : -1;
      };
      let main = -9, branch = -9;
      for (let i = 0; i < tr.N; i += 2) {
        const p = tr.points[i], n = tr.normals[i];
        for (const s of [-1, 0, 1]) main = Math.max(main, h(p.x + n.x * tr.halfWidth * s, p.z + n.z * tr.halfWidth * s));
      }
      for (const b of tr.branches || []) {
        for (let i = 0; i < b.points.length; i++) {
          const p = b.points[i], n = b.normals[i];
          for (const s of [-1, 0, 1]) branch = Math.max(branch, h(p.x + n.x * b.halfWidth * s, p.z + n.z * b.halfWidth * s));
        }
      }
      return { main: +main.toFixed(3), branch: +branch.toFixed(3), branches: (tr.branches || []).length, lifted: sc.environment._decorLifted };
    });
    console.log(`${m.name.padEnd(13)} yerin maks hündürlüyü: əsas yol ${r.main} m · şaxə ${r.branches ? r.branch : '—'} m · relyefə oturdulan dekor (>15 sm fərq): ${r.lifted}`);
    // yol +0.02, şaxə yolu +0.012 hündürlükdədir; yer onlardan aşağı qalmalıdır
    expect(r.main, 'yer əsas yolun üstünə çıxmır').toBeLessThan(0.0);
    if (r.branches) expect(r.branch, 'yer şaxə yolunun üstünə çıxmır').toBeLessThan(0.0);
  });
}
