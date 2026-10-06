import { test, expect } from '@playwright/test';
import { MODES, boot, startMode, mergeJson } from './helpers.js';

// ZEN: maşının GÖVDƏSİ görünən səthə və maneələrə girməməlidir.
// `zen-ground` yalnız maşının mərkəz nöqtəsini ölçür; burada real sürüşdə maşının özü ölçülür:
//   1) təkərlər — yoldan kənarda (çiyin, yamac) hər təkərin dəymə nöqtəsi görünən səthdən
//      (yer meshi + yol hissələri) nə qədər aşağıdadır;
//   2) maneələr — maşın hər maneəyə 3 bucaqdan tam qazla sürülür, dayanandan sonra gövdə
//      qutusunun kənar nöqtələrinin modelin içinə nə qədər girdiyi şüa ilə ölçülür.
const zen = () => MODES.find((m) => m.name === 'zen').config;
const SECS = Number(process.env.SECS || 75);

test('zen: təkərlər yoldan kənarda yerə batmır', async ({ page }) => {
  test.setTimeout((SECS + 60) * 1000);
  await boot(page);
  await startMode(page, zen());
  const r = await page.evaluate(async (secs) => {
    const sc = window.__active, T = window.__THREE;
    const car = sc.playerCar, road = sc.road, hw = road.halfWidth;
    const rc = new T.Raycaster();
    const down = new T.Vector3(0, -1, 0), wp = new T.Vector3();
    const wrap = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
    // yol boyu, verilmiş eninə sürüşmə ilə sürən sadə sürücü
    const LATS = [0, hw + 2.5, hw + 5.5, hw + 9, 0, -(hw + 2.5), -(hw + 5.5), -(hw + 9)];
    // təkərin alt nöqtəsi: təkər qovşağından modelin öz alt kənarına qədər (maşın düz duranda)
    await new Promise((res) => setTimeout(res, 1500));
    car.root.updateMatrixWorld(true);
    const bottom = car.wheels.map((w) => w.getWorldPosition(new T.Vector3()).y - new T.Box3().setFromObject(w).min.y);
    const t0 = performance.now();
    let frame = 0, raf = 0;
    const rows = [];
    let surf = [], surfAt = -1e9;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const L = LATS[Math.floor((now - t0) / 4500) % LATS.length];
      const li = road.getNearest(car.position, car.wpHint).index - road.base;
      const ahead = Math.min(road.points.length - 1, li + 3);
      const p = road.points[ahead], n = road.normals[ahead];
      const diff = wrap(Math.atan2(p.x + n.x * L - car.position.x, p.z + n.z * L - car.position.z) - car.heading);
      sc.input.touch.steer = Math.max(-1, Math.min(1, -diff / 0.5));
      sc.input.touch.throttle = Math.abs(car.vF) > 26 ? 0 : 1;
      if (++frame % 4) return;
      if (now - surfAt > 1000) {
        surfAt = now; surf = [sc.ground];
        sc.scene.traverse((o) => { if (o.isMesh && o.userData?.roadPart) surf.push(o); });
      }
      if (road.tunnelAtPos(car.position, car.wpHint) > 0) return;      // tuneldə divar buraxmır
      const lat = car.lateral || 0;
      car.root.updateMatrixWorld(true);
      let worst = -9;
      for (let wi = 0; wi < car.wheels.length; wi++) {
        const w = car.wheels[wi];
        w.getWorldPosition(wp);
        const contact = wp.y - bottom[wi];
        rc.set(new T.Vector3(wp.x, wp.y + 2.5, wp.z), down); rc.far = 8;
        // sürahi/post kimi hündür hissələr səth deyil — təkər oxundan yuxarıdakı kəsişmələr atılır
        const hit = rc.intersectObjects(surf, false).find((h) => h.point.y < wp.y + 0.2);
        if (!hit) continue;
        worst = Math.max(worst, hit.point.y - contact);   // + : təkər səthin altındadır
      }
      if (worst > -9) rows.push({ sink: +worst.toFixed(3), lat: +lat.toFixed(1), y: +car.position.y.toFixed(2), x: Math.round(car.position.x), z: Math.round(car.position.z), water: sc.water ? car.position.y < sc.water.position.y + 0.3 : false });
    };
    tick();
    await new Promise((res) => setTimeout(res, secs * 1000));
    cancelAnimationFrame(raf);
    sc.input.touch.steer = 0; sc.input.touch.throttle = 0;
    const q = (arr, p) => { const s = arr.map((x) => x.sink).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
    const dry = rows.filter((x) => !x.water);
    const on = dry.filter((x) => Math.abs(x.lat) <= hw), off = dry.filter((x) => Math.abs(x.lat) > hw + 0.65);
    const deep = off.filter((x) => x.sink > 0.15);
    return {
      n: dry.length, onN: on.length, offN: off.length,
      onP50: q(on, 0.5), onP99: q(on, 0.99),
      offP50: q(off, 0.5), offP90: q(off, 0.9), offP99: q(off, 0.99), offMax: q(off, 1),
      deepShare: off.length ? +(deep.length / off.length).toFixed(3) : 0,
      worst: [...off].sort((a, b) => b.sink - a.sink).slice(0, 6),
      // zolaqlar üzrə p90: çiyin (rampa), keçid, torpaq
      zones: [[hw + 0.65, hw + 4.2], [hw + 4.2, hw + 5.2], [hw + 5.2, 99]].map(([a, b]) => {
        const z = off.filter((x) => Math.abs(x.lat) > a && Math.abs(x.lat) <= b);
        return { from: +a.toFixed(1), n: z.length, p50: q(z, 0.5), p90: q(z, 0.9) };
      }),
    };
  }, SECS);
  mergeJson('zen-contact.json', 'wheels', r);
  console.log(`təkər batması (m) · yolda n=${r.onN} p50 ${r.onP50} p99 ${r.onP99} · kənarda n=${r.offN} p50 ${r.offP50} p90 ${r.offP90} p99 ${r.offP99} maks ${r.offMax} · >15 sm payı ${r.deepShare}`);
  console.log('ən pis:', JSON.stringify(r.worst), 'zolaqlar:', JSON.stringify(r.zones));
  expect.soft(r.offN, 'ssenari yoldan kənarda sürür').toBeGreaterThan(150);
  expect.soft(r.offP99, 'kənarda təkər batması p99 (m)').toBeLessThan(0.2);
  expect.soft(r.deepShare, '15 sm-dən dərin batma payı').toBeLessThan(0.03);
});

