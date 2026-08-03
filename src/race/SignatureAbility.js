import * as THREE from 'three';
import { abilityFor } from '../data/abilities.js';

// ————— İMZA GÜCÜ MENECERİ —————
// Yarışda BİR DƏFƏ işlədilir. Maşına görə fərqli mexanika, hər birinin öz
// vizual effekti var. Rəqibə birbaşa zərər vermir — balans qorunur.

const UP = new THREE.Vector3(0, 1, 0);

export class SignatureAbility {
  constructor(car, scene) {
    this.car = car;
    this.scene = scene;          // GameplayScene
    this.data = abilityFor(car.carId || scene?.config?.carId) || null;
    this.used = false;
    this.activeT = 0;            // qalan effekt vaxtı (HUD üçün)
    this._trailT = 0;
    this._patches = [];          // {x,z,r,life,max,slip,blind,mesh}
    this._hist = [];             // rewind üçün mövqe tarixi
    this._histT = 0;
    this._hopT = 0;
    this._group = new THREE.Group();
    scene?.scene?.add(this._group);
  }

  get ready() { return !!this.data && !this.used; }

  // ————— İŞƏ SALMA —————
  activate() {
    if (!this.ready) return false;
    const a = this.data, car = this.car, sc = this.scene;
    this.used = true;
    const fx = sc?.effects;

    // Hər mexanikanın ÖZ işə salma görüntüsü — hamısı eyni görünməsin
    this._spawnActivateFx(fx, a, car);

    // — sürət —
    if (a.boost) {
      let pow = a.power || 1.2;
      if (a.comeback) {
        // Nə qədər geridəsə, bir o qədər güclü (bərabərləşdirici)
        const me = sc?.racers?.find((r) => r.isPlayer);
        const pos = me?.position || 1;
        const n = sc?.racers?.length || 6;
        pow += a.comeback * ((pos - 1) / Math.max(1, n - 1));
      }
      car.boostTimer = Math.max(car.boostTimer, a.boost);
      car._sigPower = pow;
      car._sigPowerT = a.boost;
    }
    // — qorunma —
    if (a.guard) car.shieldTimer = Math.max(car.shieldTimer, a.guard);
    if (a.anchor) car._sigAnchor = a.anchor;
    if (a.cloak) car._sigCloak = a.cloak;
    // — idarə —
    if (a.grip) car._sigGrip = a.grip;
    if (a.offroad) car._sigOffroad = a.offroad;
    // — bərpa —
    if (a.repair) { car.hitTimer = 0; car.slipTimer = 0; sc?.repairPlayer?.(); }
    if (a.rewind) this._doRewind(a.rewind);
    // — manevr —
    if (a.leap) { this._hopT = 0.78; car.shieldTimer = Math.max(car.shieldTimer, 0.9); }
    if (a.dash) {
      // XƏTA İDİ: xam sürət əlavə olunurdu, amma Car.update dərhal `vMax`-a
      // kəsirdi → sıçrayış itirdi (ölçüldü: −15 m … +11 m, yəni gücün dəyəri
      // sıfır və ya mənfi). İndi qısa müddət sürət tavanı da qaldırılır ki,
      // impuls yaşasın; `boost/power` maşın datasından gəlir.
      const h = car.heading;
      car.velocity.x += Math.sin(h) * a.dash;
      car.velocity.z += Math.cos(h) * a.dash;
    }
    // — köməkçi —
    if (a.magnet) { this._magnetT = a.magnet.time; this._magnetR = a.magnet.radius; }
    // — dalğa —
    if (a.wave) this._doWave(a.wave);
    // — arxada iz —
    if (a.trail) { this._trailLeft = a.trail.life; }

    this.activeT = Math.max(
      a.boost || 0, a.guard || 0, a.grip || 0, a.offroad || 0,
      a.anchor || 0, a.cloak || 0, a.magnet?.time || 0, a.trail?.life || 0, 1.2
    );
    sc?._toast?.(a.name);
    return true;
  }

