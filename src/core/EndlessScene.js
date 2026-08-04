import * as THREE from 'three';
import { playerCarData } from '../data/playerCar.js';
import { t } from './i18n.js';
import { getCarById } from '../data/cars.js';
import { Car } from '../entities/Car.js';
import { PlayerController } from '../entities/PlayerController.js';
import { EndlessRoad, waterMaterial, terrainY, groundYAt, RAIL_ABOVE, CUT_IN, CUT_OUT, WATER_LEVEL } from '../world/EndlessRoad.js';
import { sharedNature, NATURE_BY_BIOME, SMALL_BY_BIOME } from '../world/NatureKit.js';
import { sharedCity } from '../world/CityKit.js';
import { disposeObject3D } from './MergeUtils.js';
import { SkidMarks } from './SkidMarks.js';
import { Effects } from './Effects.js';
import { TouchControls, isTouchDevice } from './TouchControls.js';
import { audio } from './AudioManager.js';
import { auth } from '../net/Auth.js';

const CAR_RADIUS = 1.5;

// Biomlar — landşaftlar bir-birinə axıcı keçir
const BIOMES = [
  {
    id: 'desert', sky: 0xf7b26a, skyB: 0xffd9a0, ground: 0xd99b57, fog: 0xf2b47a,
    road: 0x45464f, curb: 0xff7a2f, mountain: 0xbc7c42,
    decor: ['cactus', 'rock', 'dune'], curvMul: 0.8,
    weather: { clear: 0.75, fog: 0.1, rain: 0.15 }, flake: 0,
  },
  {
    id: 'alpine', sky: 0x8fd4ff, skyB: 0xd8f1ff, ground: 0x3f8f4e, fog: 0xbfe6ff,
    road: 0x4c4e58, curb: 0xe8ecf2, mountain: 0x556878,
    decor: ['pine', 'rock', 'pine'], curvMul: 1.15,
    weather: { clear: 0.5, fog: 0.2, rain: 0.3 }, flake: 1, // yağış = qar
  },
  {
    id: 'coast', sky: 0x5a4a9e, skyB: 0xff9a6a, ground: 0xe0bd86, fog: 0xe8a37e,
    road: 0x494750, curb: 0x27e6c8, mountain: 0x8a5f86,
    decor: ['pine', 'lamp', 'rock'], curvMul: 0.9,
    weather: { clear: 0.8, fog: 0.15, rain: 0.05 }, flake: 0,
  },
  {
    id: 'canyon', sky: 0x86385e, skyB: 0xf29a5c, ground: 0xa85a3e, fog: 0xc76d52,
    road: 0x45434d, curb: 0xffb02e, mountain: 0x6b3550,
    decor: ['rock', 'cactus', 'windmill'], curvMul: 1.35,
    weather: { clear: 0.7, fog: 0.25, rain: 0.05 }, flake: 0,
  },
  {
    id: 'snow', sky: 0xa8c8e2, skyB: 0xe8f3fc, ground: 0xe8eff6, fog: 0xd6e5f0,
    road: 0x4f5461, curb: 0x3e6fd8, mountain: 0x9fb6c8,
    decor: ['pine', 'rock', 'pine'], curvMul: 1.05,
    weather: { clear: 0.2, fog: 0.15, rain: 0.65 }, flake: 1, // demək olar həmişə qar
  },
];
const BIOME_LEN = 1600;   // hər biomun uzunluğu (m)
const BLEND_LEN = 280;    // keçid zonası
const DAY_PERIOD = 320;   // gün dövrü (saniyə)
// Gecə palitrası — bütün biomlar gecə soyuq indiqoya çəkilir (bax _updateWorld)
const NIGHT_SKY = new THREE.Color(0x080d26);
const NIGHT_SKY_B = new THREE.Color(0x16204a);
const NIGHT_FOG = new THREE.Color(0x101838);
const NIGHT_GROUND = new THREE.Color(0x141a30);

const GROUND_SIZE = 1300;  // yer torunun ölçüsü (m) — duman 620 m-də bağlayır
const GROUND_SEGS = 130;   // 10 m-lik xanalar — yol kəsiyi təmiz görünür
const GROUND_REPEAT = 26;  // tekstura kafeli (50 m) + snap addımı

export class EndlessScene {
  constructor(config, { input, uiRoot, renderer = null, library, onQuit }) {
    this.input = input;
    this.uiRoot = uiRoot;
    this.renderer = renderer;
    this.onQuit = onQuit;
    this._state = 'run';
    this._time = 0;
    this.score = 0;
    this._goldMark = 0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 1100);
    this.scene.add(this.camera);
    this._camTarget = new THREE.Vector3();

    if (this.renderer) this.renderer.toneMappingExposure = 1.15;

    // ——— İşıqlar (sayı SABİT) ———
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sun.position.set(60, 110, 40);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.amb = new THREE.AmbientLight(0xffffff, 0.32);
    this.scene.add(this.amb);
    // Gecə faraları (gündüz intensity=0 — işıq sayı dəyişmir)
    // Fara: nöqtəvi işıq hər tərəfə yayılırdı və yolu işıqlandırmırdı.
    // Projektor irəli yönəlir — asfalt, dekor və işarələr həqiqətən işıq alır.
    this.headlight = new THREE.SpotLight(0xffe2b0, 0, 70, 0.46, 0.85, 1.3);
    this.headlight.castShadow = false;   // mobil üçün: kölgəsiz
    this.scene.add(this.headlight);
    this.scene.add(this.headlight.target);

