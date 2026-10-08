import * as THREE from 'three';
import { TUNING } from '../data/balance.js';
import { applyLegendaryFx, LEGENDARY_SET, makeUnderglow } from '../core/LegendaryFx.js';
import { applyPaintPattern } from '../core/PaintPatterns.js';

const tmpF = new THREE.Vector3();
const tmpR = new THREE.Vector3();

// Kenney GLB modeli + arcade drift fizikası.
// forward = (sin h, 0, cos h);  right = (-cos h, 0, sin h)
export class Car {
  constructor(carData, library, { isPlayer = false, legacyFeel = false } = {}) {
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
    // Sürüş modeli. Standart: arcade-drift (TUNING.feel2, bax _driveV2) — yarış və zen.
    // `legacyFeel` → köhnə model: arena və futbol hələ onunla tənzimlənib.
    this.feel = legacyFeel ? null : TUNING.feel2;
    // Maşına məxsus v2 əmsalları (statlardan) — bax TUNING.feel2 "MAŞIN ŞƏXSİYYƏTİ"
    const F2 = TUNING.feel2;
    this.tau = F2.tauMax - (s.accel / 100) * F2.tauRange;
    this.grip2 = F2.gripMin + (s.grip / 100) * F2.gripRange;
    this.driftGrip2 = F2.driftGrip + ((s.grip - 70) / 30) * F2.driftGripPer;
    this.cornerScrub2 = F2.cornerScrub - ((s.grip - 70) / 100) * F2.scrubPerGrip;
    this.brake2 = F2.brake - ((s.armor ?? 55) - 55) * F2.brakePerArmor;
    this.offRoadCut2 = carData.class === 'Offroad' ? F2.offRoadCutOffroad : F2.offRoadCut;
    if (!legacyFeel) {
      this.turnRate *= 1 + ((s.handling - 76) / 100) * F2.turnSpread;
      this.maxSpeed = F2.speedPivot + (s.topSpeed - 82) * F2.speedPer;
    }
    this._stats = s;
    this.driftT = 0;       // cari driftin müddəti (s)
    this.driftBoostT = 0;  // drift çıxışı təkanının qalan vaxtı (s)

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
    // Zərbə silkələnməsi (yay): əyilməyə əlavə olunur
    this._jLean = 0; this._jLeanV = 0;
    this._jPitch = 0; this._jPitchV = 0;

    // Model
    const cos = carData.cosmetics || null; // {paint, rim, flame, smoke, fx} dəyərləri
    // Əfsanəvi skin öz rəngini gətirir və adi boyanı üstələyir
    const baseHex = cos?.fx?.hex ?? cos?.paint ?? carData.tint ?? null;
    // Disk rəngi teksturada dəyişdirilir (rezin toxunulmaz qalır) — bax applyRim
    const inst = library.instantiate(carData.model, baseHex, cos?.rim ?? null, carData.kit ?? null, !!cos?.skin);
    this.wheelRadius = inst.wheelRadius;
    this.wheels = inst.wheels;
    // Drift tüstüsü artıq satılmır — həmişə maşının öz rəngindədir (uyğun görünür)
    this.smokeColor = carData.tint ?? carData.bodyColor ?? null;

    // ————— ƏFSANƏVİ ÖRTÜK (şeyder naxışı — bax LegendaryFx.js) —————
    this._fx = applyLegendaryFx(inst.root, cos?.fx?.kind);
    // Əfsanəvi dəst: drift tüstüsü də örtüyün rəngindədir (bax LEGENDARY_SET)
    if (this._fx && LEGENDARY_SET[this._fx.kind]) this.smokeColor = LEGENDARY_SET[this._fx.kind].smoke;
    // Mağaza: yer işığı və iz (əfsanəvi örtük yoxdursa — onun öz dəsti var)
    if (!this._fx && cos?.glow) this._glowFx = makeUnderglow(inst.root, cos.glow.hex, cos.glow.rainbow);
    if (!this._fx && cos?.trail) this._trail = cos.trail;
    // Naxışlı skin (boya dizaynı — animasiya yoxdur)
    if (cos?.skin) applyPaintPattern(inst.root, cos.skin);
    this.steerPivots = inst.steerPivots;

    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.tilt.add(inst.root);
    this.root.add(this.tilt);
    this._model = inst.root;   // yalnız maşının öz gövdəsi (alov/qalxan daxil deyil) — bax setGhost

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

  // ————— SÜRÜŞ MODELİ v2 —————
  // Qaz, süzmə, əyləc, döngə itkisi, yoldan kənar, drift və drift çıxışı təkanı.
  // Yeni irəli sürəti qaytarır, yan sürəti `this._vR2`-yə yazır.
  //
  // Köhnə modeldən əsas fərq: yan sürət ENERJİ İTİRMƏDƏN düzlənir — sürət
  // REJİMƏ MƏXSUS SÜRÜŞ TƏNZİMİ: v2 modelinin əmsallarını bu maşın üçün dəyişir (zen — sərbəst,
  // rahat drift; bax EndlessScene ZEN_FEEL). Yarışın TUNING.feel2-si toxunulmaz qalır.
  tuneFeel(mod) {
    if (!this.feel) return;
    const F2 = (this.feel = { ...TUNING.feel2, ...mod });
    const s = this._stats;
    this.tau = F2.tauMax - (s.accel / 100) * F2.tauRange;
    this.grip2 = F2.gripMin + (s.grip / 100) * F2.gripRange;
    this.brake2 = F2.brake - ((s.armor ?? 55) - 55) * F2.brakePerArmor;
    this.driftGrip2 = F2.driftGrip + ((s.grip - 70) / 30) * F2.driftGripPer;
    this.cornerScrub2 = F2.cornerScrub - ((s.grip - 70) / 100) * F2.scrubPerGrip;
    this.offRoadCut2 = this.data?.class === 'Offroad' ? Math.min(F2.offRoadCutOffroad, F2.offRoadCut) : F2.offRoadCut;
  }

  // vektoru burun istiqamətinə doğru fırlanır, uzunluğu dəyişmir. Köhnədə yan
  // sürət sadəcə sönürdü, ona görə drift sürəti yeyirdi və "yana fırlanma" olurdu.
  _driveV2(dt, drive, vF, vR, vMaxBase, sigPow, boosting, drifting) {
    const F = this.feel;
    const th = drive.throttle;
    this.driftBoostT = Math.max(0, this.driftBoostT - dt);

    // Drift çıxışı: kifayət qədər uzun driftdən sonra qısa təkan
    if (drifting) {
      if (Math.abs(drive.steer) > 0.2) this.driftT += dt;
    } else if (this.driftT > 0) {
      if (this.driftT >= F.boostMin && th > 0) {
        this.driftBoostT = Math.min(F.boostMax, 0.3 + this.driftT * 0.45);
      }
      this.driftT = 0;
    }

    // 1) Yan tutum: sürüşmə bucağı β = atan2(vR, vF) eksponensial sönür
    let g = drifting ? this.driftGrip2 : this.grip2;
    if (this.slipTimer > 0) g = 0.4;                 // yağ: demək olar tutum yoxdur
    else if (this._sigGrip > 0) g = Math.max(g, 14); // "mükəmməl tutum" imza gücü: demək olar sürüşmür
    // Buz ləkəsi: yan tutum kəskin düşür — maşın getdiyi istiqamətdə sürüşür (imza tutumu xilas edir)
    if (this._iceT > 0 && this._sigGrip <= 0) g = Math.min(g, 0.9);
    let S = Math.hypot(vF, vR);
    if (vF > 0.5) {
      const beta = Math.atan2(vR, vF) * Math.exp(-g * dt);
      vF = S * Math.cos(beta);
      vR = S * Math.sin(beta);
    } else {
      vR *= Math.exp(-g * dt);                       // dayanıq/geri: sadə sönmə
    }

    // 2) İcazə verilən sürət
    let vAllow = vMaxBase;
    if (this.offRoad > 0 && this._sigOffroad <= 0) vAllow *= 1 - this.offRoadCut2 * this.offRoad;
    if (this.driftBoostT > 0) vAllow *= F.boostSpeed;
    if (drifting) vAllow *= F.driftTarget;
    let tau = this.tau / sigPow;
    if (boosting) tau /= F.nitroAccel;
    if (this.driftBoostT > 0) tau /= F.boostAccel;

    // 3) Uzununa qüvvə. Driftdə idarə olunan kəmiyyət ÜMUMİ sürətdir (S), yoxsa
    //    irəli sürət (vF) — sürüşmə bucağı böyük olanda ikisi fərqlənir.
    let v = drifting ? S : vF;
    if (th > 0) {
      // Oyunçu: qaz sürətlənmə tempini miqyaslayır, hədəf həmişə vAllow-dur.
      // Bot: qaz HƏDƏF sürəti təyin edir (köhnə modeldə az qaz = aşağı tarazlıq
      // sürəti idi və botlar döngədə məhz belə yavaşlayırdı).
      const target = this.isPlayer
        ? vAllow
        : vAllow * Math.min(1, (this.engineForce * th) / (TUNING.car.drag * this.maxSpeed));
      if (v < target) v = Math.min(target, v + ((target * F.overshoot - v) / tau) * (this.isPlayer ? th : 1) * dt);
      else v -= ((v - target) / F.tauDown) * dt;
    } else if (th < 0) {
      if (v > 0.5) v -= this.brake2 * dt;                        // əyləc
      else v += this.engineForce * 0.6 * th * dt;                // geri
    } else {
      v -= v * F.coast * dt;                                     // süzmə
      if (v > vAllow) v -= ((v - vAllow) / F.tauDown) * dt;
    }
    // Döngədə sürət itkisi (driftdə YOX — drift məhz bundan qaçmağın yoludur)
    // "Mükəmməl tutum" imza gücü aktivdirsə itki YOXDUR — döngə tam sürətlə keçilir.
    // (Yeni modeldə döngə sürətini tutum yox, bu itki müəyyən edir: gücün əvvəlki
    // həyata keçirilməsi burada heç nə qazandırmırdı — ölçüldü: −1.1 m.)
    if (!drifting && v > 0 && this._sigGrip <= 0) {
      const s2 = this._steerSmooth * this._steerSmooth;
      v -= v * (this.cornerScrub2 / this.tau) * s2 * Math.min(v / this.maxSpeed, 1) * dt;
    }

    if (drifting && S > 0.01) {
      const k = Math.max(0, v) / S;
      vF *= k; vR *= k;
    } else {
      vF = v;
    }
    this._vR2 = vR;
    return vF;
  }

  reset(position, heading) {
    this.position.copy(position);
    this.position.y = 0;
    this.heading = heading;
    this.velocity.set(0, 0, 0);
    this.vF = 0;
    this.driftT = 0;
    this.driftBoostT = 0;
    this.wpHint = 0;
    this.root.position.copy(this.position);
    this.root.rotation.y = heading;
  }

  // Kapot kamerası üçün: maşının mərkəzindən `fwd` m irəlidə gövdənin ÜST səthinin hündürlüyü
  // (maşının öz yerinə nisbətən). Kamera bundan aşağı düşə bilməz — tək həcmli gövdədə
  // (mikroavtobus) sabit düsturla kamera kabinanın İÇİNDƏ qalırdı (kadr: cams-mobile, crimson).
  hoodTop(fwd = 0.55) {
    if (this._hoodTop == null) {
      this.root.updateWorldMatrix(true, true);
      const s = Math.sin(this.root.rotation.y), c = Math.cos(this.root.rotation.y);
      const from = new THREE.Vector3(this.root.position.x + s * fwd, this.root.position.y + 8, this.root.position.z + c * fwd);
      const hit = new THREE.Raycaster(from, new THREE.Vector3(0, -1, 0), 0, 12).intersectObject(this._model, true)[0];
      this._hoodTop = hit ? hit.point.y - this.root.position.y : 1.2;
    }
    return this._hoodTop;
  }

  // Əfsanəvi örtüyün canlandırılması (Car.update-dən çağırılır)
  _updateFx(dt) {
    this._fx?.tick(dt);
    this._glowFx?.tick(dt);
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
    this._iceT = Math.max(0, (this._iceT || 0) - dt);   // buz ləkəsi (Buz Zirvəsi)
    this.shieldTimer = Math.max(0, this.shieldTimer - dt);
    // İmza gücü taymerləri (bax race/SignatureAbility.js)
    this._sigPowerT = Math.max(0, (this._sigPowerT || 0) - dt);
    this._sigGrip = Math.max(0, (this._sigGrip || 0) - dt);
    this._sigOffroad = Math.max(0, (this._sigOffroad || 0) - dt);
    this._airT = Math.max(0, (this._airT || 0) - dt);
    const sigPow = this._sigPowerT > 0 ? (this._sigPower || 1) : 1;
    const boosting = this.boostTimer > 0;
    const engine = this.engineForce * (boosting ? TUNING.boost.engineMul : 1) * sigPow;
    const vMax = this.maxSpeed * (boosting ? TUNING.boost.speedMul : 1) * (1 + (sigPow - 1) * 0.55);

    // Mühərrik / əyləc / geri
    const th = drive.throttle;
    const F = this.feel;
    // Drift vəziyyəti (yalnız v2): əl əyləci + kifayət qədər sürət
    const drifting = !!F && drive.handbrake && vF > F.driftMinSpeed;
    if (F) {
      vF = this._driveV2(dt, drive, vF, vR, vMax, sigPow, boosting, drifting);
    } else {
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
    }

    // Raket dəyibsə — güclü yavaşlama + silkələnmə
    if (this.hitTimer > 0) {
      vF *= Math.pow(0.93, dt * 60);
      this.heading += Math.sin(this.hitTimer * 26) * dt * 3.2;
    }

    // Yoldan kənar — TƏDRİCƏN, mülayim yavaşlama (sürünmə yox)
    // "Hər yerdə yol" imza gücü aktivdirsə cəza yoxdur
    if (!F && this.offRoad > 0 && this._sigOffroad <= 0) {
      vF *= Math.pow(1 - TUNING.car.offRoadDamp * this.offRoad, dt * 60);
    }

    // Sürət limiti (v2-də yuxarı hədd _driveV2-də yumşaq tətbiq olunur)
    vF = Math.max(-this.reverseMax, Math.min(F ? vMax * 1.2 : vMax, vF));

    // Yan tutum — əl əyləci arxa təkərləri "buraxır" (drift sürüşməsi)
    let grip = drive.handbrake ? 0.991 : this.latFriction;
    if (this.slipTimer > 0) grip = 0.997; // yağ üstündə demək olar sürüşkən
    // "Mükəmməl tutum" imza gücü — sürüşmə azalır, amma TAM öldürülmür:
    // 0.80-də yan impuls da itirdi və maşın YAVAŞLAYIRDI (ölçüldü: −25 m)
    if (this._sigGrip > 0) grip = Math.min(grip, 0.90);
    if (F) vR = this._vR2;                       // v2: yan sürət _driveV2-də hesablanıb
    else vR *= Math.pow(grip, dt * 60);

    // Sükan — yumşaq ramp: düymə basılanda tədricən artır, buraxılanda cəld mərkəzə qayıdır
    // Qeyd: heading AZALMASI ekranda SAĞA dönmədir (D → sağ)
    const steerTarget = drive.steer * (this.slipTimer > 0 ? 0.4 : 1);
    const returning = Math.abs(steerTarget) < Math.abs(this._steerSmooth) ||
      Math.sign(steerTarget) !== Math.sign(this._steerSmooth || steerTarget);
    const rampRate = returning ? TUNING.car.steerRampOut : TUNING.car.steerRampIn * (drifting ? 1 : (this.steerRampMul ?? 1));
    this._steerSmooth += (steerTarget - this._steerSmooth) * Math.min(1, dt * rampRate);

    // Yüksək sürətdə dönmə həssaslığı azalır (stabil, axıcı idarə)
    const speedRatio = Math.min(Math.abs(vF) / this.maxSpeed, 1);
    const highSpeedDamp = 1 - TUNING.car.highSpeedSteerDamp * speedRatio;
    // Drift zamanı burun daha iti fırlanır
    const driftSteer = F ? (drifting ? F.driftSteer : 1) : (drive.handbrake ? 1.4 : 1);
    // SAKİT SÜKAN (zen): sürətdə dönmə əlavə olaraq yumşalır, aşağı sürətdə (manevr, yola qayıtma)
    // tam qalır. `steerCalm` 0 = yarış davranışı (dəyişmir).
    // Driftdə sükan TAM qalır — sürüşməni idarə etmək üçün (sakit sükan driftin burnunu "kütləşdirirdi").
    const calmK = this.steerCalm && !drifting ? Math.max(0, Math.min(1, (Math.abs(vF) - 12) / 16)) : 0;
    const calm = 1 - (this.steerCalm || 0) * calmK * calmK * (3 - 2 * calmK);
    const steerFactor = Math.min(Math.abs(vF) / 6, 1) * highSpeedDamp * driftSteer * calm;
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
    const near = track.locate ? track.locate(this.position, this.wpHint) : track.getNearest(this.position, this.wpHint);
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
    // Zərbə silkələnməsi: az sönümlü yay — gövdə bir-iki dəfə yırğalanıb dayanır
    this._jLeanV += (-260 * this._jLean - 14 * this._jLeanV) * dt;
    this._jPitchV += (-260 * this._jPitch - 14 * this._jPitchV) * dt;
    this._jLean += this._jLeanV * dt;
    this._jPitch += this._jPitchV * dt;
    this.tilt.rotation.z = this._lean + this._jLean;
    this.tilt.rotation.x = this._pitch + this._jPitch;
  }

  // Zərbədən gövdənin silkələnməsi. (nx, nz) — maneədən maşına doğru normal, s — 0..1 güc.
  jolt(nx, nz, s) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const uzun = nx * fx + nz * fz;    // +1 = zərbə qabaqdan-arxaya itələyir (arxadan vurulub)
    const yan = nx * fz - nz * fx;
    this._jLeanV += yan * (0.6 + 1.6 * s);
    this._jPitchV += -uzun * (0.5 + 1.3 * s);
  }