  // ————— İŞƏ SALMA GÖRÜNTÜSÜ (mexanikaya görə fərqli) —————
  _spawnActivateFx(fx, a, car) {
    if (!fx) return;
    const p = car.position, h = car.heading;
    const back = (d) => ({ x: p.x - Math.sin(h) * d, y: 0.4, z: p.z - Math.cos(h) * d });
    const side = (o) => ({ x: p.x - Math.cos(h) * o, y: 0.5, z: p.z + Math.sin(h) * o });
    switch (a.mech) {
      case 'surge': // arxadan uzanan alov/qığılcım quyruğu
        for (let i = 0; i < 14; i++) fx.spawnSparkle?.(back(1.5 + i * 0.55), a.color);
        fx.spawnSmoke?.(back(2.4), false, a.color, 1.5);
        break;
      case 'trail': // yerə yayılan rəngli püskürtü
        for (let i = 0; i < 3; i++) fx.spawnSmoke?.(back(2.2 + i), false, a.trail.color, 2.0);
        fx.spawnRangeRing?.(p, 6.5, a.color);
        break;
      case 'guard': // genişlənən qoruyucu qübbə (iki halqa)
        fx.spawnRangeRing?.(p, 4.5, a.color);
        fx.spawnRangeRing?.(p, 8.0, a.color);
        for (let i = 0; i < 8; i++) fx.spawnSparkle?.({ x: p.x, y: 1.6, z: p.z }, a.color);
        break;
      case 'handling': // təkərlərin altından yerə yapışma tozu
        for (const o of [-0.8, 0.8]) fx.spawnSmoke?.(side(o), false, a.color, 1.1);
        fx.spawnRangeRing?.(p, 5.0, a.color);
        break;
      case 'recover': // yuxarı qalxan bərpa sütunu
        for (let i = 0; i < 16; i++) {
          fx.spawnSparkle?.({ x: p.x + (Math.random() - 0.5) * 1.6, y: 0.3 + i * 0.22, z: p.z + (Math.random() - 0.5) * 1.6 }, a.color);
        }
        break;
      case 'agility': // altdan güclü toz partlayışı
        for (let i = 0; i < 4; i++) {
          fx.spawnSmoke?.({ x: p.x + (Math.random() - 0.5) * 2.2, y: 0.15, z: p.z + (Math.random() - 0.5) * 2.2 }, false, null, 1.6);
        }
        for (let i = 0; i < 8; i++) fx.spawnSparkle?.(p, a.color);
        break;
      case 'utility': // maqnit dalğaları — üç halqa
        for (const r of [6, 12, 18]) fx.spawnRangeRing?.(p, r, a.color);
        break;
      case 'wave': // güclü partlayış + geniş halqa
        fx.spawnExplosion?.({ ...p });
        fx.spawnRangeRing?.(p, a.wave.radius, a.color);
        for (let i = 0; i < 12; i++) fx.spawnSparkle?.(p, a.color);
        break;
      default:
        fx.spawnRangeRing?.(p, 5.5, a.color);
    }
  }

  // 3 saniyə əvvəlki mövqeyə qayıt
  _doRewind(sec) {
    const car = this.car;
    const want = this._hist.find((h) => h.t <= sec) || this._hist[this._hist.length - 1];
    if (!want) return;
    this.scene?.effects?.spawnExplosion?.({ ...car.position });
    car.position.set(want.x, 0, want.z);
    car.heading = want.h;
    car.velocity.set(Math.sin(want.h) * want.v, 0, Math.cos(want.h) * want.v);
    car.hitTimer = 0; car.slipTimer = 0;
    car.shieldTimer = Math.max(car.shieldTimer, 1.4); // qayıdışdan dərhal sonra qorunma
  }

  // Ətrafdakıları kənara itələ
  _doWave({ radius, force }) {
    const car = this.car;
    for (const o of this.scene?.cars || []) {
      if (o === car) continue;
      const dx = o.position.x - car.position.x, dz = o.position.z - car.position.z;
      const d = Math.hypot(dx, dz);
      if (d > radius || d < 0.001) continue;
      const k = (1 - d / radius) * force;
      o.velocity.x += (dx / d) * k;
      o.velocity.z += (dz / d) * k;
      o.slipTimer = Math.max(o.slipTimer, 0.5);
      this.scene?.effects?.spawnSmoke?.(o.position, false, this.data.color, 0.7);
    }
  }