    // ——— Səma + günəş diski + yer ———
    this._skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), this._skyMat);
    this.scene.add(this.skyDome);

    // ENV MAP: zen-də yox idi və maşın tamamilə mat görünürdü. Bir dəfə
    // qurulan neytral qradiyent kifayətdir (gün vaxtı ilə yenilənməsi
    // hər kadr PMREM demək olardı — çox baha).
    if (this.renderer && !EndlessScene._envCache) {
      const pm = new THREE.PMREMGenerator(this.renderer);
      const cv = document.createElement('canvas');
      cv.width = 4; cv.height = 128;
      const cx2 = cv.getContext('2d');
      const gg = cx2.createLinearGradient(0, 0, 0, 128);
      gg.addColorStop(0, '#9fc4ff'); gg.addColorStop(0.5, '#e8eef6'); gg.addColorStop(1, '#6b6560');
      cx2.fillStyle = gg; cx2.fillRect(0, 0, 4, 128);
      const t2 = new THREE.CanvasTexture(cv);
      t2.mapping = THREE.EquirectangularReflectionMapping;
      t2.colorSpace = THREE.SRGBColorSpace;
      EndlessScene._envCache = pm.fromEquirectangular(t2).texture;
      EndlessScene._envCache.userData = { shared: true };
      t2.dispose(); pm.dispose();
    }
    if (EndlessScene._envCache) {
      this.scene.environment = EndlessScene._envCache;
      this.scene.environmentIntensity = 0.45;
    }
    // ULDUZ SAHƏSİ — gecə səması boş qalmasın (əvvəl yalnız arabir axan ulduz
    // vardı). Tək çağırış, 460 nöqtə — mobildə də sərbəstdir.
    {
      const N = 460, pos = new Float32Array(N * 3), sz = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const a = Math.random() * Math.PI * 2;
        const y = 0.08 + Math.random() * 0.9;           // yalnız üfüqdən yuxarı
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        pos[i * 3] = Math.cos(a) * r * 840;
        pos[i * 3 + 1] = y * 840;
        pos[i * 3 + 2] = Math.sin(a) * r * 840;
        sz[i] = 1.6 + Math.random() * 2.6;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('size', new THREE.BufferAttribute(sz, 1));
      this._starsMat = new THREE.PointsMaterial({
        color: 0xdfe8ff, size: 2.4, sizeAttenuation: false, transparent: true,
        opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      });
      this.stars = new THREE.Points(geo, this._starsMat);
      this.stars.frustumCulled = false;
      this.scene.add(this.stars);
    }
    this.sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(46, 40),
      new THREE.MeshBasicMaterial({ color: 0xffe6b0, fog: false, depthWrite: false })
    );
    this.scene.add(this.sunDisc);

    const gt = this._noiseTexture();
    gt.repeat.set(GROUND_REPEAT, GROUND_REPEAT);
    this._groundMat = new THREE.MeshStandardMaterial({
      color: 0x888888, map: gt, roughness: 1, flatShading: true,
    });
    // RELYEFLİ YER: təpələr yolu qaldırdıqda torpaq da qalxır (yol havada üzmür)
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGS, GROUND_SEGS),
      this._groundMat
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0;
    this.scene.add(this.ground);
    this._groundSnap = { x: NaN, z: NaN };

    // Qlobal su səthi — relyefin su səviyyəsindən aşağı çuxurları göl/çay olur
    const wm = waterMaterial().clone();
    // Dalğa teksturası ÖZ nüsxəsində olmalıdır: paylaşılanda offset dəyişimi
    // digər səhnələrə də sıçrayırdı
    wm.map = waterMaterial().map.clone();
    wm.map.needsUpdate = true;
    // ~52 m-lik dalğa kafeli — əvvəl bütün 1300 m-ə bir kafel dartılırdı və
    // yer sürüşdükcə tekstura sıçrayırdı ("su qəribə hərəkət edir")
    this._waterTile = 52;
    wm.map.repeat.set(GROUND_SIZE / this._waterTile, GROUND_SIZE / this._waterTile);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), wm);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = WATER_LEVEL;
    this.water.renderOrder = 1;
    this.scene.add(this.water);

    this.scene.fog = new THREE.Fog(0xffffff, 90, 620);

    // ——— Yol + maşın ———
    this.road = new EndlessRoad(this.scene);
    // Kenney Nature Kit (CC0) — arxa planda yüklənir, hazır olanda dekora qarışır
    // RELYEF İŞÇİSİ: yer torunun hesablanması ayrı mövzuya keçir — kadr
    // vaxtı sıçrayışları tamamilə yox olur. Dəstəklənmirsə (köhnə brauzer)
    // avtomatik kadra bölünmüş əsas-mövzu yoluna düşürük.
    try {
      this._tw = new Worker(new URL('../world/terrainWorker.js', import.meta.url), { type: 'module' });
      this._tw.onmessage = (e) => this._applyTerrain(e.data);
      this._twBusy = false;
    } catch { this._tw = null; }

    this._nature = sharedNature();     // paylaşılan nüsxə (yarış da işlədir)
    // KayKit şəhər modelləri — rayonlarda prosedural qutuları əvəz edir
    this._city = sharedCity();
    if (this._city.ready) this.road.cityFactory = (n) => this._city.get(n);
    else this._city._loading.then(() => { this.road.cityFactory = (n) => this._city.get(n); });
    this.road.natureFactory = (name) => this._nature.get(name);
    if (this._nature.ready) this._natureReady = true;
    else this._nature._loading.then(() => { this._natureReady = true; });
    const data = playerCarData(config.carId);
    this.playerCar = new Car(data, library, { isPlayer: true });
    const spot = this.road.nearestSpot(new THREE.Vector3(0, 0, 20));
    this.playerCar.reset(spot.point, spot.heading);
    this.playerCar.wpHint = 0;
    this.scene.add(this.playerCar.root);
    this.controller = new PlayerController(this.playerCar, input);
    this.cars = [this.playerCar];
    this.racers = [{ car: this.playerCar, isPlayer: true, items: [], itemIdx: 0 }];

    this.skids = new SkidMarks(this.scene);
    this.effects = new Effects(this.scene);
    this._buildHeadlights();

    // ——— Biom / hava / gün vəziyyəti ———
    this._biomeIdx = 0;
    this._applyBiomeStyle(BIOMES[0]);
    this._weather = { fogMul: 0.15, rain: 0 };
    this._weatherTarget = { fogMul: 0.15, rain: 0 };
    this._weatherTimer = 9;
    this._skyRegenT = 0;
    this._rain = this._buildRain();

    this._buildZenFx(); // zen-ə xas atmosfer: atəşböcəkləri, axan ulduz, quşlar
    this._buildHUD();
    this._bindKeys();
    audio.playMusic('lofi');
    audio.setZenMix(true); // musiqi önə, mühərrik arxa fona

    // Zen HƏMİŞƏ arxa görünüşlə başlayır — yadda qalmış fps/kapot rejimi
    // "maşın görsənmir" çaşqınlığı yaradırdı; 🎥/V ilə keçid yenə mümkündür
    this._camMode = 'tps';

    if (typeof window !== 'undefined') window.__scene = this;
    if (import.meta.env.DEV && typeof window !== 'undefined') window.__THREE = THREE;
  }

  // Yumşaq dairəvi parıltı teksturası (atəşböcəyi/halə üçün)
  _glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,240,200,0.6)');
    g.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ————— Zen atmosferi: game feel detalları —————
  _buildZenFx() {
    this._glowTex = this._glowTexture();
    // 1) Atəşböcəkləri — parıltılı orblar, YOLDAN KƏNARDA, məsafəyə görə kiçilir
    const N = 42;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    this._ffData = [];
    for (let i = 0; i < N; i++) {
      // Dünya koordinatında lövbərlənir — maşın dönəndə yerində qalır
      this._ffData.push({ wx: 0, wz: 0, alive: false, y: 0.5 + Math.random() * 2.8,
        ph: Math.random() * Math.PI * 2, sp: 0.4 + Math.random() * 0.8 });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._ffMat = new THREE.PointsMaterial({
      map: this._glowTex, color: 0xffe9a0, size: 1.15, sizeAttenuation: true, fog: false,
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._fireflies = new THREE.Points(geo, this._ffMat);
    this._fireflies.frustumCulled = false;
    this.scene.add(this._fireflies);

    // 1b) Günəş/ay haləsi — səma cismini yumşaq işıq bürüyür
    this._haloMat = new THREE.SpriteMaterial({
      map: this._glowTex, color: 0xffe6b0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    this._halo = new THREE.Sprite(this._haloMat);
    this._halo.scale.setScalar(240);
    this.scene.add(this._halo);

    // 2) Axan ulduz — gecə arabir səmada sürüşən zolaq
    // AXAN ULDUZ SİLİNDİ: gündüz və alaqaranlıqda göydə/mənzərədə ağ
    // cizgilər kimi oxunurdu və səhnəni korlayırdı (istifadəçi rəyi).
    this._shootStarOff = true;
    this._starMat = new THREE.MeshBasicMaterial({
      color: 0xeef4ff, transparent: true, opacity: 0, fog: false,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._shootStar = new THREE.Mesh(new THREE.PlaneGeometry(26, 0.5), this._starMat);
    this._shootStar.frustumCulled = false;
    this._shootStar.visible = false;      // artıq işlədilmir
    this._starT = 1e9;
    this._starLife = 0;

    // 3) Quş dəstəsi — gündüz arabir üfüqdə süzür
    this._birds = new THREE.Group();
    const bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      -1.1, 0, 0, 0, 0, 0.35, 0, 0, 0,
      0, 0, 0, 1.1, 0, 0, 0, 0, 0.35,
    ], 3));
    bGeo.computeVertexNormals();
    const bMat = new THREE.MeshBasicMaterial({ color: 0x2a2f3a, side: THREE.DoubleSide });
    this._birdList = [];
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(bGeo, bMat);
      b.position.set((i % 3) * 4 - 4, -(i % 3) * 1.2, i * 3.5);
      this._birds.add(b);
      this._birdList.push(b);
    }
    this._birds.visible = false;
    this.scene.add(this._birds);
    this._birdT = 14 + Math.random() * 14;
  }

  _updateZenFx(dt) {
    const day = this._dayNow || { night: 0, warm: 0 };
    const car = this.playerCar;
    const h = car.heading;
    const fx = Math.sin(h), fz = Math.cos(h);

    // Günəş/ay haləsi — fazaya görə rəng və güc
    if (this._halo) {
      this._halo.position.copy(this.sunDisc.position);
      const warm = day.warm || 0, night = day.night || 0;
      this._haloMat.color.set(night > 0.5 ? 0xa8c0e8 : warm > 0.4 ? 0xffa860 : 0xfff2d0);
      this._haloMat.opacity = 0.14 + warm * 0.5 + night * 0.22;
      this._halo.scale.setScalar(220 + warm * 130);
    }

    // Yağışda təkər su tozu (qar deyilsə)
    const rainNow2 = this._weather?.rain ?? 0;
    const spd2 = car.velocity.length();
    if (rainNow2 > 0.45 && spd2 > 12 && this._snow < 0.4) {
      this._sprayT = (this._sprayT ?? 0) - dt;
      if (this._sprayT <= 0) {
        this._sprayT = 0.1;
        const bx = car.position.x - fx * 1.3;
        const bz = car.position.z - fz * 1.3;
        const nx = fz, nz = -fx; // yan vektor
        for (const sgn of [-1, 1]) {
          this.effects.spawnSmoke(
            { x: bx + nx * 0.85 * sgn, y: 0.25, z: bz + nz * 0.85 * sgn },
            false, 0xa9c2d6, 0.45
          );
        }
      }
    }

    // Atəşböcəkləri: yalnız toran/gecə
    const ffOn = Math.min(1, day.night * 1.6 + (day.warm || 0) * 0.3);
    this._ffMat.opacity += (ffOn * 0.95 - this._ffMat.opacity) * Math.min(1, dt * 2);
    if (this._ffMat.opacity > 0.03) {
      const attr = this._fireflies.geometry.attributes.position;
      const road = this.road;
      for (let i = 0; i < this._ffData.length; i++) {
        const f = this._ffData[i];
        f.ph += dt * f.sp;
        // Uzaqda qalanları YOL BOYU qabaqda, dünya mövqeyində yenidən doğur
        const ddx = f.wx - car.position.x, ddz = f.wz - car.position.z;
        if (!f.alive || ddx * ddx + ddz * ddz > 210 * 210) {
          const li = Math.min(
            road.points.length - 1,
            Math.max(0, (car.wpHint ?? 0) - road.base + 4 + Math.floor(Math.random() * 22))
          );
          const rp = road.points[li];
          const rn = road.normals[li];
          const side = Math.random() < 0.5 ? -1 : 1;
          const off = 11 + Math.random() * 42;
          f.wx = rp.x + rn.x * off * side;
          f.wz = rp.z + rn.z * off * side;
          f.alive = true;
        }
        // Yerində zərif süzülmə (dünya mövqeyi ətrafında)
        attr.setXYZ(
          i,
          f.wx + Math.sin(f.ph) * 2.2,
          f.y + Math.sin(f.ph * 1.3) * 0.5,
          f.wz + Math.cos(f.ph * 0.7) * 2.2
        );
      }
      attr.needsUpdate = true;
    }

    // Axan ulduz: gecə, arabir
    if (day.night > 0.5 && this._starLife <= 0) {
      this._starT -= dt;
      if (this._starT <= 0) {
        this._starT = 9 + Math.random() * 14;
        this._starLife = 1.1;
        const a = Math.random() * Math.PI * 2;
        this._starDir = new THREE.Vector3(Math.cos(a), -0.25, Math.sin(a)).normalize();
        this._shootStar.position.set(
          car.position.x + (Math.random() - 0.5) * 500,
          170 + Math.random() * 90,
          car.position.z + (Math.random() - 0.5) * 500
        );
        this._shootStar.lookAt(this._shootStar.position.clone().add(this._starDir));
        this._shootStar.rotateY(Math.PI / 2);
      }
    }
    if (this._starLife > 0) {
      this._starLife -= dt;
      this._shootStar.position.addScaledVector(this._starDir, dt * 220);
      this._starMat.opacity = Math.max(0, Math.min(1, this._starLife * 1.6)) * 0.85;
    } else if (this._starMat.opacity > 0) {
      this._starMat.opacity = 0;
    }

    // Quşlar: gündüz, arabir üfüqdə süzür
    if (!this._birds.visible && day.night < 0.15) {
      this._birdT -= dt;
      if (this._birdT <= 0) {
        this._birdT = 22 + Math.random() * 18;
        this._birds.visible = true;
        this._birdLife = 26;
        const side = Math.random() < 0.5 ? -1 : 1;
        this._birds.position.set(
          car.position.x + fx * 160 - fz * side * 130,
          34 + Math.random() * 20,
          car.position.z + fz * 160 + fx * side * 130
        );
        this._birdVel = new THREE.Vector3(fz * side * -14 + fx * 4, 0, -fx * side * -14 + fz * 4);
        this._birds.lookAt(this._birds.position.clone().add(this._birdVel));
      }
    }
    if (this._birds.visible) {
      this._birdLife -= dt;
      this._birds.position.addScaledVector(this._birdVel, dt);
      const t = this._time * 7;
      this._birdList.forEach((b, i) => {
        b.rotation.x = Math.sin(t + i * 1.1) * 0.45; // qanad çırpma
        b.position.y = -(i % 3) * 1.2 + Math.sin(t * 0.5 + i) * 0.4;
      });
      if (this._birdLife <= 0 || day.night > 0.3) this._birds.visible = false;
    }
  }

  // ————— HUD —————
  _buildHUD() {
    this.uiRoot.innerHTML = `
      <div class="ehud">
        <div class="ehud__score"><b id="ehud-score">0</b><span id="ehud-dist">0.0 km</span></div>
        <div class="ehud__btns">
          <button class="ehud__btn" id="ehud-weather" title="Hava">🌦</button>
          <button class="ehud__btn" id="ehud-time" title="Günün vaxtı">🕐</button>
          <button class="ehud__btn" id="ehud-biome" title="Mühit">🌍</button>
          <button class="ehud__btn" id="ehud-music" title="Növbəti lofi trek">⏭</button>
          <button class="ehud__btn" id="ehud-retro" title="Retro filtr">📺</button>
          <button class="ehud__btn" id="ehud-pause" title="Pauza">⏸</button>
        </div>
        <div class="ehud__speed"><b id="ehud-speed">0</b><span>km/s</span></div>
        <div class="ehud__toast" id="ehud-toast"></div>
        <div id="ehud-overlay"></div>
      </div>
      <!-- AÇILIŞ: səhnə birdən partlayıb görünürdü. İndi qara ekrandan
           yumşaq açılır və rejimin adı bir anlıq görünür (yarışdakı geri
           sayımın zen qarşılığı — sürməyə mane olmur, oyunçu dərhal gedir) -->
      <div class="ezen-intro" id="ezen-intro">
        <div class="ezen-intro__title">${t('mode.free')}</div>
        <div class="ezen-intro__sub">${t('mode.free.d')}</div>
      </div>`;
    // Açılış pərdəsini növbəti kadrda söndür: səhnənin ilk kadrı hazır
    // olmamış başlasa, keçid "atlanmış" görünür
    const intro = this.uiRoot.querySelector('#ezen-intro');
    if (intro) {
      requestAnimationFrame(() => requestAnimationFrame(() => intro.classList.add('is-off')));
      setTimeout(() => intro.remove(), 2600);
    }
    this._el = {
      score: this.uiRoot.querySelector('#ehud-score'),
      dist: this.uiRoot.querySelector('#ehud-dist'),
      speed: this.uiRoot.querySelector('#ehud-speed'),
      toast: this.uiRoot.querySelector('#ehud-toast'),
      overlay: this.uiRoot.querySelector('#ehud-overlay'),
    };
    this.uiRoot.querySelector('#ehud-weather').onclick = () => this._cycleWeather();
    this.uiRoot.querySelector('#ehud-time').onclick = () => this._cycleDayTime();
    this.uiRoot.querySelector('#ehud-biome').onclick = () => this._cycleBiome();
    this.uiRoot.querySelector('#ehud-music').onclick = () => {
      const name = audio.nextLofiTrack();
      this._toast('🎵 ' + name);
    };
    this.uiRoot.querySelector('#ehud-retro').onclick = () => this._toggleRetro();
    this.uiRoot.querySelector('#ehud-pause').onclick = () => this._togglePause();

    // Retro scanline qatı (body-də — canvas filtri CSS-dədir)
    if (!document.getElementById('retro-lines')) {
      const rl = document.createElement('div');
      rl.id = 'retro-lines';
      document.body.appendChild(rl);
    }

    if (isTouchDevice()) {
      this.touchControls = new TouchControls(this.uiRoot, this.input, {
        onPause: () => this._togglePause(),
        onRescue: () => this._rescue(true),
        onCameraToggle: () => this._toggleCamMode(),
      });
      this.touchControls.setItems(null, null);
      // Zen-in öz ⏸ düyməsi var (sağ sıra) — touch pauzası dublikat olmasın
      this.uiRoot.querySelector('.touch [data-t="pause"], [data-t="pause"]')?.remove();
    }
  }

  _toast(text) {
    this._el.toast.textContent = text;
    this._el.toast.classList.add('is-on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this._el.toast.classList.remove('is-on'), 1800);
  }

  _toggleCamMode() {
    // Dövr: arxadan → sükan arxası → kapot → arxadan
    const order = ['tps', 'fps', 'hood'];
    this._camMode = order[(order.indexOf(this._camMode) + 1) % order.length];
    localStorage.setItem('apexCamMode', this._camMode);
    this.playerCar.root.visible = this._camMode !== 'fps';
    this._toast({ tps: '🎥 Arxadan görünüş', fps: '🎥 Sükan arxası', hood: '🎥 Kapot görünüşü' }[this._camMode]);
  }

  // ————— Oyun içi mühit idarəsi: hər düymə öz dəyərini yumşaq dəyişir —————
  _setWeather(w) {
    this._weatherOverride = w;
    const T = {
      clear: { fogMul: 0.1, rain: 0 },
      cloud: { fogMul: 0.55, rain: 0 },
      fog: { fogMul: 1.0, rain: 0 },
      rain: { fogMul: 0.45, rain: 0.9 },
      snow: { fogMul: 0.5, rain: 0.85 },
    };
    if (w) {
      this._weatherTarget = { ...T[w] };
      this._manualWeatherT = 1;   // əl ilə seçim: keçid sürətli olsun
    }
    else this._weatherTimer = 1.5; // avto — tezliklə təbii hava seçilsin
  }

  _setDayTime(id) {
    this._timeOverride = id;
    const P = { dawn: 0.93, day: 0.2, dusk: 0.48, night: 0.7 };
    // Ani sıçrayış yox: cari fazadan seçilənə doğru yumşaq sürüşmə
    if (this._dayPhase == null) this._dayPhase = (this._time % DAY_PERIOD) / DAY_PERIOD;
    this._dayPhaseTarget = id ? P[id] : null;
    this._dayFree = !id;
  }

  // Hava: avto → açıq → buludlu → duman → yağış → qar → avto (hamısı yumşaq keçir)
  _cycleWeather() {
    const opts = [null, 'clear', 'cloud', 'fog', 'rain', 'snow'];
    const names = {
      clear: '☀️ Açıq', cloud: '☁️ Buludlu', fog: '🌫 Duman',
      rain: '🌧 Yağış', snow: '🌨 Qar',
    };
    const i = (opts.indexOf(this._weatherOverride ?? null) + 1) % opts.length;
    this._setWeather(opts[i]);
    this._toast(opts[i] ? names[opts[i]] : '🌦 Avto hava');
  }

  // Günün vaxtı: avto → səhər → gündüz → qürub → gecə → avto
  _cycleDayTime() {
    const opts = [null, 'dawn', 'day', 'dusk', 'night'];
    const names = { dawn: '🌅 Səhər', day: '🌞 Gündüz', dusk: '🌇 Qürub', night: '🌙 Gecə' };
    const i = (opts.indexOf(this._timeOverride ?? null) + 1) % opts.length;
    this._setDayTime(opts[i]);
    this._toast(opts[i] ? names[opts[i]] : '🕐 Avto vaxt');
  }

  // Ətraf mühiti əl ilə dəyiş: avto → səhra → dağ → sahil → kanyon → avto
  _cycleBiome() {
    const names = { desert: 'Səhra', alpine: 'Dağlar', coast: 'Sahil', canyon: 'Kanyon', snow: 'Qarlıq' };
    if (this._biomeOverride == null) this._biomeOverride = 0;
    else if (this._biomeOverride >= BIOMES.length - 1) this._biomeOverride = null;
    else this._biomeOverride++;
    this._toast(this._biomeOverride == null
      ? '🌍 Avto (yol boyu dəyişir)'
      : '🌍 ' + names[BIOMES[this._biomeOverride].id]);
  }

  _toggleRetro() {
    const on = document.body.classList.toggle('retro-on');
    this._toast(on ? '📺 Retro: AÇIQ' : '📺 Retro: bağlı');
  }

  _bindKeys() {
    this.input.bind('Escape', () => this._togglePause());
    this.input.bind('KeyP', () => this._togglePause());
    this.input.bind('KeyF', () => this._rescue(true));
    this.input.bind('KeyN', () => { this._toast('🎵 ' + audio.nextLofiTrack()); });
    this.input.bind('KeyT', () => this._toggleRetro());
    this.input.bind('KeyV', () => this._toggleCamMode());
    this.input.bind('KeyB', () => this._cycleBiome());
    this.input.bind('KeyR', () => this._cycleWeather());
    this.input.bind('KeyG', () => this._cycleDayTime());
  }

  _togglePause() {
    if (this._state === 'paused') {
      this._state = 'run';
      this._el.overlay.innerHTML = '';
      this.touchControls?.setVisible(true);
      audio.setPaused(false);
      return;
    }
    this._state = 'paused';
    audio.setPaused(true);
    this.touchControls?.setVisible(false);
    this._el.overlay.innerHTML = `
      <div class="pause">
        <div class="screen__heading">Pauza</div>
        <div class="menu-sub" style="text-align:center">🎵 N — trek · 📺 T — retro filtr</div>
        <div class="btn-row">
          <button class="btn btn--primary" data-resume>${t('pause.resume')}</button>
          <button class="btn btn--ghost" data-quit>Menyu</button>
        </div>
      </div>`;
    this._el.overlay.querySelector('[data-resume]').onclick = () => this._togglePause();
    this._el.overlay.querySelector('[data-quit]').onclick = () => this.onQuit?.();
  }

  // ————— SƏRBƏST GƏZİNTİ SƏRHƏDİ —————
  // Əvvəl 20.5 m-də SƏRT görünməz divar vardı və maşın hər kadr ora yapışdırılırdı
  // ("şüşəyə sürtünmə" hissi). Chill janrda doğru davranış: divar yox, tədricən
  // artan müqavimət; su təbii sərhəd; çox uzaqda yumşaq avtomatik qaytarılma.
  _updateFreeRoam(dt, near) {
    const car = this.playerCar;
    const lat = Math.abs(near.lateral);
    const hw = this.road.halfWidth;
    const li = Math.min(Math.max(near.index - this.road.base, 0), this.road.points.length - 1);
    const nr = this.road.normals[li];
    const sgn = Math.sign(near.lateral) || 1;
    const outward = car.velocity.x * nr.x * sgn + car.velocity.z * nr.z * sgn; // + = uzaqlaşır

    // 1) KÖRPÜ: sürahi var, düşmək olmaz — sərt sıxışdırma yerinə yumşaq itələmə
    // XƏTA İDİ: şərt `_carGy > 2.8` idi. Relyefin bazası +11 m-dir (dünyanın
    // 82%-i 2.8-dən yuxarıdır) → sürahi klampı DÜZ YOLDA da işə düşürdü:
    // görünməz divar + hər kadr mövqe sıçrayışı (maşın əsirdi).
    // Doğru şərt: yol torpaqdan RAIL_ABOVE qədər yuxarıdadır (sürahi məhz
    // orada qurulur — bax EndlessRoad "KÖRPÜ" bloku).
    // Torpaq YOLUN altında ölçülür, maşının altında yox: maşın körpünün
    // yanındakı suya düşəndə də "körpüdədir" sayılıb səssizcə yola atılırdı.
    const ty = terrainY(car.position.x, car.position.z);
    const rpB = this.road.points[li];
    const onBridge = rpB.y - terrainY(rpB.x, rpB.z) > RAIL_ABOVE;
    // SÜRAHİNİN İÇ ÜZÜ hw + 0.3-dədir (bax EndlessRoad → körpü _ribbon).
    // Əvvəl klamp hw + 0.75 idi: maşının MƏRKƏZİ sürahinin içinə keçirdi və
    // gövdə dəmirin içindən çıxırdı. İndi maşının yarım eni də çıxılır —
    // gövdə sürahiyə söykənib dayanır (tunel divarında olduğu kimi).
    const CAR_HALF = 0.95;
    const RAIL = hw + 0.3 - CAR_HALF;
    // Sürahi yalnız KÖRPÜNÜN ÜSTÜNDƏ olan maşına aiddir. Maşın körpünün
    // yanındakı suda/torpaqdadırsa (ora yandan gəlib) sürahi onu tutmamalıdır —
    // əks halda görünməyən qüvvə onu yuxarı, yola atırdı.
    // Sürahi klampı maşını RAIL+0.8-də saxlayır; RAIL+2.5-i keçibsə deməli
    // körpünün üstündə deyil (yandan gəlib və ya aşağı düşüb)
    if (!onBridge || lat > RAIL + 2.5) this._onDeck = false;
    else if (lat <= RAIL) this._onDeck = true;
    if (onBridge && this._onDeck) {
      // SÜRAHİ = SƏRT DİVAR.
      // Əvvəl itələmə qüvvəsi + mövqe klampı vardı: maşın geri itilir, yenidən
      // sürahiyə dəyir, yenə itilir → TİTRƏYİRDİ. İndi klassik "divar boyu
      // sürüşmə" həlli: mövqedən yalnız ARTIQ hissə silinir, sürətdən yalnız
      // divara doğru olan komponent. Nəticə: maşın divarda dayanır, irəli
      // hərəkəti qalır, sükanı açıq tərəfə çevirən kimi sərbəst buraxılır.
      const excess = lat - RAIL;   // near.lateral ilə (bax tunel şərhi)
      if (excess > 0) {
        car.position.x -= nr.x * sgn * excess;
        car.position.z -= nr.z * sgn * excess;
        if (outward > 0) {          // divara doğru sürət söndürülür
          car.velocity.x -= nr.x * sgn * outward;
          car.velocity.z -= nr.z * sgn * outward;
        }
      }
      this._roamAway = 0;
      return;
    }

    // 1.5) TUNEL DİVARLARI
    // Tunelin içində qabıq var, amma fizikası YOX idi — divardan keçib
    // tunelin içinə/arxasına çıxmaq olurdu. Sürahi ilə eyni "divar boyu
    // sürüşmə" həlli: yalnız artıq yerdəyişmə və divara doğru sürət silinir.
    // Sərt zona: divar qabığı yalnız burada var (keçid zolağında yoxdur).
    // DİVAR yalnız DƏHLİZİN İÇİNDƏKİ maşına aiddir — tunelin ÜSTÜNDƏN/yanından
    // keçən maşını içəri dartmaq olmaz (körpüdəki `_onDeck` ilə eyni məntiq).
    const inTun = this.road.isInTunnel(car.position, car.wpHint);
    const TW0 = this.road.tunnelHalfWidth - 1.0;
    if (!inTun || lat > TW0 + 2.5) this._inTunnel = false;
    else if (lat <= TW0) this._inTunnel = true;
    if (inTun && this._inTunnel) {
      const TW = TW0;
      // DİQQƏT: düzəliş `near.lateral` ilə ölçülməlidir. Xam nöqtə
      // proyeksiyası tunelin sonunda fərqli dəyər verirdi və klamp işə
      // düşmürdü (ölçüldü: yan mövqe 14.5 m-ə çatırdı).
      const exT = lat - TW;
      if (exT > 0) {
        car.position.x -= nr.x * sgn * exT;
        car.position.z -= nr.z * sgn * exT;
        if (outward > 0) {
          car.velocity.x -= nr.x * sgn * outward;
          car.velocity.z -= nr.z * sgn * outward;
        }
      }
      this._roamAway = 0;
      return;                       // tuneldə su/dəhliz məntiqi işləmir
    }

    // 2) SU: təkərlər suya girirsə güclü müqavimət — "üzmək" yoxdur
    // SU yalnız o halda sayılır ki, maşın həqiqətən suyun içindədir:
    // yoldan kənardadır VƏ özü su səviyyəsindədir. Əvvəl yalnız altdakı
    // relyefə baxılırdı — su kənarından YOLLA keçəndə də "qaytarıldın" deyirdi.
    const inWater = !car.onRoad
      && ty < WATER_LEVEL - 0.05
      && car.position.y < WATER_LEVEL + 0.45;
    if (inWater) {
      car.velocity.multiplyScalar(Math.pow(0.06, dt));
      this._waterT = (this._waterT || 0) + dt;
      if (Math.random() < dt * 26) {
        this.effects.spawnSmoke({ x: car.position.x, y: WATER_LEVEL + 0.2, z: car.position.z }, false, 0xbfe4f5, 0.9);
      }
      if (this._waterT > 1.8) { this._waterT = 0; this._softReturn('💧'); }
    } else {
      this._waterT = 0;
    }

    // 3) YUMŞAQ DƏHLİZ: uzaqlaşdıqca müqavimət artır (divar yox)
    const SOFT = hw + 15;
    if (lat > SOFT) {
      const over = lat - SOFT;
      const k = Math.min(1, over / 26);
      // yalnız KƏNARA yönəlmiş sürət söndürülür — geri qayıtmaq sərbəstdir
      if (outward > 0) {
        const damp = 1 - Math.min(0.9, k * 1.35) * Math.min(1, dt * 4.2);
        car.velocity.x -= nr.x * sgn * outward * (1 - damp);
        car.velocity.z -= nr.z * sgn * outward * (1 - damp);
      }
      // yola doğru çox yüngül çəkiş — itməkdən qoruyur, idarəni almır
      const pull = k * 3.4;
      car.velocity.x -= nr.x * sgn * pull * dt;
      car.velocity.z -= nr.z * sgn * pull * dt;
    }

    // 4) ÇOX UZAQ: yumşaq avtomatik qaytarılma (oyunçu itməsin)
    const FAR = hw + 62;
    this._roamAway = lat > FAR ? (this._roamAway || 0) + dt : 0;
    if (this._roamAway > 2.2) { this._roamAway = 0; this._softReturn('🚩'); }
  }

  _softReturn(icon) {
    this._rescue(true);
    this._toast(icon + ' ' + t('zen.backOnRoad'));
  }

  _rescue(force = false) {
    const c = this.playerCar;
    if (!force && c.onRoad) return;
    const spot = this.road.nearestSpot(c.position);
    for (let i = 0; i < 4; i++) this.effects.spawnSmoke(c.position);
    c.reset(spot.point, spot.heading);
    this._rescueMark = (this._rescueMark || 0) + 1;   // testlər ayırd etsin
    this._onDeck = false;   // yola qayıtdı — körpü vəziyyəti yenidən qiymətləndirilsin
    this._latSm = 0;
    audio.sfx('rescue');
  }

  // ————— İŞÇİDƏN GƏLƏN RELYEFİN TƏTBİQİ —————
  // Buferlər hazırdır: hamısı BİR ANDA tətbiq olunur (yarımçıq görüntü yox).
  _applyTerrain({ gx, gz, h, col }) {
    this._twBusy = false;
    const geo = this.ground?.geometry;
    if (!geo) return;
    const pos = geo.attributes.position;
    if (h.length !== pos.count) return;   // tor ölçüsü dəyişib — nəticə köhnədir
    let vcol = geo.attributes.color;
    if (!vcol) {
      vcol = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
      geo.setAttribute('color', vcol);
      this._groundMat.vertexColors = true;
      this._groundMat.needsUpdate = true;
    }
    const pa = pos.array;
    for (let i = 0; i < pos.count; i++) pa[i * 3 + 2] = h[i];
    pos.needsUpdate = true;
    vcol.array.set(col);
    vcol.needsUpdate = true;
    geo.computeVertexNormals();
    this.ground.position.set(gx, 0, gz);
    if (this._twCells) this._roadCells = this._twCells;
    this._gridAx = gx - GROUND_SIZE / 2;
    this._gridAz = gz - GROUND_SIZE / 2;
  }

  // ————— Biom / hava / gün —————
  _applyBiomeStyle(b) {
    this.road.setStyle({
      // id KƏND KLASTERİ üçün lazımdır (yalnız yaşıl biomlarda kənd olur)
      id: b.id,
      road: b.road, curb: b.curb, curvMul: b.curvMul,
      small: this._natureReady ? (SMALL_BY_BIOME[b.id] || []) : [],
      decor: this._natureReady
        ? [...b.decor, ...(NATURE_BY_BIOME[b.id] || [])]
        : b.decor,
      mountainColor: b.mountain, fog: b.fog,
    });
    // Biom-spesifik yer toxuması (yalnız dəyişəndə — hər kadr yox)
    if (this._groundTexId !== b.id) {
      this._groundTexId = b.id;
      this._groundMat.map = this._groundTexFor(b.id);
      this._groundMat.needsUpdate = true;
    }
  }

  _biomeAt(dist) {
    // Əl ilə seçilmiş mühit — keçidsiz sabit qalır
    if (this._biomeOverride != null) {
      const b = BIOMES[this._biomeOverride];
      return { cur: b, nxt: b, k: 0, seg: -1 - this._biomeOverride };
    }
    const seg = Math.floor(dist / BIOME_LEN);
    const into = dist - seg * BIOME_LEN;
    const bi = ((seg % BIOMES.length) + BIOMES.length) % BIOMES.length; // mənfi məsafə üçün
    const cur = BIOMES[bi];
    const nxt = BIOMES[(bi + 1) % BIOMES.length];
    const k = into > BIOME_LEN - BLEND_LEN ? (into - (BIOME_LEN - BLEND_LEN)) / BLEND_LEN : 0;
    return { cur, nxt, k, seg };
  }

  _dayTint(t) {
    // 0..1 dövr: gündüz → qürub → gecə → dan (əl ilə seçim varsa sabit qalır)
    const ph = this._dayPhase != null ? this._dayPhase : (t % DAY_PERIOD) / DAY_PERIOD;
    let sky = 1, ground = 1, sunI = 1.2, warm = 0, elev = 1, night = 0;
    if (ph < 0.42) { /* gündüz */ }
    else if (ph < 0.55) { const k = (ph - 0.42) / 0.13; warm = k; sunI = 1.2 - k * 0.4; sky = 1 - k * 0.25; elev = 1 - k * 0.6; }
    else if (ph < 0.85) { const k = Math.min(1, (ph - 0.55) / 0.08); night = k; sky = 0.75 - k * 0.55; ground = 1 - k * 0.6; sunI = 0.8 - k * 0.62; warm = 1 - k; elev = 0.4 - k * 0.25; }
    else { const k = (ph - 0.85) / 0.15; night = 1 - k; sky = 0.2 + k * 0.8; ground = 0.4 + k * 0.6; sunI = 0.18 + k * 1.0; warm = k * 0.4; elev = 0.15 + k * 0.85; }
    return { sky, ground, sunI, warm, elev, night };
  }

  // Maşının oturacağı hündürlük: yolda yol səthi, kənarda TORPAQ.
  // Əvvəl kənarda hündürlük sıfıra doğru sönürdü — maşın ya havada üzürdü,
  // ya da təpədə torpağın içinə batırdı (yoldan çıxmaq qeyri-təbii görünürdü).
  // Yer meshinin həmin nöqtədəki ŞƏBƏKƏ hündürlüyü.
  // Mesh 10 m-lik xanalardan ibarətdir və vertexlər arası XƏTTİ keçir; analitik
  // groundYAt() isə əyridir. Fərq yol kəsiyinin yamacında 0.4 m-ə çatırdı və
  // maşın torpağa batmış görünürdü. Burada meshin öz 4 vertexi hesablanıb
  // bilinear qarışdırılır → maşın ekrandakı səthlə üst-üstə düşür.
  _meshGroundY(x, z) {
    const step = this._gridStep;
    if (!step || !this._roadCells) return groundYAt(x, z);
    const CELL = this._cellSize;
    const cells = this._roadCells;
    const nodeY = (wx, wz) => {
      let bd = Infinity, by = 0;
      const cx = Math.floor(wx / CELL), cz = Math.floor(wz / CELL);
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const arr = cells.get((cx + a) + '|' + (cz + b));
          if (!arr) continue;
          for (let q = 0; q < arr.length; q++) {
            const dx = wx - arr[q].x, dz = wz - arr[q].z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bd) { bd = d2; by = arr[q].y; }
          }
        }
      }
      return groundYAt(wx, wz, bd < CUT_OUT * CUT_OUT ? by : null, Math.sqrt(bd));
    };
    const u = (x - this._gridAx) / step, v = (z - this._gridAz) / step;
    const i0 = Math.floor(u), j0 = Math.floor(v);
    const tu = u - i0, tv = v - j0;
    const x0 = this._gridAx + i0 * step, z0 = this._gridAz + j0 * step;
    const h00 = nodeY(x0, z0), h10 = nodeY(x0 + step, z0);
    const h01 = nodeY(x0, z0 + step), h11 = nodeY(x0 + step, z0 + step);
    return (h00 * (1 - tu) + h10 * tu) * (1 - tv) + (h01 * (1 - tu) + h11 * tu) * tv;
  }

  // GÖRÜNƏN səthi izləyir: asfalt (hw+0.65) → çiyin zolağı (hw+4.2) → torpaq.
  // Bu profil EndlessRoad._verge geometriyası ilə EYNİDİR, torpaq isə yer
  // meshi ilə eyni groundYAt() funksiyasından oxunur. Əvvəl kənarda 8 m-lik
  // süni keçid vardı və torpaq düz terrainY sayılırdı → yol qazma içində
  // olanda maşın təpənin içinə girirdi, körpü yanında havada qalırdı.
  _groundYFor(car, dt = 0.016) {
    const road = this.road.heightAtPos(car.position, car.wpHint);
    const hw = this.road.halfWidth;
    const raw = Math.max(0, Math.abs(car.lateral || 0) - (hw + 0.65));
    // `lateral` hər kadr yola yenidən proyeksiya olunur və bir az titrəyir —
    // yüngül alçaq keçid filtri (gecikmə yaratmayacaq qədər cəld)
    const a = 1 - Math.exp(-dt * 25);
    this._latSm = (this._latSm ?? raw) + (raw - (this._latSm ?? raw)) * a;
    const off = this._latSm;
    if (off <= 0.02) return road;
    const g = Math.max(this._meshGroundY(car.position.x, car.position.z), WATER_LEVEL - 0.4);
    let k = Math.min(1, off / 3.55);   // çiyin zolağının eni (hw+4.2 − hw+0.65)
    k = k * k * (3 - 2 * k);           // smoothstep — kəskin sıçrayış olmasın
    return road * (1 - k) + g * k;
  }

  // ————— FARALAR —————
  // Nöqtəvi işıq TEXNİKİ olaraq yanırdı, amma görünmürdü: asfalt demək olar
  // qaradır və işığın özü (konus, lampa, yolda işıq gölməçəsi) yox idi.
  // Low-poly gecə sürüşündə görüntünü məhz bu üç element satır.
  _buildHeadlights() {
    const g = new THREE.Group();
    // Nə konus, nə lampa topları — ikisi də süni görünürdü (istifadəçi rəyi).
    // Gecə görüntüsünü YALNIZ projektor işığı + yolda yumşaq işıq sahəsi verir.
    this._hlBeams = [];
    // Yolda işıq gölməçəsi — radial qradiyent
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const cx = cv.getContext('2d');
    const gr = cx.createRadialGradient(32, 32, 1, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,240,210,0.95)');
    gr.addColorStop(0.30, 'rgba(255,234,195,0.55)');
    gr.addColorStop(0.62, 'rgba(255,228,182,0.20)');
    gr.addColorStop(1, 'rgba(255,225,175,0)');
    cx.fillStyle = gr;
    cx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._hlPool = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this._hlPool.rotation.x = -Math.PI / 2;
    this._hlPool.scale.set(11, 30, 1);
    this._hlPool.position.set(0, 0.07, 12.0);
    this._hlPool.renderOrder = 2;
    g.add(this._hlPool);
    g.visible = false;
    this._hl = g;
    this.playerCar.root.add(g);
  }

  // night: 0..1 — gecə payı
  _updateHeadlights(night) {
    if (!this._hl) return;
    const on = night > 0.06;
    this._hl.visible = on;
    if (!on) return;
    // Yüngül titrəyiş — canlı görünsün, amma göz yormasın
    const flick = 0.96 + Math.sin(this._time * 2.3) * 0.04;
    this._hlPool.material.opacity = 0.42 * night * flick;
  }

  _buildRain() {
    const geo = new THREE.BoxGeometry(0.03, 0.85, 0.03);
    const mat = new THREE.MeshBasicMaterial({ color: 0xcfe0ee, transparent: true, opacity: 0.55 });
    const n = 520; // qarda daha sıx görünsün
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.visible = false;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const drops = [];
    for (let i = 0; i < n; i++) {
      drops.push({
        x: (Math.random() - 0.5) * 70, y: Math.random() * 30,
        z: (Math.random() - 0.5) * 70, v: 26 + Math.random() * 14,
        // qar üçün: hər dənənin öz dolanma fazası və ölçüsü — eyni anda
        // eyni cür süzülməsinlər (əvvəl hamısı sinxron sürüşürdü)
        ph: Math.random() * 6.283, sz: 0.65 + Math.random() * 0.75,
      });
    }
    return { mesh, drops, m4: new THREE.Matrix4(), s4: new THREE.Matrix4() };
  }

  _updateWorld(dt) {
    const dist = this.playerCar.trackT * 8; // abs indeks × SEG
    this.road.ensure(dist);

    // Yol dəhlizi: kənara maksimum ~13 m — sonsuz çölə getmək olmur
    const car = this.playerCar;
    const near = this.road.getNearest(car.position, car.wpHint);
    // Təpə/körpü: maşın yol hündürlüyünə oturur, burnu meylə uyğun əyilir
    {
      const gy = this._groundYFor(car, dt);
      const ahead = this.road.heightAt(near.index + 2);
      const behind = this.road.heightAt(near.index - 2);
      // Dəqiq interpolyasiya var — hamarlama yalnız chunk tikişləri üçün, çox cəld
      const rate = car.onRoad ? 30 : 20; // torpaqda bir az yumşaq, amma gecikməsiz asqı
      this._carGy = (this._carGy ?? gy) + (gy - (this._carGy ?? gy)) * Math.min(1, dt * rate);
      // Təkərlər yerin İÇİNƏ girə bilməz: qalxanda asqı gecikməsi yoxdur,
      // enəndə hamarlama qalır (əks halda maşın təpəyə çıxanda torpağa batırdı)
      this._carGy = Math.max(this._carGy, gy - 0.03);
      car.position.y = this._carGy;
      const slope = Math.atan2(ahead - behind, 4 * 8); // 4 nöqtə × SEG(8m)
      // İrəli gedəndə yoxuş = burun yuxarı; heading yolla üst-üstə düşməyə bilər
      const fwd = Math.sin(car.heading) * this.road.tangents[Math.min(Math.max(near.index - this.road.base, 0), this.road.tangents.length - 1)].x
        + Math.cos(car.heading) * this.road.tangents[Math.min(Math.max(near.index - this.road.base, 0), this.road.tangents.length - 1)].z;
      this._carPitch = (this._carPitch ?? 0) + ((-slope * Math.sign(fwd || 1)) - (this._carPitch ?? 0)) * Math.min(1, dt * 7);
      car.root.rotation.x = this._carPitch;
      // Körpüdə dəhliz daralır (sürahilər) — havada üzmək olmaz
    }
    this._updateFreeRoam(dt, near);

    // Biom qarışığı
    const { cur, nxt, k, seg } = this._biomeAt(dist);
    if (seg !== this._lastSeg) {
      this._lastSeg = seg;
      this._toast('🌍 ' + { desert: 'Səhra', alpine: 'Dağlar', coast: 'Sahil', canyon: 'Kanyon', snow: 'Qarlıq' }[cur.id]);
    }
    // Keçidin ortasında chunk stili yenisinə keçir
    this._applyBiomeStyle(k > 0.5 ? nxt : cur);

    const mix = (a, b, kk) => new THREE.Color(a).lerp(new THREE.Color(b), kk);
    const day = this._dayTint(this._time);
    this._dayNow = day; // zen fx üçün
    // Biom rəngləri əl ilə seçiləndə ani sıçramasın: hədəf rənglərə yumşaq keçid
    if (!this._envCol) {
      this._envCol = {
        sky: new THREE.Color(cur.sky), skyB: new THREE.Color(cur.skyB),
        fog: new THREE.Color(cur.fog), ground: new THREE.Color(cur.ground),
      };
    }
    const kk = Math.min(1, dt * 0.5); // ~2 s keçid
    this._envCol.sky.lerp(mix(cur.sky, nxt.sky, k), kk);
    this._envCol.skyB.lerp(mix(cur.skyB, nxt.skyB, k), kk);
    this._envCol.fog.lerp(mix(cur.fog, nxt.fog, k), kk);
    this._envCol.ground.lerp(mix(cur.ground, nxt.ground, k), kk);
    const skyC = this._envCol.sky.clone().multiplyScalar(day.sky);
    const skyB = this._envCol.skyB.clone().multiplyScalar(day.sky * (1 + day.warm * 0.25));
    // Duman səmanın üfüq rəngi ilə qarışır: uzaq relyef səmaya əriyir
    // (atmosfer perspektivi). Əvvəl duman öz rəngində qalırdı və uzaq
    // obyektlərlə səma arasında görünən sərhəd yaranırdı.
    const fogC = this._envCol.fog.clone().multiplyScalar(0.35 + day.sky * 0.65)
      .lerp(this._envCol.skyB, 0.35);
    const groundC = this._envCol.ground.clone().multiplyScalar(day.ground);

    // ——— GECƏ QRADASİYASI ———
    // Əvvəl gecə sadəcə TÜNDLƏŞDİRMƏ idi: səhra narıncısı × 0.2 = palçıq
    // qəhvəyi. İndi rənglər dərin indiqoya çəkilir — gecə soyuq və sakit
    // görünür (zen rejiminin əsas hissi budur).
    if (day.night > 0.01) {
      skyC.lerp(NIGHT_SKY, day.night * 0.88);
      skyB.lerp(NIGHT_SKY_B, day.night * 0.80);
      fogC.lerp(NIGHT_FOG, day.night * 0.82);
      groundC.lerp(NIGHT_GROUND, day.night * 0.62);
    }

    // ——— Hava yerə hopur: yağış → yaş/tünd parıltılı torpaq, qar → ağ örtük ———
    // Əl ilə seçim biomdan üstündür: "yağış" qar biomunda da yağışdır
    const flakeNow = this._weatherOverride === 'snow' ? 1
      : this._weatherOverride === 'rain' ? 0
      : (k > 0.5 ? nxt : cur).flake;
    const rainNow = this._weather.rain;
    this._wet = this._wet ?? 0;
    this._snow = this._snow ?? 0;
    // Yaş: yağış yağdıqca islanır (τ≈8s), kəsiləndə quruyur
    this._wet += (((flakeNow ? 0 : rainNow)) - this._wet) * Math.min(1, dt * 0.12);
    // Qar örtüyü: yağdıqca yığılır (τ≈6s), kəsiləndə yavaş əriyir (τ≈25s)
    const biomeSnowBase = (k > 0.5 ? nxt : cur).id === 'snow' ? 0.75 : 0;
    const snowT = Math.max(biomeSnowBase, flakeNow ? rainNow : 0);
    this._snow += (snowT - this._snow) * Math.min(1, dt * (snowT > this._snow ? 0.2 : 0.02));
    groundC.multiplyScalar(1 - this._wet * 0.45); // yaş → aydın tündləşmə
    groundC.lerp(new THREE.Color(0xf0f4fa).multiplyScalar(Math.max(0.35, day.ground)), this._snow * 0.96); // qar → qalın ağ örtük
    this._groundMat.roughness = 1 - this._wet * 0.68; // yaş → güclü parıltı

    this._groundMat.color.copy(groundC);
    this.scene.fog.color.copy(fogC);
    const fogFar = 640 * (1 - this._weather.fogMul * 0.42) * (1 - day.night * 0.22);
    this.scene.fog.near = Math.max(42, 85 * (1 - this._weather.fogMul * 0.45));
    this.scene.fog.far = Math.max(210, fogFar);
    this.scene.background = fogC;

    // Səma toxuması — seyrək yenilənir (hər 0.4s)
    this._skyRegenT -= dt;
    if (this._skyRegenT <= 0) {
      this._skyRegenT = 0.4;
      this._skyMat.map?.dispose();
      this._skyMat.map = this._skyTexture(skyC, skyB, day.night);
      this._skyMat.needsUpdate = true;
    }

    // İşıqlar
    this.hemi.color.copy(skyC);
    this.hemi.groundColor.copy(groundC.clone().multiplyScalar(0.6));
    this.sun.intensity = day.sunI * (1 - this._weather.rain * 0.45);
    // Gecə "günəş" AY olur: soyuq mavi işıq — relyef tam qaraya düşmür
    this.sun.color.set(day.night > 0.5 ? 0x9fb6ff : (day.warm > 0.5 ? 0xffc98a : 0xffffff));
    // Ay işığı: gecə ambient qalxır ki, relyef büsbütün qara olmasın.
    // ƏVVƏL 0.26 idi — gecə yer qapqara olurdu və düz kölgələnmiş iri
    // üçbucaqlar sərt tünd ləkələr kimi oxunurdu (istifadəçi skrinşotu).
    this.amb.intensity = 0.32 * (0.5 + day.sky * 0.5) + day.night * 0.5;
    // Gecə istiqamətli "ay" işığını zəiflədirik: kontrast azalır, üzlər
    // arasındakı kəskin sərhəd yumşalır
    this.sun.intensity *= (1 - day.night * 0.45);
    this.headlight.intensity = day.night * 190;
    this._updateHeadlights(day.night);

    // Günəş mövqeyi (maşını izləyir)
    const c = this.playerCar.position;
    this.skyDome.position.set(c.x, 0, c.z);
    if (this.stars) {
      this.stars.position.set(c.x, 0, c.z);
      // yumşaq sayrışma (0.35 Hz) — sabit deyil, göz yormur
      this._starsMat.opacity = day.night * (0.72 + Math.sin(this._time * 2.2) * 0.08);
      this.stars.visible = day.night > 0.04;
      this.stars.rotation.y += dt * 0.004;   // çox yavaş səma dönüşü
    }
    // Yer KAFEL addımı ilə sürüşür — maşının altında "axmır"; sürüşdükcə
    // relyef hündürlükləri dünya funksiyasından yenidən hesablanır
    const gT = GROUND_SIZE / GROUND_REPEAT;
    const gx = Math.round(c.x / gT) * gT, gz = Math.round(c.z / gT) * gT;
    // XƏTA İDİ: mesh DƏRHAL yeni kafelə sıçrayırdı, hündürlüklər isə kadrlara
    // bölünmüş hesablama bitəndən sonra gəlirdi → bütün xəritə hər ~50 m-də
    // "yanıb-sönürdü" (istifadəçi rəyi). İndi mesh yalnız hesablama BİTƏNDƏ
    // yeni yerinə keçir. Su düz səthdir — onu dərhal sürüşdürmək təhlükəsizdir.
    this.water.position.set(gx, WATER_LEVEL, gz);
    // YOL UCU DA TƏTİKDİR: yer yalnız kafel sürüşəndə (hər ~50 m) yenidən
    // hesablanırdı, yol isə fasiləsiz qabağa uzanır. Aralıqda yaranan yeni
    // yol KƏSİLMƏMİŞ torpağın altından keçirdi və asfaltın üstündə yaşıl
    // torpaq dilimi görünürdü (istifadəçi skrinşotu). İndi yol ucu 48 m
    // irəlilədikdə də yenidən kəsilir.
    // Maşının kadrlar arası yerdəyişməsi (teleport aşkarı üçün)
    this._lastCarPos = this._lastCarPos || { x: c.x, z: c.z };
    const yolUcu = this.road.base + this.road.points.length;
    // 6 nöqtə (48 m) idi: yeni yaranan yol növbəti kəsimə qədər torpağın
    // altında qala bilirdi və uzaqdan asfaltın üstündə torpaq görünürdü.
    // İndi 2 nöqtə (16 m) — kəsim yolun ucundan geri qalmır.
    const ucSürüşdü = Math.abs(yolUcu - (this._cutTip ?? -1e9)) >= 2;
    if (gx !== this._groundSnap.x || gz !== this._groundSnap.z || ucSürüşdü) {
      this._groundSnap.x = gx; this._groundSnap.z = gz;
      this._cutTip = yolUcu;
      // Yol nöqtələrini şəbəkə xanalarına yığ (vertex başına sürətli axtarış).
      // Xəritə saxlanılır: maşının hündürlüyü də EYNİ anlıq görüntüdən oxunur
      // (bax _meshGroundY) — maşın ekranda gördüyümüz səthdə oturur.
      const CELL = 60;
      const cells = new Map();
      const rp = this.road.points;
      for (let i = 0; i < rp.length; i++) {
        const k = Math.floor(rp[i].x / CELL) + '|' + Math.floor(rp[i].z / CELL);
        let arr = cells.get(k);
        if (!arr) { arr = []; cells.set(k, arr); }
        // İNDEKS də saxlanılır: kəsim hündürlüyü qonşu seqmentə proyeksiya
        // ilə hesablanır (yalnız ən yaxın NÖQTƏ ilə yox)
        arr.push({ x: rp[i].x, y: rp[i].y, z: rp[i].z, i });
      }
      // DİQQƏT: _roadCells / _gridAx / _gridAz maşının hündürlüyünü verir
      // (_meshGroundY). Onları İŞ BİTƏNDƏ dəyişirik — yoxsa maşın hələ
      // yenilənməmiş mesh üzərində yeni məlumatla oturur və titrəyir.
      this._cellSize = CELL;
      this._gridStep = GROUND_SIZE / GROUND_SEGS;
      const pos = this.ground.geometry.attributes.position;
      // Vertex rəngi atributu (bir dəfə yaradılır)
      let vcol = this.ground.geometry.attributes.color;
      if (!vcol) {
        vcol = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
        this.ground.geometry.setAttribute('color', vcol);
        this._groundMat.vertexColors = true;
        this._groundMat.needsUpdate = true;
      }
      // KADRA BÖLÜNMÜŞ HESABLAMA: 17 161 vertex bir kadrda hesablananda
      // kadr vaxtı 16 ms-dən 40 ms-ə sıçrayırdı — 60 FPS göstərsə də
      // "lag" hiss olunurdu (ölçüldü: p99 = 25 ms, spike 41 ms).
      // İndi iş növbəyə düşür və bir neçə kadra yayılır.
      // İŞÇİ VARSA: hesablama ora göndərilir (əsas mövzu boş qalır)
      if (this._tw && !this._twBusy) {
        const pos0 = this.ground.geometry.attributes.position;
        if (!this._twLocal || this._twLocal.x.length !== pos0.count) {
          const lx = new Float32Array(pos0.count), ly = new Float32Array(pos0.count);
          for (let i = 0; i < pos0.count; i++) { lx[i] = pos0.getX(i); ly[i] = pos0.getY(i); }
          this._twLocal = { x: lx, y: ly };
        }
        const rp2 = this.road.points;
        const pxA = new Float32Array(rp2.length), pyA = new Float32Array(rp2.length), pzA = new Float32Array(rp2.length);
        for (let i = 0; i < rp2.length; i++) { pxA[i] = rp2[i].x; pyA[i] = rp2[i].y; pzA[i] = rp2[i].z; }
        this._twBusy = true;
        this._twCells = cells;
        this._tw.postMessage({
          id: (this._twId = (this._twId || 0) + 1), gx, gz,
          px: pxA, py: pyA, pz: pzA,
          localX: this._twLocal.x, localY: this._twLocal.y, CELL,
        });
        this._cutJob = null;   // əsas mövzuda iş yoxdur — nəticə mesajla gələcək
      } else {
      this._cutJob = {
        i: 0, gx, gz, cells, CELL,
        h: this._cutBufH && this._cutBufH.length === pos.count
          ? this._cutBufH : (this._cutBufH = new Float32Array(pos.count)),
        c: this._cutBufC && this._cutBufC.length === pos.count * 3
          ? this._cutBufC : (this._cutBufC = new Float32Array(pos.count * 3)),
      };
      }
    }
    // ————— Növbədəki yer hesablaması (kadr başına bir dilim) —————
    if (this._cutJob) {
      const job = this._cutJob;
      const { gx: jgx, gz: jgz, cells, CELL } = job;
      const pos = this.ground.geometry.attributes.position;
      const vcol = this.ground.geometry.attributes.color;
      // Böyük sıçrayışda (teleport / F ilə yola qayıtma / biom keçidi)
      // relyefi kadrlara bölmək köhnə torpağı ekranda saxlayır — bir kadrlıq
      // yavaşlama buna dəyər. Adi sürüşdə isə bölünür (lag olmasın).
      const sıçrayış = this._lastCarPos
        ? Math.hypot(c.x - this._lastCarPos.x, c.z - this._lastCarPos.z) > 60 : true;
      const SLICE = sıçrayış ? 1e9 : 8800;
      const son = Math.min(pos.count, job.i + SLICE);
      for (let i = job.i; i < son; i++) {
        const gx = jgx, gz = jgz;
        // Plane XY müstəvisindədir (sonra X oxu ətrafında döndərilib):
        // yerli x → dünya x, yerli y → dünya -z
        const wx = gx + pos.getX(i);
        const wz = gz - pos.getY(i);
        // YOL KƏSİYİ: yol torpaqdan aşağıdırsa (tunel/qazma) torpaq kəsilir —
        // yoxsa relyef yolun üstünü örtür və maşın "torpağın içində" qalır
        let bd = Infinity, by = 0, bi = -1;
        const cx = Math.floor(wx / CELL), cz = Math.floor(wz / CELL);
        for (let a = -1; a <= 1; a++) {
          for (let b = -1; b <= 1; b++) {
            const arr = cells.get((cx + a) + '|' + (cz + b));
            if (!arr) continue;
            for (let q = 0; q < arr.length; q++) {
              const dx = wx - arr[q].x, dz = wz - arr[q].z;
              const d2 = dx * dx + dz * dz;
              if (d2 < bd) { bd = d2; by = arr[q].y; bi = arr[q].i; }
            }
          }
        }
        // XƏTA İDİ: kəsim ƏN YAXIN NÖQTƏNİN hündürlüyünü işlədirdi. Yol
        // nöqtələri 8 m aralıdır və mailli hissədə qonşu vertex UZAQ, DAHA
        // HÜNDÜR nöqtəni tuturdu → yer səthi asfaltın kənarında 5–25 sm
        // yuxarı qalxırdı (şüa testi). İndi qonşu seqmentə PROYEKSİYA ilə
        // yolun həqiqi hündürlüyü tapılır.
        if (bi >= 0) {
          const rpAll = this.road.points;
          for (const j of [bi - 1, bi]) {
            const a0 = rpAll[j], a1 = rpAll[j + 1];
            if (!a0 || !a1) continue;
            const ex = a1.x - a0.x, ez = a1.z - a0.z;
            const L2 = ex * ex + ez * ez;
            if (L2 < 1e-6) continue;
            let t = ((wx - a0.x) * ex + (wz - a0.z) * ez) / L2;
            t = Math.max(0, Math.min(1, t));
            const px = a0.x + ex * t, pz = a0.z + ez * t;
            const d2 = (wx - px) * (wx - px) + (wz - pz) * (wz - pz);
            if (d2 < bd) { bd = d2; by = a0.y + (a1.y - a0.y) * t; }
          }
        }
        // Maşının hündürlüyü ilə EYNİ funksiya (bax _groundYFor).
        // Nəticə KÖLGƏ buferinə yazılır — mesh yarımçıq görünmür.
        job.h[i] = groundYAt(wx, wz, bd < CUT_OUT * CUT_OUT ? by : null, Math.sqrt(bd));
        // İRİ MİQYASLI LƏKƏLƏR: tekstura 50 m-də təkrarlanır və yer düz bir
        // rəng kimi görünürdü. Vertex rəngi dünya koordinatından alçaq tezlikli
        // funksiya ilə hesablanır → ləkələr TƏKRARLANMIR, dərinlik yaranır.
        if (vcol) {
          // XƏTA İDİ: dalğa uzunluğu ~200 m, amplituda ±11% — nəticədə yerdə
          // uzun tünd ZOLAQLAR yaranırdı və "görünməz maneənin kölgəsi" kimi
          // oxunurdu (zen-də heç bir işıq kölgə salmır). İndi üç oktava, qısa
          // dalğa (50–125 m) və zəif amplituda (±5%) — torpaq faktura alır,
          // kölgə təəssüratı yaratmır.
          const n1 = Math.sin(wx * 0.050 + 0.7) * Math.cos(wz * 0.044 - 1.2);
          const n2 = Math.sin((wx * 0.7 + wz) * 0.081 + 2.4);
          const n3 = Math.sin(wx * 0.118 - wz * 0.093 + 4.1);
          const k = 0.972 + (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) * 0.052;   // 0.92 … 1.02
          const warm = 1 + n2 * 0.014;
          job.c[i * 3] = k * warm; job.c[i * 3 + 1] = k; job.c[i * 3 + 2] = k * (2 - warm);
        }
      }
      job.i = son;
      if (job.i >= pos.count) {
        // Hamısı hazırdır — İNDİ birdəfəlik tətbiq olunur (görüntü sıçramır)
        const pa = pos.array;
        for (let i = 0; i < pos.count; i++) pa[i * 3 + 2] = job.h[i];
        pos.needsUpdate = true;
        if (vcol) { vcol.array.set(job.c); vcol.needsUpdate = true; }
        this.ground.geometry.computeVertexNormals();
        this.ground.position.set(job.gx, 0, job.gz);
        this._roadCells = job.cells;
        this._gridAx = job.gx - GROUND_SIZE / 2;
        this._gridAz = job.gz - GROUND_SIZE / 2;
        this._cutJob = null;
      }
    }
    this._lastCarPos.x = c.x; this._lastCarPos.z = c.z;
    const elevY = 80 + day.elev * 320;
    this.sunDisc.position.set(c.x + 500, elevY, c.z + 330);
    this.sunDisc.lookAt(c.x, 0, c.z);
    this.sunDisc.material.color.set(day.night > 0.5 ? 0xdfe8ff : (day.warm > 0.5 ? 0xffb46a : 0xffe6b0));
    this.sunDisc.scale.setScalar(day.night > 0.5 ? 0.65 : 1);
    this.sun.position.set(c.x + 60, 110, c.z + 40);
    this.sun.target.position.copy(c);
    this.sun.target.updateMatrixWorld();
    {
      const hh = this.playerCar.heading;
      const hy = (this._carGy ?? 0);
      this.headlight.position.set(c.x + Math.sin(hh) * 2.0, hy + 1.15, c.z + Math.cos(hh) * 2.0);
      // Hədəf 24 m qabaqda, yol səviyyəsində — konus asfaltı yalayır
      this.headlight.target.position.set(c.x + Math.sin(hh) * 24, hy - 0.6, c.z + Math.cos(hh) * 24);
      this.headlight.target.updateMatrixWorld();
    }

    // Hava dəyişimi
    // Hava dəyişimi ilə birlikdə günün vaxtı da axıcı sürüşür (time-lapse)
    if (this._timeGoal != null) {
      const need = this._timeGoal - this._time;
      const step = Math.min(need, dt * 30);
      this._time += step;
      if (need <= step + 0.01) this._timeGoal = null;
    }
    // Günün vaxtı seçiləndə yumşaq keçid (ən qısa istiqamətlə, ~6 s)
    if (this._dayPhase != null) {
      if (this._dayPhaseTarget != null) {
        let d = this._dayPhaseTarget - this._dayPhase;
        if (d > 0.5) d -= 1;
        if (d < -0.5) d += 1;
        const step = Math.sign(d) * Math.min(Math.abs(d), dt / 22);
        this._dayPhase = (this._dayPhase + step + 1) % 1;
        if (Math.abs(d) < 0.004) { this._dayPhase = this._dayPhaseTarget; this._dayPhaseTarget = null; }
      } else if (this._dayFree) {
        // Avtoya qayıdış: sərbəst dövrə qoşulana qədər öz sürəti ilə irəliləyir
        this._dayPhase = (this._dayPhase + dt / DAY_PERIOD) % 1;
        const nat = (this._time % DAY_PERIOD) / DAY_PERIOD;
        let d2 = nat - this._dayPhase;
        if (d2 > 0.5) d2 -= 1;
        if (d2 < -0.5) d2 += 1;
        if (Math.abs(d2) < 0.02) { this._dayPhase = null; this._dayFree = false; }
        else this._dayPhase = (this._dayPhase + Math.sign(d2) * dt / 12 + 1) % 1;
      }
    }

    // Çay suyu axır
    // Dalğa sürüşməsi DÜNYAYA bağlıdır: su müstəvisi 52 m addımlarla sürüşəndə
    // tekstura yerində qalır (sıçrayış yoxdur), üstündən yavaş axım əlavə olunur
    {
      const m = this.water.material.map;
      const T = this._waterTile;
      this._waterFlow = (this._waterFlow || 0) + dt * 0.012;
      m.offset.set(
        this.water.position.x / T,
        -this.water.position.z / T + this._waterFlow
      );
    }

    this._weatherTimer -= dt;
    if (this._weatherTimer <= 0 && !this._weatherOverride) {
      this._timeGoal = this._time + 60 + Math.random() * 150; // hava ilə günün vaxtı da dəyişsin
      // Hava çox tez-tez dəyişirdi (30–55 s) — zen rejimində bu narahat edir.
      // İndi bir hava 2–4 dəqiqə qalır, keçid isə uzun və hiss olunmazdır.
      this._weatherTimer = 120 + Math.random() * 120;
      const w = (k > 0.5 ? nxt : cur).weather;
      // Eyni havanın təkrarı olmasın — dövr canlı qalsın
      const pool = [];
      for (let i = 0; i < Math.round(w.clear * 10); i++) pool.push('clear');
      for (let i = 0; i < Math.round(w.fog * 10); i++) pool.push('fog');
      for (let i = 0; i < Math.round((1 - w.clear - w.fog) * 10); i++) pool.push('rain');
      pool.push('cloud', 'cloud'); // buludlu hər biomda mümkündür
      const cand = pool.filter((x) => x !== this._autoWeather);
      const pick = (cand.length ? cand : pool)[Math.floor(Math.random() * (cand.length || pool.length))];
      this._autoWeather = pick;
      if (pick === 'clear') this._weatherTarget = { fogMul: 0.1 + Math.random() * 0.18, rain: 0 };
      else if (pick === 'cloud') this._weatherTarget = { fogMul: 0.5 + Math.random() * 0.2, rain: 0 };
      else if (pick === 'fog') this._weatherTarget = { fogMul: 0.8 + Math.random() * 0.25, rain: 0 };
      else this._weatherTarget = { fogMul: 0.45, rain: 0.6 + Math.random() * 0.4 };
    }
    // Keçid sabiti 7 s → 22 s: yağış birdən "yanıb-sönmür", tədricən gəlir.
    // Əl ilə seçiləndə isə oyunçu nəticəni dərhal görməlidir (τ≈4 s).
    const wTau = this._manualWeatherT > 0 ? 4 : 22;
    if (this._manualWeatherT > 0) this._manualWeatherT -= dt / 12;
    this._weather.fogMul += (this._weatherTarget.fogMul - this._weather.fogMul) * Math.min(1, dt / wTau);
    this._weather.rain += (this._weatherTarget.rain - this._weather.rain) * Math.min(1, dt / wTau);

    // Yağış / qar hissəcikləri
    const rain = this._rain;
    const rAmount = this._weather.rain;
    // TUNELDƏ yağış/qar görünməməlidir — tavan var (əvvəl içəri yağırdı)
    const inTunnel = this.road?.tunnelAtPos?.(this.playerCar.position, this.playerCar.wpHint) > 0.35;
    rain.mesh.visible = rAmount > 0.04 && !inTunnel;
    if (rain.mesh.visible) {
      // QAR seçimi biomdan asılı DEYİL: səhrada "qar" seçəndə yer ağarır, ona görə
      // göydən də qar düşməlidir (əvvəl damcı düşürdü — uyğunsuz görünürdü)
      const flake = flakeNow;
      rain.mesh.material.opacity = (flake ? 0.62 : 0.5) * rAmount;
      rain.mesh.material.color.set(flake ? 0xffffff : 0xcfe0ee);
      const fall = flake ? 4.2 : 30;
      const tt = this._time;
      // Qarda hissəciklərin yalnız bir hissəsi görünsün ki, yağış sıxlığı dəyişməsin
      const live = flake ? rain.drops.length : Math.round(rain.drops.length * 0.62);
      for (let i = 0; i < rain.drops.length; i++) {
        const d = rain.drops[i];
        if (i >= live) { rain.m4.makeScale(0, 0, 0); rain.mesh.setMatrixAt(i, rain.m4); continue; }
        d.y -= (d.v * (fall / 30)) * dt;
        if (flake) {
          // iki fərqli tezlikli dolanma → təbii süzülmə, sinxronluq yoxdur
          d.x += (Math.sin(tt * 1.05 + d.ph) * 1.5 + Math.sin(tt * 0.33 + d.ph * 2.7) * 0.8) * dt;
          d.z += Math.cos(tt * 0.82 + d.ph * 1.6) * 1.2 * dt;
        }
        if (d.y < 0) {
          d.y = 24 + Math.random() * 8;
          d.x = (Math.random() - 0.5) * 70;
          d.z = (Math.random() - 0.5) * 70;
        }
        rain.m4.makeTranslation(c.x + d.x, d.y, c.z + d.z);
        if (flake) {
          const s = d.sz;
          rain.s4.makeScale(1.9 * s, 0.13 * s, 1.9 * s);
          rain.m4.multiply(rain.s4);
        }
        rain.mesh.setMatrixAt(i, rain.m4);
      }
      rain.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  _skyTexture(top, bottom, night) {
    const cv = document.createElement('canvas');
    cv.width = 8; cv.height = 512;   // daha hamar keçid (banding yox)
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    // ATMOSFER: əvvəl 5 dayaq və dar (0.47–0.54) üfüq zolağı vardı — keçid
    // sərt idi və zolaqlanma (banding) görünürdü. İndi geniş, yumşaq
    // atmosfer qatı: zenitdən üfüqə tədricən açılır, üfüqdə isti işıq
    // halqası var (gecə soyuq ay parıltısı).
    const glow = bottom.clone().lerp(new THREE.Color(night > 0.5 ? 0xa8c0ff : 0xffffff),
      night > 0.5 ? 0.12 : 0.42);
    const üst = top.clone();
    const zenit = üst.clone().multiplyScalar(0.9);          // zenit bir az tünd
    const orta = üst.clone().lerp(bottom, 0.55);
    g.addColorStop(0.00, '#' + zenit.getHexString());
    g.addColorStop(0.18, '#' + üst.getHexString());
    g.addColorStop(0.38, '#' + orta.getHexString());
    g.addColorStop(0.46, '#' + bottom.clone().lerp(glow, 0.35).getHexString());
    g.addColorStop(0.50, '#' + glow.getHexString());
    g.addColorStop(0.56, '#' + bottom.clone().lerp(glow, 0.25).getHexString());
    g.addColorStop(0.72, '#' + bottom.getHexString());
    g.addColorStop(1.00, '#' + bottom.clone().multiplyScalar(0.72).getHexString());
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 512);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Hər biom üçün fərqli, neytral-boz yer teksturası (rəng tint ilə gəlir)
  _groundTexFor(id) {
    this._gtCache = this._gtCache || {};
    if (this._gtCache[id]) return this._gtCache[id];
    const cv = document.createElement('canvas');
    cv.width = cv.height = 192;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#909090';
    ctx.fillRect(0, 0, 192, 192);
    // Ümumi incə səpinti
    for (let i = 0; i < 1400; i++) {
      const v = 128 + Math.floor((Math.random() - 0.5) * 24);
      ctx.fillStyle = `rgba(${v},${v},${v},0.45)`;
      ctx.fillRect(Math.random() * 192, Math.random() * 192, 2, 2);
    }
    if (id === 'desert') {
      // Qum dalğaları — yumşaq diaqonal zolaqlar
      for (let i = 0; i < 26; i++) {
        const y0 = Math.random() * 192;
        const light = Math.random() < 0.5;
        ctx.strokeStyle = light ? 'rgba(200,200,200,0.17)' : 'rgba(70,70,70,0.17)';
        ctx.lineWidth = 2.5 + Math.random() * 3;
        ctx.beginPath();
        ctx.moveTo(-10, y0);
        ctx.bezierCurveTo(60, y0 + 8, 130, y0 - 8, 202, y0 + 4);
        ctx.stroke();
      }
    } else if (id === 'alpine') {
      // Otlaq xalları — açıq/tünd ləkələr
      for (let i = 0; i < 34; i++) {
        const light = Math.random() < 0.5;
        ctx.fillStyle = light ? 'rgba(210,210,210,0.13)' : 'rgba(60,60,60,0.13)';
        ctx.beginPath();
        ctx.ellipse(Math.random() * 192, Math.random() * 192,
          6 + Math.random() * 16, 4 + Math.random() * 10, Math.random() * 3, 0, 7);
        ctx.fill();
      }
    } else if (id === 'canyon') {
      // Çatlamış torpaq — nazik tünd çatlar
      ctx.strokeStyle = 'rgba(50,40,35,0.20)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 24; i++) {
        let x = Math.random() * 192, y = Math.random() * 192;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s2 = 0; s2 < 4; s2++) {
          x += (Math.random() - 0.5) * 46;
          y += (Math.random() - 0.5) * 46;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else if (id === 'coast') {
      // Sahil qumu — geniş açıq ləkələr
      for (let i = 0; i < 20; i++) {
        ctx.fillStyle = 'rgba(215,215,215,0.08)';
        ctx.beginPath();
        ctx.ellipse(Math.random() * 192, Math.random() * 192,
          12 + Math.random() * 24, 8 + Math.random() * 14, Math.random() * 3, 0, 7);
        ctx.fill();
      }
    } else if (id === 'snow') {
      // Qar örtüyü — sedefli parıltı ləkələri + göyümtül kölgələr
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(140,165,195,0.07)';
        ctx.beginPath();
        ctx.ellipse(Math.random() * 192, Math.random() * 192,
          8 + Math.random() * 20, 5 + Math.random() * 12, Math.random() * 3, 0, 7);
        ctx.fill();
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.set(GROUND_REPEAT, GROUND_REPEAT);
    this._gtCache[id] = tex;
    return tex;
  }

  _noiseTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#909090';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const v = 128 + Math.floor((Math.random() - 0.5) * 26);
      ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ————— Əsas dövr —————
  // Test/nümayiş: sadə avtopilot (qabaqdakı nöqtəyə sükan)
  enableAutopilot() { this._auto = true; }

  update(dt) {
    if (this._state !== 'run') return;
    this._time += dt;

    if (this._auto) {
      const car = this.playerCar;
      const li = Math.min(
        this.road.points.length - 1,
        (car.wpHint ?? this.road.base) - this.road.base + 16
      );
      const tgt = this.road.points[Math.max(0, li)];
      const desired = Math.atan2(tgt.x - car.position.x, tgt.z - car.position.z);
      let err = desired - car.heading;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      // lateral>0 = mərkəzdən solda → sağa düzəliş (müsbət steer)
      const lat = car.lateral || 0;
      const steer = Math.max(-1, Math.min(1, -err * 2.2 + lat * 0.07));
      const drive = { throttle: 1, steer, handbrake: false };
      car.update(dt, drive, this.road);
    } else {
      this.controller.update(dt, this.road);
    }
    const car = this.playerCar;
    // Təpə/körpü: fizika hər kadr y-i sıfırlayır — yol hündürlüyü HƏR İKİ
    // rejimdə (əl ilə sürüş + avtopilot) fizikadan SONRA tətbiq olunur
    {
      const gy = this._groundYFor(car, dt);
      const rate = car.onRoad ? 30 : 20;
      this._carGy = (this._carGy ?? gy) + (gy - (this._carGy ?? gy)) * Math.min(1, dt * rate);
      // Təkərlər yerin İÇİNƏ girə bilməz: qalxanda asqı gecikməsi yoxdur,
      // enəndə hamarlama qalır (əks halda maşın təpəyə çıxanda torpağa batırdı)
      this._carGy = Math.max(this._carGy, gy - 0.03);
      car.position.y = this._carGy;
      car.root.position.y = this._carGy;
    }
    // Maneə toqquşması (yalnız yaxın pəncərə)
    for (const o of this.road.obstacles) {
      const dx = car.position.x - o.x;
      const dz = car.position.z - o.z;
      const min = o.r + CAR_RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.001;   // mərkəzdə qalma halı (bax GameplayScene)
        const nx = d2 > 1e-6 ? dx / d : 1, nz = d2 > 1e-6 ? dz / d : 0;
        car.position.x = o.x + nx * min;
        car.position.z = o.z + nz * min;
        const vn = car.velocity.x * nx + car.velocity.z * nz;
        if (vn < 0) {
          // ƏVVƏL 1.4 idi — bu, ƏKS SIÇRAYIŞ deməkdir: maşın divardan
          // güllə kimi geri atılırdı (istifadəçi rəyi). İndi yalnız divara
          // doğru olan komponent silinir (1.0) və divar boyu sürüşmə
          // yüngül sürtünmə ilə yavaşıyır — real "söykənib sürüşmə" hissi.
          car.velocity.x -= vn * nx;
          car.velocity.z -= vn * nz;
          car.velocity.multiplyScalar(0.94);
        }
      }
    }

    this._updateWorld(dt);
    this.effects.update(dt);
    this.skids.update(dt);
    this._updateSkidsAndSmoke(dt);
    this._updateZenFx(dt);
    this._updateCamera(dt);

    // Xal: sürət əsaslı (drift 2×)
    const speed = car.velocity.length();
    if (speed > 3) {
      this.score += speed * dt * (car.isDrifting ? 2 : 1);
    }
    this._odo = (this._odo ?? 0) + speed * dt; // gedilən yol — istiqamətdən asılı deyil
    this._el.score.textContent = Math.floor(this.score);
    this._el.dist.textContent = (this._odo / 1000).toFixed(1) + ' km';
    this._el.speed.textContent = Math.round(speed * 3.6);

    // Qızıl mərhələləri (hər 4000 xal)
    if (auth.isLoggedIn && this.score - this._goldMark >= 4000) {
      this._goldMark += 4000;
      auth.award(20, 'zen');
      this._toast('🪙 +20 qızıl (zen mərhələsi)');
    }

    // Mühərrik + sürət xətləri
    const speedT = Math.min(speed / car.maxSpeed, 1);
    audio.setEngine(speedT, car.boostTimer > 0);

    // Mobil rescue düyməsi vəziyyəti
    this.touchControls?.setRescueEnabled(!car.onRoad);
  }

  _updateSkidsAndSmoke(dt) {
    const car = this.playerCar;
    const speed = car.velocity.length();
    const drifting = car.isDrifting && speed > 9;
    const dusty = car.offRoad > 0.35 && speed > 10;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const rx = -Math.cos(car.heading), rz = Math.sin(car.heading);
    const bx = car.position.x - fx * 1.15;
    const bz = car.position.z - fz * 1.15;
    if (drifting && car.onRoad && car.position.y < 0.6) {
      const lX = bx + rx * -0.72, lZ = bz + rz * -0.72;
      const rX = bx + rx * 0.72, rZ = bz + rz * 0.72;
      if (car._skidPrev) {
        const d = Math.hypot(lX - car._skidPrev[0], lZ - car._skidPrev[1]);
        if (d > 0.35 && d < 6) {
          this.skids.add(car._skidPrev[0], car._skidPrev[1], lX, lZ);
          this.skids.add(car._skidPrev[2], car._skidPrev[3], rX, rZ);
        }
        if (d >= 0.35) car._skidPrev = [lX, lZ, rX, rZ];
      } else car._skidPrev = [lX, lZ, rX, rZ];
    } else car._skidPrev = null;
    car._smokeT = (car._smokeT ?? 0) - dt;
    if (car._smokeT <= 0) {
      if (drifting) { this.effects.spawnSmoke({ x: bx, y: car.position.y + 0.25, z: bz }, false, car.smokeColor ?? null, 0.7); car._smokeT = 0.09; }
      else if (dusty) { this.effects.spawnSmoke({ x: bx, y: car.position.y + 0.2, z: bz }, false, 0x9a8a6a, 0.8); car._smokeT = 0.11; }
    }
  }

  _updateCamera(dt) {
    const car = this.playerCar;
    const h = car.heading;
    const lookBack = (this.input.isDown('KeyC') || this.input.touch.lookBack) ? -1 : 1;
    const fx = Math.sin(h) * lookBack, fz = Math.cos(h) * lookBack;
    const speedT = Math.min(car.velocity.length() / car.maxSpeed, 1);
    // 🎥 FPS: sükan arxası
    if (this._camMode !== 'tps') {
      const hood = this._camMode === 'hood';
      if (hood && this._carH == null) {
        // Modelin hündürlüyü — yalnız GÖRÜNƏN mesh-lərdən (qalxan/alov sayılmasın)
        const bb = new THREE.Box3();
        car.root.updateWorldMatrix(true, true);
        car.root.traverse((o) => {
          if (!o.isMesh || o.visible === false || o.parent?.visible === false) return;
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          bb.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
        });
        this._carH = Math.min(2.2, Math.max(1.0, bb.max.y - bb.min.y));
      }
      // Kapot: kamera şüşənin önündə, kapotun ÜSTÜNDƏ — maşının burnu kadrda
      const fwd = hood ? 0.55 : 0.45;
      const cy = car.position.y;
      const camY = (hood ? this._carH * 0.62 + 0.42 : 1.5) + cy;
      this.camera.position.set(
        car.position.x + Math.sin(h) * fwd, camY,
        car.position.z + Math.cos(h) * fwd
      );
      // Kapotda baxış aşağı meyillidir — burun + yol görünür
      this._camTarget.set(
        car.position.x + fx * (hood ? 16 : 40),
        (hood ? 0.15 : 1.2) + cy,
        car.position.z + fz * (hood ? 16 : 40)
      );
      this.camera.lookAt(this._camTarget);
      this.camera.rotateZ(-(car._steerSmooth || 0) * 0.012 * lookBack);
      const ffov = (hood ? 64 : 66) + speedT * 12;
      if (Math.abs(this.camera.fov - ffov) > 0.1) {
        this.camera.fov = ffov;
        this.camera.updateProjectionMatrix();
      }
      return;
    }
    const back = 6.6 + speedT * 0.9;
    // Sürət qabaqlaması 0.11 → 0.075: driftdə kamera yana yellənirdi
    const desired = new THREE.Vector3(
      car.position.x - fx * back + car.velocity.x * 0.075, 3.2 + car.position.y,
      car.position.z - fz * back + car.velocity.z * 0.075
    );
    const look = new THREE.Vector3(car.position.x + fx * 7, 1.1 + car.position.y, car.position.z + fz * 7);
    // İLK KADR: kamera (0,0,0)-dan lerp edirdi, relyef isə ~25 m hündürdədir
    // → oyun başlayanda kamera YERİN İÇİNDƏN çıxırdı. İndi dərhal yerinə oturur.
    if (!this._camInit) {
      this._camInit = true;
      this.camera.position.copy(desired);
      this._camTarget.copy(look);
    } else {
      // İzləmə sürəti 8 → 11, baxış nöqtəsi 8 → 15: dönüşdə kamera maşının
      // arxasınca gecikmir (əvvəl ~125 ms geri qalırdı = "lag" hissi)
      this.camera.position.lerp(desired, 1 - Math.exp(-dt * 11));
      this._camTarget.lerp(look, 1 - Math.exp(-dt * 15));
    }
    this.camera.lookAt(this._camTarget);
    this.camera.rotateZ(-(car._steerSmooth || 0) * 0.018 * lookBack);
    const fov = 58 + speedT * 11;
    if (Math.abs(this.camera.fov - fov) > 0.1) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  dispose() {
    this._tw?.terminate?.();
    this._tw = null;
    this.input.enabled = true;
    this.input.binds.clear();
    this.touchControls?.dispose();
    this.effects?.dispose();
    this.skids?.dispose();
    this.road?.dispose();
    audio.stopEngine();
    audio.setZenMix(false); // adi miks bərpa olunsun
    this._fireflies?.geometry.dispose();
    this._ffMat?.dispose();
    this._glowTex?.dispose();
    this._haloMat?.dispose();
    this._shootStar?.geometry.dispose();
    this._starMat?.dispose();
    document.body.classList.remove('retro-on');
    document.getElementById('retro-lines')?.remove();
    // SIRA: qraf əvvəl (car.dispose övladları qrafdan çıxarır)
    disposeObject3D(this.scene);
    this.playerCar.dispose();
    this._skyMat.map?.dispose();
    this._rain.mesh.geometry.dispose();
    this._rain.mesh.material.dispose();
    this.scene.clear();
    this.uiRoot.innerHTML = '';
  }
}
