import { test, expect } from '@playwright/test';
import { MODES, boot, startMode, autopilot, mergeJson } from './helpers.js';

// ZEN: maşının fiziki hündürlüyü GÖRÜNƏN səthlə üst-üstə düşməlidir. Avtopilot yol boyu sürür
// (tunel daxil); hər nümunədə maşının yanında 9 eninə nöqtə üçün "fizika hündürlüyü"
// (`_groundYFor`) ilə ekrandakı səth (yer meshi + yol hissələrinə şüa) tutuşdurulur.
//   batma  = səth fizikadan yuxarıdadır → maşın yerin içində görünür
//   asılma = səth fizikadan aşağıdadır → maşın havada görünür (çiyindən torpağa 0.7 m-lik
//            keçid zolağında 0.4 m-ə qədər fərq qəsdəndir — yalnız > 0.5 m sayılır)
const SECS = Number(process.env.SECS || 110);

test('zen: maşın görünən səthdə oturur (yol, çiyin, torpaq, tunel)', async ({ page }) => {
  test.setTimeout((SECS + 60) * 1000);
  // ZEN_ROAD=old → ritmsiz (əvvəlki) yol ilə müqayisə
  if (process.env.ZEN_ROAD === 'old') await page.addInitScript(() => { try { localStorage.setItem('apexZenRoad', 'old'); } catch { /* boş */ } });
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'zen').config);
  await autopilot(page, true);
  const r = await page.evaluate(async (secs) => {
    const sc = window.__active, T = window.__THREE;
    const rc = new T.Raycaster();
    const down = new T.Vector3(0, -1, 0);
    const surfaces = () => {
      const a = [sc.ground];
      sc.scene.traverse((o) => { if (o.isMesh && o.userData?.roadPart) a.push(o); });
      return a;
    };
    sc._waterY = sc.water ? sc.water.position.y - 0.4 : -99;
    const worstSink = [], worstFloat = [];
    let n = 0, sinkN = 0, floatN = 0, tunnelN = 0, buried = 0;
    const end = performance.now() + secs * 1000;
    while (performance.now() < end) {
      await new Promise((res) => setTimeout(res, 250));
      const car = sc.playerCar, road = sc.road;
      const near = road.getNearest(car.position, car.wpHint);
      const li = Math.min(Math.max(near.index - road.base, 0), road.normals.length - 1);
      const nrm = road.normals[li];
      const hw = road.halfWidth;
      const inTun = road.tunnelAtPos(car.position, car.wpHint) > 0.35;
      if (inTun) tunnelN++;
      // körpü: yol relyefdən hündürdədir (səhnədəki `onBridge` ilə eyni ölçü: yer meshi yoldan ≥ 1.2 m aşağı)
      const rp = road.points[li];
      const bridge = rp.y - sc._meshGroundY(rp.x + nrm.x * (hw + 6), rp.z + nrm.z * (hw + 6)) > 1.2
        || rp.y - sc._meshGroundY(rp.x - nrm.x * (hw + 6), rp.z - nrm.z * (hw + 6)) > 1.2;
      const meshes = surfaces();
      // Yer meshi yeni kafelə keçəndə `position` dərhal, `matrixWorld` isə növbəti render-də yenilənir.
      // Arada şüa köhnə matrisə görə düşürdü və asfaltın üstündə 1–1.5 m "torpaq" ölçülürdü —
      // ekranda belə kadr yoxdur (ölçüldü: bütün belə nümunələr tətbiqdən 3–8 ms sonra idi).
      sc.ground.updateMatrixWorld(true);
      const keepLat = sc._latSm;
      // eninə nöqtələr: asfalt, çiyin, yaxın torpaq (maşın yoldan ən çox ~13 m aralana bilir)
      for (const off of [0, hw * 0.8, -hw * 0.8, hw + 2, -(hw + 2), hw + 5, -(hw + 5), hw + 8, -(hw + 8)]) {
        const lat = (car.lateral || 0) + off;
        const pos = new T.Vector3(car.position.x + nrm.x * off, car.position.y, car.position.z + nrm.z * off);
        if (inTun && Math.abs(lat) > road.tunnelHalfWidth - 1.2) continue; // divarın arxası — maşın ora çata bilmir
        // körpüdə sürahi yoldan çıxmağa qoymur (yol relyefdən xeyli yuxarıdadır) — kənar nöqtələr əlçatmazdır
        if (bridge && Math.abs(lat) > hw + 0.3) continue;
        // yol dirəyi / işıq / nişan (nazik, bərk obyekt): şüa onun başına düşür və 1 m "batma" kimi
        // oxunurdu — maşın ora çata bilmir (toqquşması var), səth deyil
        if (road.obstacles.some((ob) => ['post', 'pole', 'lamp', 'sign'].includes(ob.kind) && Math.hypot(ob.x - pos.x, ob.z - pos.z) < ob.r + 0.6)) continue;
        sc._latSm = undefined;
        const phys = sc._groundYFor({ position: pos, lateral: lat, wpHint: car.wpHint }, 1);
        // görünən səth: fizikadan 1.6 m yuxarıdan aşağı şüa (tunel tavanı daha hündürdür)
        rc.set(new T.Vector3(pos.x, phys + 1.6, pos.z), down);
        rc.far = 6;
        const hit = rc.intersectObjects(meshes, false)[0];
        n++;
        if (!hit) { floatN++; worstFloat.push({ d: 9, lat: +lat.toFixed(1), inTun, x: Math.round(pos.x), z: Math.round(pos.z) }); continue; }
        // körpü sürahisi (yoldan 0.95 m hündür, açıq boz lent): maşın ora çata bilmir — səth deyil.
        // Şüa onun üstünə düşəndə sabit "0.87 m batma" oxunurdu (təsadüfi qırılmaların mənbəyi).
        if (hit.object.material?.color?.getHex?.() === 0xc7ccd8 && hit.point.y - phys > 0.6) continue;
        const d = hit.point.y - phys; // + : səth yuxarıdadır (batma) · − : səth aşağıdadır (asılma)
        const m = Math.round((((near.index * 8) % 2600) + 2600) % 2600); // tunel dövründəki yer (tunel: 1480–1710)
        const row = { d: +d.toFixed(2), lat: +lat.toFixed(1), inTun, m, job: !!(sc._cutJob || sc._twBusy), roadY: +road.heightAtPos(pos, car.wpHint).toFixed(2), physY: +phys.toFixed(2), x: Math.round(pos.x), z: Math.round(pos.z), on: hit.object === sc.ground ? 'yer' : 'yol' };
        if (d > 0.15) { sinkN++; worstSink.push(row); if (row.on === 'yer' && Math.abs(lat) < hw) buried++; }
        // su üstündə maşın qəsdən su səviyyəsində saxlanır (dib görünən "səth" deyil) — sayılmır
        // körpü/uçurum kənarı (səth 1.5 m-dən aşağı): ora məhəccər buraxmır — sayılmır
        if (d < -0.5 && d > -1.5 && phys > sc._waterY + 0.3) { floatN++; worstFloat.push(row); }
      }
      sc._latSm = keepLat;
    }
    worstSink.sort((a, b) => b.d - a.d);
    worstFloat.sort((a, b) => a.d - b.d);
    const maxSink = worstSink.length ? worstSink[0].d : 0;
    return { n, sinkN, floatN, tunnelN, buried, maxSink, worstSink: worstSink.slice(0, 8), worstFloat: worstFloat.slice(0, 8), km: +(sc.playerCar.trackT * 8 / 1000).toFixed(2) };
  }, SECS);
  mergeJson('zen-ground.json', 'zen', r);
  console.log(`zen ${r.km} km · nümunə ${r.n} · tuneldə ${r.tunnelN} · batma (>15 sm) ${r.sinkN} · asılma (>50 sm) ${r.floatN} · torpaq asfaltın üstündə ${r.buried} · ən dərin batma ${r.maxSink} m`);
  console.log('ən pis batmalar:', JSON.stringify(r.worstSink));
  console.log('ən pis asılmalar:', JSON.stringify(r.worstFloat));
  expect.soft(r.tunnelN, 'ssenari tuneldən keçir').toBeGreaterThan(0);
  expect.soft(r.buried, 'torpaq asfaltın üstünə çıxmır').toBe(0);
  // Düzəlişdən əvvəl: 1.2–1.6 m batma, 0.6 m asfaltın üstündə torpaq. İndi qalan fərqlər dik
  // yamacda 0.3 m-ə qədərdir (çiyin zolağının rampası ilə 10 m-lik yer xanası arasında).
  expect.soft(r.maxSink, 'ən dərin batma (m)').toBeLessThan(0.6);
  expect.soft(r.sinkN / r.n, 'batma payı').toBeLessThan(0.03);
  expect.soft(r.floatN / r.n, 'asılma payı').toBeLessThan(0.02);
});