  // ————— HƏR KADR —————
  update(dt) {
    const car = this.car;
    // Rewind üçün mövqe tarixi (0.15 s addım, 5 s pəncərə)
    this._histT += dt;
    if (this._histT >= 0.15) {
      this._histT = 0;
      for (const h of this._hist) h.t += 0.15;
      this._hist.unshift({ t: 0, x: car.position.x, z: car.position.z, h: car.heading, v: car.vF || 0 });
      if (this._hist.length > 40) this._hist.pop();
    }
    if (!this.used) return;
    this.activeT = Math.max(0, this.activeT - dt);
    car._sigAnchor = Math.max(0, (car._sigAnchor || 0) - dt);
    car._sigCloak = Math.max(0, (car._sigCloak || 0) - dt);

    // Tullanış (vizual qövs)
    if (this._hopT > 0) {
      this._hopT = Math.max(0, this._hopT - dt);
      const k = 1 - this._hopT / 0.78;
      car.root.position.y = Math.sin(k * Math.PI) * 2.6;
      if (this._hopT === 0) car.root.position.y = 0;
    }

    // Maqnit — yaxındakı bonusları çək
    if (this._magnetT > 0) {
      this._magnetT -= dt;
      const boxes = this.scene?.powerups?.boxes || this.scene?.powerups?._boxes || [];
      for (const bx of boxes) {
        const p = bx.mesh?.position || bx.position;
        if (!p) continue;
        const dx = car.position.x - p.x, dz = car.position.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > this._magnetR || d < 0.5) continue;
        const s = Math.min(1, dt * 3.4);
        p.x += dx * s; p.z += dz * s;
      }
    }

