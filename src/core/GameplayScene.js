import * as THREE from 'three';
import { playerCarData } from '../data/playerCar.js';
import { t } from './i18n.js';
import { CARS, getCarById, carSkin } from '../data/cars.js';
import { getTrackById } from '../data/tracks.js';
import { TrackBuilder } from '../world/TrackBuilder.js';
import { makeNameTag, makeContainer, makeIceBlock, makeBasaltBlock, lavaGlowMat, setLampGlow } from './AssetFactory.js';
import { Weather } from '../world/Weather.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Environment } from '../world/Environment.js';
import { Car } from '../entities/Car.js';
import { PlayerController } from '../entities/PlayerController.js';
import { AIController } from '../entities/AIController.js';
import { chaseCamTweak } from './ChaseCam.js';
import { NetworkController } from '../entities/NetworkController.js';
import { RaceManager } from '../race/RaceManager.js';
import { PowerUpManager } from '../race/PowerUpManager.js';
import { disposeObject3D, mergeStaticGroup } from './MergeUtils.js';
import { playFinishFx } from './FinishFx.js';
import { Effects } from './Effects.js';
import { ImpactFeel } from './ImpactFeel.js';
import { SpeedLines } from './SpeedLines.js';
import { SkidMarks } from './SkidMarks.js';
import { audio } from './AudioManager.js';
import { TouchControls, isTouchDevice } from './TouchControls.js';
import { TUNING } from '../data/balance.js';
import { HUD } from '../ui/HUD.js';
import { SignatureAbility } from '../race/SignatureAbility.js';
import { signatureIconURL } from './SignatureIcons.js';

const RACE_CARS = 6;      // yarışda ümumi maşın sayı
// Dəymə xalları (Blur stili)
const HIT_SCORE = { missile: 100, mine: 80, bolt: 60, trishot: 25 };
const CAR_RADIUS = 1.5;   // toqquşma üçün
const END_WAIT = 30;     // ilk finişdən sonra yarışın bitməsinə qədər saniyə
// Bot çətinliyi → AI bacarıq aralığı [baza, yayılma]
// [bacarıq bazası, yayılma, sürət əmsalı, döngə cəsarəti]
// ÇƏTİN əvvəl 0.92 qaz idi — praktikada asan idi. İndi botlar daha
// sürətli maşın sürür (×1.08), döngəyə daha cəsarətlə girir və qazı
// demək olar buraxmır. ASAN isə əvvəlkindən də yumşaqdır.
const DIFF_SKILL = {
  easy:   [0.58, 0.10, 0.90, 0.75],
  normal: [0.82, 0.13, 1.00, 1.00],
  hard:   [1.00, 0.02, 1.12, 1.40],
};
const LANE_OFFSETS = [-0.42, 0.42, -0.24, 0.24, 0];

// 3D gameplay orkestratoru — Game-in "active scene" interfeysini həyata keçirir.
export class GameplayScene {
  constructor(config, { input, uiRoot, renderer = null, library, onFinish, onQuit, onRestart, onLobby = null }) {
    this.config = config;
    this.input = input;
    this.uiRoot = uiRoot;
    this.renderer = renderer;
    this.library = library;
    this.onFinish = onFinish;
    this.onQuit = onQuit;
    this.onLobby = onLobby;
    this.onRestart = onRestart;

    // Zen gün əyrisi paylaşılan lampa materiallarını söndürmüş ola bilər —
    // yarış/arena/futbol səhnəsi tam parıltı ilə başlamalıdır
    setLampGlow(2.1);

    this.isRace = config.mode === 'race';
    this.online = config.online || null; // { net, players } — onlayn yarış
    this.trackData = getTrackById(config.trackId);
    this.grade = this.trackData.grade; // Game.setActive → PostFX
    // CAN sistemi BÜTÜN xəritələrdə — lazer/manelər yalnız hazards olan trekdə (zavod)
    this.hz = this.trackData.hazards || { hp: 100, hitDamage: 18 };

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.5, 1000);
    this.camera.position.set(0, 8, -14);
    this.scene.add(this.camera); // kameraya bağlı effektlər (sürət zolaqları) render olunsun
    this.speedLines = new SpeedLines(this.camera);

    this._camTarget = new THREE.Vector3();
    this._time = 0;
    this._state = 'run'; // run | paused | done
    this._resultsSent = false;
    this.score = 0; // dəymə xalları
    this._playerDone = false;
    this._finishTimer = 0;

    this._buildWorld();
    this.skids = new SkidMarks(this.scene); // drift təkər izləri (1 draw call)
    this._buildCars();
    // KAMERA İLK KADRDAN maşının arxasındadır. Əvvəl dünya mərkəzindən
    // (0,8,-14) süzülüb gəlirdi — trekdən asılı olaraq yandan "uçub gələn"
    // qəribə giriş görünürdü (istifadəçi rəyi). Giriş ofseti (bir az yuxarı,
    // bir az uzaq) geri sayım ərzində yumşaq enir — bax _updateCamera.
    if (this.playerCar) {
      const c0 = this.playerCar, h0 = c0.heading;
      const bx = Math.sin(h0), bz = Math.cos(h0);
      this.camera.position.set(c0.position.x - bx * 13.1, 6.2, c0.position.z - bz * 13.1);
      this._camTarget.set(c0.position.x + bx * 7, 1.1, c0.position.z + bz * 7);
      this.camera.lookAt(this._camTarget);
    }
    // Can hər xəritədə: yerli maşınlara HP ver
    for (const car of this.cars) {
      if (!car.isRemote) { car.maxHp = this._maxHp(car); car.hp = car.maxHp; car._dmgCd = 0; car._invuln = 0; }
    }
    if (this.trackData.hazards) this._buildHazards(); // lazer/konteynerlər (zavod)
    // Trekin havası: qar / yağış / köz hissəcikləri + mühit səsi
    if (this.trackData.weather) {
      this.weather = new Weather(this.scene, this.trackData.weather, { lite: isTouchDevice() });
      audio.setWeather(this.trackData.weather === 'rain' ? 0.75 : 0, this.trackData.weather === 'snow' ? 0.7 : 0);
    }
    this._buildHUD();
    this.hud.setHP(this.playerCar.hp, this.playerCar.maxHp);
    this._bindKeys();

    // Kamera rejimi (yadda saxlanır): tps = arxadan, fps = sükan arxası
    this._camMode = ['fps', 'hood'].includes(localStorage.getItem('apexCamMode')) ? localStorage.getItem('apexCamMode') : 'tps';
    if (this._camMode === 'fps') this.playerCar.root.visible = false;

