import * as THREE from 'three';
import { playerCarData } from '../data/playerCar.js';
import { t } from './i18n.js';
import { CARS, getCarById } from '../data/cars.js';
import { Car } from '../entities/Car.js';
import { TUNING } from '../data/balance.js';
import { PlayerController } from '../entities/PlayerController.js';
import { NetworkController } from '../entities/NetworkController.js';
import { SkidMarks } from './SkidMarks.js';
import { disposeObject3D } from './MergeUtils.js';
import { playFinishFx } from './FinishFx.js';
import { Effects } from './Effects.js';
import { SpeedLines } from './SpeedLines.js';
import { TouchControls, isTouchDevice } from './TouchControls.js';
import { audio } from './AudioManager.js';
import { abilityIconCanvas, ABILITY_COLORS } from './ItemAssets.js';
import { auth } from '../net/Auth.js';
import { makeNameTag, makeFloodlight, makeSponsorBoard } from './AssetFactory.js';
import { mergeStaticGroup } from './MergeUtils.js';

// ⚔️ ARENA — battle royale: daralan zona, təsadüfi ability-lər, son qalan qalib.
const ARENA_R = 104;       // platforma radiusu
const HP_MAX = 100;
const ZONE_HOLD = 18;      // ilk daralmaya qədər (s)
const ZONE_END_T = 165;    // bu vaxta minimuma çatır (s)
const ZONE_MIN_R = 18;
const ZONE_DPS = 8;        // zonadan kənarda saniyəlik zərər
const PAD_RESPAWN = 3;     // pad boşalandan neçə saniyə sonra yenisi çıxır
const MISSILE_DMG = 30;
const RAM_DMG = 8;

// Balans: hücum ≫ hərəkət > müdafiə > şəfa.
// 10/6/4/2 → 45% / 27% / 18% / 9%. Raket zərəri 30, can 100 (≈4 vuruş);
// təmir +35 olduğuna görə nadir qalmalıdır, yoxsa heç kim ölmür.
const PICKUP_TYPES = [
  { id: 'missile', icon: '🚀', w: 10 },
  { id: 'nitro', icon: '⚡', w: 6 },
  { id: 'shield', icon: '🛡️', w: 4 },
  { id: 'repair', icon: '➕', w: 2 },
];

export class ArenaScene {
  constructor(config, { input, uiRoot, renderer = null, library, onLeave = null, onQuit, onRestart = null }) {
    this.config = config;
    this.input = input;
    this.uiRoot = uiRoot;
    this.renderer = renderer;
    this.library = library;
    this.onQuit = onQuit;
    this.onLeave = onLeave;
    this.onRestart = onRestart;
    this.online = config.online || null;
    this._state = 'countdown';
    this._time = 0;
    this._playT = 0;
    this._pickupT = 0;
    this._pickupSeq = 0;
    this.pickups = new Map(); // i → {tp, mesh, x, z}
    this.projectiles = [];
    this._elimOrder = []; // tid ölmə sırası ilə

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 900);
    this.scene.add(this.camera);
    this.speedLines = new SpeedLines(this.camera);
    this._camTarget = new THREE.Vector3();
    if (this.renderer) this.renderer.toneMappingExposure = 1.15;

    this._buildArena();
    this._buildArenaProps();
    this._buildCars();
    this._buildHUD();
    this._bindKeys();
    if (this.online) this._setupNet();
    audio.playMusic('race');

