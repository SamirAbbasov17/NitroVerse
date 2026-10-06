import { test, expect } from '@playwright/test';
import { boot, startMode, mergeJson } from './helpers.js';

// ————— İMZA GÜCLƏRİNİN AUDİTİ —————
// Hər maşının imza gücü işə salınır və VƏD ETDİYİ təsir ölçülür. Rəqəmlər
// tests/out/abilities.json-a yazılır (balans üçün), işləməyən güc testi qırır.
//
// Sürət/tutum/yoldan-kənar təsirləri maneəsiz, sabit addımlı simulyasiyada ölçülür
// (test:feel ilə eyni üsul); zərbə, itələmə, maqnit, iz kimi səhnə təsirləri
// real oyun dövründə yoxlanır.
const CARS = ['blaze', 'titan', 'interceptor', 'sunburst', 'venom', 'crimson', 'frost', 'sequoia', 'cargo',
  'midnight', 'lagoon', 'ranger', 'cruiser', 'violetta', 'flamingo', 'taxi', 'goldrush', 'inferno'];

for (const carId of CARS) {
  test(`güc: ${carId}`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page);
    await startMode(page, { mode: 'race', trackId: 'zavod', carId, laps: 3, difficulty: 'normal' });
    await page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30_000 });

    const R = await page.evaluate(async () => {
      const sc = window.__active;
      const car = sc.playerCar;
      const sig = sc.signature;
      const a = sig.data;
      const me = sc.racers.find((r) => r.isPlayer);
      const bots = sc.racers.filter((r) => !r.isPlayer);
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = { car: car.data.id, name: a?.name, mech: a?.mech };
      if (!a) return { ...out, error: 'güc tapılmadı' };

      // Botları dayandır, bonusları söndür (yalnız lazım olan ssenaridə istifadə olunur)
      for (const c of sc.controllers) if (c.car !== car) c.active = false;
      for (const r of bots) { r._sigWait = 1e9; r.car.reset(car.position.clone().set(7000 + Math.random() * 50, 0, 7000), 0); }
      const park = () => { for (const r of bots) r.car.reset(car.position.clone().set(7000 + Math.random() * 50, 0, 7000), 0); };

      // ————— Sabit addımlı simulyasiya köməkçiləri —————
      const DT = 1 / 60;
      const flat = { halfWidth: 1e9, maxRadius: 1e9, getNearest: () => ({ index: 0, t: 0, lateral: 0, onRoad: true }) };
      const rough = { ...flat, halfWidth: 0, getNearest: () => ({ index: 0, t: 0, lateral: 50, onRoad: false }) };
      const clear = () => {
        car.position.set(0, 0, 0); car.velocity.set(0, 0, 0); car.heading = 0; car.vF = 0; car._steerSmooth = 0;
        car.offRoad = 0; car.driftT = 0; car.driftBoostT = 0; car.boostTimer = 0; car.shieldTimer = 0;
        car._sigPowerT = 0; car._sigGrip = 0; car._sigOffroad = 0; car.hitTimer = 0; car.slipTimer = 0;
      };
      const run = (sec, th, st, track = flat) => {
        let last;
        for (let i = 0; i < Math.round(sec / DT); i++) {
          const h0 = car.heading;
          car.update(DT, { throttle: th, steer: st, handbrake: false }, track);
          last = { v: Math.hypot(car.velocity.x, car.velocity.z), w: Math.abs(car.heading - h0) / DT };
        }
        return last;
      };
      // Güc timerlərini əl ilə (gücün öz datasından) qoşan "işə salma" — sim üçün
      const arm = () => {
        if (a.boost) { car.boostTimer = a.boost; car._sigPower = a.power || 1.2; car._sigPowerT = a.boost; }
        if (a.grip) car._sigGrip = a.grip;
        if (a.offroad) car._sigOffroad = a.offroad;
        if (a.dash) { car.velocity.x += Math.sin(car.heading) * a.dash; car.velocity.z += Math.cos(car.heading) * a.dash; }
      };
      const dist = () => Math.hypot(car.position.x, car.position.z);

      // 1) Düz yolda qazanc: tam sürətdən 5 s — güclə və gücsüz qət edilən məsafə fərqi
      clear(); run(6, 1, 0); car.position.set(0, 0, 0); run(5, 1, 0); const base = dist();
      clear(); run(6, 1, 0); car.position.set(0, 0, 0); arm(); run(5, 1, 0); out.straightGain_m = +(dist() - base).toFixed(1);

      // 2) Döngədə qazanc: tam sükanla 3 s — qət edilən yol fərqi və saxlanılan sürət
      const corner = (useArm) => {
        clear(); run(6, 1, 0);
        if (useArm) { if (a.grip) car._sigGrip = a.grip; }
        let path = 0;
        let last;
        for (let i = 0; i < 180; i++) { last = run(DT, 1, 1); path += last.v * DT; }
        return { path, kept: Math.round((last.v / car.maxSpeed) * 100) };
      };
      const c0 = corner(false);
      const c1 = corner(true);
      out.cornerKept_pct = [c0.kept, c1.kept];
      out.cornerGain_m = +(c1.path - c0.path).toFixed(1);

      // 3) Yoldan kənar: 4 s — güclə və gücsüz məsafə fərqi
      const off = (useArm) => {
        clear(); run(6, 1, 0); car.position.set(0, 0, 0);
        if (useArm && a.offroad) car._sigOffroad = a.offroad;
        run(4, 1, 0, rough);
        return dist();
      };
      out.offroadGain_m = +(off(true) - off(false)).toFixed(1);
      clear();

      // ————— Real işə salma (səhnədə) —————
      // Maşını start xəttinə qaytar və gücü həqiqətən işə sal
      const tr = sc.track;
      const home = tr.points[0];
      const hh = Math.atan2(tr.tangents[0].x, tr.tangents[0].z);
      car.reset(car.position.clone().set(home.x, 0, home.z), hh);
      car.wpHint = 0;
      // rewind üçün tarixçə: 3.5 s irəli sür
      sc.input.touch.throttle = 1;
      await wait(3500);
      const before = { x: car.position.x, z: car.position.z, items: me.items.length, hp: car.hp ?? null };
      // Zədə ssenarisi (bərpa gücləri üçün)
      if (a.repair) { car.hitTimer = 1.2; if (sc.hz?.hp) car.hp = Math.max(1, Math.round(sc.hz.hp * 0.3)); }
      // Dalğa üçün: 3 botu yaxına qoy
      let near = [];
      if (a.wave) {
        near = bots.slice(0, 3);
        near.forEach((r, i) => {
          const ang = (i - 1) * 0.9;
          r.car.reset(car.position.clone().set(car.position.x + Math.sin(car.heading + ang) * 7, 0, car.position.z + Math.cos(car.heading + ang) * 7), car.heading);
        });
      }
      const nearStart = near.map((r) => ({ x: r.car.position.x, z: r.car.position.z }));

      out.activated = sig.activate();
      out.secondActivate = sig.activate();          // yalnız 1 dəfə olmalıdır
      out.activeT = +sig.activeT.toFixed(1);
      out.shield_s = +car.shieldTimer.toFixed(1);
      out.boost_s = +car.boostTimer.toFixed(1);
      out.anchor_s = +(car._sigAnchor || 0).toFixed(1);
      out.cloak_s = +(car._sigCloak || 0).toFixed(1);
      if (a.repair) { out.hitCleared = car.hitTimer === 0; out.hpAfter = car.hp ?? null; out.hpMax = sc.hz?.hp ?? null; }
      if (a.rewind) out.rewind_m = +Math.hypot(car.position.x - before.x, car.position.z - before.z).toFixed(1);

      // Qalxan: raket zərbəsi udulurmu
      if (car.shieldTimer > 0) {
        sc.powerups._applyMissileHit(me);
        out.shieldBlocksHit = car.hitTimer === 0;
      }
      // Kölgə: arxadakı bot oyunçunu hədəf ala bilirmi
      if (a.cloak) {
        const b = bots[0];
        b.car.reset(car.position.clone().set(car.position.x - Math.sin(car.heading) * 20, 0, car.position.z - Math.cos(car.heading) * 20), car.heading);
        await wait(80);
        out.cloakHidesFromMissile = sc.powerups._findTarget(b, false) !== me;
        park();
      }
      // Ağır yük: yandan itələmə
      if (a.anchor) {
        const b = bots[0];
        const rx = -Math.cos(car.heading), rz = Math.sin(car.heading);
        sc.input.touch.throttle = 0; car.velocity.set(0, 0, 0);
        await wait(60);
        const p0 = { x: car.position.x, z: car.position.z };
        b.car.reset(car.position.clone().set(car.position.x + rx * 1.2, 0, car.position.z + rz * 1.2), car.heading);
        await wait(250);
        out.anchorPushed_m = +Math.hypot(car.position.x - p0.x, car.position.z - p0.z).toFixed(2);
        out.anchorOtherPushed_m = +Math.hypot(b.car.position.x - (p0.x + rx * 1.2), b.car.position.z - (p0.z + rz * 1.2)).toFixed(2);
        park();
      }
      // Dalğa: yaxındakılar nə qədər uzaqlaşdı və sürüşürmü
      if (a.wave) {
        out.waveSlip = near.filter((r) => r.car.slipTimer > 0).length;
        await wait(600);
        // hər botun ÖZ başlanğıc yerindən nə qədər itələndiyi — median (düz qabaqdakı bot
        // oyunçunun öz maşını ilə toqquşur, onun rəqəmi dalğanı göstərmir)
        const push = near.map((r, i) => Math.hypot(r.car.position.x - nearStart[i].x, r.car.position.z - nearStart[i].z)).sort((p, q) => p - q);
        out.wavePush_m = +push[1].toFixed(1);
        park();
      }
      // Tullanış: maşın qalxırmı və alçaq maneənin üstündən keçirmi
      if (a.leap) {
        await wait(350);
        out.leapHeight_m = +car.root.position.y.toFixed(2);
        // ikinci tullanış (yalnız bu yoxlama üçün): 9 m qabaqdakı botun üstündən keçid
        const b = bots[0];
        const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
        car.velocity.set(fx * 30, 0, fz * 30);
        b.car.reset(car.position.clone().set(car.position.x + fx * 9, 0, car.position.z + fz * 9), car.heading);
        const bp = { x: b.car.position.x, z: b.car.position.z };
        car._airT = 0.78;
        await wait(700);
        // keçibsə: oyunçu botdan qabaqdadır və bot yerindən tərpənməyib
        const ahead = (car.position.x - bp.x) * fx + (car.position.z - bp.z) * fz;
        out.leapClearsCar = ahead > 2 && Math.hypot(b.car.position.x - bp.x, b.car.position.z - bp.z) < 0.5;
        park();
      }

      // İz: ləkələr yaranırmı, arxadan gələn bot sürüşürmü, sahibi sürüşürmü
      if (a.trail) {
        sc.input.touch.throttle = 1;
        await wait(1500);
        out.trailPatches = sig._patches.length;
        const last = sig._patches[Math.max(0, sig._patches.length - 3)];
        if (last) {
          const b = bots[0];
          b.car.reset(car.position.clone().set(last.x, 0, last.z), car.heading);
          await wait(200);
          out.trailSlipsFollower = b.car.slipTimer > 0;
          out.trailSlip_s = +b.car.slipTimer.toFixed(2);
          park();
        }
        out.trailSlipsOwner = car.slipTimer > 0;
      }
      // Maqnit: bonuslar çəkilir və götürülürmü (10 s sürüş)
      if (a.magnet) {
        for (const b of sc.powerups.boxes) { b.active = true; b.timer = 0; }
        me.items = [];
        const box = sc.powerups.boxes[1];
        // bonus cərgəsinin 12 m yanından keç: adi halda götürülməz
        const idx = Math.floor(tr.N * (0.55 / 4));
        const p = tr.points[(idx - 6 + tr.N) % tr.N];
        const n = tr.normals[idx];
        car.reset(car.position.clone().set(p.x + n.x * 2, 0, p.z + n.z * 2), Math.atan2(tr.tangents[idx].x, tr.tangents[idx].z));
        car.wpHint = idx;
        sig._magnetT = a.magnet.time; sig._magnetR = a.magnet.radius;
        const b0 = { x: box.homeX, z: box.homeZ };
        sc.input.touch.throttle = 0; car.velocity.set(0, 0, 0);
        await wait(1200);
        out.magnetPull_m = +Math.max(...sc.powerups.boxes.map((bx) => Math.hypot(bx.mesh.position.x - bx.homeX, bx.mesh.position.z - bx.homeZ))).toFixed(1);
        out.magnetPicked = me.items.length;
        out._box = b0;
      }
      sc.input.touch.throttle = 0;
      return out;
    });

    console.log(JSON.stringify(R));
    mergeJson('abilities.json', carId, R);
    expect(R.error, 'güc tapılmalıdır').toBeUndefined();
    expect(R.activated, 'işə düşməlidir').toBe(true);
    expect(R.secondActivate, 'yalnız bir dəfə işləməlidir').toBe(false);
    // Vəd olunan təsir həqiqətən işləməlidir
    if (R.rewind_m != null) expect(R.rewind_m, 'geri qayıdış məsafəsi (m)').toBeGreaterThan(40);
    if (['lagoon', 'frost', 'ranger'].includes(carId)) expect(R.cornerGain_m, 'tutum gücü döngədə qazandırmalıdır (m)').toBeGreaterThan(4);
    if (R.shield_s > 0) expect(R.shieldBlocksHit, 'qalxan zərbəni udmalıdır').toBe(true);
    if (R.cloak_s > 0) expect(R.cloakHidesFromMissile, 'kölgə raketdən gizlətməlidir').toBe(true);
    if (R.anchor_s > 0) expect(R.anchorPushed_m, 'ağır yük itələnməməlidir (m)').toBeLessThan(0.2);
    if (R.wavePush_m != null) { expect(R.wavePush_m, 'dalğa itələməlidir (m)').toBeGreaterThan(3); expect(R.waveSlip).toBe(3); }
    if (R.trailPatches != null) { expect(R.trailPatches).toBeGreaterThan(5); expect(R.trailSlipsFollower).toBe(true); expect(R.trailSlipsOwner).toBe(false); }
    if (R.magnetPull_m != null) { expect(R.magnetPull_m).toBeGreaterThan(5); expect(R.magnetPicked).toBeGreaterThan(0); }
    if (R.leapHeight_m != null) { expect(R.leapHeight_m).toBeGreaterThan(1); expect(R.leapClearsCar, 'tullanış rəqibin üstündən keçməlidir').toBe(true); }
    if (carId === 'ranger') expect(R.offroadGain_m, 'yoldan kənar qazanc (m)').toBeGreaterThan(10);
    if (carId === 'cruiser') { expect(R.hitCleared).toBe(true); expect(R.hpAfter).toBe(R.hpMax); }
  });
}