  // KAMERA ÖRTÜLMƏSİ: maşın kamera ilə oyunçunun arasına girəndə yarı-şəffaf olur.
  // Materiallar bütün maşınlar arasında PAYLAŞILIR, ona görə şəffaflıq üçün bu maşına
  // məxsus nüsxələr (ilk çağırışda, bir dəfə) yaradılır və əsl materiallarla dəyişdirilir.
  setGhost(on) {
    if (!!this._ghost === on) return;
    this._ghost = on;
    if (!this._ghostMats) this._ghostMats = new Map();
    this._model.traverse((o) => {
      if (!o.isMesh) return;
      if (on) {
        o.userData.solidMat = o.material;
        let g = this._ghostMats.get(o.material);
        if (!g) {
          g = o.material.clone();
          g.transparent = true;
          g.opacity = 0.22;
          g.depthWrite = false;
          g.userData = {};            // paylaşılan DEYİL — Car.dispose silir
          this._ghostMats.set(o.material, g);
        }
        o.material = g;
        o.castShadow = false;
      } else if (o.userData.solidMat) {
        o.material = o.userData.solidMat;
        o.castShadow = true;
      }
    });
  }

  get speedKmh() {
    return Math.max(0, Math.round(this.velocity.length() * TUNING.car.kmhFactor));
  }

  get isDrifting() {
    const vR = this.velocity.dot(tmpR.set(-Math.cos(this.heading), 0, Math.sin(this.heading)));
    // v2: drift SÜRÜŞMƏ BUCAĞI ilə təyin olunur (> ~20°). Adi dönmədə bucaq ~16°-dir,
    // real driftdə ~30° — köhnə hədd (yan sürət > 2.2) hər döngədə tüstü və iz verirdi.
    if (this.feel) return Math.abs(this.vF) > 8 && Math.abs(vR) > Math.abs(this.vF) * 0.36;
    return Math.abs(vR) > 2.2 && Math.abs(this.vF) > 8;
  }

  dispose() {
    // Materiallar/geometriyalar ModelLibrary şablonları ilə paylaşılır — burada silinmir
    // (kamera şəffaflığı üçün yaradılmış nüsxələr istisna — onlar bu maşına məxsusdur)
    this.setGhost(false);
    for (const g of this._ghostMats?.values() || []) g.dispose();
    this._ghostMats = null;
    this.root.clear();
  }
}