    this._cd = 3.2;
    if (this.online) {
      // SİNXRON START: hamının səhnəsi qurulana qədər gözlə
      this._state = 'wait';
      this._waitT = 0;
      if (!this.online.net.isHost) this.online.net.sendEvent({ kind: 'rdy2' });
      else this._checkAllScenesReady();
    }
    if (typeof window !== 'undefined') window.__scene = this;
  }

  // ————— Arena: gecə kolizeyi —————
  _buildArena() {
    this.scene.background = new THREE.Color(0x120a1e);
    this.scene.fog = new THREE.Fog(0x120a1e, 170, 460);
    this.scene.add(new THREE.HemisphereLight(0xd9c4ff, 0x241536, 1.05));
    const sun = new THREE.DirectionalLight(0xffe8d0, 1.15);
    sun.position.set(70, 110, 40);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.38));

    // Döşəmə — cızıqlı beton + neon halqalar (canvas)
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 512;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#3a3244';
    cx.fillRect(0, 0, 512, 512);
    // Cızıq sıxlığı/kontrastı azaldıldı — təkrarlanan teksturada 260 ədəd
    // "zibil" kimi görünürdü
    for (let i = 0; i < 130; i++) {
      cx.strokeStyle = `rgba(${20 + Math.random() * 40 | 0},${15 + Math.random() * 30 | 0},${30 + Math.random() * 40 | 0},0.26)`;
      cx.lineWidth = 1 + Math.random() * 2;
      const x = Math.random() * 512, y = Math.random() * 512, a = Math.random() * 7;
      cx.beginPath(); cx.moveTo(x, y);
      cx.lineTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30); cx.stroke();
    }
    cx.globalAlpha = 1;
    // XƏTA İDİ: 512 px tekstura 208 m-lik arenaya BİR DƏFƏ yayılırdı —
    // 1–2 piksellik cızıqlar yerdə 12 metrlik tünd ləkələrə çevrilirdi
    // (istifadəçi rəyi: "yerdə qəribə ləkələr"). İndi tekstura təkrarlanır,
    // cızıqlar real beton faktura ölçüsündədir.
    const floorTex = new THREE.CanvasTexture(cv);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(9, 9);
    floorTex.anisotropy = 4;
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(ARENA_R, 48),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // NEON ŞƏBƏKƏ: döşəmə ekranın 60%-ni tutur və tamamilə boş görünürdü.
    // Nazik radial + konsentrik xətlər sahəyə miqyas və istiqamət verir
    // (həm estetik, həm oyunçu üçün məsafə hissi). Tək additiv mesh.
    {
      const g = new THREE.BufferGeometry();
      const v = [];
      const R = ARENA_R * 0.99;
      for (let i = 0; i < 24; i++) {            // radial
        const a = (i / 24) * Math.PI * 2;
        v.push(Math.cos(a) * 8, 0.03, Math.sin(a) * 8, Math.cos(a) * R, 0.03, Math.sin(a) * R);
      }
      for (const k of [0.22, 0.44, 0.66, 0.88]) { // konsentrik
        const rr = R * k;
        for (let i = 0; i < 72; i++) {
          const a0 = (i / 72) * Math.PI * 2, a1 = ((i + 1) / 72) * Math.PI * 2;
          v.push(Math.cos(a0) * rr, 0.03, Math.sin(a0) * rr, Math.cos(a1) * rr, 0.03, Math.sin(a1) * rr);
        }
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      const şəbəkə = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
        color: 0x7a5cff, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      this.scene.add(şəbəkə);
    }

    // Neon halqalar teksturadan ÇIXARILDI (təkrarlananda 9 dəfə çıxırdı) —
    // indi ayrıca nazik həndəsədir, ölçüsü arenaya bağlıdır
    for (const [k, col] of [[0.39, 0xb44bff], [0.70, 0xff6b1a], [0.97, 0x37b8ff]]) {
      const rr = ARENA_R * k;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(rr - 0.5, rr + 0.5, 96),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.32,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      this.scene.add(ring);
    }
    const around = new THREE.Mesh(
      new THREE.PlaneGeometry(760, 760),
      new THREE.MeshStandardMaterial({ color: 0x1a1128, roughness: 1 })
    );
    around.rotation.x = -Math.PI / 2;
    around.position.y = -0.06;
    this.scene.add(around);

    // Kolizey divarı + izləyicilər (futboldakı kütlə texturası üslubu)
    const crowdCv = document.createElement('canvas');
    crowdCv.width = 512; crowdCv.height = 40;
    const cg = crowdCv.getContext('2d');
    cg.fillStyle = '#2b1d42'; cg.fillRect(0, 0, 512, 40);
    const cols = ['#ffd34d', '#ff6b6b', '#4fc3ff', '#7dff8a', '#d9a0ff', '#f2f4f8'];
    for (let i = 0; i < 1500; i++) {
      cg.fillStyle = cols[(Math.random() * cols.length) | 0];
      cg.globalAlpha = 0.5 + Math.random() * 0.5;
      cg.fillRect(Math.random() * 512, Math.random() * 37, 1.7, 2.3);
    }
    cg.globalAlpha = 1;
    const crowdTex = new THREE.CanvasTexture(crowdCv);
    crowdTex.colorSpace = THREE.SRGBColorSpace;
    crowdTex.wrapS = THREE.RepeatWrapping;
    crowdTex.repeat.set(16, 1);
    for (let tier = 0; tier < 3; tier++) {
      const r = ARENA_R + 7 + tier * 8;
      const stand = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 5, r, 3.2, 40, 1, true),
        new THREE.MeshStandardMaterial({
          map: crowdTex, emissive: 0x4a3670, emissiveIntensity: 0.5, emissiveMap: crowdTex,
          side: THREE.DoubleSide, roughness: 1,
        })
      );
      stand.position.y = 2.6 + tier * 3.4;
      this.scene.add(stand);
    }
    // Arena divarı (aşağı) + neon üst zolaq
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_R + 1.2, ARENA_R + 1.2, 3.2, 48, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x241736, roughness: 0.6, side: THREE.DoubleSide })
    );
    wall.position.y = 1.6;
    this.scene.add(wall);
    const neon = new THREE.Mesh(
      new THREE.TorusGeometry(ARENA_R + 1.2, 0.35, 6, 64),
      new THREE.MeshStandardMaterial({ color: 0xb44bff, emissive: 0xb44bff, emissiveIntensity: 1.7 })
    );
    neon.rotation.x = Math.PI / 2;
    neon.position.y = 3.3;
    this.scene.add(neon);

    // Sığınacaq sütunları və yeşiklər (örtük obyektləri) — toqquşma dairələri
    this.obstacles = [];
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x4a3a63, flatShading: true, roughness: 0.7 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xb06a2a, flatShading: true, roughness: 0.8 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const rr = 46;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.0, 9, 7), pillarMat);
      p.position.set(Math.cos(a) * rr, 4.5, Math.sin(a) * rr);
      this.scene.add(p);
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(3.2, 3.2, 0.8, 7),
        new THREE.MeshStandardMaterial({ color: 0xff6b1a, emissive: 0xff6b1a, emissiveIntensity: 0.8 })
      );
      cap.position.set(p.position.x, 9.2, p.position.z);
      this.scene.add(cap);
      // NEON ZOLAQ: sütunlar düz tünd silindr idi və arenanın neon dilindən
      // kənarda qalırdı. İki nazik işıqlı halqa siluetə oxunaqlıq verir və
      // qaranlıqda sütunun harada olduğunu uzaqdan göstərir (oyun faydası).
      for (const [hh, kk] of [[2.2, 0.55], [6.4, 0.35]]) {
        const halqa = new THREE.Mesh(
          new THREE.CylinderGeometry(2.95 - hh * 0.06, 2.95 - hh * 0.06, 0.22, 7, 1, true),
          new THREE.MeshBasicMaterial({ color: 0x37b8ff, transparent: true, opacity: kk,
            blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
        );
        halqa.position.set(p.position.x, hh, p.position.z);
        this.scene.add(halqa);
      }
      this.obstacles.push({ x: p.position.x, z: p.position.z, r: 3.4 });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = 24 + (i % 2) * 44;
      const c = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 3.4), crateMat);
      c.position.set(Math.cos(a) * rr, 1.1, Math.sin(a) * rr);
      c.rotation.y = a * 1.7;
      this.scene.add(c);
      this.obstacles.push({ x: c.position.x, z: c.position.z, r: 2.6 });
    }
    // Projektorlar
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(a) * (ARENA_R + 26), z = Math.sin(a) * (ARENA_R + 26);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.8, 30, 6),
        new THREE.MeshStandardMaterial({ color: 0x33244d })
      );
      pole.position.set(x, 15, z);
      this.scene.add(pole);
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(6, 2.4, 1),
        new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xffe8c8, emissiveIntensity: 2.2 })
      );
      lamp.position.set(x * 0.93, 29, z * 0.93);
      lamp.lookAt(0, 0, 0);
      this.scene.add(lamp);
    }
    // Ulduzlar
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = 280 + Math.random() * 170;
      starPos[i * 3] = Math.cos(a) * rr;
      starPos[i * 3 + 1] = 50 + Math.random() * 210;
      starPos[i * 3 + 2] = Math.sin(a) * rr;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.scene.add(new THREE.Points(starGeo,
      new THREE.PointsMaterial({ color: 0xd9cff0, size: 1.3, sizeAttenuation: false, fog: false })));

    // ——— Ability spawn padləri: altıbucaq lövhə + parlaq halqa + işıq sütunu ———
    // Radiuslar döşəmənin neon xətlərindən (≈34/62/85) kənarda seçilib.
    this.pads = [];
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x18102e, emissive: 0x2a1355, emissiveIntensity: 0.6, roughness: 0.5,
    });
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xc09aff, transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    });
    const padCandidates = [[0, 0]];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.25;
      padCandidates.push([Math.cos(a) * 20, Math.sin(a) * 20]);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4 + Math.PI / 6; // sütunların arasında
      padCandidates.push([Math.cos(a) * 44, Math.sin(a) * 44]);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.28;
      padCandidates.push([Math.cos(a) * 72, Math.sin(a) * 72]);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.15 + Math.PI / 7;
      padCandidates.push([Math.cos(a) * 92, Math.sin(a) * 92]);
    }
    for (const [px, pz] of padCandidates) {
      if (this.obstacles.some((o) => Math.hypot(px - o.x, pz - o.z) < o.r + 4)) continue;
      // Altıbucaq lövhə — döşəmədən azca qalxıq, xətləri örtür
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.35, 0.18, 6), plateMat);
      plate.position.set(px, 0.09, pz);
      this.scene.add(plate);
      // Parlaq altıbucaq halqa (additiv — əsl neon parıltısı)
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.75, 2.15, 6),
        new THREE.MeshBasicMaterial({
          color: 0x9a5cff, transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(px, 0.2, pz);
      this.scene.add(ring);
      // Yumru parıltı halosu — yalnız pad dolu olanda yanır (düzbucaq şüa yox)
      const beam = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._padGlowTex(), color: 0xb489ff, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      beam.scale.set(5.4, 5.4, 1);
      beam.position.set(px, 2.1, pz);
      beam.visible = false;
      this.scene.add(beam);
      // GÖYDƏN DÜŞƏN ŞÜA: yumşaq kənarlı billboard sütun, ability rəngində
      const shaft = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._padShaftTex(), color: 0xb489ff, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      shaft.scale.set(5.6, 17, 1);
      shaft.position.set(px, 8.5, pz);
      shaft.visible = false;
      this.scene.add(shaft);
      this.pads.push({ x: px, z: pz, ring, beam, shaft, phase: Math.random() * Math.PI * 2 });
    }

    // Daralan zona vizualı: qırmızı şəffaf divar + döşəmə halqası
    this.safeR = ARENA_R;
    this.zoneWall = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 11, 48, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff3344, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    this.zoneWall.position.y = 5.5;
    this.scene.add(this.zoneWall);
    this.zoneRing = new THREE.Mesh(
      new THREE.RingGeometry(0.975, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0xff3344, side: THREE.DoubleSide, depthWrite: false })
    );
    this.zoneRing.rotation.x = -Math.PI / 2;
    this.zoneRing.position.y = 0.12;
    this.scene.add(this.zoneRing);
  }

  // ————— Maşınlar —————
  // Kolizey qurğuları: divar boyu reklam lövhələri + projektor qüllələri.
  // Hamısı ARENA_R-dən kənarda → oyuna qarışmır, toqquşma lazım deyil.
  _buildArenaProps() {
    const g = new THREE.Group();
    const cols = [0xb44bff, 0xff6b1a, 0x37b8ff, 0x22a06b, 0xe0342c];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const b = makeSponsorBoard(9, cols[i % cols.length]);
      b.position.set(Math.cos(a) * (ARENA_R + 3.4), 0, Math.sin(a) * (ARENA_R + 3.4));
      b.rotation.y = -a + Math.PI / 2;
      g.add(b);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      const fl = makeFloodlight(20, true);
      fl.position.set(Math.cos(a) * (ARENA_R + 24), 0, Math.sin(a) * (ARENA_R + 24));
      fl.rotation.y = -a + Math.PI;
      g.add(fl);
    }
    const merged = mergeStaticGroup(g);
    g.traverse((o) => o.geometry?.dispose?.());
    this.scene.add(merged);
  }

  _buildCars() {
    this.cars = [];
    this.racers = [];
    const pool = [...CARS];
    const seats = [];
    if (this.online) {
      for (const pl of this.online.players) {
        seats.push({ tid: pl.id, netId: pl.id, name: pl.name, carId: pl.carId || 'blaze',
          isLocal: pl.id === this.online.net.selfId, isBot: false });
      }
    } else {
      seats.push({ tid: 'me', netId: null, name: 'Sən', carId: this.config.carId, isLocal: true, isBot: false });
    }
    let bi = 0;
    while (seats.length < 6) {
      seats.push({ tid: 'b' + bi, name: 'Bot ' + (bi + 1), carId: pool[(bi * 2 + 3) % pool.length].id, isBot: true, botIdx: bi });
      bi++;
    }
    this._simBots = !this.online || this.online.net.isHost;

    seats.forEach((seat, i) => {
      const data = seat.isLocal ? playerCarData(seat.carId) : getCarById(seat.carId);
      if (seat.isLocal) this._playerData = data;   // finiş animasiyası üçün
      const car = new Car(data, this.library, { isPlayer: !!seat.isLocal });
      // ARENA İDARƏ PROFİLİ — hamıya eyni (bax TUNING.arena)
      {
        const A = TUNING.arena;
        car.turnRate *= A.turnMul;
        car.latFriction = Math.min(car.latFriction, A.gripCap);
        car.driftScrub = A.driftScrub;
        car.maxSpeed *= A.speedMul;
      }
      car.isRemote = (!seat.isLocal && !seat.isBot) || (seat.isBot && !this._simBots);
      car.hp = HP_MAX;
      car.alive = true;
      car._shieldT = 0;
      car._ramCd = 0;
      this.scene.add(car.root);
      // Başlanğıc: dairə boyu bərabər
      const a = (i / seats.length) * Math.PI * 2;
      const pos = new THREE.Vector3(Math.cos(a) * (ARENA_R - 16), 0, Math.sin(a) * (ARENA_R - 16));
      car.reset(pos, Math.atan2(-pos.x, -pos.z)); // mərkəzə baxsın
      if (!seat.isLocal) {
        const tag = makeNameTag(seat.name);
        car.root.add(tag);
      }
      let ctrl = null;
      if (seat.isLocal) {
        ctrl = new PlayerController(car, this.input);
        this.playerCar = car;
      } else if (car.isRemote) {
        ctrl = new NetworkController(car);
      }
      this.cars.push(car);
      this.racers.push({ ...seat, car, controller: ctrl, item: null, _wanderT: 0, _wander: null });
    });
    if (!this.playerCar) this.playerCar = this.cars[0];
    this.skids = new SkidMarks(this.scene);
    this.effects = new Effects(this.scene);
  }

  // ————— HUD —————
  _buildHUD() {
    this.uiRoot.innerHTML = `
      <div class="ahud">
        <div class="ahud__top">
          <span class="ahud__alive" id="ah-alive">👥 6</span>
          <span class="ahud__zone" id="ah-zone">⭕ zona sabitdir</span>
        </div>
        <div class="ahud__hp"><i id="ah-hpfill"></i></div>
        <div class="ahud__item" id="ah-item">boş</div>
        <div class="ahud__spec" id="ah-spec"></div>
        <div class="ahud__danger" id="ah-danger"></div>
        <div class="fhud__toast" id="ah-toast"></div>
        <div id="ah-overlay"></div>
      </div>`;
    this._el = {
      alive: this.uiRoot.querySelector('#ah-alive'),
      zone: this.uiRoot.querySelector('#ah-zone'),
      hp: this.uiRoot.querySelector('#ah-hpfill'),
      item: this.uiRoot.querySelector('#ah-item'),
      danger: this.uiRoot.querySelector('#ah-danger'),
      toast: this.uiRoot.querySelector('#ah-toast'),
      overlay: this.uiRoot.querySelector('#ah-overlay'),
    };
    this._setHP(HP_MAX);
    if (isTouchDevice()) {
      this.touchControls = new TouchControls(this.uiRoot, this.input, {
        onPause: () => this._togglePause(),
        onUse: () => this._useItem(),
      });
      this._syncTouchItem();
    }
  }

  _syncTouchItem() {
    if (!this.touchControls) return;
    const me = this.racers.find((r) => r.isLocal);
    const it = me?.item ? PICKUP_TYPES.find((t) => t.id === me.item) : null;
    this.touchControls.setItems(it ? { id: it.id, icon: it.icon, name: it.id } : null, null);
    for (const sel of ['[data-t="x"]', '[data-t="swap"]', '[data-t="rescue"]', '[data-t="back"]']) {
      const b = this.uiRoot.querySelector(sel);
      if (b) b.style.display = 'none';
    }
  }

  _setHP(hp) {
    const t = Math.max(0, hp) / HP_MAX;
    this._el.hp.style.width = (t * 100).toFixed(0) + '%';
    this._el.hp.style.background = t > 0.55 ? '#43d17c' : t > 0.28 ? '#ffb347' : '#ff5252';
  }

  _toast(t) {
    this._el.toast.textContent = t;
    this._el.toast.classList.add('is-on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this._el.toast.classList.remove('is-on'), 2100);
  }

  _bindKeys() {
    this.input.bind('Escape', () => this._togglePause());
    this.input.bind('KeyE', () => this._useItem());
    this.input.bind('ShiftLeft', () => this._useItem());
  }

  _togglePause() {
    if (this._state === 'done') return;
    if (this._state === 'paused') {
      this._state = this._pausedFrom || 'play';
      this._el.overlay.innerHTML = '';
      this.touchControls?.setVisible(true);
      audio.setPaused(false);
      return;
    }
    this._pausedFrom = this._state;
    this._state = 'paused';
    audio.setPaused(true);
    this.touchControls?.setVisible(false);
    this._el.overlay.innerHTML = `
      <div class="pause">
        <div class="screen__heading">Pauza</div>
        <div class="btn-row">
          <button class="btn btn--primary" data-resume>${t('pause.resume')}</button>
          ${this.online ? `<button class="btn" data-lobby>${t('pause.backRoom')}</button>` : ''}
          <button class="btn btn--ghost" data-quit>${this.online ? 'Otaqdan çıx' : 'Menyu'}</button>
        </div>
      </div>`;
    this._el.overlay.querySelector('[data-resume]').onclick = () => this._togglePause();
    const plb = this._el.overlay.querySelector('[data-lobby]');
    if (plb) plb.onclick = () => this.onQuit?.(); // onlaynda onQuit = lobbiyə qayıdış
    this._el.overlay.querySelector('[data-quit]').onclick = () =>
      (this.online && this.onLeave ? this.onLeave() : this.onQuit?.());
  }

  // ————— Item istifadəsi —————
  _useItem() {
    const me = this.racers.find((r) => r.isLocal);
    if (this._state !== 'play' || !me?.item || !me.car.alive) return;
    this._applyItem(me);
  }

  _applyItem(r) {
    const it = r.item;
    r.item = null;
    if (r.isLocal) { this._el.item.textContent = 'boş'; this._syncTouchItem(); }
    this._applyEffect(it, r);
  }

  // Effekti r.item-ə toxunmadan tətbiq et (ani pickup-lar üçün də)
  _applyEffect(it, r) {
    if (it === 'missile') this._fireMissile(r);
    else if (it === 'nitro') { r.car.boostTimer = 1.6; if (r.isLocal) audio.sfx('boost'); }
    else if (it === 'shield') {
      r.car._shieldT = 4;
      r.car.shieldTimer = 4;
      this.effects.spawnRangeRing(r.car.position, 4, 0x4fc3ff);
      if (r.isLocal) audio.sfx('shield');
    }
    else if (it === 'repair') {
      r.car.hp = Math.min(HP_MAX, r.car.hp + 35);
      if (r.isLocal) this._setHP(r.car.hp);
      this.effects.spawnSparkle(r.car.position, 0x7dff8a);
      this._sendHp(r);
    }
  }

  _fireMissile(r) {
    const c = r.car;
    // HƏDƏF SEÇİMİ (istifadəçi istəyi): oyunçu üçün KAMERADA GÖRÜNƏN hədəf —
    // ekranda olan düşmənlərdən nişana (ekran mərkəzinə) ən yaxını.
    // Kamerada heç kim yoxdursa → ümumi ən yaxın. Botlar üçün köhnə
    // qabaq-konus məntiqi qalır (botun kamerası yoxdur).
    let best = null;
    if (r.isLocal && this.camera) {
      this._msTmp = this._msTmp || new THREE.Vector3();
      this._msDir = this._msDir || new THREE.Vector3();
      this.camera.getWorldDirection(this._msDir);
      let bestScore = Infinity;
      for (const o of this.racers) {
        if (o === r || !o.car.alive) continue;
        const p = o.car.position;
        const d = Math.hypot(p.x - c.position.x, p.z - c.position.z);
        if (d > 110) continue;
        this._msTmp.set(p.x - this.camera.position.x, 0.8, p.z - this.camera.position.z);
        if (this._msTmp.dot(this._msDir) <= 2) continue;   // kameranın arxasında
        this._msTmp.set(p.x, (p.y || 0) + 0.8, p.z).project(this.camera);
        if (Math.abs(this._msTmp.x) > 1 || Math.abs(this._msTmp.y) > 1) continue; // ekrandan kənar
        // Nişan xalı: ekran mərkəzinə yaxınlıq əsas, məsafə köməkçi
        const score = Math.hypot(this._msTmp.x, this._msTmp.y * 0.6) + d * 0.004;
        if (score < bestScore) { bestScore = score; best = o; }
      }
    }
    if (!best) {
      const KONUS = Math.cos(55 * Math.PI / 180);
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      let qabaq = null, qabaqD = 95, hər = null, hərD = 60;
      for (const o of this.racers) {
        if (o === r || !o.car.alive) continue;
        const dx = o.car.position.x - c.position.x;
        const dz = o.car.position.z - c.position.z;
        const d = Math.hypot(dx, dz);
        if (d < hərD) { hər = o; hərD = d; }
        if (d < 0.001) continue;
        const istiqamət = (dx * fx + dz * fz) / d;   // 1 = düz qabaqda
        if (istiqamət >= KONUS && d < qabaqD) { qabaq = o; qabaqD = d; }
      }
      best = qabaq || hər;
    }
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xff6b1a, emissive: 0xff8438, emissiveIntensity: 1.6 })
    );
    mesh.position.set(c.position.x, 1.1, c.position.z);
    this.scene.add(mesh);
    this.projectiles.push({
      mesh, owner: r,
      vx: Math.sin(c.heading) * 56, vz: Math.cos(c.heading) * 56,
      target: best, life: 2.4,
    });
    if (r.isLocal || (!this.online && r.isBot)) audio.sfx('missile');
  }

  // ————— Zərər —————
  _damage(r, amount, silent = false, by = null) {
    const c = r.car;
    if (!c.alive || this._state !== 'play') return;
    if (c._shieldT > 0) return; // qalxan uddu
    if (by) c._lastBy = by; // kill feed üçün son vuran
    c.hp -= amount;
    if (r.isLocal) {
      this._setHP(c.hp);
      audio.sfx('tick');
    }
    if (c.hp <= 0) { this._eliminate(r); return; }
    if (!silent) this._sendHp(r);
  }

  _sendHp(r) {
    if (!this.online) return;
    // Yalnız öz simulyasiyamızda olan maşınların hp-sini yayımlayırıq
    if (r.isLocal || (r.isBot && this._simBots)) {
      this.online.net.sendEvent({ kind: 'ahp', tid: r.tid, hp: Math.round(r.car.hp) });
    }
  }

  _eliminate(r, broadcast = true) {
    const c = r.car;
    if (!c.alive) return;
    c.alive = false;
    c.hp = 0;
    this.effects.spawnExplosion(new THREE.Vector3(c.position.x, 1, c.position.z));
    if (c.position.distanceTo(this.playerCar.position) < 100) audio.sfx('explosion');
    c.root.visible = false;
    this._elimOrder.push(r.tid);
    const by = r.car._lastBy;
    // MƏNTIQ (istifadəçi rəyi): 2-ci olub öləndə matç ELƏ HƏMİN AN bitir —
    // "tamaşa edirsən" yazıb dərhal nəticə göstərmək mənasız idi. Tamaşa
    // rejimi yalnız matç doğrudan davam edəndə (≥2 sağ) açılır.
    const davamEdir = this._aliveList().length >= 2;
    this._toast(r.isLocal
      ? (davamEdir
        ? (by ? `☠️ ${by} səni vurdu — tamaşa edirsən` : '☠️ Elendin — tamaşa edirsən')
        : (by ? `☠️ ${by} səni vurdu` : '☠️ Elendin'))
      : (by === 'zona' ? `☠️ ${r.name} zonada yandı`
        : by ? `☠️ ${by} → ${r.name}` : `☠️ ${r.name} elendi`));
    if (broadcast && this.online && (r.isLocal || (r.isBot && this._simBots))) {
      this.online.net.sendEvent({ kind: 'adead', tid: r.tid, by: r.car._lastBy || null });
    }
    if (r.isLocal) {
      this._setHP(0);
      this.touchControls?.setVisible(false);
      if (davamEdir) this._showSpecBar();
    }
    this._checkEnd();
  }

  // ——— Öləndən sonra: tamaşa paneli (oyunçular arası keçid + çıxış seçimləri) ———
  _showSpecBar() {
    if (this._state === 'done') return;
    const el = this.uiRoot.querySelector('#ah-spec');
    if (!el) return;
    const extra = this.online
      ? `<button class="btn btn--ghost" data-spec-lobby>${t('pause.backRoom')}</button>`
      : `<button class="btn" data-spec-retry>🔄 Yenidən</button>
         <button class="btn btn--ghost" data-spec-end>🏁 Nəticələndir</button>`;
    el.innerHTML = `
      <div class="spec-bar">
        <div class="spec-title">👁 Tamaşa: <b id="spec-name">—</b></div>
        <div class="spec-btns">
          <button class="btn btn--ghost" data-spec-prev>◀</button>
          <button class="btn btn--ghost" data-spec-next>▶</button>
          ${extra}
        </div>
      </div>`;
    this._specIdx = 0;
    this._refreshSpecName();
    el.querySelector('[data-spec-prev]').onclick = () => this._specCycle(-1);
    el.querySelector('[data-spec-next]').onclick = () => this._specCycle(1);
    el.querySelector('[data-spec-lobby]')?.addEventListener('click', () => this.onQuit?.());
    el.querySelector('[data-spec-retry]')?.addEventListener('click', () => this.onRestart?.());
    el.querySelector('[data-spec-end]')?.addEventListener('click', () => this._finishNow());
  }

  _specCycle(dir) {
    const alive = this._aliveList();
    if (!alive.length) return;
    this._specIdx = (((this._specIdx ?? 0) + dir) % alive.length + alive.length) % alive.length;
    this._refreshSpecName();
    audio.sfx('click');
  }

  _refreshSpecName() {
    const alive = this._aliveList();
    const el = this.uiRoot.querySelector('#spec-name');
    if (el) el.textContent = alive.length ? alive[(this._specIdx ?? 0) % alive.length].name : '—';
  }

  // Oyunu dərhal nəticələndir: sağ qalanlar CANLARINA görə sıralanır
  // (az can = daha aşağı yer), qızıl yerə uyğun verilir.
  _finishNow() {
    const alive = this._aliveList().sort((a, b) => a.car.hp - b.car.hp);
    const order = [...this._elimOrder, ...alive.map((r) => r.tid)];
    this._finish(order);
  }

  _aliveList() { return this.racers.filter((x) => x.car.alive && !x.gone); }

  _checkEnd() {
    // Sonu yalnız host (və ya offline) elan edir
    if (this.online && !this.online.net.isHost) return;
    const alive = this._aliveList();
    if (alive.length <= 1) {
      const order = [...this._elimOrder];
      if (alive[0]) order.push(alive[0].tid);
      this.online?.net.sendEvent({ kind: 'aend', order });
      this._finish(order);
    }
  }

  _finish(order) {
    if (this._state === 'done') return;
    this._state = 'done';
    const spec = this.uiRoot.querySelector('#ah-spec');
    if (spec) spec.innerHTML = '';
    const me = this.racers.find((r) => r.isLocal);
    const place = order.length - order.indexOf(me.tid); // 1 = qalib
    const gold = place === 1 ? 100 : place === 2 ? 60 : place === 3 ? 40 : 20;
    if (auth.isLoggedIn) auth.award(gold, 'arena');
    this.touchControls?.setVisible(false);
    const rows = [...order].reverse().map((tid, i) => {
      const r = this.racers.find((x) => x.tid === tid);
      return `<div class="arena-row ${r?.isLocal ? 'is-me' : ''}"><b>#${i + 1}</b> ${r?.name || tid}</div>`;
    }).join('');
    audio.stopEngine();          // qalib ekranında motor səsi qalmasın
    // ÖNCƏ iri qalib bildirişi (2.2 s), sonra sıralama menyusu — əvvəl menyu
    // dərhal açılırdı və qalibi görmək olmurdu (istifadəçi rəyi)
    const winner = this.racers.find((x) => x.tid === order[order.length - 1]);
    this._el.overlay.innerHTML = `
      <div class="winbanner ${place === 1 ? 'winbanner--win' : ''}">
        <div class="winbanner__title">${place === 1 ? '👑 QALİBSƏN!' : `${winner?.name || 'Rəqib'} QALİB`}</div>
        <div class="winbanner__sub">${place === 1 ? 'son qalan sən oldun' : `sənin yerin: #${place}`}</div>
      </div>`;
    if (place === 1) for (let i = 0; i < 5; i++) this.effects.spawnConfetti(this.playerCar.position, true);
    if (place === 1) this._playFinishFx();
    audio.sfx(place === 1 ? 'finish' : 'click');
    this._resultT = setTimeout(() => this._showResult(place, gold, rows), 2200);
  }

  _showResult(place, gold, rows) {
    this._el.overlay.innerHTML = `
      <div class="pause">
        <div class="screen__heading">${place === 1 ? '👑 Qalibsən!' : `Yerin: #${place}`}
          <small>${auth.isLoggedIn ? `🪙+${gold}` : 'Qonaq — qızıl hesabla qazanılır'}</small>
        </div>
        <div class="arena-standings">${rows}</div>
        <div class="btn-row">
          <button class="btn btn--primary" data-quit>${this.online ? t('pause.backRoom') : t('pause.menu')}</button>
        </div>
      </div>`;
    this._el.overlay.querySelector('[data-quit]').onclick = () => this.onQuit?.();
  }

  // ————— Pickup-lar —————
  _rollPickupType() {
    // Oyun irəlilədikcə raket tez-tez çıxır (60s-dən sonra artmağa başlayır)
    const wOf = (p) => p.id === 'missile' ? p.w + Math.min(6, Math.max(0, (this._time - 60) / 22)) : p.w;
    const total = PICKUP_TYPES.reduce((s, p) => s + wOf(p), 0);
    let x = Math.random() * total;
    for (const p of PICKUP_TYPES) { x -= wOf(p); if (x <= 0) return p.id; }
    return 'missile';
  }

  // Göydən düşən şüa teksturası: aşağıda parlaq, yuxarı doğru sönür,
  // yanlardan yumşaq kənar (kvadrat sərhəd görünməsin)
  _padShaftTex() {
    if (this._shaftTexCache) return this._shaftTexCache;
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 256;
    const ctx = cv.getContext('2d');
    const v = ctx.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(255,255,255,0)');
    v.addColorStop(0.35, 'rgba(255,255,255,0.28)');
    v.addColorStop(0.86, 'rgba(255,255,255,0.95)');
    v.addColorStop(1, 'rgba(255,255,255,0.6)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 64, 256);
    // Yan kənarları yumşalt
    ctx.globalCompositeOperation = 'destination-in';
    const h = ctx.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(0,0,0,0)');
    h.addColorStop(0.5, 'rgba(0,0,0,1)');
    h.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, 64, 256);
    this._shaftTexCache = new THREE.CanvasTexture(cv);
    return this._shaftTexCache;
  }

  // Yumşaq radial parıltı — pad halosu üçün
  _padGlowTex() {
    if (this._glowTexCache) return this._glowTexCache;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    this._glowTexCache = tex;
    return tex;
  }

  _spawnPickup(i, tp, x, z) {
    const group = new THREE.Group();
    // İkon sprite (canvas emoji)
    const itex = new THREE.CanvasTexture(abilityIconCanvas(tp, 96));
    itex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: itex, transparent: true, alphaTest: 0.08 }));
    spr.scale.set(2.8, 2.8, 1);
    spr.position.y = 2.1;
    group.add(spr);
    group.position.set(x, 0.2, z);
    this.scene.add(group);
    this.pickups.set(i, { tp, mesh: group, x, z, padKey: x + '/' + z });
  }

  // Hər boş pad (zona daxilində) qısa fasilədən sonra yenidən dolur —
  // arenada demək olar HƏMİŞƏ hər padda ability var.
  _hostSpawnPickups() {
    const taken = new Set([...this.pickups.values()].map((p) => p.padKey));
    const now = this._playT;
    for (const pad of this.pads) {
      if (Math.hypot(pad.x, pad.z) >= this.safeR - 5) continue;
      if (taken.has(pad.x + '/' + pad.z)) { pad._emptyAt = null; continue; }
      if (pad._emptyAt == null) { pad._emptyAt = now; continue; }
      if (now - pad._emptyAt < PAD_RESPAWN) continue;
      pad._emptyAt = null;
      const tp = this._rollPickupType();
      const i = this._pickupSeq++;
      this._spawnPickup(i, tp, pad.x, pad.z);
      this.online?.net.sendEvent({ kind: 'pk', i, tp, x: +pad.x.toFixed(1), z: +pad.z.toFixed(1) });
    }
  }

  _takePickup(i, r) {
    const pk = this.pickups.get(i);
    if (!pk) return;
    this.scene.remove(pk.mesh);
    this.pickups.delete(i);
    const cols = { missile: 0xff8438, nitro: 0xffd34d, shield: 0x4fc3ff, repair: 0x7dff8a };
    this.effects.spawnSparkle(new THREE.Vector3(pk.x, 1.4, pk.z), cols[pk.tp] || 0xffffff);
    if (pk.tp === 'repair' || pk.tp === 'shield' || pk.tp === 'nitro') {
      // Ani effektli item-lər dərhal işə düşür — əldəki raketə toxunmur
      this._applyEffect(pk.tp, r);
    } else {
      r.item = pk.tp;
      if (r.isLocal) {
        this._el.item.textContent = '🚀 Raket — E';
        this._syncTouchItem();
        audio.sfx('pickup');
      }
    }
    if (r.isLocal || (r.isBot && this._simBots)) {
      this.online?.net.sendEvent({ kind: 'pkt', i });
    }
  }

  // ————— Şəbəkə —————
  _setupNet() {
    const net = this.online.net;
    this._net = net;
    this._netAcc = 0;
    this._zoneAcc = 0;
    net.on('state', (m) => {
      const r = this.racers.find((x) => x.netId === m.id);
      if (r?.car.isRemote) r.controller.push(m);
    });
    net.on('event', (m) => {
      switch (m.kind) {
        case 'rdy2':
          if (net.isHost) {
            (this._rdy2 = this._rdy2 || new Set()).add(m.id);
            this._checkAllScenesReady();
          }
          break;
        case 'cstart':
          if (this._state === 'wait') { this._state = 'countdown'; this._cd = 3.2; }
          break;
        case 'pk': if (!this.pickups.has(m.i)) this._spawnPickup(m.i, m.tp, m.x, m.z); break;
        case 'pkt': {
          const pk = this.pickups.get(m.i);
          if (pk) { this.scene.remove(pk.mesh); this.pickups.delete(m.i); }
          break;
        }
        case 'abot': {
          const b = this.racers.find((x) => x.isBot && x.botIdx === m.i);
          if (b?.controller) b.controller.push({ p: m.p, h: m.h, v: m.v, b: m.b || 0, sh: 0 });
          break;
        }
        case 'ahit': { // mənim maşınıma (və ya host üçün bota) dəydi
          const r = this.racers.find((x) => x.tid === m.tid);
          if (r && (r.isLocal || (r.isBot && this._simBots))) this._damage(r, m.dmg, false, m.by || null);
          break;
        }
        case 'ahp': {
          const r = this.racers.find((x) => x.tid === m.tid);
          if (r && !r.isLocal && !(r.isBot && this._simBots)) r.car.hp = m.hp;
          break;
        }
        case 'adead': {
          const r = this.racers.find((x) => x.tid === m.tid);
          if (r && r.car.alive) { r.car._lastBy = m.by || null; this._eliminate(r, false); }
          break;
        }
        case 'afire': { // vizual raket (zərəri sahibi hesablanır)
          const r = this.racers.find((x) => x.tid === m.tid);
          if (r && !r.isLocal && !(r.isBot && this._simBots)) this._fireMissile(r);
          break;
        }
        case 'zt': { // zona vaxtı sinxronu
          if (!this._simBots && Math.abs(this._playT - m.t) > 1.5) this._playT = m.t;
          break;
        }
        case 'aend': this._finish(m.order); break;
        case 'gleave': {
          const r = this.racers.find((x) => x.netId === m.id);
          if (r && !r.gone) {
            r.gone = true;
            if (r.car.alive) { r.car.alive = false; r.car.root.visible = false; this._elimOrder.unshift(r.tid); }
            this._toast(r.name + ' otağa qayıtdı');
            this._checkEnd();
          }
          break;
        }
      }
    });
    net.on('left', (id) => {
      const r = this.racers.find((x) => x.netId === id);
      if (r) {
        r.gone = true;
        if (r.car.alive) { r.car.alive = false; r.car.root.visible = false; this._elimOrder.unshift(r.tid); }
        this._checkEnd();
      }
    });
    net.on('closed', () => this.onQuit?.());
  }

  // Host: bütün qonaqların səhnəsi hazırdırsa sinxron geri sayım
  _checkAllScenesReady() {
    if (this._cstartSent || !this.online?.net.isHost) return;
    const guests = this.online.players.filter((p) => p.id !== this.online.net.selfId).length;
    if ((this._rdy2?.size ?? 0) >= guests) {
      this._cstartSent = true;
      this.online.net.sendEvent({ kind: 'cstart' });
      this._state = 'countdown'; // öz hadisəmiz bizə çatmır — lokal başlat
      this._cd = 3.2;
    }
  }

  // ————— Bot AI —————
  _botDrive(r, dt) {
    const car = r.car;
    if (!car.alive) return;
    const myPos = car.position;
    let target = null;
    // 1) Zonadan qaç
    const distC = Math.hypot(myPos.x, myPos.z);
    if (distC > this.safeR - 6) {
      const k = Math.max(0.3, (this.safeR - 12) / Math.max(1, distC));
      target = new THREE.Vector3(myPos.x * k * 0.5, 0, myPos.z * k * 0.5);
    }
    // 2) Item yoxdursa — ən yaxın pickup
    if (!target && !r.item && this.pickups.size) {
      let best = null, bd = 1e9;
      for (const pk of this.pickups.values()) {
        const d = Math.hypot(pk.x - myPos.x, pk.z - myPos.z);
        if (d < bd && Math.hypot(pk.x, pk.z) < this.safeR - 4) { bd = d; best = pk; }
      }
      if (best) target = new THREE.Vector3(best.x, 0, best.z);
    }
    // 3) Raketi varsa — düşmənə yaxınlaş
    let enemy = null, ed = 1e9;
    for (const o of this.racers) {
      if (o === r || !o.car.alive || o.gone) continue;
      const d = o.car.position.distanceTo(myPos);
      if (d < ed) { ed = d; enemy = o; }
    }
    if (!target && r.item === 'missile' && enemy) {
      target = new THREE.Vector3(enemy.car.position.x, 0, enemy.car.position.z);
    }
    // 4) Sərgərdan gəzinti
    if (!target) {
      r._wanderT -= dt;
      if (!r._wander || r._wanderT <= 0) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.random() * Math.max(8, this.safeR - 14);
        r._wander = new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr);
        r._wanderT = 4 + Math.random() * 3;
      }
      target = r._wander;
    }
    const desired = Math.atan2(target.x - myPos.x, target.z - myPos.z);
    let err = desired - car.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    const distT = myPos.distanceTo(target);
    const drive = {
      throttle: Math.abs(err) > 2.2 ? -0.5 : (distT < 5 ? 0.55 : 0.9),
      steer: Math.max(-1, Math.min(1, -err * 2.4)),
      handbrake: false,
    };
    car.update(dt, drive, this._fakeTrack);
    // Atəş: raket + düşmən yaxın + nişan tutulub
    if (r.item === 'missile' && enemy && ed < 42) {
      const aimErr = Math.abs((() => {
        let e = Math.atan2(enemy.car.position.x - myPos.x, enemy.car.position.z - myPos.z) - car.heading;
        while (e > Math.PI) e -= Math.PI * 2;
        while (e < -Math.PI) e += Math.PI * 2;
        return e;
      })());
      if (aimErr < 0.4) {
        this._applyItem(r);
        this.online?.net.sendEvent({ kind: 'afire', tid: r.tid });
      }
    }
  }

  // ————— Əsas dövr —————
  update(dt) {
    if (this._state === 'paused' || this._state === 'done') return;
    this._time += dt;

    // SİNXRON START gözləməsi
    if (this._state === 'wait') {
      this._waitT += dt;
      if ((this._waitT * 2 | 0) !== this._waitShown) {
        this._waitShown = this._waitT * 2 | 0;
        this._toast(t('tst.waiting'));
      }
      if (this.online?.net.isHost && this._waitT > 6 && !this._cstartSent) {
        this._cstartSent = true;
        this.online.net.sendEvent({ kind: 'cstart' });
        this._state = 'countdown';
        this._cd = 3.2;
      }
      this.effects.update(dt);
    if (this._finishFx) {
      this._finishFx.update(dt);
      if (this._finishFx.done) { this._finishFx.dispose(); this._finishFx = null; }
    }
      this._updateCamera(dt);
      return;
    }

    if (this._state === 'countdown') {
      this._cd -= dt;
      const n = Math.ceil(this._cd);
      if (n !== this._cdShown && n > 0) { this._cdShown = n; this._toast(String(n)); audio.sfx('count'); }
      if (this._cd <= 0) {
        this._state = 'play';
        this._toast(t('tst.fight'));
        audio.sfx('go');
        // İlkin dalğa: BÜTÜN padlər dolu başlayır (host/offline)
        if (this._simBots) {
          for (const pad of this.pads) pad._emptyAt = -PAD_RESPAWN;
          this._hostSpawnPickups();
        }
      }
    }

    if (!this._fakeTrack) {
      this._fakeTrack = {
        halfWidth: 500, maxRadius: 460, branches: [],
        getNearest: () => ({ index: 0, t: 0, lateral: 0, onRoad: true }),
        points: [new THREE.Vector3()], tangents: [new THREE.Vector3(0, 0, 1)], normals: [new THREE.Vector3(1, 0, 0)],
      };
    }

    const inPlay = this._state === 'play';
    if (inPlay) this._playT += dt;

    // Zona radiusu
    const zt = this._playT;
    if (zt <= ZONE_HOLD) this.safeR = ARENA_R;
    else this.safeR = Math.max(ZONE_MIN_R,
      ARENA_R - (ARENA_R - ZONE_MIN_R) * Math.min(1, (zt - ZONE_HOLD) / (ZONE_END_T - ZONE_HOLD)));
    this.zoneWall.scale.set(this.safeR, 1, this.safeR);
    this.zoneRing.scale.set(this.safeR, this.safeR, 1);
    if (zt <= ZONE_HOLD) {
      this._el.zone.textContent = '⭕ zona ' + Math.ceil(ZONE_HOLD - zt) + 's sonra daralır';
    } else if (this.safeR <= ZONE_MIN_R + 0.5) {
      this._el.zone.textContent = '⭕ zona minimumdadır!';
    } else {
      this._el.zone.textContent = '⭕ zona daralır';
    }

    // İdarə
    for (const r of this.racers) {
      if (r.gone) continue;
      if (r.isLocal) {
        if (inPlay && r.car.alive) r.controller?.update?.(dt, this._fakeTrack);
        else r.car.update(dt, { throttle: 0, steer: 0, handbrake: false }, this._fakeTrack);
      } else if (r.car.isRemote) {
        r.controller?.update?.(dt, this._fakeTrack);
      } else if (r.isBot && this._simBots && inPlay) {
        this._botDrive(r, dt);
      }
    }

    // Divar + maneə toqquşmaları (yerli simulyasiya olunanlar)
    for (const car of this.cars) {
      if (car.isRemote || !car.alive) continue;
      const d = Math.hypot(car.position.x, car.position.z);
      if (d > ARENA_R - 1.6) {
        const nx = car.position.x / d, nz = car.position.z / d;
        car.position.x = nx * (ARENA_R - 1.6);
        car.position.z = nz * (ARENA_R - 1.6);
        const vn = car.velocity.x * nx + car.velocity.z * nz;
        if (vn > 0) { car.velocity.x -= nx * vn * 1.4; car.velocity.z -= nz * vn * 1.4; }
      }
      for (const o of this.obstacles) {
        const dx = car.position.x - o.x, dz = car.position.z - o.z;
        const dd = Math.hypot(dx, dz);
        const min = o.r + 1.5;
        if (dd < min && dd > 0.001) {
          car.position.x = o.x + (dx / dd) * min;
          car.position.z = o.z + (dz / dd) * min;
          const vn = car.velocity.x * (dx / dd) + car.velocity.z * (dz / dd);
          if (vn < 0) { car.velocity.x -= (dx / dd) * vn * 1.3; car.velocity.z -= (dz / dd) * vn * 1.3; }
        }
      }
    }

    // Maşın-maşın toqquşma + ram zərəri
    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const A = this.racers[i], B = this.racers[j];
        if (!A.car.alive || !B.car.alive || A.gone || B.gone) continue;
        const a = A.car, b = B.car;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.2 && d > 0.001) {
          const nx = dx / d, nz = dz / d;
          const ov = (3.2 - d) / 2;
          if (!a.isRemote) { a.position.x -= nx * ov; a.position.z -= nz * ov; }
          if (!b.isRemote) { b.position.x += nx * ov; b.position.z += nz * ov; }
          // Ram: nisbi sürət böyükdürsə hər ikisinə kiçik zərər
          // (uzaq maşınların velocity-si sinxron deyil — vF ehtiyatı ilə)
          const rel = Math.max(
            Math.hypot(a.velocity.x - b.velocity.x, a.velocity.z - b.velocity.z),
            Math.abs((a.vF || 0) - (b.vF || 0))
          );
          if (inPlay && rel > 14 && (a._ramCd ?? 0) <= 0) {
            a._ramCd = b._ramCd = 0.8;
            this.effects.spawnSmoke({ x: (a.position.x + b.position.x) / 2, y: 0.8, z: (a.position.z + b.position.z) / 2 }, true, null, 0.8);
            if (A.isLocal || (A.isBot && this._simBots) || !this.online) this._damage(A, RAM_DMG, false, B.name);
            if (B.isLocal || (B.isBot && this._simBots) || !this.online) this._damage(B, RAM_DMG, false, A.name);
          }
        }
      }
    }
    for (const c of this.cars) {
      c._ramCd = Math.max(0, (c._ramCd ?? 0) - dt);
      c._shieldT = Math.max(0, (c._shieldT ?? 0) - dt);
    }

    // Zona zərəri (öz simulyasiyamızdakı maşınlara)
    if (inPlay) {
      this._zoneDmgAcc = (this._zoneDmgAcc ?? 0) + dt;
      if (this._zoneDmgAcc >= 0.5) {
        const step = this._zoneDmgAcc;
        this._zoneDmgAcc = 0;
        for (const r of this.racers) {
          if (!r.car.alive || r.gone) continue;
          const own = r.isLocal || (r.isBot && this._simBots) || !this.online;
          if (!own) continue;
          const d = Math.hypot(r.car.position.x, r.car.position.z);
          if (d > this.safeR) this._damage(r, ZONE_DPS * step, true, 'zona');
        }
        const me = this.racers.find((r) => r.isLocal);
        if (me?.car.alive) this._setHP(me.car.hp);
      }
    }

    // Pad animasiyası: nəbz + yavaş fırlanma; dolu padlərdə işıq sütunu
    {
      const taken = new Map([...this.pickups.values()].map((p) => [p.padKey, p.tp]));
      for (const pad of this.pads) {
        const tp = taken.get(pad.x + '/' + pad.z);
        const busy = !!tp;
        if (busy && pad._tp !== tp) {
          pad._tp = tp;
          const col = new THREE.Color(ABILITY_COLORS[tp] || '#b489ff');
          pad.beam.material.color.copy(col);
          pad.shaft.material.color.copy(col);
          pad.ring.material.color.copy(col);
        }
        const pulse = 1 + Math.sin(this._time * 2.2 + pad.phase) * (busy ? 0.1 : 0.05);
        pad.ring.scale.setScalar(pulse);
        pad.ring.rotation.z += dt * (busy ? 0.9 : 0.25);
        pad.ring.material.opacity = busy ? 0.95 : 0.5 + Math.sin(this._time * 2.2 + pad.phase) * 0.15;
        if (pad.beam.visible !== busy) pad.beam.visible = busy;
        if (pad.shaft.visible !== busy) pad.shaft.visible = busy;
        if (busy) {
          pad.beam.material.opacity = 0.2 + Math.sin(this._time * 3 + pad.phase) * 0.08;
          pad.shaft.material.opacity = 0.46 + Math.sin(this._time * 1.8 + pad.phase) * 0.12;
        }
      }
    }

    // Pickup spawn (host/offline) + götürmə
    if (inPlay && this._simBots) this._hostSpawnPickups();
    if (inPlay) {
      for (const [i, pk] of this.pickups) {
        pk.mesh.rotation.y += dt * 1.6;
        pk.mesh.position.y = 0.2 + Math.sin(this._time * 2 + i) * 0.2; // üzmə
        for (const r of this.racers) {
          if (!r.car.alive || r.gone) continue;
          // Əlində item varkən: eyni tipdən İKİNCİ raket götürmək olmaz,
          // amma ani utility-lər (qalxan/nitro/təmir) yenə işləyir
          if (r.item && pk.tp === 'missile') continue;
          const own = r.isLocal || (r.isBot && this._simBots) || !this.online;
          if (!own) continue;
          if (Math.hypot(pk.x - r.car.position.x, pk.z - r.car.position.z) < 2.6) {
            this._takePickup(i, r);
            break;
          }
        }
      }
    }

    // Raketlər
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      // Yüngül izləmə
      if (p.target?.car.alive) {
        const tx = p.target.car.position.x - p.mesh.position.x;
        const tz = p.target.car.position.z - p.mesh.position.z;
        const cur = Math.atan2(p.vx, p.vz);
        let want = Math.atan2(tx, tz) - cur;
        while (want > Math.PI) want -= Math.PI * 2;
        while (want < -Math.PI) want += Math.PI * 2;
        const turn = Math.max(-2.4 * dt, Math.min(2.4 * dt, want));
        const na = cur + turn;
        const sp = Math.hypot(p.vx, p.vz);
        p.vx = Math.sin(na) * sp;
        p.vz = Math.cos(na) * sp;
      }
      // Sütun/qutu yayınması: qabaqdakı maneənin yanından dolan
      {
        const sp2 = Math.hypot(p.vx, p.vz) || 1;
        const dirx = p.vx / sp2, dirz = p.vz / sp2;
        let steer = 0, bestAlong = 12;
        for (const o of this.obstacles) {
          const ox = o.x - p.mesh.position.x, oz = o.z - p.mesh.position.z;
          const along = ox * dirx + oz * dirz;
          if (along < 0 || along > 12) continue;
          const side = ox * dirz - oz * dirx;
          if (Math.abs(side) < o.r + 1.2 && along < bestAlong) {
            bestAlong = along;
            steer = side >= 0 ? -1 : 1; // maneə sağdadırsa sola burul (və əksinə)
          }
        }
        if (steer !== 0) {
          const cur2 = Math.atan2(p.vx, p.vz);
          const na2 = cur2 + steer * 3.6 * dt;
          p.vx = Math.sin(na2) * sp2;
          p.vz = Math.cos(na2) * sp2;
        }
      }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.z += p.vz * dt;
      this.effects.spawnSmoke({ x: p.mesh.position.x, y: 1.0, z: p.mesh.position.z }, false, 0xff8438, 0.4);
      let hit = false;
      // Maneəyə birbaşa dəymə → partlayış (içindən keçmək olmaz)
      for (const o of this.obstacles) {
        if (Math.hypot(p.mesh.position.x - o.x, p.mesh.position.z - o.z) < o.r + 0.4) {
          hit = true;
          this.effects.spawnExplosion(p.mesh.position.clone());
          break;
        }
      }
      for (const r of this.racers) {
        if (r === p.owner || !r.car.alive || r.gone) continue;
        if (p.mesh.position.distanceTo(r.car.position) < 2.3) {
          hit = true;
          this.effects.spawnExplosion(p.mesh.position.clone());
          // Tək səlahiyyət: yalnız ATICININ simulyasiyası zərər verir
          const ownShooter = p.owner.isLocal || (p.owner.isBot && this._simBots) || !this.online;
          if (ownShooter) {
            const ownVictim = r.isLocal || (r.isBot && this._simBots) || !this.online;
            if (ownVictim) this._damage(r, MISSILE_DMG, false, p.owner.name);
            else this.online?.net.sendEvent({ kind: 'ahit', tid: r.tid, dmg: MISSILE_DMG, by: p.owner.name });
          }
          break;
        }
      }
      if (hit || p.life <= 0 || Math.hypot(p.mesh.position.x, p.mesh.position.z) > ARENA_R + 4) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // Təhlükə vinyeti: oyunçu zonadan kənardadırsa qırmızı kənar parıltısı
    const meR = this.racers.find((r) => r.isLocal);
    const inDanger = inPlay && meR?.car.alive
      && Math.hypot(meR.car.position.x, meR.car.position.z) > this.safeR;
    if (this._dangerShown !== inDanger) {
      this._dangerShown = inDanger;
      this._el.danger.classList.toggle('is-on', inDanger);
      if (inDanger) this._toast(t('tst.zoneOut'));
    }

    // HUD: sağ qalanlar
    const aliveN = this._aliveList().length;
    if (this._aliveShown !== aliveN) {
      this._aliveShown = aliveN;
      this._el.alive.textContent = '👥 ' + aliveN;
      if (!this.playerCar.alive) this._refreshSpecName(); // tamaşa etiketi köhnəlməsin
    }

    // Şəbəkə göndərişləri
    if (this.online) {
      this._netAcc += dt;
      if (this._netAcc >= 0.066) {
        this._netAcc = 0;
        const c = this.playerCar;
        this._net.sendState({
          p: [Math.round(c.position.x * 100) / 100, Math.round(c.position.z * 100) / 100],
          h: Math.round(c.heading * 1000) / 1000,
          v: Math.round(c.vF * 10) / 10,
          b: c.boostTimer > 0 ? 1 : 0, sh: c._shieldT > 0 ? 1 : 0,
        });
        if (this._simBots) {
          for (const r of this.racers) {
            if (!r.isBot || !r.car.alive) continue;
            this._net.sendEvent({
              kind: 'abot', i: r.botIdx,
              p: [+r.car.position.x.toFixed(1), +r.car.position.z.toFixed(1)],
              h: +r.car.heading.toFixed(3),
              v: +r.car.vF.toFixed(1),
              b: r.car.boostTimer > 0 ? 1 : 0,
            });
          }
          this._zoneAcc += 0.066;
          if (this._zoneAcc >= 5) { this._zoneAcc = 0; this._net.sendEvent({ kind: 'zt', t: +this._playT.toFixed(1) }); }
        }
      }
    }

    this.effects.update(dt);
    this.skids.update(dt);
    this._updateCamera(dt);
    const pc = this.playerCar;
    // Oyun bitəndə (qalib ekranı) motor səsi susmalıdır
    const over = this._state === 'done';
    const speedT = (over || !pc.alive) ? 0 : Math.min(pc.velocity.length() / pc.maxSpeed, 1);
    audio.setEngine(speedT, !over && pc.boostTimer > 0);
    this.speedLines?.update(dt, speedT, pc.velocity.length());
  }

  _updateCamera(dt) {
    // Ölmüşüksə — seçilmiş oyunçuya tamaşa et (◀ ▶ ilə keçid)
    let car = this.playerCar;
    if (!car.alive) {
      const alive = this._aliveList();
      if (alive.length) car = alive[(this._specIdx ?? 0) % alive.length].car;
    }
    const h = car.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const desired = new THREE.Vector3(
      car.position.x - fx * 9 + car.velocity.x * 0.08, 5.2,
      car.position.z - fz * 9 + car.velocity.z * 0.08
    );
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 7));
    const look = new THREE.Vector3(car.position.x + fx * 6, 1.1, car.position.z + fz * 6);
    this._camTarget.lerp(look, 1 - Math.exp(-dt * 7));
    this.camera.lookAt(this._camTarget);
  }

  // Mağazadan alınmış finiş animasiyası (yarışdakı ilə eyni)
  _playFinishFx() {
    const f = this._playerData?.cosmetics?.finish;
    if (!f?.kind) return;
    this._finishFx?.dispose();
    // Maşının özü ötürülür: effekt yerində qalmır, maşını izləyir
    this._finishFx = playFinishFx(this.scene, f.kind, this.playerCar, f.hex);
  }

  dispose() {
    this._finishFx?.dispose(); this._finishFx = null;
    clearTimeout(this._resultT);   // səhnə bağlananda gec açılan menyu olmasın
    this.input.enabled = true;
    this.input.binds.clear();
    this.touchControls?.dispose();
    this.effects?.dispose();
    this.skids?.dispose();
    this.speedLines?.dispose();
    audio.stopEngine();
    disposeObject3D(this.scene);   // SIRA: qraf əvvəl (bax GameplayScene şərhi)
    for (const c of this.cars) c.dispose();
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    
    this.scene.clear();
    this.uiRoot.innerHTML = '';
  }
}