test('zen: maşın maneənin içinə girmir', async ({ page }) => {
  test.setTimeout(900_000);
  await boot(page);
  await startMode(page, zen());
  const r = await page.evaluate(async () => {
    const sc = window.__active, T = window.__THREE;
    const car = sc.playerCar, road = sc.road, hw = road.halfWidth;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const frames = (n) => new Promise((res) => { const f = () => (--n <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    await sleep(2500);
    // gövdə qutusu (yerli fəza)
    const keepRot = car.root.rotation.clone(), keepPos = car.root.position.clone();
    car.root.rotation.set(0, 0, 0); car.root.position.set(0, 0, 0); car.root.updateMatrixWorld(true);
    const bb = new T.Box3().setFromObject(car._model);
    car.root.rotation.copy(keepRot); car.root.position.copy(keepPos);
    const HL = Math.max(bb.max.z, -bb.min.z), HWD = Math.max(bb.max.x, -bb.min.x);
    // gövdənin kənar nöqtələri: [yan, irəli]
    const PTS = [[0, HL], [HWD, HL], [-HWD, HL], [HWD, 0], [-HWD, 0], [HWD * 0.6, HL], [-HWD * 0.6, HL], [HWD, HL * 0.5], [-HWD, HL * 0.5]];
    const rc = new T.Raycaster();
    const out = [];
    const perKind = {};
    const start = car.position.clone();
    const pick = () => road.obstacles
      .map((o) => { const nr = road.getNearest({ x: o.x, z: o.z }, null); return { o, lat: Math.abs(nr.lateral), nr }; })
      .filter((x) => x.lat > hw + x.o.r + 1.2 && x.lat < hw + 26 && x.o.r <= 12
        && Math.hypot(x.o.x - start.x, x.o.z - start.z) < 420);
    // hər mühitdə ayrıca (maneə növləri mühitə görə dəyişir): mühiti seç, yeni chunk-lara qədər sür
    const wrap = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
    const driveOn = async (metres) => {
      const from = car.trackT * 8;
      const until = performance.now() + 60000;
      while (car.trackT * 8 - from < metres && performance.now() < until) {
        const li = road.getNearest(car.position, car.wpHint).index - road.base;
        const p = road.points[Math.min(road.points.length - 1, li + 4)];
        const diff = wrap(Math.atan2(p.x - car.position.x, p.z - car.position.z) - car.heading);
        sc.input.touch.steer = Math.max(-1, Math.min(1, -diff / 0.5));
        sc.input.touch.throttle = 1;
        await frames(1);
      }
    };
    for (let biome = 0; biome < 5; biome++) {
    sc._biomeOverride = biome;
    if (biome > 0) await driveOn(900);
    start.copy(car.position);
    const startH = car.heading, startHint = car.wpHint;
    for (const k of Object.keys(perKind)) perKind[k] = 0;
    const all = pick();
    for (const { o, nr } of all) {
      perKind[o.kind] = (perKind[o.kind] || 0);
      if (perKind[o.kind] >= 3) continue;
      perKind[o.kind]++;
      const li = Math.min(Math.max(nr.index - road.base, 0), road.points.length - 1);
      const rp = road.points[li];
      const base = Math.atan2(rp.x - o.x, rp.z - o.z);       // maneədən yola doğru
      for (const da of [0, 0.7]) {
        const a = base + da;
        const sx = o.x + Math.sin(a) * (o.r + 7), sz = o.z + Math.cos(a) * (o.r + 7);
        const head = Math.atan2(o.x - sx, o.z - sz);
        car.reset(new T.Vector3(sx, 0, sz), head);
        car.wpHint = nr.index;
        car.vF = 12; car.velocity.set(Math.sin(head) * 12, 0, Math.cos(head) * 12);
        sc._carGy = undefined; sc._latSm = undefined;
        sc.input.touch.steer = 0; sc.input.touch.throttle = 1;
        await sleep(1300);
        sc.input.touch.throttle = 0;
        await frames(2);
        // maşın maneəyə çatıbmı (yoxsa başqa şeyə ilişib)?
        const dist = Math.hypot(car.position.x - o.x, car.position.z - o.z);
        const meshes = [];
        road._group.traverse((m) => { if (m.isMesh && !m.userData?.roadPart) meshes.push(m); });
        car.root.updateMatrixWorld(true);
        const s = Math.sin(car.heading), c = Math.cos(car.heading);
        let pen = 0, where = '';
        for (const hgt of [0.55, 1.0]) {
          const from = new T.Vector3(car.position.x, car.position.y + hgt, car.position.z);
          for (const [lx, lz] of PTS) {
            const dir = new T.Vector3(c * lx + s * lz, 0, -s * lx + c * lz);
            const len = dir.length(); dir.normalize();
            rc.set(from, dir); rc.far = len;
            const hit = rc.intersectObjects(meshes, false)[0];
            if (hit && len - hit.distance > pen) { pen = len - hit.distance; where = `${lx.toFixed(1)},${lz.toFixed(1)}@${hgt}`; }
          }
        }
        out.push({ kind: o.kind, r: +o.r.toFixed(2), box: !!o.box, da, pen: +pen.toFixed(2), where, gap: +(dist - o.r).toFixed(2), x: Math.round(o.x), z: Math.round(o.z) });
      }
    }
    car.reset(start, startH); car.wpHint = startHint; sc._carGy = undefined;
    }
    const reached = out.filter((x) => x.gap < 3.2);
    const byKind = {};
    for (const x of reached) {
      const k = (byKind[x.kind] ||= { n: 0, max: 0, over: 0 });
      k.n++; k.max = Math.max(k.max, x.pen); if (x.pen > 0.25) k.over++;
    }
    return { HL: +HL.toFixed(2), HWD: +HWD.toFixed(2), tries: out.length, reached: reached.length, byKind, worst: [...reached].sort((a, b) => b.pen - a.pen).slice(0, 10) };
  });
  mergeJson('zen-contact.json', 'obstacles', r);
  console.log(`gövdə yarım ölçü: uzunluq ${r.HL} en ${r.HWD} · cəhd ${r.tries} · çatan ${r.reached}`);
  console.log('növ üzrə (n, maks giriş m, >25 sm sayı):', JSON.stringify(r.byKind));
  console.log('ən pis:', JSON.stringify(r.worst));
  expect.soft(r.reached, 'maşın maneələrə çatır').toBeGreaterThan(20);
  const max = Math.max(0, ...Object.values(r.byKind).map((k) => k.max));
  expect.soft(max, 'gövdənin maneəyə ən dərin girişi (m)').toBeLessThan(0.35);
});