    // Dev/test üçün əlçatan istinad
    if (typeof window !== 'undefined') window.__scene = this;
  }

  // Finiş sonrası "şərəf dövrəsi": oyunçunun maşınını sakit avtopilot aparır
  _cruiseAfterFinish() {
    const idx = this.controllers.findIndex((c) => c.car === this.playerCar);
    if (idx < 0) return;
    const ai = new AIController(this.playerCar, { skill: 0.5, brave: 0.8 });
    ai._startDelay = 0;
    this.playerCar.maxSpeed *= 0.6; // yarış bitib — sakit templə (ölçüldü: məhdudiyyətsiz 40 m/s gedirdi)
    this.controllers[idx] = ai;
    const racer = this.racers?.find((r) => r.isPlayer);
    if (racer) racer.controller = ai;
  }

  // Test/nümayiş: oyunçunu AI idarə etsin
  enableAutopilot() {
    const idx = this.controllers.findIndex((c) => c.car === this.playerCar);
    const ai = new AIController(this.playerCar, { skill: 0.9 });
    ai.active = this.isRace ? this.raceManager.state === 'racing' : true;
    this.controllers[idx] = ai;
    const racer = this.racers?.find((r) => r.isPlayer);
    if (racer) racer.controller = ai;
  }

  _buildWorld() {
    this.track = new TrackBuilder(this.trackData);
    this.scene.add(this.track.build());
    this.environment = new Environment(this.scene, this.trackData, this.track, this.renderer);
    this._fitCameraFar();
  }

  // Kameranın görmə həddi uzaq relyefi (dağ halqası / şəhər silueti) trekin HƏR
  // nöqtəsindən əhatə etməlidir. Sabit 1000 m iri trekdə (Riviera, R = 353) çatmırdı:
  // qarşı tərəfdəki dağlar 1100 m-dən uzaqdadır və kəsilirdi. Kəsmə müstəvi üzrə
  // olduğundan dağ ekranın kənarında görünür, mərkəzində itir — kamera dönəndə üfüqdə
  // "nəsə hərəkət edir" (istifadəçi rəyi).
  _fitCameraFar() {
    const d = this.environment.distant;
    if (!d) return;
    const box = new THREE.Box3().setFromObject(d);
    // ən uzaq künc + trekin radiusu (maşın əks tərəfdə ola bilər) + kameranın geri məsafəsi
    const reach = Math.max(
      Math.hypot(box.min.x, box.min.z), Math.hypot(box.max.x, box.max.z),
      Math.hypot(box.min.x, box.max.z), Math.hypot(box.max.x, box.min.z));
    this.camera.far = Math.max(1000, Math.ceil(reach + this.track.maxRadius + 40));
    this.camera.updateProjectionMatrix();
  }

  _buildCars() {
    this.cars = [];
    this.controllers = [];
    this.racers = [];

    // ————— ONLAYN YARIŞ: hər oyunçu üçün bir maşın, AI yoxdur —————
    if (this.online) {
      const { net, players } = this.online;
      const slots = this.track.getGridSlots(players.length);
      players.forEach((pl, i) => {
        const isLocal = pl.id === net.selfId;
        const cid = pl.carId || CARS[i % CARS.length].id;
        const data = isLocal ? playerCarData(cid) : getCarById(cid);
        if (isLocal) this.playerData = data;   // finiş animasiyası üçün
        const car = new Car(data, this.library, { isPlayer: isLocal });
        car.isRemote = !isLocal;
        this._place(car, slots[i]);
        this.scene.add(car.root);
        // Rəqibin adı maşının üstündə (yalnız rəqiblər — özümüz yox)
        if (!isLocal) car.root.add(makeNameTag(pl.name));
        const ctrl = isLocal
          ? new PlayerController(car, this.input)
          : new NetworkController(car);
        this.cars.push(car);
        this.controllers.push(ctrl);
        this.racers.push({
          car, controller: ctrl, name: pl.name, isPlayer: isLocal,
          isRemote: !isLocal, netId: pl.id, color: data.bodyColor,
        });
        if (isLocal) this.playerCar = car;
      });
      this.raceManager = new RaceManager(this.racers, this.config.laps);
      this._wireRace();
      this.effects = new Effects(this.scene);
      this._warmFx();
      this._shake = 0;
      this.powerups = new PowerUpManager(this.scene, this.track, this.racers, {
        repairWeight: this.trackData.hazards?.lasers ? 4 : 2, // təhlükəli trekdə can daha tez-tez düşür
        effects: this.effects,
        onHit: (racer, kind) => {
          if (racer.isPlayer && kind !== 'trishot') { this._shake = 0.8; this._hitStop(1); }
          if (!racer.isRemote) this._weaponDamage(racer.car, kind);
        },
        onRemoteHit: (racer) => this._net?.sendEvent({ kind: 'hit', target: racer.netId }),
        seed: this.online.seed ?? null, // host seed-i — qutu tipləri hamıda eyni
      });
      // Hər iki slot dolu → qutu götürülmür: bunu AÇIQ de, yoxsa buq kimi görünür
    this.powerups.onSlotsFull = () => {
      if ((this._fullToastT ?? -9) > this._time - 5) return;
      this._fullToastT = this._time;
      this.hud?.showToast(isTouchDevice() ? '🎒 Slotların doludur — ✕ ilə birini at'
        : '🎒 Slotların doludur — X: aktivi at');
    };
    this.powerups.onScore = (shooter, kind, target) => {
        // Hədəfin qalxanı udubsa — xal YOX
        if (target?.car && target.car.shieldTimer > 0) return;
        if (shooter?.isPlayer) this._addScore(HIT_SCORE[kind] || 0);
      };
      this.powerups.onRepair = (racer) => {
        const car = racer.car;
        if (car.isRemote) return;
        car.hp = Math.min(car.maxHp, (car.hp ?? car.maxHp) + Math.round(car.maxHp * TUNING.damage.repair));
        if (racer.isPlayer) this.hud.setHP(car.hp, car.maxHp);
        this.effects.spawnSparkle(car.position, 0x7dff8a);
      };
      this.powerups.onBoltFired = () => this._net?.sendEvent({ kind: 'bolt' });
      this.powerups.onMissileFired = (target, x, z, h) =>
        this._net?.sendEvent({
          kind: 'missile', target: target?.netId ?? null,
          x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, h: Math.round(h * 1000) / 1000,
        });
      this.powerups.onBoxTaken = (i) => this._net?.sendEvent({ kind: 'box', i });
      this.powerups.onMineDropped = (id, x, z) =>
        this._net?.sendEvent({ kind: 'mine', mid: id, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
      this.powerups.onMineBoom = (id) => this._net?.sendEvent({ kind: 'mineboom', mid: id });
      this.powerups.onPlayerPickup = (item) => this.hud?.showToast(`${item.icon} ${item.name}!`);
      this.powerups.onTrishotFired = (x, z, h) =>
        this._net?.sendEvent({ kind: 'trishot', x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, h: Math.round(h * 1000) / 1000 });
      this.powerups.onRemoteSmallHit = (racer) => this._net?.sendEvent({ kind: 'hit2', target: racer.netId });
      this._obstacles = [
        ...(this.environment.obstacles || []),
        ...(this.track.obstacles || []),
      ];
      this._autoObstacles();
      this._setupNet();
      // SİNXRON START: hamının səhnəsi qurulana qədər geri sayım gözləyir
      this.raceManager.state = 'wait';
      this._waitT = 0; // toast HUD qurulandan sonra _updateWaitGate-də göstərilir
      if (!this._net.isHost) this._net.sendEvent({ kind: 'rdy2' });
      else this._checkAllScenesReady(); // tək nəfərlik otaq dərhal başlasın
      return;
    }

    const slots = this.track.getGridSlots(this.isRace ? RACE_CARS : 1);

    // Oyunçu maşını
    const playerData = playerCarData(this.config.carId);
    this.playerData = playerData;   // finiş animasiyası üçün (bax _playFinishFx)
    const playerCar = new Car(playerData, this.library, { isPlayer: true });
    playerCar.carId = this.config.carId;
    this.playerCar = playerCar;
    // İmza gücü — hər maşının yarışda bir dəfə işlədə biləcəyi öz gücü
    this.signature = new SignatureAbility(playerCar, this);
    SignatureAbility.warm(this.renderer);

    if (this.isRace) {
      // Oyunçu orta slotda (qabaqlama üçün maraqlı)
      const playerSlot = 2;
      this._place(playerCar, slots[playerSlot]);
      this.scene.add(playerCar.root);
      const pCtrl = new PlayerController(playerCar, this.input);
      this.cars.push(playerCar);
      this.controllers.push(pCtrl);
      this.racers.push({ car: playerCar, controller: pCtrl, name: playerData.name, isPlayer: true, color: playerData.bodyColor });

      // 5 AI (oyunçudan fərqli maşınlar)
      const pool = CARS.filter((c) => c.id !== playerData.id);
      this._shuffle(pool);
      const aiData = pool.slice(0, RACE_CARS - 1);
      let slotIdx = 0;
      aiData.forEach((data, i) => {
        if (slotIdx === playerSlot) slotIdx++;
        const car = new Car(data, this.library, { isPlayer: false });
        this._place(car, slots[slotIdx]);
        this.scene.add(car.root);
        const [dBase, dSpread, dSpeed, dBrave] = DIFF_SKILL[this.config.difficulty] || DIFF_SKILL.normal;
        // Maşının öz gücü çətinliyə görə miqyaslanır (oyunçunun maşını
        // toxunulmazdır — yalnız botlar)
        // DİQQƏT: sahə adı `engineForce`-dur (`accel` yoxdur — NaN verərdi)
        car.maxSpeed *= dSpeed;
        car.engineForce *= dSpeed;
        const ai = new AIController(car, {
          brave: dBrave,
          skill: dBase + Math.random() * dSpread,
          laneOffset: LANE_OFFSETS[i % LANE_OFFSETS.length] * this.track.halfWidth,
        });
        this.cars.push(car);
        this.controllers.push(ai);
        // BOTLARA DA İMZA GÜCÜ: əvvəl yalnız oyunçuda vardı — botlar öz
        // maşınlarının xüsusi gücünü heç vaxt işlətmirdi (istifadəçi rəyi).
        car.carId = data.id;
        const sig = new SignatureAbility(car, this);
        const racer = { car, controller: ai, name: data.name, isPlayer: false,
          color: data.bodyColor, signature: sig,
          // Çətinlik nə qədər yüksəkdirsə, gücü bir o qədər tez və yerində işlədir
          _sigWait: (this.config.difficulty === 'hard' ? 6 : this.config.difficulty === 'easy' ? 22 : 12)
            + Math.random() * 10 };
        this.racers.push(racer);
        slotIdx++;
      });

      this.raceManager = new RaceManager(this.racers, this.config.laps);
      this._wireRace();
    } else {
      // Sərbəst sürüş
      this._place(playerCar, { position: this.track.startPosition.clone(), heading: this.track.startHeading });
      this.scene.add(playerCar.root);
      const pCtrl = new PlayerController(playerCar, this.input);
      this.cars.push(playerCar);
      this.controllers.push(pCtrl);
      this.racers = [{ car: playerCar, controller: pCtrl, name: playerData.name, isPlayer: true, color: playerData.bodyColor, progress: 0 }];
    }

    // VFX + Power-up sistemi (hər iki rejimdə)
    this.effects = new Effects(this.scene);
    this._warmFx();
    this._shake = 0;
    this.powerups = new PowerUpManager(this.scene, this.track, this.racers, {
        repairWeight: this.trackData.hazards?.lasers ? 4 : 2, // təhlükəli trekdə can daha tez-tez düşür
      effects: this.effects,
      onHit: (racer, kind) => {
        if (racer.isPlayer && kind !== 'trishot') this._shake = 0.8;
        this._weaponDamage(racer.car, kind);
      },
    });
    // Hər iki slot dolu → qutu götürülmür: bunu AÇIQ de, yoxsa buq kimi görünür
    this.powerups.onSlotsFull = () => {
      if ((this._fullToastT ?? -9) > this._time - 5) return;
      this._fullToastT = this._time;
      this.hud?.showToast(isTouchDevice() ? '🎒 Slotların doludur — ✕ ilə birini at'
        : '🎒 Slotların doludur — X: aktivi at');
    };
    this.powerups.onScore = (shooter, kind, target) => {
      // Hədəfin qalxanı udubsa — xal YOX
      if (target?.car && target.car.shieldTimer > 0) return;
      if (shooter?.isPlayer) this._addScore(HIT_SCORE[kind] || 0);
    };
    this.powerups.onRepair = (racer) => {
      const car = racer.car;
      if (car.isRemote) return;
      car.hp = Math.min(car.maxHp, (car.hp ?? car.maxHp) + Math.round(car.maxHp * TUNING.damage.repair));
      if (racer.isPlayer) this.hud.setHP(car.hp, car.maxHp);
      this.effects.spawnSparkle(car.position, 0x7dff8a);
    };
    this.powerups.onPlayerPickup = (item) => this.hud?.showToast(`${item.icon} ${item.name}!`);

    // Bütün maneələr bir siyahıda (dekor + dağlar + postlar + tağ dirəkləri)
    this._obstacles = [
      ...(this.environment.obstacles || []),
      ...(this.track.obstacles || []),
    ];
    this._autoObstacles();   // qeydsiz qalmış dekora avtomatik maneə
  }

  _wireRace() {
    const rm = this.raceManager;
    rm.onCountdown = (label) => {
      this.hud.showCountdown(label);
      audio.sfx(label === 'GO' ? 'go' : 'count');
    };
    rm.onLap = (r) => {
      if (r.isPlayer) {
        const left = this.config.laps - r.lap;
        this.hud.showToast(left === 1 ? 'Son dövrə!' : `Dövrə ${r.lap + 1}`);
        audio.sfx('lap');
      }
    };
    rm.onPlayerFinish = () => {
      this._playerDone = true;
      this._finishTimer = 2.6;
      this.hud.showToast(t('tst.finish'));
      audio.sfx('finish');
      // Konfeti — qalibiyyətdə ikiqat
      const pr = this.racers.find((r) => r.isPlayer);
      const first = (pr?.position ?? 9) === 1;
      this.effects.spawnConfetti(this.playerCar.position, first);
      if (first) setTimeout(() => this.effects?.spawnConfetti(this.playerCar.position, true), 500);
      // Mağazadan alınmış FİNİŞ ANİMASİYASI (bax data/cosmetics.js → FINISHES)
      this._playFinishFx();
      // Finişdən sonra idarə oyunçudan alınır, maşını avtopilot YOL BOYU sakit sürür.
      // Əvvəl idarə sadəcə söndürülürdü: maşın əl əyləci ilə dümdüz gedib ilk
      // döngədə yoldan çıxırdı (istifadəçi rəyi).
      this._cruiseAfterFinish();
    };
    // İLK FİNİŞ: kimsə (bot və ya başqa oyunçu) birinci gələndə qalanlar üçün yarış
    // 30 saniyəyə bitir. Əvvəl oflayn yarış oyunçu finişə çatana qədər sonsuz davam
    // edirdi və uduzduğu heç yerdə bildirilmirdi (istifadəçi rəyi).
    rm.onFinish = (r, pos) => {
      if (pos !== 1 || this._endT != null) return;
      this._endT = END_WAIT;
      this._winnerName = r.name;
    };
    rm.onComplete = () => this._sendResults();
  }

  // Yarışın sonu: geri sayım, bildiriş və "Yarışı bitir" düyməsi. Hər kadr çağırılır.
  _updateRaceEnd(dt) {
    if (this._endT == null || this._state === 'done') return;
    this._endT = Math.max(0, this._endT - dt);
    const n = Math.ceil(this._endT);
    const online = !!this.online;
    if (this._playerDone || this._gaveUp) {
      // Onlayn: finişə çatan və ya yarışı bitirən oyunçu yerində qalıb digərlərini gözləyir
      if (online) {
        this.hud.setEndBanner({
          n, frac: this._endT / END_WAIT,
          title: t(this._gaveUp ? 'end.gaveTitle' : 'end.waitTitle'),
          sub: t('end.waitSub'),
        });
      }
    } else {
      this.hud.setEndBanner({
        lost: true, n, frac: this._endT / END_WAIT,
        title: t('end.lostTitle'),
        sub: t('end.lostSub', { name: this._winnerName }),
        button: t('end.btn'),
        onButton: () => this._giveUp(),
      });
      if (this._endT <= 0) this._giveUp(); // vaxt bitdi — düymə basılmış kimi
    }
  }

  // Oyunçu yarışı bitirir (düymə və ya 30 saniyə). Oflayn: dərhal nəticə ekranı.
  // Onlayn: maşın yerində qalır, host-a bildirilir; nəticəni host göndərir.
  _giveUp() {
    if (this._gaveUp || this._playerDone || this._state === 'done') return;
    this._gaveUp = true;
    const pr = this.racers.find((r) => r.isPlayer);
    if (pr?.controller) pr.controller.active = false;
    this.playerCar.velocity.set(0, 0, 0);
    if (!this.online) {
      this.hud.setEndBanner(null);
      this.raceManager.forceFinishRemaining(true); // → onComplete → nəticə ekranı
      return;
    }
    this.touchControls?.setVisible(false);
    this._net.sendEvent({ kind: 'giveup' });
    this._onGiveUp(this._net.selfId); // öz hadisəmiz bizə qayıtmır
  }

  // Onlayn: kimsə yarışı bitirdi. Host hamının bitib-bitmədiyini yoxlayır.
  _onGiveUp(id) {
    const r = this.racers.find((x) => x.netId === id);
    if (!r || r.gaveUp) return;
    r.gaveUp = true;
    if (!r.isPlayer) this.hud.showToast(t('end.gaveUp', { name: r.name }));
    if (this._net.isHost) {
      if (!this._hostResultsTimer) this._hostResultsTimer = END_WAIT;
      this._hostCheckAllDone();
    }
  }

  // Host: hamı finişə çatıb, yarışı bitirib və ya ayrılıbsa nəticəni dərhal göndər
  _hostCheckAllDone() {
    const done = this.racers.every((r) =>
      this._netFinishes.has(r.netId) || r.gaveUp || r.finishTime === Infinity);
    if (done) this._hostSendResults();
  }

  // Oyunçunun aldığı finiş animasiyasını oynadır (yoxdursa heç nə etmir)
  _playFinishFx() {
    const f = this.playerData?.cosmetics?.finish;
    if (!f?.kind) return;
    this._finishFx?.dispose();
    // Maşının özü ötürülür: effekt finiş xəttində qalmır, maşını izləyir
    this._finishFx = playFinishFx(this.scene, f.kind, this.playerCar, f.hex);
  }

  // ————— Onlayn şəbəkə axını —————
  _setupNet() {
    const net = this.online.net;
    this._net = net;
    this._netAcc = 0;
    this._netFinishes = new Map(); // host: id -> time
    this._resultsShown = false;

    net.on('state', (m) => {
      const r = this.racers.find((x) => x.netId === m.id);
      if (r?.isRemote) r.controller.push(m);
    });

    net.on('event', (m) => this._onNetEvent(m));

    const dropRacer = (id, note) => {
      const r = this.racers.find((x) => x.netId === id);
      if (r && !r.finished) {
        r.finished = true;
        r.finishTime = Infinity;
        r.car.root.visible = false;
        this.hud.showToast(r.name + note);
      }
    };
    net.on('left', (id) => {
      dropRacer(id, ' ayrıldı');
      if (net.isHost && this._hostResultsTimer) this._hostCheckAllDone();
    });
    this._dropRacer = dropRacer; // gleave hadisəsi _onNetEvent-də işlənir

    net.on('results', (rows) => this._showNetResults(rows));

    net.on('closed', () => {
      // Host otağı bağladı
      if (!this._resultsShown) {
        this._resultsShown = true;
        this.onQuit?.();
      }
    });

    if (net.isHost) {
      net.on('finish', ({ id, time }) => {
        this._netFinishes.set(id, time);
        if (!this._hostResultsTimer) this._hostResultsTimer = END_WAIT; // ilk finişdən sonra max gözləmə
        this._hostCheckAllDone();
      });
    }
  }

  // Host: bütün qonaqların səhnəsi hazırdırsa geri sayımı başlat
  _checkAllScenesReady() {
    if (this._cstartSent || !this._net?.isHost) return;
    const guests = this.online.players.filter((p) => p.id !== this._net.selfId).length;
    if ((this._rdy2?.size ?? 0) >= guests) {
      this._cstartSent = true;
      this._net.sendEvent({ kind: 'cstart' });
      this.raceManager.state = 'countdown'; // öz hadisəmiz bizə çatmır — lokal başlat
    }
  }

  _onNetEvent(m) {
    if (m.kind === 'gleave') {
      this._dropRacer?.(m.id, ' otağa qayıtdı');
      if (this._net.isHost && this._hostResultsTimer) this._hostCheckAllDone();
    } else if (m.kind === 'giveup') {
      this._onGiveUp(m.id);
    } else if (m.kind === 'done') {
      // Başqa oyunçu finişə çatdı — geri sayım hələ başlamayıbsa indi başlayır
      if (this._endT == null) {
        this._endT = END_WAIT;
        this._winnerName = this.racers.find((x) => x.netId === m.id)?.name || '';
      }
    } else if (m.kind === 'mine') {
      const owner = this.racers.find((x) => x.netId === m.id) || null;
      this.powerups.spawnNetMine(m.mid, m.x, m.z, owner);
    } else if (m.kind === 'mineboom') {
      const mine = this.powerups.removeNetMine(m.mid);
      if (mine?.owner?.isPlayer) this._addScore(HIT_SCORE.mine);
    } else if (m.kind === 'rdy2') {
      // Host: səhnəsi qurulan oyunçuları toplayır — hamı hazır → sinxron start
      if (this._net?.isHost) {
        (this._rdy2 = this._rdy2 || new Set()).add(m.id);
        this._checkAllScenesReady();
      }
    } else if (m.kind === 'cstart') {
      if (this.raceManager.state === 'wait') this.raceManager.state = 'countdown';
    } else if (m.kind === 'hit') {
      const target = this.racers.find((x) => x.netId === m.target);
      if (!target || target.finished) return; // finişləyənə toxunulmur
      const pos = target.car.position;
      this.effects.spawnExplosion(new THREE.Vector3(pos.x, 1.0, pos.z));
      audio.sfx('explosion');
      if (target.isPlayer) {
        if (this.playerCar.shieldTimer > 0) {
          this.playerCar.shieldTimer = 0; // qalxan udur
          this.effects.spawnSparkle(this.playerCar.position);
        } else {
          this.playerCar.hitTimer = TUNING.items.hitStun * (this.playerCar.stunMul || 1);
          this._shake = 0.8;
          this._hitStop(1);
          this._weaponDamage(this.playerCar, 'missile', true);
        }
      }
    } else if (m.kind === 'missile') {
      // Başqasının raketi — kosmetik olaraq göstər (hədəfsiz = düz uçur)
      const target = m.target ? this.racers.find((x) => x.netId === m.target) || null : null;
      const shooter = this.racers.find((x) => x.netId === m.id);
      this.powerups.spawnNetMissile(m.x, m.z, target, shooter || null, m.h || 0);
    } else if (m.kind === 'box') {
      // Başqası qutunu götürdü — burada da itsin
      this.powerups.takeNetBox(m.i);
    } else if (m.kind === 'trishot') {
      const shooter = this.racers.find((x) => x.netId === m.id) || null;
      this.powerups.spawnNetTrishot(m.x, m.z, m.h, shooter);
    } else if (m.kind === 'hit2') {
      // Kiçik güllə dəydi — az stun
      if (m.target !== this._net.selfId) return;
      const target = this.racers.find((x) => x.netId === m.target);
      if (!target) return;
      this.effects.spawnSparkle(this.playerCar.position, 0xdbe6f5);
      if (this.playerCar.shieldTimer > 0) return; // qalxan udur
      this.playerCar.hitTimer = Math.max(this.playerCar.hitTimer, TUNING.items.trishotStun * (this.playerCar.stunMul || 1));
      this._weaponDamage(this.playerCar, 'trishot', true);
      audio.sfx('tick');
      this._shake = 0.3;
    } else if (m.kind === 'bolt') {
      // Başqasının şimşəyi — teleqraflı: xəbərdarlıq + gecikmə + zərbə
      if (m.id === this._net.selfId) return;
      const sender = this.racers.find((x) => x.netId === m.id);
      const me = this.racers.find((x) => x.isPlayer);
      if (sender && me) this.powerups.incomingBolt(sender, me);
    }
  }

  _hostSendResults() {
    if (this._hostResultsSent) return;
    this._hostResultsSent = true;
    // Bitirməyənlərə proqresə görə yer ver
    const rows = [...this.racers]
      .map((r) => ({
        name: r.name,
        isPlayer: false, // hər müştəri özününkünü işarələyəcək
        netId: r.netId,
        color: r.car.data.bodyColor,
        model: carSkin(r.car.data),
        finishTime: this._netFinishes.get(r.netId) ?? null,
        progress: r.progress ?? 0,
      }))
      .sort((a, b) => {
        if (a.finishTime != null && b.finishTime != null) return a.finishTime - b.finishTime;
        if (a.finishTime != null) return -1;
        if (b.finishTime != null) return 1;
        return b.progress - a.progress;
      })
      .map((r, i) => ({ ...r, position: i + 1 }));
    this._net.sendResults(rows);
  }

  _showNetResults(rows) {
    if (this._resultsShown) return;
    this._resultsShown = true;
    this._state = 'done';
    this.hud.setEndBanner(null);
    // Nəticə gələn kimi hamının idarəsi bağlanır (uduzan da daxil)
    const pr = this.racers.find((r) => r.isPlayer);
    if (pr?.controller) pr.controller.active = false;
    this.input.enabled = false;
    this.touchControls?.setVisible(false);
    const marked = rows.map((r) => ({
      ...r,
      isPlayer: r.netId === this._net.selfId,
      score: r.netId === this._net.selfId ? this.score : undefined,
    }));
    this.onFinish?.(marked, this.config);
  }

  _buildHUD() {
    this.hud = new HUD(this.uiRoot, {
      mode: this.config.mode,
      totalLaps: this.config.laps,
      trackPoints: this.track.points,
      branchLines: this.track.branches.map((b) => b.points),
      curbColor: this.trackData.palette.curb,
      canRestart: !this.online, // onlaynda "Yenidən" yoxdur
      onResume: () => this._resume(),
      onRestart: () => this.onRestart?.(this.config),
      onQuit: () => this.onQuit?.(),
      onLobby: this.onLobby ? () => this.onLobby() : null,
      onRescue: () => this._rescuePlayer(),
    });
    this._rescueVisible = false;
    this._rescueCooldown = 0;
  }

  // Oyunçunu ən yaxın yol nöqtəsinə qaytar
  // force: mobil 🚩 düyməsi — xəbərdarlıq görünməsə də işləyir (cooldown qalır),
  // amma yalnız yoldan çıxıbsa
  _rescuePlayer(force = false) {
    if ((!this._rescueVisible && !force) || this._rescueCooldown > 0 || this._state !== 'run') return;
    if (force) {
      // onRoad şaxə yollarını da nəzərə alır; səhv istiqamətdə həmişə icazə var
      const excess = this.playerCar.onRoad ? 0 : Math.abs(this.playerCar.lateral) - this.track.halfWidth;
      if (excess <= 1 && !this._wrongWay) return; // yoldadır və istiqamət düzdür
    }
    const car = this.playerCar;
    // Şaxədəyiksə şaxənin üstünə (öz istiqaməti ilə) qaytar — əsas yola sıçratma
    const onBr = this.track.branches?.length ? this.track.getBranchNearest(car.position, 6) : null;
    let p, tt;
    if (onBr) {
      p = onBr.point;
      tt = onBr.tangent;
    } else {
      const near = this.track.getNearest(car.position); // tam axtarış
      p = this.track.points[near.index];
      tt = this.track.tangents[near.index];
    }
    // Tüstü effekti köhnə yerdə
    for (let i = 0; i < 5; i++) this.effects.spawnSmoke(car.position);
    audio.sfx('rescue');
    this._place(car, { position: p.clone(), heading: Math.atan2(tt.x, tt.z) });
    // Tüstü + effekt yeni yerdə
    for (let i = 0; i < 5; i++) this.effects.spawnSmoke(p);
    this._rescueCooldown = 1.2;
    this._rescueVisible = false;
    this._wrongAcc = 0;
    this._wrongWay = false;
    this.hud.setRescue(false);
  }

  _toggleCamMode() {
    // Dövr: arxadan → sükan arxası → kapot → arxadan
    const order = ['tps', 'fps', 'hood'];
    this._camMode = order[(order.indexOf(this._camMode) + 1) % order.length];
    localStorage.setItem('apexCamMode', this._camMode);
    if (!this._playerDone) this.playerCar.root.visible = this._camMode !== 'fps';
    this.hud?.showToast({ tps: '🎥 Arxadan görünüş', fps: '🎥 Sükan arxası', hood: '🎥 Kapot görünüşü' }[this._camMode]);
  }

  _bindKeys() {
    this.input.bind('Escape', () => this._togglePause());
    this.input.bind('KeyP', () => this._togglePause());
    this.input.bind('KeyV', () => this._toggleCamMode());
    // R = ability keçidi (restart yalnız pauza menyusundadır)
    this.input.bind('KeyR', () => this._switchItem());
    this.input.bind('KeyE', () => this._useItem());
    this.input.bind('ShiftLeft', () => this._useItem());
    this.input.bind('KeyF', () => this._rescuePlayer());
    // Enter — "Yarışı bitir" düyməsinin qısa yolu (yalnız uduzdun zolağı açıq olanda)
    this.input.bind('Enter', () => { if (this._endT != null && this._state === 'run') this._giveUp(); });
    this.input.bind('KeyG', () => this._useSignature());
    this.input.bind('KeyX', () => this._discardItem());
    // Q = aktiv itemi ARXAYA at (S+E-dən rahat)
    this.input.bind('KeyQ', () => this._useItemBackward());

    // Telefon/planşet: toxunma idarəsi
    if (isTouchDevice()) {
      this.touchControls = new TouchControls(this.uiRoot, this.input, {
        onPause: () => this._togglePause(),
        onCameraToggle: () => this._toggleCamMode(),
        onSignature: () => this._useSignature(),
        onUse: () => this._useItem(),
        onUseBack: () => this._useItemBackward(), // ↩ aktiv itemi arxaya at
        onUseSecond: () => this._useSecondItem(), // mobildə ikinci düymə BİRBAŞA işlədir
        onDiscard: () => this._discardItem(),
        onRescue: () => this._rescuePlayer(true), // 🚩 mobildə həmişə işləyir
      });
    }
  }

  // Dəymə xalı əlavə et — HUD-da yığılır və "+N" görünür
  _addScore(pts) {
    if (!pts || !this.isRace) return;
    this.score += pts;
    this.hud?.addScore(pts, this.score);
  }

  // İmza gücü — yarışda bir dəfə
  _useSignature() {
    if (this._state !== 'run' || !this.signature?.ready) return;
    const racingActive = this.isRace ? this.raceManager.state === 'racing' : true;
    if (!racingActive) return;
    if (this.signature.activate()) {
      audio.sfx('boost');
      this.hud?.showToast?.(`✦ ${this.signature.data.name}!`);
      this._updateHUD?.();
    }
  }

  // İmza gücündə "İkinci nəfəs" — gücü işlədən MAŞININ zədəsini tam təmizləyir.
  // (Əvvəl `repairPlayer` idi və bot bu gücü işlədəndə oyunçunun canı dolurdu.)
  repairCar(car) {
    if (!car || !this.hz?.hp) return;
    car.hp = car.maxHp ?? this.hz.hp;
    if (car === this.playerCar) this.hud?.setHP?.(car.hp, car.hp);
  }

  _useItem() {
    const r = this.racers?.find((x) => x.isPlayer);
    if (r?.items?.length && this._state === 'run') {
      // S / ↓ basılı ikən raket ARXAYA atılır
      const backward = this.input.isDown('ArrowDown', 'KeyS');
      this.powerups.use(r, { backward });
    }
  }

  _useItemBackward() {
    const r = this.racers?.find((x) => x.isPlayer);
    if (!r?.items?.length || this._state !== 'run') return;
    // Arxaya yalnız RAKET və ÜÇLÜ ATƏŞ atılır. Aktiv slot uyğun deyilsə,
    // İKİNCİ slotda uyğun item varsa ORADAN atılır (mobildə vacibdir)
    const canBack = (it) => it && (it.id === 'missile' || it.id === 'trishot');
    const idx = r.itemIdx || 0;
    let slot = null;
    if (canBack(r.items[idx])) slot = idx;
    else if (canBack(r.items[1 - idx])) slot = 1 - idx;
    if (slot === null) return;
    this.powerups.use(r, { backward: true, slot });
  }

  _discardItem() {
    const r = this.racers?.find((x) => x.isPlayer);
    if (r?.items?.length && this._state === 'run') {
      this.powerups.discard(r);
      this.hud.showToast(t('tst.abilityUsed'));
    }
  }

  _switchItem() {
    const r = this.racers?.find((x) => x.isPlayer);
    if (r && this._state === 'run') this.powerups.switchItem(r);
  }

  // Mobil: ikinci slotdakı itemi birbaşa işlət
  _useSecondItem() {
    const r = this.racers?.find((x) => x.isPlayer);
    if (r?.items?.length > 1 && this._state === 'run') {
      this.powerups.use(r, { slot: 1 - (r.itemIdx || 0) });
    }
  }

  // Effekt shader-ları geri sayım vaxtı kompilyasiya olunur — əvvəl İLK
  // partlayış/tüstü anında olurdu və kadr donması verirdi. Nümunə effektlər
  // yerin altında yaranır, compile() bütün materialları indi hazırlayır.
  _warmFx() {
    if (!this.renderer || !this.effects) return;
    const uzaq = new THREE.Vector3(0, -140, 0);
    this.effects.spawnExplosion(uzaq);
    this.effects.spawnSmoke({ x: 0, y: -140, z: 0 });
    this.effects.spawnSparkle(uzaq);
    try { this.renderer.compile(this.scene, this.camera); } catch { /* boş */ }
    // Şəffaf ("ghost") maşın materialı ayrı şeyder variantıdır — ilk dəfə yarışın
    // ortasında kompilyasiya olunmasın deyə indi isidilir
    for (const c of this.cars) if (c !== this.playerCar) c.setGhost(true);
    try { this.renderer.compile(this.scene, this.camera); } catch { /* boş */ }
    for (const c of this.cars) c.setGhost(false);
  }

  _place(car, slot) {
    car.reset(slot.position, slot.heading);
    const n = this.track.getNearest(slot.position);
    car.trackT = n.t;
    car.wpHint = n.index;
    car.lateral = n.lateral;
    car.onRoad = n.onRoad;
  }

  // ————— Loop —————
  // ————— HIT-STOP (zərbə anında mikro-donma) —————
  // Oyun hissinin ən güclü ucuz aləti: güclü zərbədə vaxt 60 ms ərzində
  // yavaşıyır — zərbənin "çəkisi" hiss olunur. Postprocessing tələb etmir.
  _hitStop(güc = 1) {
    this._stopT = Math.max(this._stopT || 0, 0.055 * güc);
    // Ekranın kənarında qısa flaş — zərbə vizual olaraq da oxunur
    document.getElementById('app')?.classList.remove('impact');
    void document.getElementById('app')?.offsetWidth;   // reflow: animasiya təzələnsin
    document.getElementById('app')?.classList.add('impact');
  }

  update(dt) {
    // Donma müddətində vaxt yavaşıyır (fizika sabit qalır — dt kiçilir)
    if ((this._stopT || 0) > 0) {
      this._stopT = Math.max(0, this._stopT - dt);
      dt *= 0.22;
    }
    if (this._state === 'paused') return;
    this._time += dt;
    if (this.isRace) this._updateRaceEnd(dt);

    if (this.isRace) {
      this._updateWaitGate(dt);
    this.raceManager.update(dt, this.track);
    }

    for (const ctrl of this.controllers) ctrl.update(dt, this.track);
    this.signature?.update(dt);
    // ————— BOTLARIN İMZA GÜCÜ —————
    // İşə salma şərti: gözləmə bitib, sürət yaxşıdır (düz hissə) və ya
    // oyunçudan geridədirsə — yəni gücü mənalı anda işlədir, təsadüfən yox.
    if (this._state === 'run') {
      for (const r of this.racers) {
        if (r.isPlayer || !r.signature) continue;
        r.signature.update(dt);
        if (!r.signature.ready) continue;
        r._sigWait -= dt;
        if (r._sigWait > 0) continue;
        const sürət = r.car.velocity.length();
        const düzHissə = sürət > r.car.maxSpeed * 0.72;
        const geridə = (r.position || 0) > (this.raceManager?.getPlayer()?.position || 0);
        // "VAXTI GERİ AL" ayrıca şərtlə: bot onu düz yolda tam sürətdə işlədəndə 3 saniyə
        // geriyə — arxadan gələn oyunçunun düz QABAĞINA — teleport olurdu (istifadəçi
        // rəyi: "start düzündə birdən qabağımda maşın peyda oldu"), üstəlik özünə ziyan
        // edirdi. İndi yalnız bəlaya düşəndə işlədir: vurulub, sürüşür, yoldan çıxıb.
        const uyğun = r.signature.data.rewind
          ? (r.car.hitTimer > 0 || r.car.slipTimer > 0 || !r.car.onRoad)
          : (düzHissə || geridə);
        if (uyğun) r.signature.activate();
        else r._sigWait = r.signature.data.rewind ? 0.3 : 1.5; // uyğun an deyil — sonra yenidən bax
      }
    }
    this._resolveCollisions();

    const racingActive = this.isRace ? this.raceManager.state === 'racing' : true;
    this.powerups.update(dt, racingActive && this._state === 'run');
    this.effects.update(dt);
    this.weather?.update(dt, this.camera);
    this.impact?.update(dt);
    if (this._finishFx) {
      this._finishFx.update(dt);
      if (this._finishFx.done) { this._finishFx.dispose(); this._finishFx = null; }
    }
    this.environment.update?.(dt);
    this._updateSkidsAndSmoke(dt);
    this.skids.update(dt);

    // Vurulmuş / sürüşən maşınlardan tüstü
    for (const car of this.cars) {
      if ((car.hitTimer > 0 || car.slipTimer > 0) && Math.random() < dt * 20) {
        this.effects.spawnSmoke(car.position, car.slipTimer > 0);
      }
    }
    // Drift tüstüsü — HƏR İKİ arxa təkərdən, sürüşmə bucağına görə sıxlaşır
    // (əvvəl mərkəzdən tək-tük çıxırdı və seçilən tüstü rəngi işlənmirdi)
    {
      const c = this.playerCar;
      if (c.isDrifting) {
        const h = c.heading;
        const slip = Math.min(1, Math.abs(c.velocity.dot(
          this._tmpR ? this._tmpR.set(-Math.cos(h), 0, Math.sin(h))
            : (this._tmpR = new THREE.Vector3(-Math.cos(h), 0, Math.sin(h)))
        )) / 9);
        const rate = 26 + slip * 34;
        if (Math.random() < dt * rate) {
          const rx = -Math.cos(h), rz = Math.sin(h);
          const side = Math.random() < 0.5 ? -0.75 : 0.75;
          this.effects.spawnSmoke({
            x: c.position.x - Math.sin(h) * 1.55 + rx * side + (Math.random() - 0.5) * 0.5,
            y: 0.12,
            z: c.position.z - Math.cos(h) * 1.55 + rz * side + (Math.random() - 0.5) * 0.5,
          }, false, c.smokeColor ?? null, 0.75 + slip * 0.6);
        }
      }
    }

    if (this.trackData.hazards) this._updateHazards(dt);
    this._updateMissileWarning(dt);
    this._updateRescue(dt);
    this._updateCamera(dt);
    this._updateHUD();

    // ————— Onlayn: vəziyyət göndərmə + nəticə axını —————
    if (this.online) {
      this._netAcc += dt;
      if (this._netAcc >= 0.066) { // ~15 Hz
        this._netAcc = 0;
        const c = this.playerCar;
        this._net.sendState({
          p: [Math.round(c.position.x * 100) / 100, Math.round(c.position.z * 100) / 100],
          h: Math.round(c.heading * 1000) / 1000,
          v: Math.round(c.vF * 10) / 10,
          b: c.boostTimer > 0 ? 1 : 0,
          sh: c.shieldTimer > 0 ? 1 : 0,
        });
      }
      // Yerli finiş → host-a bildir
      if (this._playerDone && !this._localFinSent) {
        this._localFinSent = true;
        const me = this.raceManager.getPlayer();
        this._net.sendFinish(me.finishTime);
        // Hamıya bildir: geri sayım uzaq maşının yerli interpolyasiyasından asılı
        // qalmasın (gecikmə/itki olanda qonaq finişi görməyə bilərdi)
        this._net.sendEvent({ kind: 'done' });
      }
      // Host: ilk finişdən sonra maksimum gözləmə
      if (this._net.isHost && this._hostResultsTimer) {
        this._hostResultsTimer -= dt;
        if (this._hostResultsTimer <= 0) this._hostSendResults();
      }
      return;
    }

    if (this._playerDone && !this._resultsSent) {
      this._finishTimer -= dt;
      if (this._finishTimer <= 0) {
        this.raceManager.forceFinishRemaining();
        this._sendResults();
      }
    }
  }

  // ————— ZAVOD: lazerlər + konteynerlər + CAN sistemi —————
  _buildHazards() {
    const hz = this.hz;
    const N = this.track.N;
    // Yerli maşınlara can ver
    for (const car of this.cars) {
      if (!car.isRemote) { car.maxHp = this._maxHp(car); car.hp = car.maxHp; car._dmgCd = 0; car._invuln = 0; }
    }
    // Lazer qapıları
    this._lasers = [];
    // Tərpənməyən hissələr (dirək, odluq, maneə, buz ləkəsi) bir qrupa yığılıb birləşdirilir:
    // ayrı-ayrı Vulkanda ~90 draw call edirdi (ölçüldü: 180, büdcə 140)
    const hzGroup = new THREE.Group();
    const hw = this.track.halfWidth;
    const fire = hz.gateKind === 'fire';   // Vulkan: lazer əvəzinə yoldan qalxan alov divarı
    const pyGeo = fire ? new THREE.CylinderGeometry(0.75, 1.0, 1.5, 6) : new THREE.BoxGeometry(0.6, 2.4, 0.6);
    const pyMat = new THREE.MeshStandardMaterial({ color: fire ? 0x2a272f : 0x3a3d46, roughness: fire ? 1 : 0.7, flatShading: fire });
    const tipMat = fire ? lavaGlowMat()
      : new THREE.MeshStandardMaterial({ color: 0xff4433, emissive: 0xff4433, emissiveIntensity: 1.5 });
    // alov divarı: yolun eninə düzülmüş konuslar — tək həndəsə (qapı başına 1 draw call)
    let flameGeo = null;
    if (fire) {
      const cones = [];
      const cnt = 9, span = (hw + 0.4) * 2;
      for (let q = 0; q < cnt; q++) {
        const h = 3.0 + ((q * 7) % 4) * 0.35;
        const cg = new THREE.ConeGeometry(span / cnt * 0.72, h, 5, 1, true);
        cg.translate(0, h / 2, -span / 2 + (q + 0.5) * (span / cnt));
        cones.push(cg);
      }
      flameGeo = mergeGeometries(cones, false);
      cones.forEach((cg) => cg.dispose());
    }
    hz.lasers.forEach((tt, gi) => {
      const i = Math.round(tt * N) % N;
      const c = this.track.points[i];
      const n = this.track.normals[i];
      const tg = this.track.tangents[i];
      for (const side of [-1, 1]) {
        const py = new THREE.Mesh(pyGeo, pyMat);
        py.position.set(c.x + n.x * (hw + 0.9) * side, fire ? 0.75 : 1.2, c.z + n.z * (hw + 0.9) * side);
        hzGroup.add(py);
        const tip = new THREE.Mesh(fire ? new THREE.CylinderGeometry(0.5, 0.62, 0.22, 6) : new THREE.BoxGeometry(0.7, 0.35, 0.7), tipMat);
        tip.position.set(py.position.x, fire ? 1.6 : 2.55, py.position.z);
        hzGroup.add(tip);
        this._obstacles.push({ x: py.position.x, z: py.position.z, r: fire ? 1.0 : 0.8 });
      }
      const beam = fire
        ? new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({
          color: 0xff4a0a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide,
        }))
        : new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.5, (hw + 0.9) * 2),
          new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.85 })
        );
      beam.position.set(c.x, fire ? 0.05 : 0.85, c.z);
      beam.rotation.y = Math.atan2(n.x, n.z);
      beam.visible = false;
      this.scene.add(beam);
      if (fire) {
        // odluq: yolun eninə közərən yarıq — alov sönəndə də qapının yeri görünür
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, (hw + 0.4) * 2), lavaGlowMat());
        slot.position.set(c.x, 0.07, c.z);
        slot.rotation.y = beam.rotation.y;
        hzGroup.add(slot);
      }
      this._lasers.push({ beam, fire, center: c, tangent: tg, phaseOff: gi * 0.73 });
    });
    // Buz ləkələri (Buz Zirvəsi): üstündə tutum itir — bax Car._iceT
    this._ice = [];
    if (hz.ice?.length) {
      const iceMat = new THREE.MeshStandardMaterial({
        color: 0xd6f1ff, roughness: 0.06, metalness: 0.35, transparent: true, opacity: 0.82,
        emissive: 0x4aa8d8, emissiveIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -2,
      });
      for (const ic of hz.ice) {
        const i = Math.round(ic.t * N) % N;
        const c = this.track.points[i], n = this.track.normals[i];
        const x = c.x + n.x * ic.lane * hw, z = c.z + n.z * ic.lane * hw;
        const m = new THREE.Mesh(new THREE.CircleGeometry(ic.r, 9), iceMat);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = i;                 // çoxbucaqlılar eyni bucaqda durmasın
        m.scale.set(1.25, 0.8, 1);        // yol boyu uzanan ləkə
        m.position.set(x, 0.075, z);
        hzGroup.add(m);
        this._ice.push({ x, z, r: ic.r * 0.95 });
      }
    }
    // Yol üstü konteynerlər (deterministik — onlaynda hamıda eyni)
    for (const b of hz.blocks || []) {
      const i = Math.round(b.t * N) % N;
      const c = this.track.points[i];
      const n = this.track.normals[i];
      const box = hz.blockKind === 'ice' ? makeIceBlock() : hz.blockKind === 'basalt' ? makeBasaltBlock() : makeContainer();
      box.position.set(
        c.x + n.x * b.lane * this.track.halfWidth,
        0,
        c.z + n.z * b.lane * this.track.halfWidth
      );
      box.rotation.y = Math.atan2(this.track.tangents[i].x, this.track.tangents[i].z) + b.lane;
      hzGroup.add(box);
      this._obstacles.push({ x: box.position.x, z: box.position.z, r: 2.4 });
    }
    hzGroup.updateMatrixWorld(true);
    const hzMerged = mergeStaticGroup(hzGroup);
    hzGroup.traverse((o) => { if (o.isMesh && !o.material?.userData?.shared) o.geometry?.dispose?.(); });
    this.scene.add(hzMerged);
    this.hud?.setHP?.(this.playerCar.hp, this.playerCar.maxHp);
  }

  // Maşının maksimum canı zirehdən asılıdır (bax TUNING.damage)
  _maxHp(car) {
    const D = TUNING.damage;
    return Math.round(D.hpBase + (car.data?.stats?.armor ?? 50) * D.hpPerArmor);
  }

  // Silah zərəri (raket, mina, güllə, şimşək). Zərər fasiləsinə (cooldown) TABE DEYİL:
  // əvvəl bütün zərər 0.5 s-lik ümumi fasilə ilə gedirdi — lazerdən və ya əvvəlki
  // zərbədən dərhal sonra minaya düşəndə can getmirdi (istifadəçi rəyi), üçlü atəşin
  // üç gülləsindən isə yalnız biri sayılırdı.
  _weaponDamage(car, kind, silent = false) {
    this._damage(car, TUNING.damage[kind] ?? TUNING.damage.mine, silent, true);
  }

  _damage(car, amount, silent = false, weapon = false) {
    if (car.isRemote) return;
    if ((!weapon && (car._dmgCd ?? 0) > 0) || (car._invuln ?? 0) > 0 || car.hp == null) return;
    // QALXAN bütün zərəri tutur (lazer, maneə). Əvvəl yalnız raket/mina/şimşəkdən
    // qoruyurdu: qalxanla lazerdən keçəndə can gedirdi (istifadəçi rəyi).
    if (car.shieldTimer > 0) {
      car._dmgCd = 0.5; // parıltı hər kadr təkrarlanmasın
      if (this.effects && car.position.distanceTo(this.playerCar.position) < 70) {
        this.effects.spawnSparkle(new THREE.Vector3(car.position.x, 1, car.position.z), 0x7fe9ff);
      }
      if (car.isPlayer && !silent) audio.sfx('shield');
      return;
    }
    car.hp -= amount;
    if (!weapon) car._dmgCd = 0.5; // fasilə yalnız davamlı təhlükələr üçündür (lazer, maneə)
    // Zərbə qığılcımı — vizual geri bildirim (yalnız yaxınlıqda, ucuz)
    if (this.effects && car.position.distanceTo(this.playerCar.position) < 70) {
      this.effects.spawnSparkle(new THREE.Vector3(car.position.x, 1, car.position.z), 0xffa64d);
    }
    if (car.isPlayer) {
      this.hud.setHP(Math.max(0, car.hp), car.maxHp);
      this._shake = Math.max(this._shake, 0.4);
      if (!silent) audio.sfx('tick');
    }
    if (car.hp <= 0) this._explodeRespawn(car);
  }

  _explodeRespawn(car) {
    this.effects.spawnExplosion(new THREE.Vector3(car.position.x, 1, car.position.z));
    if (car.isPlayer || car.position.distanceTo(this.playerCar.position) < 90) audio.sfx('explosion');
    const near = this.track.getNearest(car.position);
    const p = this.track.points[near.index];
    const tg = this.track.tangents[near.index];
    car.reset(p.clone(), Math.atan2(tg.x, tg.z));
    car.hp = car.maxHp;
    car._invuln = TUNING.items.respawnInvuln;
    if (car.isPlayer) {
      this.hud.setHP(car.maxHp, car.maxHp);
      this.hud.showToast(t('tst.respawn'));
      this._shake = 1.0;
    }
  }

  _updateHazards(dt) {
    if (!this._lasers) return;
    const { laserPeriod, laserOn, laserWarn } = TUNING.items;
    for (const L of this._lasers) {
      const ph = (this._time + L.phaseOff * laserPeriod) % laserPeriod;
      const on = ph < laserOn;
      const warn = !on && ph > laserPeriod - laserWarn;
      L.beam.visible = on || warn;
      if (L.fire) {
        // alov: xəbərdarlıqda alçaq pilot alovu, yananda titrəyən tam divar
        const fl = 0.5 + 0.5 * Math.sin(this._time * 23 + L.phaseOff * 9);
        L.beam.scale.y = warn ? 0.14 + 0.05 * fl : 0.92 + 0.2 * fl;
        L.beam.material.color.set(warn ? 0xff9a2a : 0xff4a0a);
        L.beam.material.opacity = warn ? 0.45 : 0.5 + 0.18 * fl;
      } else if (warn) {
        L.beam.material.color.set(0xffaa33);
        L.beam.material.opacity = 0.3;
      } else if (on) {
        L.beam.material.color.set(0xff3322);
        L.beam.material.opacity = 0.7 + Math.sin(this._time * 30) * 0.2;
      }
      if (on) {
        for (const car of this.cars) {
          if (car.isRemote) continue;
          const dx = car.position.x - L.center.x;
          const dz = car.position.z - L.center.z;
          const along = dx * L.tangent.x + dz * L.tangent.z;
          if (Math.abs(along) < 1.0 && Math.hypot(dx, dz) < this.track.halfWidth + 1) {
            this._damage(car, this.trackData.hazards.laserDamage);
          }
        }
      }
    }
    // Buz ləkələri
    for (const ic of this._ice || []) {
      for (const car of this.cars) {
        if (car.isRemote) continue;
        const dx = car.position.x - ic.x, dz = car.position.z - ic.z;
        if (dx * dx + dz * dz < ic.r * ic.r) car._iceT = 0.3;
      }
    }
    // Cooldown + toxunulmazlıq yanıb-sönməsi
    for (const car of this.cars) {
      if (car.isRemote) continue;
      if (car._dmgCd > 0) car._dmgCd -= dt;
      if (car._invuln > 0) {
        car._invuln -= dt;
        car.root.visible = Math.floor(this._time * 10) % 2 === 0;
        if (car._invuln <= 0) car.root.visible = true;
      }
    }
  }

  // Drift izləri + drift tüstüsü + off-road tozu (yerli maşınlar üçün)
  _updateSkidsAndSmoke(dt) {
    const dustColor = this._dustColor ??
      (this._dustColor = this.trackData.palette.groundEdge ?? this.trackData.palette.ground);
    for (const car of this.cars) {
      if (car.isRemote) continue;
      const speed = car.velocity.length();
      const drifting = car.isDrifting && speed > 9;
      const dusty = car.offRoad > 0.35 && speed > 10;
      // Arxa ox mövqeyi
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const rx = -Math.cos(car.heading), rz = Math.sin(car.heading);
      const bx = car.position.x - fx * 1.15;
      const bz = car.position.z - fz * 1.15;
      if (drifting && car.onRoad) {
        // İki arxa təkərin izi
        const lX = bx + rx * -0.72, lZ = bz + rz * -0.72;
        const rX = bx + rx * 0.72, rZ = bz + rz * 0.72;
        if (car._skidPrev) {
          const d = Math.hypot(lX - car._skidPrev[0], lZ - car._skidPrev[1]);
          if (d > 0.35 && d < 6) {
            this.skids.add(car._skidPrev[0], car._skidPrev[1], lX, lZ);
            this.skids.add(car._skidPrev[2], car._skidPrev[3], rX, rZ);
          }
          if (d >= 0.35) car._skidPrev = [lX, lZ, rX, rZ];
        } else {
          car._skidPrev = [lX, lZ, rX, rZ];
        }
      } else {
        car._skidPrev = null;
      }
      // Tüstü / toz (seyrək — effekt hovuzunu boğmasın)
      car._smokeT = (car._smokeT ?? 0) - dt;
      if (car._smokeT <= 0) {
        if (drifting) {
          this.effects.spawnSmoke({ x: bx, y: 0.25, z: bz }, false, car.smokeColor ?? null, 0.7);
          car._smokeT = 0.09;
        } else if (dusty) {
          this.effects.spawnSmoke({ x: bx, y: 0.2, z: bz }, false, dustColor, 0.8);
          car._smokeT = 0.11;
        }
      }
    }
  }

  // Mənə tərəf gələn raket/şimşək varsa — EKRAN banneri + bip.
  // (3D işarə maşına bağlıdır — FPS/kapot rejimində görünmür, banner isə həmişə görünür)
  _updateMissileWarning(dt) {
    const missileIn = this.powerups.projectiles.some((p) => p.target?.isPlayer);
    const boltIn = this.powerups.pendingBolts?.some(
      (b) => b.targets?.some((tt) => tt.isPlayer)
    );
    const inbound = missileIn || !!boltIn;
    const text = missileIn ? '🚀 RAKET GƏLİR!' : '🌩 ŞİMŞƏK GƏLİR!';
    if (inbound !== this._missileWarn || (inbound && text !== this._warnText)) {
      this._missileWarn = inbound;
      this._warnText = text;
      this.hud.setMissileWarning(inbound, text);
      if (inbound) this._warnAcc = 0;
    }
    if (inbound) {
      this._warnAcc = (this._warnAcc || 0) - dt;
      if (this._warnAcc <= 0) {
        audio.sfx('warn');
        this._warnAcc = 0.5;
      }
    }
  }

  // Yoldan çox kənara çıxanda "yola qayıt" düyməsini göstər (histerezisli)
  _updateRescue(dt) {
    this._rescueCooldown = Math.max(0, this._rescueCooldown - dt);
    // onRoad şaxə yollarını da nəzərə alır (şaxədə rescue çıxmasın)
    const excess = this.playerCar.onRoad ? 0 : Math.abs(this.playerCar.lateral) - this.track.halfWidth;

    // SƏHV İSTİQAMƏT: trekin gedişat istiqamətinə qarşı davamlı hərəkət (yalnız yarışda).
    // QISAYOLDA əsas yolun tangensi yanıltır — şaxədəyiksə ŞAXƏNİN istiqaməti əsasdır
    let wrongWay = false;
    if (this.isRace && this._state === 'run' && !this._playerDone) {
      const onBr = this.track.branches?.length
        ? this.track.getBranchNearest(this.playerCar.position)
        : null;
      const tg = onBr ? onBr.tangent : this.track.tangents[this.playerCar.wpHint || 0];
      const along = this.playerCar.velocity.x * tg.x + this.playerCar.velocity.z * tg.z;
      // Trek özünə yaxın keçən yerlərdə "hint" qonşu əks-istiqamətli seqmentə
      // düşə bilir → tangens yanıldır. Ona görə trackT-nin HƏQİQƏTƏN geriyə
      // getməsini də tələb edirik (böyük sıçrayış = hint atlaması, sayılmır).
      const tNow = this.playerCar.trackT ?? 0;
      const dT = ((tNow - (this._lastT ?? tNow) + 1.5) % 1) - 0.5;
      this._lastT = tNow;
      // trackT pilləli yenilənir → "geriyə" əvəzinə "irəli getmir" (dT ≤ 0);
      // iri sıçrayış = hint atlaması, sayğac sıfırlanır
      const notForward = dT <= 0.000001 && dT > -0.05;
      this._wrongAcc = (along < -5 && notForward) ? (this._wrongAcc || 0) + dt : 0;
      wrongWay = this._wrongAcc > 1.1;
    } else {
      this._wrongAcc = 0;
    }
    this._wrongWay = wrongWay;

    const reason = wrongWay ? 'wrongway' : 'offroad';
    const shouldShow = (excess > 7 || wrongWay) && this._rescueCooldown <= 0;
    if (!this._rescueVisible && shouldShow) {
      this._rescueVisible = true;
      this.hud.setRescue(true, reason);
    } else if (this._rescueVisible && excess < 2.5 && !wrongWay) {
      this._rescueVisible = false;
      this.hud.setRescue(false);
    } else if (this._rescueVisible) {
      this.hud.setRescue(true, reason); // mətn səbəbə görə dəyişsin (HUD keşləyir)
    }
    // Mobil 🚩 — yoldan çıxanda VƏ YA səhv istiqamətdə aktivdir
    this.touchControls?.setRescueEnabled((excess > 1 || wrongWay) && this._rescueCooldown <= 0);
  }

  _resolveCollisions() {
    const n = this.cars.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = this.cars[i], b = this.cars[j];
        if (a.isRemote && b.isRemote) continue; // uzaqlar öz müştərilərində həll olunur
        if ((a._airT || 0) > 0 || (b._airT || 0) > 0) continue; // tullanan maşın rəqibin üstündən keçir
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        let d = Math.hypot(dx, dz);
        const min = CAR_RADIUS * 2;
        if (d < min && d > 0.0001) {
          const nx = dx / d, nz = dz / d;
          if (a.isRemote || b.isRemote) {
            // Yalnız yerli maşın itələnir (uzaq mövqe şəbəkədən gəlir)
            const local = a.isRemote ? b : a;
            const sign = a.isRemote ? 1 : -1;
            const overlap = min - d;
            local.position.x += sign * nx * overlap;
            local.position.z += sign * nz * overlap;
            local.velocity.x += sign * nx * overlap * 2;
            local.velocity.z += sign * nz * overlap * 2;
          } else {
            // "Ağır yük" imza gücü — həmin maşın itələnmir, qarşıdakı tam geri gedir
            const aAnch = (a._sigAnchor || 0) > 0, bAnch = (b._sigAnchor || 0) > 0;
            const ka = aAnch && !bAnch ? 0 : (bAnch && !aAnch ? 2 : 1);
            const kb = bAnch && !aAnch ? 0 : (aAnch && !bAnch ? 2 : 1);
            const overlap = (min - d) / 2;
            a.position.x -= nx * overlap * ka; a.position.z -= nz * overlap * ka;
            b.position.x += nx * overlap * kb; b.position.z += nz * overlap * kb;
            // İMPULS: nisbi sürətin normal komponenti iki maşın arasında bölünür
            // (bərabər kütlə, 0.15 elastiklik). Əvvəl yalnız örtüşmə qədər itələnirdi —
            // arxadan vuran maşın sürətini saxlayıb rəqibin içinə girirdi (ölçüldü:
            // 34 → 33.8 m/s, rəqib 20 → 20.2), zərbə "yumşaq yapışma" kimi hiss olunurdu.
            const rvn = (b.velocity.x - a.velocity.x) * nx + (b.velocity.z - a.velocity.z) * nz;
            if (rvn < 0) {
              const imp = -rvn * 1.15 * 0.5;
              a.velocity.x -= nx * imp * ka; a.velocity.z -= nz * imp * ka;
              b.velocity.x += nx * imp * kb; b.velocity.z += nz * imp * kb;
              const me = a === this.playerCar ? a : (b === this.playerCar ? b : null);
              if (me) {
                const sgn = me === a ? -1 : 1; // normal rəqibdən oyunçuya doğru olsun
                const other = me === a ? b : a;
                const s = this._impactFx().hit(me, nx * sgn, nz * sgn, -rvn);
                if (s > 0) other.jolt(-nx * sgn, -nz * sgn, s);
                if (s > 0.8) this._hitStop(0.6);
              }
            }
          }
        }
      }
    }

    // Maşın ↔ maneə toqquşması (dekor, dağlar, postlar, tağ dirəkləri)
    const obstacles = this._obstacles;
    for (let i = 0; i < n; i++) {
      const car = this.cars[i];
      const havada = (car._airT || 0) > 0;
      for (const o of obstacles) {
        // Tullanış: alçaq/kiçik maneələrin (şin, bariyer, post, konteyner) üstündən keçir;
        // iri obyektlər (bina, təpə, tribuna) yenə bərkdir
        if (havada && o.r <= 3.5) continue;
        const dx = car.position.x - o.x;
        const dz = car.position.z - o.z;
        const min = o.r + CAR_RADIUS;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          // DEGENERAT HAL: maşın maneənin tam mərkəzindədirsə (spawn, telepor)
          // d=0 olur və köhnə kod onu ATLAYIRDI — maşın obyektin içində ilişirdi
          const d = Math.sqrt(d2) || 0.001;
          const nx = d2 > 1e-6 ? dx / d : 1, nz = d2 > 1e-6 ? dz / d : 0;
          // Sıxışdır və sürətin maneəyə doğru komponentini geri qaytar
          car.position.x = o.x + nx * min;
          car.position.z = o.z + nz * min;
          const vn = car.velocity.x * nx + car.velocity.z * nz;
          if (vn < 0) {
            // Maneəyə doğru komponent silinir + xəfif (0.12) geri sıçrayış. Əvvəl 0.5
            // elastik idi: 30 m/s düz zərbədə maşın 15 m/s ilə geri atılırdı (ölçüldü) —
            // sərt və idarəni əldən alan hiss; zen-də eyni şikayət artıq düzəldilmişdi.
            // Səth boyu sürət ZƏRBƏNİN GÜCÜNƏ mütənasib sürtünmə ilə azalır (μ = 0.2):
            // sərt sürtünmə sürət aparır, yüngül söykənib sürüşmə demək olar aparmır.
            const tx = car.velocity.x - nx * vn, tz = car.velocity.z - nz * vn;
            const slide = Math.hypot(tx, tz);
            const keep = slide > 0.01 ? Math.max(0, slide + vn * 0.2) / slide : 0;
            car.velocity.x = tx * keep - nx * vn * 0.12;
            car.velocity.z = tz * keep - nz * vn * 0.12;
            if (car === this.playerCar) {
              const s = this._impactFx().hit(car, nx, nz, -vn, slide);
              if (s > 0.8) this._hitStop(0.6);
            }
          }
        }
      }
    }
  }

  _impactFx() { return (this.impact ||= new ImpactFeel(this.effects)); }

  // ————— TOQQUŞMA TƏHLÜKƏSİZLİK TORU (səhnə səviyyəsində) —————
  // Dekor müxtəlif qurucudan gəlir (Environment, TrackBuilder, birləşdirilmiş
  // qruplar) və bəziləri maneə qeydini unudurdu — fiziki testdə ağacların
  // içindən keçmək olurdu. Bu keçid BÜTÜN səhnəni gəzir və qeydsiz iri
  // obyektlərə maneə verir. Bir dəfə, səhnə qurulandan sonra işləyir.
  _autoObstacles() {
    const box = new THREE.Box3(), size = new THREE.Vector3(), tmp = new THREE.Vector3();
    const half = this.track.halfWidth;
    const carRoots = new Set(this.cars.map((c) => c.root));
    let added = 0;
    this.scene.traverse((n) => {
      if (!n.isMesh) return;
      for (let q = n; q; q = q.parent) if (carRoots.has(q)) return;   // maşınlar yox
      box.setFromObject(n); box.getSize(size);
      if (size.y < 1.5) return;                       // alçaq — üstündən keçilir
      if (size.x > 26 || size.z > 26) return;         // nəhəng/birləşmiş blok
      const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
      tmp.set(cx, 0, cz);
      const near = this.track.getNearest(tmp);
      if (Math.abs(near.lateral) < half + 1.2) return; // yolun üstü (tağ, banner)
      const r = Math.max(size.x, size.z) * 0.42;
      for (const o of this._obstacles) {
        if (Math.hypot(o.x - cx, o.z - cz) < r + o.r) return;
      }
      this._obstacles.push({ x: cx, z: cz, r });
      added++;
    });
    return added;
  }

  // Kameranın önünü tutan rəqib maşınlar yarı-şəffaf olur (yalnız arxa görünüşdə).
  // ƏVVƏL arxadan yanaşan bot kadrın böyük hissəsini örtür, oyunçu öz maşınını və
  // yolu görmürdü (baseline kadrları: alp, kanyon, zavod).
  // Şərt: maşın kamera→oyunçu xəttinin üstündədir (yandan < 2.4 m) və ya kameraya
  // 4.2 m-dən yaxındır. Histerezis: şəffaflıqdan çıxış həddi bir az genişdir ki,
  // sərhəddə yanıb-sönməsin.
  _ghostOccluders() {
    const cam = this.camera.position;
    const me = this.playerCar.position;
    const sx = me.x - cam.x, sz = me.z - cam.z;
    const L = Math.hypot(sx, sz) || 1;
    for (const c of this.cars) {
      if (c === this.playerCar) continue;
      const px = c.position.x - cam.x, pz = c.position.z - cam.z;
      const along = (px * sx + pz * sz) / (L * L);        // 0 = kamera, 1 = oyunçu
      const perp = Math.abs(px * sz - pz * sx) / L;
      const k = c._ghost ? 1.25 : 1;                      // histerezis
      const want = (along > -0.3 * k && along < 0.9 && perp < 2.4 * k) || Math.hypot(px, pz) < 4.2 * k;
      if (want !== !!c._ghost) c.setGhost(want);
    }
  }

  _updateCamera(dt) {
    const car = this.playerCar;
    // FİNİŞ ORBİTİ: yarış bitəndə kamera maşının ətrafında yavaş dövr edir
    if (this._playerDone && this.isRace) {
      car.root.visible = true; // FPS-də gizlədilmişdisə, finişdə görünsün
      this._orbitA = (this._orbitA ?? Math.atan2(
        this.camera.position.x - car.position.x,
        this.camera.position.z - car.position.z
      )) + dt * 0.55;
      const desired = new THREE.Vector3(
        car.position.x + Math.sin(this._orbitA) * 8.5, 3.8,
        car.position.z + Math.cos(this._orbitA) * 8.5
      );
      this.camera.position.lerp(desired, 1 - Math.exp(-dt * 4));
      this.camera.lookAt(car.position.x, 1.0, car.position.z);
      audio.setEngine(Math.min(car.velocity.length() / car.maxSpeed, 1), false);
      this.speedLines?.update(dt, 0, 0); // xətlər havada asılı qalmasın
      return;
    }
    const h = car.heading;
    // C (və ya mobil 👁 düyməsi) basılı ikən ARXAYA baxış
    const lookBack = (this.input.isDown('KeyC') || this.input.touch.lookBack) ? -1 : 1;
    const fx = Math.sin(h) * lookBack, fz = Math.cos(h) * lookBack;
    const speedT = Math.min(car.velocity.length() / car.maxSpeed, 1);
    let back = 6.6 + speedT * 0.8;
    let height = 3.2;
    // Start girişi: geri sayımda kamera azca yuxarıdan/uzaqdan zərif enib oturur.
    // Onlaynda 'wait' fazası geri sayımdan ƏVVƏLDİR — ofset orada tam qalır,
    // yoxsa kamera əvvəl oturub sonra geri sıçrayırdı.
    const rmSt = this.raceManager?.state;
    if (rmSt === 'countdown' || rmSt === 'wait') {
      const k = rmSt === 'wait' ? 1 : Math.max(0, Math.min(1, this.raceManager.countdown / 3));
      const e = k * k;
      back += 6.5 * e;
      height += 3.0 * e;
    }

    // Günəş (kölgə kamerası) oyunçunu izləyir
    const sun = this.environment.sun;
    if (sun) {
      const o = sun.userData.offset; // trekin günəş istiqaməti (palette.sunDir)
      sun.position.set(car.position.x + o[0], o[1], car.position.z + o[2]);
      sun.target.position.copy(car.position);
      sun.target.updateMatrixWorld();
    }
    // Günəş diski kameranı izləyir — sonsuz uzaqda kimi (bax Environment._celestialBody)
    this.environment.celestial?.position.set(this.camera.position.x, 0, this.camera.position.z);

    // 🎥 FPS: sükan arxası görünüş — sərt bağlı kamera
    if (this._camMode !== 'tps') {
      for (const c of this.cars) if (c._ghost) c.setGhost(false); // sükan arxası görünüşdə şəffaflıq yoxdur
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
      const camY = hood ? this._carH * 0.62 + 0.42 : 1.5;
      this.camera.position.set(
        car.position.x + Math.sin(h) * fwd, camY,
        car.position.z + Math.cos(h) * fwd
      );
      // Kapotda baxış aşağı meyillidir — burun + yol görünür
      this._camTarget.set(
        car.position.x + fx * (hood ? 16 : 40),
        hood ? 0.15 : 1.2,
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

    // Sürət kompensasiyası: eksponensial izləmənin ləngiməsini qabaqcadan ödəyir —
    // yüksək sürətdə maşın "qaçıb uzaqlaşmır", kamera yalnız bir az geri çəkilir
    // Döngənin içinə baxış + sürətdə azca alçaq rakurs — bax ChaseCam.js
    const B = chaseCamTweak(car, speedT, lookBack);
    back += B.back; height -= B.drop;
    const rx = -Math.cos(h) * lookBack, rz = Math.sin(h) * lookBack;   // sağ tərəf
    const sideCam = -B.side * 0.35;   // kamera döngənin bayırına azca çəkilir
    const desired = new THREE.Vector3(
      car.position.x - fx * back + car.velocity.x * 0.11 + rx * sideCam,
      height,
      car.position.z - fz * back + car.velocity.z * 0.11 + rz * sideCam
    );
    const k = 1 - Math.exp(-dt * 8);
    this.camera.position.lerp(desired, k);

    // Sürət zolaqları (külək effekti) + mühərrik səsi
    this.speedLines?.update(dt, speedT, car.velocity.length());
    (this.postMotion ||= {}).speed = speedT; this.postMotion.boost = car.boostTimer > 0 || car.driftBoostT > 0 ? 1 : 0; // PostFX sürət effektləri
    audio.setEngine(speedT, car.boostTimer > 0);

    const sideLook = B.side;
    this._camTarget.lerp(
      new THREE.Vector3(car.position.x + fx * 7 + rx * sideLook, 1.1, car.position.z + fz * 7 + rz * sideLook),
      1 - Math.exp(-dt * 8)
    );
    this.camera.lookAt(this._camTarget);
    this._ghostOccluders();

    // Raket dəyəndə kamera silkələnməsi
    if (this._shake > 0) {
      this._shake = Math.max(0, this._shake - dt * 1.7);
      const s = this._shake * 0.4;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.6;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }

    this.impact?.apply(this.camera); // zərbə istiqamətində itələnmə (ImpactFeel)

    // Döngədə incə kamera yatımı (roll) — sürüş hissi
    this.camera.rotateZ(-(car._steerSmooth || 0) * 0.02 * lookBack);

    // Sürətə görə FOV + nitro anında yumşaq "kick"
    this._fovKick = this._fovKick ?? 0;
    const kickTarget = car.boostTimer > 0 ? 6.5 : 0;
    this._fovKick += (kickTarget - this._fovKick) * Math.min(1, dt * 5);
    const fov = 58 + speedT * 12 + this._fovKick + B.fov;
    if (Math.abs(this.camera.fov - fov) > 0.1) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  _updateHUD() {
    const carsDots = this.cars.map((c) => ({
      x: c.position.x, z: c.position.z, color: c.data.bodyColor, isPlayer: c.isPlayer,
    }));
    const playerRacer = this.racers?.find((r) => r.isPlayer);
    const items = playerRacer?.items || [];
    const itemIdx = playerRacer?.itemIdx || 0;
    const boosting = this.playerCar.boostTimer > 0;
    // ————— SÜRƏT QATI (oyun hissi) —————
    // Yüksək sürətdə kənarlarda zolaqlar + nitroda xromatik kənar.
    // Hamısı CSS overlay-dır: render pipeline-a və FPS-ə toxunmur.
    {
      const app = this._appEl || (this._appEl = document.getElementById('app'));
      if (app) {
        if (boosting !== this._boostOn) { this._boostOn = boosting; app.classList.toggle('boosting', boosting); }
      }
    }
    // Mobil item düymələrinin ikonları
    this.touchControls?.setItems(
      items[itemIdx] || null,
      items.length > 1 ? items[1 - itemIdx] : null
    );
    // İmza gücü nişanı (HUD + mobil düymə)
    if (this.signature?.data) {
      const ab = this.signature.data;
      const url = signatureIconURL(ab.icon, ab.color, 96);
      this.hud?.setSignature?.(ab, this.signature.ready, url);
      this.touchControls?.setSignature?.(ab, this.signature.ready, url);
    }
    if (this.isRace) {
      const p = this.raceManager.getPlayer();
      this.hud.update({
        speedKmh: this.playerCar.speedKmh,
        lap: Math.max(0, p.lap) + 1,
        position: p.position,
        totalCars: this.racers.length,
        time: this.raceManager.elapsed,
        cars: carsDots,
        items,
        itemIdx,
        boosting,
      });
    } else {
      this.hud.update({
        speedKmh: this.playerCar.speedKmh,
        time: this._time,
        cars: carsDots,
        items,
        itemIdx,
        boosting,
      });
    }
  }

  _sendResults() {
    if (this._resultsSent) return;
    this._resultsSent = true;
    this._state = 'done';
    this.hud.setEndBanner(null);
    this.touchControls?.setVisible(false);
    const standings = this.raceManager.standings || this.racers;
    this.onFinish?.(standings.map((r) => ({
      name: r.name, isPlayer: r.isPlayer, color: r.color, model: carSkin(r.car.data),
      position: r.position, finishTime: r.dnf ? null : r.finishTime, // bitirməyənə uydurma vaxt yazılmır
      score: r.isPlayer ? this.score : undefined, // dəymə xalları nəticədə görünsün
    })), this.config);
  }

  // ————— Pauza —————
  _updateWaitGate(dt) {
    if (!this.online || this.raceManager.state !== 'wait') return;
    if (!this._waitToastShown) {
      this._waitToastShown = true;
      this.hud?.showToast(t('tst.waiting'));
    }
    this._waitT += dt;
    if (this._net.isHost && this._waitT > 6 && !this._cstartSent) {
      this._cstartSent = true;
      this._net.sendEvent({ kind: 'cstart' });
      this.raceManager.state = 'countdown';
    }
  }

  _togglePause() {
    if (this._state === 'done') return;
    if (this._state === 'paused') this._resume();
    else {
      this._state = 'paused';
      // input açıq qalır — Esc ilə geri qayıtmaq mümkün olsun
      // (oyun loop-u onsuz da pauzada dayanır)
      audio.setPaused(true); // mühərrik səsi sussun
      this.touchControls?.setVisible(false); // pauza menyusu ilə üst-üstə düşməsin
      this.hud.setPaused(true);
    }
  }

  _resume() {
    this._state = 'run';
    this.input.enabled = true;
    audio.setPaused(false);
    this.touchControls?.setVisible(true);
    this.hud.setPaused(false);
  }

  _shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }

  dispose() {
    // Ekran siniflərini TƏMİZLƏ — əvvəl 'fast' sinfi yarışdan sonra qalırdı
    // və statik şüalar zen-də də görünürdü (istifadəçi rəyi)
    document.getElementById('app')?.classList.remove('fast', 'boosting', 'impact');
    this.input.enabled = true;
    this.input.binds.clear();
    this.hud?.destroy();
    this.touchControls?.dispose();
    this.powerups?.dispose();
    this.effects?.dispose();
    this.skids?.dispose();
    this.speedLines?.dispose();
    this.weather?.dispose();
    if (this.trackData.weather) audio.setWeather(0, 0);
    audio.stopEngine();
    // SIRA VACİBDİR: əvvəl səhnə qrafı təmizlənir. car.dispose() maşının
    // övladlarını (ad etiketi, alov, qalxan) qrafdan çıxarır və sonra
    // təmizləyici onları GÖRMÜR — ölçüldü: futbolda dövr başına 5 tekstura.
    this._finishFx?.dispose(); this._finishFx = null;
    disposeObject3D(this.scene);
    for (const car of this.cars) car.dispose();
    this.track?.dispose();
    this.environment?.dispose();
    this.scene.clear();
  }
}