    // Arxada iz qoyma
    if (this._trailLeft > 0 && this.data?.trail) {
      this._trailLeft -= dt;
      this._trailT -= dt;
      if (this._trailT <= 0) {
        // Ləkə tezliyi ENİ ilə tərs mütənasibdir: geniş ləkələr onsuz da
        // üst-üstə düşür, sıx buraxmaq yalnız overdraw yaradırdı.
        // ÖLÇÜLDÜ: 0.09 s sabit addımda duman pərdəsi (wide 1.9) 78 ləkə +
        // 78 tüstü buludu verirdi → FPS çökür, dt tavana dəyir və maşın 8
        // saniyədə 76 m GERİ qalırdı (öz gücündən zərər görürdü).
        this._trailT = 0.09 * (this.data.trail.wide || 1);
        this._spawnPatch();
      }
    }
    this._updatePatches(dt);
    this._updatePuffs(dt);
  }

  // Yumşaq radial tekstura — bir dəfə qurulur, bütün izlər paylaşır
  // İZ TEKSTURALARI: hər gücün öz xarakteri var. Əvvəl hamısı EYNİ yumşaq
  // dairə idi — ona görə "yerdə dairələr" kimi görünürdü (istifadəçi rəyi).
  //   fire  — qeyri-müntəzəm közərmiş ləkə (yanmış yer)
  //   cloud — dalğalı duman
  //   ice   — kristal cizgiləri
  static _texCache = {};
  _lookTex(look = 'fire') {
    const keş = SignatureAbility._texCache;
    if (keş[look]) return keş[look];
    const N = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const cx = cv.getContext('2d');
    const rnd = (a) => { const x = Math.sin(a * 127.1) * 43758.55; return x - Math.floor(x); };

    if (look === 'ice') {
      const g = cx.createRadialGradient(N / 2, N / 2, 4, N / 2, N / 2, N / 2 - 2);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, N, N);
      // kristal çatlar
      cx.strokeStyle = 'rgba(255,255,255,0.75)'; cx.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        const a = rnd(i * 3.1) * Math.PI * 2;
        cx.beginPath(); cx.moveTo(N / 2, N / 2);
        cx.lineTo(N / 2 + Math.cos(a) * N * 0.44, N / 2 + Math.sin(a) * N * 0.44);
        cx.stroke();
      }
    } else if (look === 'cloud') {
      // üst-üstə düşən yumşaq ləkələr → dalğalı duman kənarı
      for (let i = 0; i < 14; i++) {
        const a = rnd(i * 7.7) * Math.PI * 2, rr = rnd(i * 2.3) * N * 0.3;
        const x = N / 2 + Math.cos(a) * rr, y = N / 2 + Math.sin(a) * rr;
        const rad = N * (0.16 + rnd(i * 5.5) * 0.16);
        const g = cx.createRadialGradient(x, y, 1, x, y, rad);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, rad, 0, 7); cx.fill();
      }
    } else {
      // FIRE: isti nüvə + qeyri-müntəzəm kənar + qara köz ləkələri
      const g = cx.createRadialGradient(N / 2, N / 2, 2, N / 2, N / 2, N / 2 - 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,225,150,0.85)');
      g.addColorStop(0.72, 'rgba(255,120,30,0.42)');
      g.addColorStop(1, 'rgba(255,60,0,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, N, N);
      cx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 26; i++) {        // kənarı "yeyib" qeyri-müntəzəm et
        const a = rnd(i * 4.4) * Math.PI * 2;
        const rr = N * (0.30 + rnd(i * 8.1) * 0.22);
        const x = N / 2 + Math.cos(a) * rr, y = N / 2 + Math.sin(a) * rr;
        const rad = N * (0.05 + rnd(i * 1.7) * 0.09);
        const gg = cx.createRadialGradient(x, y, 0, x, y, rad);
        gg.addColorStop(0, 'rgba(0,0,0,0.85)');
        gg.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = gg; cx.beginPath(); cx.arc(x, y, rad, 0, 7); cx.fill();
      }
      cx.globalCompositeOperation = 'source-over';
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData = { shared: true };
    keş[look] = tex;
    return tex;
  }

  _softTex() {
    if (SignatureAbility._soft) return SignatureAbility._soft;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const cx = cv.getContext('2d');
    const g = cx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = g;
    cx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Bütün izlər/buludlar bu TƏK teksturanı paylaşır — səhnə təmizlənməsi
    // ona toxunmamalıdır (yoxsa hər səhnədə yenidən yaranır)
    tex.userData = { shared: true };
    SignatureAbility._soft = tex;
    return tex;
  }

  _spawnPatch() {
    const t = this.data.trail;
    const car = this.car;
    const h = car.heading;
    const r = 2.1 * (t.wide || 1);
    const px = car.position.x - Math.sin(h) * 2.4;
    const pz = car.position.z - Math.cos(h) * 2.4;

    // ————— YERDƏKİ İZ —————
    // ƏVVƏL: kəskin kənarlı CircleGeometry — yerə "yumru disklər" düzülürdü,
    // süni görünürdü. İndi yumşaq kənarlı, hərəkət istiqamətində UZANMIŞ
    // ləkədir: təkərin arxasında qalan sürtülmə kimi oxunur.
    const look = t.look || 'fire';
    const mat = new THREE.MeshBasicMaterial({
      map: this._lookTex(look), color: t.color, transparent: true,
      // Əvvəl 0.30 idi — gündüz işığında demək olar görünmürdü
      opacity: t.blind ? 0.5 : look === 'fire' ? 0.62 : 0.42, depthWrite: false,
      blending: t.blind ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(SignatureAbility._patchGeo
      || (SignatureAbility._patchGeo = new THREE.PlaneGeometry(1, 1)), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -h;                       // maşının istiqaməti boyunca
    m.scale.set(r * 1.7, r * 2.6, 1);        // uzunsov: dairə deyil
    m.position.set(px, 0.06, pz);
    m.renderOrder = 1;
    this._group.add(m);
    this._patches.push({ x: px, z: pz, r, life: 3.2, max: 3.2, slip: t.slip, mesh: m,
      sx: r * 1.7, sy: r * 2.6, look, faz: Math.random() * 6.28 });

    // ————— YANAN YER: qaralmış ləkə + qalxan alov dilləri —————
    // Alov izi yalnız işıqlı ləkə idi; indi altında KÖZ (tünd, normal
    // qarışdırma) və üstündə qısa ömürlü şaquli alovlar var.
    if (look === 'fire') {
      const köz = new THREE.Mesh(SignatureAbility._patchGeo, new THREE.MeshBasicMaterial({
        map: this._lookTex('fire'), color: 0x2a1206, transparent: true,
        opacity: 0.55, depthWrite: false,
      }));
      köz.rotation.x = -Math.PI / 2; köz.rotation.z = -h;
      köz.scale.set(r * 1.9, r * 2.9, 1);
      köz.position.set(px, 0.045, pz);
      this._group.add(köz);
      this._patches[this._patches.length - 1].köz = köz;

      this._flames = this._flames || [];
      for (let i = 0; i < 2; i++) {
        const fm = new THREE.Mesh(
          SignatureAbility._flameGeo || (SignatureAbility._flameGeo = new THREE.PlaneGeometry(1, 1)),
          new THREE.MeshBasicMaterial({
            map: this._lookTex('fire'), color: i ? 0xffd25a : t.color, transparent: true,
            opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
          })
        );
        const a = Math.random() * Math.PI * 2;
        fm.position.set(px + Math.cos(a) * r * 0.5, 0.5, pz + Math.sin(a) * r * 0.5);
        fm.scale.set(r * 0.8, r * 1.3, 1);
        this._group.add(fm);
        this._flames.push({ mesh: fm, t: 0, life: 0.55 + Math.random() * 0.35,
          vy: 2.2 + Math.random() * 1.6, faz: Math.random() * 6.28 });
      }
      if (this._flames.length > 26) {
        const köhnə = this._flames.shift();
        this._group.remove(köhnə.mesh); köhnə.mesh.material.dispose();
      }
    }

    // Canlı ləkə tavanı — mobil GPU-da overdraw partlamasın
    if (this._patches.length > 34) {
      const old = this._patches.shift();
      this._group.remove(old.mesh);
      old.mesh.material.dispose();
    }

    // ————— HAVADAKI BULUD —————
    // Zəhər/duman gücləri HƏQİQİ bulud olmalıdır: qalxan, genişlənən,
    // yumşaq kürələr. Əvvəl yalnız yerə disk qoyurdu və "duman" hiss
    // olunmurdu (istifadəçi rəyi).
    this._puff = (this._puff || 0) + 1;
    const cloudy = t.blind || (t.wide || 1) > 1.2;
    if (cloudy && this._puff % 2 === 0) {
      for (let i = 0; i < 2; i++) {
        const pm = new THREE.Mesh(
          SignatureAbility._puffGeo || (SignatureAbility._puffGeo = new THREE.SphereGeometry(1, 7, 5)),
          new THREE.MeshBasicMaterial({
            map: this._softTex(), color: t.color, transparent: true,
            opacity: 0.30, depthWrite: false,
          })
        );
        const a = Math.random() * Math.PI * 2;
        pm.position.set(px + Math.cos(a) * r * 0.5, 0.8 + Math.random() * 0.6, pz + Math.sin(a) * r * 0.5);
        pm.scale.setScalar(r * (0.7 + Math.random() * 0.4));
        this._group.add(pm);
        this._puffs = this._puffs || [];
        this._puffs.push({ mesh: pm, t: 0, life: 2.4 + Math.random() * 0.8,
          vy: 0.5 + Math.random() * 0.5, grow: 0.5 + Math.random() * 0.5 });
      }
      // Buludlar da məhdud saxlanılır
      while (this._puffs && this._puffs.length > 26) {
        const old = this._puffs.shift();
        this._group.remove(old.mesh); old.mesh.material.dispose();
      }
    }
  }

  // Havadakı buludların canlandırılması
  _updatePuffs(dt) {
    if (!this._puffs?.length) return;
    for (let i = this._puffs.length - 1; i >= 0; i--) {
      const p = this._puffs[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        this._group.remove(p.mesh); p.mesh.material.dispose();
        this._puffs.splice(i, 1);
        continue;
      }
      p.mesh.position.y += p.vy * dt;
      p.mesh.scale.multiplyScalar(1 + p.grow * dt * 0.4);
      p.mesh.material.opacity = 0.30 * (1 - k * k);
    }
  }


  // ————— ALOV DİLLƏRİ —————
  _updateFlames(dt) {
    if (!this._flames?.length) return;
    const kam = this.scene?.camera;
    for (let i = this._flames.length - 1; i >= 0; i--) {
      const f = this._flames[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        this._group.remove(f.mesh); f.mesh.material.dispose();
        this._flames.splice(i, 1);
        continue;
      }
      f.mesh.position.y += f.vy * dt;
      // billboard: həmişə kameraya baxsın (alov yandan lövhə kimi görünməsin)
      if (kam) f.mesh.rotation.y = Math.atan2(kam.position.x - f.mesh.position.x, kam.position.z - f.mesh.position.z);
      const en = 1 - k * 0.55;
      f.mesh.scale.set(f.mesh.scale.x, f.mesh.scale.y, 1);
      f.mesh.material.opacity = 0.85 * (1 - k * k) * (0.75 + Math.sin(this._t * 17 + f.faz) * 0.25);
      f.mesh.scale.x = Math.max(0.05, f.mesh.scale.x * (1 - dt * 0.5)) * (0.98 + en * 0.02);
    }
  }

  _updatePatches(dt) {
    this._t = (this._t || 0) + dt;
    this._updateFlames(dt);
    for (let i = this._patches.length - 1; i >= 0; i--) {
      const p = this._patches[i];
      p.life -= dt;
      const k = Math.max(0, p.life / p.max);
      // XƏTA İDİ: setScalar bərabər miqyas verirdi və uzunsov iz KVADRATA
      // çevrilirdi (ölçüldü: 1.1×1.1). İndi baza ölçüsü saxlanılır, yalnız
      // yayılma əmsalı vurulur.
      // CANLI TİTRƏYİŞ: sabit ləkə "stiker" kimi görünürdü. Alov titrəyir,
      // duman yavaş dalğalanır, buz sabit qalır.
      const bazaOp = this.data?.trail?.blind ? 0.5 : p.look === 'fire' ? 0.62 : 0.42;
      const titrə = p.look === 'fire'
        ? 0.78 + Math.sin(this._t * 13 + p.faz) * 0.22
        : p.look === 'cloud' ? 0.9 + Math.sin(this._t * 2.4 + p.faz) * 0.1 : 1;
      p.mesh.material.opacity = k * bazaOp * titrə;
      const spread = 1 + (1 - k) * 0.35;
      const nəbz = p.look === 'fire' ? 1 + Math.sin(this._t * 9 + p.faz) * 0.05 : 1;
      p.mesh.scale.set(p.sx * spread * nəbz, p.sy * spread * nəbz, 1);
      if (p.köz) {
        // Köz ləkəsi sönmür, tədricən qaralır — "yanmış yer" hissi
        p.köz.material.opacity = Math.min(0.55, k * 0.75 + 0.12);
        p.köz.scale.set(p.sx * 1.12 * spread, p.sy * 1.12 * spread, 1);
      }
      if (p.life <= 0) {
        this._group.remove(p.mesh);
        p.mesh.material.dispose();
        if (p.köz) { this._group.remove(p.köz); p.köz.material.dispose(); }
        this._patches.splice(i, 1);
        continue;
      }
      // Başqa maşın izin üstündən keçirsə — sürüşür
      for (const o of this.scene?.cars || []) {
        if (o === this.car) continue;
        if (o.shieldTimer > 0 || (o._sigGrip || 0) > 0) continue;
        const d = Math.hypot(o.position.x - p.x, o.position.z - p.z);
        if (d < p.r * p.mesh.scale.x + 1.2) {
          o.slipTimer = Math.max(o.slipTimer, p.slip);
        }
      }
    }
  }

  dispose() {
    for (const p of this._patches) {
      p.mesh.material.dispose();
      if (p.köz) p.köz.material.dispose();
    }
    this._patches.length = 0;
    for (const f of this._flames || []) f.mesh.material.dispose();
    if (this._flames) this._flames.length = 0;
    this._group.parent?.remove(this._group);
  }
}
