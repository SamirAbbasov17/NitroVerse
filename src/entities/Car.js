import * as THREE from 'three';
import { TUNING } from '../data/balance.js';
import { applyLegendaryFx } from '../core/LegendaryFx.js';
import { applyPaintPattern } from '../core/PaintPatterns.js';

const tmpF = new THREE.Vector3();
const tmpR = new THREE.Vector3();

// Kenney GLB modeli + arcade drift fizikası.
// forward = (sin h, 0, cos h);  right = (-cos h, 0, sin h)
export class Car {
  constructor(carData, library, { isPlayer = false } = {}) {
    this.data = carData;
    this.isPlayer = isPlayer;

    const s = carData.stats;
    const T = TUNING.car;
    this.maxSpeed = T.speedMin + (s.topSpeed / 100) * T.speedRange;
    this.engineForce = T.engineMin + (s.accel / 100) * T.engineRange;
    this.brakeForce = T.brakeForce;
    this.reverseMax = T.reverseMax;
    this.turnRate = T.turnMin + (s.handling / 100) * T.turnRange;
    this.latFriction = T.gripMin + (s.grip / 100) * T.gripRange;
    this.drag = T.drag;
    this.driftScrub = T.driftScrub;   // əl əyləcində sürət saxlama (rejim üzrə dəyişir)
    // Zireh: stun müddəti vurucusu — zirehli maşın tez qurtulur (0.73x..1.09x)
    this.stunMul = 1.3 - ((s.armor ?? 50) / 100) * 0.6;

    this.position = new THREE.Vector3();
    this.heading = 0;
    this.velocity = new THREE.Vector3();
    this.vF = 0;

    // proqres keşi (RaceManager oxuyur)
    this.wpHint = 0;
    this.trackT = 0;
    this.lateral = 0;
    this.onRoad = true;
    this.offRoad = 0; // 0..1 — yoldan nə qədər kənardadır (tədricən)

    // Power-up effektləri
    this.boostTimer = 0;   // nitro
    this.hitTimer = 0;     // raket dəyib
    this.slipTimer = 0;    // yağ ləkəsi
    this.shieldTimer = 0;  // qalxan (raket/yağ/şimşəkdən qoruyur)

    this._spin = 0;
    this._steerVis = 0;
    this._steerSmooth = 0; // yumşaldılmış sükan girişi (axıcılıq üçün)
    this._lean = 0;
    this._pitch = 0;

    // Model
    const cos = carData.cosmetics || null; // {paint, rim, flame, smoke, fx} dəyərləri
    // Əfsanəvi skin öz rəngini gətirir və adi boyanı üstələyir
    const baseHex = cos?.fx?.hex ?? cos?.paint ?? carData.tint ?? null;
    // Disk rəngi teksturada dəyişdirilir (rezin toxunulmaz qalır) — bax applyRim
    const inst = library.instantiate(carData.model, baseHex, cos?.rim ?? null, carData.kit ?? null);
    this.wheelRadius = inst.wheelRadius;
    this.wheels = inst.wheels;
    // Drift tüstüsü artıq satılmır — həmişə maşının öz rəngindədir (uyğun görünür)
    this.smokeColor = carData.tint ?? carData.bodyColor ?? null;

    // ————— ƏFSANƏVİ ÖRTÜK (şeyder naxışı — bax LegendaryFx.js) —————
    this._fx = applyLegendaryFx(inst.root, cos?.fx?.kind);
    // Naxışlı skin (boya dizaynı — animasiya yoxdur)
    if (cos?.skin) applyPaintPattern(inst.root, cos.skin);
    this.steerPivots = inst.steerPivots;

    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.tilt.add(inst.root);
    this.root.add(this.tilt);

    // ————— NİTRO ALOVU —————
    // İki egzozdan arxaya uzanan alov: içəridə ağ-isti nüvə, üstündə rəngli
    // örtük, ucunda yumşaq işıq. Additive qarışdırma ilə gecə də seçilir.
    this._flameSpec = cos?.flame ?? { hex: 0x6fd2ff, rainbow: false };
    this._flames = new THREE.Group();
    this._flameParts = [];
    const fCol = new THREE.Color(this._flameSpec.hex);
    // Maşın 4.4 m-ə normallaşdırılıb → arxa bufer ≈ z −2.1. Alov bufer ağzından
    // başlayır və arxaya uzanır (əvvəl havada, gövdədən 1 m aralıda dururdu).
    for (const sx of [-0.36, 0.36]) {
      const shell = new THREE.Mesh(new THREE.ConeGeometry(0.30, 1.15, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color: fCol.clone(), transparent: true, opacity: 0.42,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }));
      shell.rotation.x = -Math.PI / 2; // uc arxaya (−Z)
      shell.position.set(sx, 0.40, -2.3);
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.8, 8, 1, true),
        new THREE.MeshBasicMaterial({
          color: fCol.clone().lerp(new THREE.Color(0xffffff), 0.20), transparent: true,
          opacity: 0.52, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }));
      core.rotation.x = -Math.PI / 2;
      core.position.set(sx, 0.40, -2.16);
      this._flames.add(shell, core);
      this._flameParts.push({ shell, core, ph: Math.random() * 6.28 });
    }
    // Egzoz ağzındakı yumşaq işıq topası
    this._flameGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 10, 8),
      new THREE.MeshBasicMaterial({
        color: fCol.clone(), transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this._flameGlow.scale.set(2.1, 0.85, 1.2);
    this._flameGlow.position.set(0, 0.42, -2.05);
    this._flames.add(this._flameGlow);
    this._flames.visible = false;
    this.tilt.add(this._flames);

    // Qalxan qabarcığı
    this._shield = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 16, 12),
      new THREE.MeshStandardMaterial({
        color: 0x37b8ff, emissive: 0x1e7fd6, emissiveIntensity: 0.55,
        transparent: true, opacity: 0.22, roughness: 0.2, depthWrite: false,
      })
    );
    this._shield.position.y = 1.0;
    this._shield.visible = false;
    this.root.add(this._shield);
  }

  reset(position, heading) {
    this.position.copy(position);
    this.position.y = 0;
    this.heading = heading;
    this.velocity.set(0, 0, 0);
    this.vF = 0;
    this.wpHint = 0;
    this.root.position.copy(this.position);
    this.root.rotation.y = heading;
  }

  // Əfsanəvi örtüyün canlandırılması (Car.update-dən çağırılır)
  _updateFx(dt) {
    this._fx?.tick(dt);
  }

  update(dt, drive, track) {
    this._updateFx(dt);
    const h = this.heading;
    const fdir = tmpF.set(Math.sin(h), 0, Math.cos(h));
    const rdir = tmpR.set(-Math.cos(h), 0, Math.sin(h));

    let vF = this.velocity.dot(fdir);
    let vR = this.velocity.dot(rdir);

    // Power-up taymerləri
    this.boostTimer = Math.max(0, this.boostTimer - dt);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.slipTimer = Math.max(0, this.slipTimer - dt);
    this.shieldTimer = Math.max(0, this.shieldTimer - dt);
    // İmza gücü taymerləri (bax race/SignatureAbility.js)
    this._sigPowerT = Math.max(0, (this._sigPowerT || 0) - dt);
    this._sigGrip = Math.max(0, (this._sigGrip || 0) - dt);
    this._sigOffroad = Math.max(0, (this._sigOffroad || 0) - dt);
    const sigPow = this._sigPowerT > 0 ? (this._sigPower || 1) : 1;
    const boosting = this.boostTimer > 0;
    const engine = this.engineForce * (boosting ? TUNING.boost.engineMul : 1) * sigPow;
    const vMax = this.maxSpeed * (boosting ? TUNING.boost.speedMul : 1) * (1 + (sigPow - 1) * 0.55);

    // Mühərrik / əyləc / geri
    const th = drive.throttle;
    if (th > 0) {
      vF += engine * th * dt;
    } else if (th < 0) {
      if (vF > 0.5) vF -= this.brakeForce * dt;         // əyləc
      else vF += engine * 0.6 * th * dt;                // geri
    }
    // Əl əyləci = DRİFT: yarışda sürət çox az itir (əyləc deyil, sürüşmə).
    // Arenada bu dəyər aşağıdır — kiçik meydanda driftdən sonra tam sürətlə
    // uçmaq idarəni öldürürdü (bax TUNING.arena).
    if (drive.handbrake) vF *= Math.pow(this.driftScrub, dt * 60);

    // Sürtünmə
    vF -= vF * this.drag * dt;

    // Raket dəyibsə — güclü yavaşlama + silkələnmə
    if (this.hitTimer > 0) {
      vF *= Math.pow(0.93, dt * 60);
      this.heading += Math.sin(this.hitTimer * 26) * dt * 3.2;
    }

    // Yoldan kənar — TƏDRİCƏN, mülayim yavaşlama (sürünmə yox)
    // "Hər yerdə yol" imza gücü aktivdirsə cəza yoxdur
    if (this.offRoad > 0 && this._sigOffroad <= 0) {
      vF *= Math.pow(1 - TUNING.car.offRoadDamp * this.offRoad, dt * 60);
    }

    // Sürət limiti
    vF = Math.max(-this.reverseMax, Math.min(vMax, vF));

    // Yan tutum — əl əyləci arxa təkərləri "buraxır" (drift sürüşməsi)
    let grip = drive.handbrake ? 0.991 : this.latFriction;
    if (this.slipTimer > 0) grip = 0.997; // yağ üstündə demək olar sürüşkən
    // "Mükəmməl tutum" imza gücü — sürüşmə azalır, amma TAM öldürülmür:
    // 0.80-də yan impuls da itirdi və maşın YAVAŞLAYIRDI (ölçüldü: −25 m)
    if (this._sigGrip > 0) grip = Math.min(grip, 0.90);
    vR *= Math.pow(grip, dt * 60);

    // Sükan — yumşaq ramp: düymə basılanda tədricən artır, buraxılanda cəld mərkəzə qayıdır
    // Qeyd: heading AZALMASI ekranda SAĞA dönmədir (D → sağ)
    const steerTarget = drive.steer * (this.slipTimer > 0 ? 0.4 : 1);
    const returning = Math.abs(steerTarget) < Math.abs(this._steerSmooth) ||
      Math.sign(steerTarget) !== Math.sign(this._steerSmooth || steerTarget);
    const rampRate = returning ? TUNING.car.steerRampOut : TUNING.car.steerRampIn;
    this._steerSmooth += (steerTarget - this._steerSmooth) * Math.min(1, dt * rampRate);

    // Yüksək sürətdə dönmə həssaslığı azalır (stabil, axıcı idarə)
    const speedRatio = Math.min(Math.abs(vF) / this.maxSpeed, 1);
    const highSpeedDamp = 1 - TUNING.car.highSpeedSteerDamp * speedRatio;
    // Drift zamanı burun daha iti fırlanır
    const driftSteer = drive.handbrake ? 1.4 : 1;
    const steerFactor = Math.min(Math.abs(vF) / 6, 1) * highSpeedDamp * driftSteer;
    this.heading -= this._steerSmooth * this.turnRate * steerFactor * dt * Math.sign(vF || 1);

    // Stabilizasiya: sükan mərkəzdə olanda yan sürüşmə daha tez sönür
    if (Math.abs(this._steerSmooth) < 0.12) vR *= Math.pow(0.93, dt * 60);

    // Sürəti yenidən qur
    this.velocity.copy(fdir).multiplyScalar(vF).addScaledVector(rdir, vR);
    this.vF = vF;

    // İnteqrasiya
    this.position.addScaledVector(this.velocity, dt);
    this.position.y = 0;

    // DÜNYA SƏRHƏDİ: xəritədən sonsuz uzaqlaşmaq olmaz — səma günbəzinin/yer
    // diskinin kənarı görünməsin (görünməz yumşaq divar)
    const lim = (track.maxRadius || 400) + 120;
    const rd = Math.hypot(this.position.x, this.position.z);
    if (rd > lim) {
      const k = lim / rd;
      this.position.x *= k;
      this.position.z *= k;
      const nx = this.position.x / lim, nz = this.position.z / lim;
      const vOut = this.velocity.x * nx + this.velocity.z * nz;
      if (vOut > 0) { this.velocity.x -= vOut * nx; this.velocity.z -= vOut * nz; }
    }

    // Trek proqresi + yol yoxlaması
    const near = track.getNearest(this.position, this.wpHint);
    this.wpHint = near.index;
    this.trackT = near.t;
    this.lateral = near.lateral;
    this.onRoad = near.onRoad;
    // Yol kənarından nə qədər kənardadır: 0 (yolda) → 1 (5m+ kənarda)
    let excess = Math.max(0, Math.abs(near.lateral) - track.halfWidth);
    // Şaxə yolunun üstündədirsə — yoldadır (yavaşlama yoxdur)
    if (excess > 0 && track.branches?.length && track.isOnBranch(this.position)) {
      excess = 0;
      this.onRoad = true;
    }
    this.offRoad = Math.min(1, excess / 5);

    this._applyVisuals(dt, drive, vR);
  }

  _applyVisuals(dt, drive, vR) {
    this.root.position.copy(this.position);
    this.root.rotation.y = this.heading;

    // Təkər fırlanması
    this._spin += (this.vF * dt) / this.wheelRadius;
    for (const w of this.wheels) w.rotation.x = this._spin;
    // Ön təkər döndərmə (yumşaldılmış sükana bağlı)
    this._steerVis = this._steerSmooth * 0.45;
    for (const p of this.steerPivots) p.rotation.y = -this._steerVis;

    // Nitro alovu — titrəyən uzunluq + qığılcım kimi qeyri-müntəzəm parlaqlıq
    const boosting = this.boostTimer > 0;
    this._flames.visible = boosting;
    if (boosting) {
      this._flameT = (this._flameT || 0) + dt;
      if (this._flameSpec.rainbow) {
        const h = (this._flameT * 0.55) % 1;
        for (const p of this._flameParts) {
          p.shell.material.color.setHSL(h, 1, 0.55);
          p.core.material.color.setHSL(h, 1, 0.85);
        }
        this._flameGlow.material.color.setHSL(h, 1, 0.6);
      }
      for (const p of this._flameParts) {
        const f = 0.75 + Math.abs(Math.sin(this._flameT * 34 + p.ph)) * 0.5 + Math.random() * 0.18;
        p.shell.scale.set(1, f, 1);          // konusun oxu Y-dir (uzunluq)
        p.core.scale.set(1, f * 0.9, 1);
        p.shell.material.opacity = 0.34 + (f - 0.75) * 0.42;
      }
      const g = 0.85 + Math.random() * 0.4;
      this._flameGlow.scale.set(1.9 * g, 0.8 * g, 1.3 * g);
    }

    // Qalxan qabarcığı — pulsasiya
    const shielded = this.shieldTimer > 0;
    this._shield.visible = shielded;
    if (shielded) {
      const p = 1 + Math.sin(this.shieldTimer * 9) * 0.04;
      this._shield.scale.setScalar(p);
      // Son 1.5s-də yanıb-sönür (bitir xəbərdarlığı)
      this._shield.material.opacity = this.shieldTimer < 1.5
        ? 0.1 + Math.abs(Math.sin(this.shieldTimer * 12)) * 0.16
        : 0.22;
    }

    // Gövdə əyilməsi (yan sürüşməyə görə)
    const targetLean = THREE.MathUtils.clamp(-vR * 0.015, -0.12, 0.12);
    this._lean += (targetLean - this._lean) * Math.min(1, dt * 8);
    const targetPitch = THREE.MathUtils.clamp(-drive.throttle * 0.02, -0.03, 0.03);
    this._pitch += (targetPitch - this._pitch) * Math.min(1, dt * 6);
    this.tilt.rotation.z = this._lean;
    this.tilt.rotation.x = this._pitch;
  }

  get speedKmh() {
    return Math.max(0, Math.round(this.velocity.length() * TUNING.car.kmhFactor));
  }

  get isDrifting() {
    const vR = this.velocity.dot(tmpR.set(-Math.cos(this.heading), 0, Math.sin(this.heading)));
    return Math.abs(vR) > 2.2 && Math.abs(this.vF) > 8;
  }

  dispose() {
    // Materiallar/geometriyalar ModelLibrary şablonları ilə paylaşılır — burada silinmir
    this.root.clear();
  }
}
