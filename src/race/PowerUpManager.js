import * as THREE from 'three';
import {
  makeMissile, makeMine, makeBullet,
  makeItemGlow, tintItemGlow, makeAbilityBadge, abilityBadgeTexture,
} from '../core/ItemAssets.js';
import { TUNING } from '../data/balance.js';
import { audio } from '../core/AudioManager.js';

export const POWERUP_TYPES = [
  { id: 'nitro', icon: '⚡', name: 'Nitro' },
  { id: 'missile', icon: '🚀', name: 'Raket' },
  { id: 'mine', icon: '💣', name: 'Mina' },
  { id: 'shield', icon: '🛡️', name: 'Qalxan' },
  { id: 'bolt', icon: '🌩️', name: 'Şimşək' },
  { id: 'trishot', icon: '···', name: 'Üçlü atəş' },
  { id: 'repair', icon: '➕', name: 'Təmir' },
];

// Çəkili tip cədvəli: hücum dördlüyü bərabər (~19%), sonra qalxan → şimşək → can
const TYPE_WEIGHTS = { missile: 8, nitro: 8, mine: 8, trishot: 8, shield: 5, bolt: 3, repair: 1 };
const WEIGHTED_TYPES = POWERUP_TYPES.flatMap((t) => Array(TYPE_WEIGHTS[t.id] || 4).fill(t));

const BOX_RESPAWN = TUNING.items.respawn;
const PICKUP_R = TUNING.items.pickupR;
const MISSILE_SPEED = TUNING.items.missileSpeed;
const MINE_RADIUS = TUNING.items.mineRadius;
const MINE_SHIELD_T = 6;   // mina neçə saniyə "müdafiə" sayılır (raketi tutur)

// Mario Kart stili power-up sistemi: fırlanan item qutuları, nitro/raket/yağ.
export class PowerUpManager {
  constructor(scene, track, racers, { effects = null, onHit = null, onRemoteHit = null, seed = null } = {}) {
    this.scene = scene;
    this.track = track;
    this.racers = racers;
    this.effects = effects;
    this.onHit = onHit;
    this.onRemoteHit = onRemoteHit;   // onlayn: uzaq hədəfə dəymə → şəbəkə hadisəsi
    this.onMineDropped = null;        // onlayn: mina yerləşdirməni yayımla
    this.onMineBoom = null;           // onlayn: mina partladı — hamıda silinsin
    this.onPlayerPickup = null;       // UI: oyunçu hansı ability-ni götürdü
    this.onBoltFired = null;          // onlayn: şimşək yayımı (GameplayScene təyin edir)
    this.onMissileFired = null;       // onlayn: raket yayımı (hamı görsün)
    this.onBoxTaken = null;           // onlayn: qutu götürülməsi yayımı (hamıda itsin)
    this.onTrishotFired = null;       // onlayn: üçlü atəş yayımı
    this.onRemoteSmallHit = null;     // onlayn: güllə uzaq hədəfə dəydi
    this.onScore = null;              // xal: (atıcı, növ, hədəf) — dəymə qeydə alındı
    // Qutu tipləri DETERMİNİSTİKDİR: onlaynda host seed göndərir → hamıda eyni tip
    this._seed = (seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.boxes = [];
    this.projectiles = [];
    this.bullets = [];
    this.pendingBolts = [];
    this.mines = [];
    this._mineSeq = 0;
    this._t = 0;
    this.pickupCount = 0; // statistika/test üçün

    this._buildBoxes();

    // 2 ability slotu + AI item istifadə taymerləri
    for (const r of this.racers) {
      r.items = [];
      r.itemIdx = 0;
      r._aiItemDelay = 1 + Math.random() * 2.5;
    }
  }

  _rollType() {
    return WEIGHTED_TYPES[Math.floor(Math.random() * WEIGHTED_TYPES.length)];
  }

  // Qutu üçün deterministik tip: (seed, qutu indeksi, neçənci respawn) → eyni nəticə hamıda
  _seededType(boxIndex, roll, salt = 0) {
    let h = (this._seed ^ Math.imul(boxIndex + 1, 0x9e3779b9)
      ^ Math.imul(roll + 1, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return WEIGHTED_TYPES[h % WEIGHTED_TYPES.length];
  }

  // BLUR ÜSLUBU: eyni cərgədəki 3 zolaqda 3 FƏRQLİ ability olsun —
  // sürücü nəyi götürdüyünü görüb şüurlu seçim etsin (təkrar = seçim yoxdur).
  // Deterministikdir: salt artırılaraq təkrar rulet — bütün klientlərdə eyni.
  _rowUniqueType(boxIndex, roll) {
    const lane = boxIndex % 3;
    const rowStart = boxIndex - lane;
    const taken = [];
    for (let l = 0; l < lane; l++) {
      taken.push(this._rowUniqueType(rowStart + l, roll).id);
    }
    for (let salt = 0; salt < 12; salt++) {
      const t = this._seededType(boxIndex, roll, salt);
      if (!taken.includes(t.id)) return t;
    }
    return this._seededType(boxIndex, roll, 0);
  }

  // Nişan teksturaları canvas-da çəkilir; ilk dəfə istifadə anında hazırlanır
  // və həmin kadrda BOŞ render oluna bilir ("işıq var, şəkil yox" halı).
  // Ona görə hamısı səhnə qurulanda əvvəlcədən isidilir.
  _warmBadges() {
    for (const t of POWERUP_TYPES) abilityBadgeTexture(t.id);
  }

  _buildBoxes() {
    this._warmBadges();
    const rows = 4; // hər dövrədə 4 cərgə
    const lanes = [-0.5, 0, 0.5];
    for (let ri = 0; ri < rows; ri++) {
      // Startdan kənarda yerləşdir (start xəttində olmasın)
      const idx = Math.floor(this.track.N * ((ri + 0.55) / rows));
      const c = this.track.points[idx];
      const n = this.track.normals[idx];
      for (const lane of lanes) {
        this._addBox(c, n, lane * this.track.halfWidth * 1.35);
      }
    }
    // Şaxə yollarının ortasında da qutular — alternativ yolun mükafatı
    for (const br of this.track.branches || []) {
      const mid = Math.floor(br.points.length / 2);
      const c = br.points[mid];
      const n = br.normals[mid];
      for (const lane of lanes) {
        this._addBox(c, n, lane * br.halfWidth * 1.35);
      }
    }
  }

  _addBox(c, n, off) {
    const i = this.boxes.length;
    const type = this._rowUniqueType(i, 0);
    const mesh = makeItemGlow(type.id); // qutu yox — ability rəngində işıq nüvəsi
    mesh.position.set(c.x + n.x * off, 1.05, c.z + n.z * off);
    this.group.add(mesh);
    // Uzaqdan oxunan billboard nişan — nəyi götürdüyünü ƏVVƏLCƏDƏN görürsən
    const badge = makeAbilityBadge(type.id);
    badge.position.set(mesh.position.x, mesh.position.y + 1.75, mesh.position.z);
    this.group.add(badge);
    this.boxes.push({
      mesh, badge, type, i, rolls: 0, active: true, timer: 0,
      baseY: 1.05, phase: Math.random() * 6,
    });
  }

  update(dt, racingActive) {
    this._t += dt;

    // Qutular: fırlanma + üzmə + respawn (pop animasiyası ilə)
    for (const b of this.boxes) {
      // İNVARİANT: aktivdirsə hər ikisi görünür, deyilsə hər ikisi gizli.
      // Hansı yoldan gəlirsə gəlsin (şəbəkə, respawn, götürmə) desinxron
      // qalmır — "ikon var, işıq yox / işıq var, ikon yox" halları bitir.
      if (b.mesh.visible !== b.active) b.mesh.visible = b.active;
      if (b.badge && b.badge.visible !== b.active) b.badge.visible = b.active;
      if (b.active) {
        // İşıq nüvəsi: yumşaq nəbz + üzmə (fırlanan qutu yoxdur)
        b.mesh.position.y = b.baseY + Math.sin(this._t * 2.6 + b.phase) * 0.18;
        const pulse = 1 + Math.sin(this._t * 3.4 + b.phase) * 0.13;
        const core = b.mesh.getObjectByName('glowcore');
        if (core) core.scale.set(2.3 * pulse, 2.3 * pulse, 1);
        const halo = b.mesh.getObjectByName('glowhalo');
        if (halo) halo.material.opacity = 0.42 + Math.sin(this._t * 3.4 + b.phase) * 0.12;
        if (b.badge) b.badge.position.y = b.mesh.position.y + 1.55;
        // Yenidən doğulanda böyüyərək peyda olur — NİŞAN da eyni sürətlə
        // böyüyür. Əvvəl nişan dərhal tam ölçüdə çıxırdı və "ikon var, işıq
        // yoxdur" görünüşü yaranırdı (istifadəçi rəyi).
        if (b.mesh.scale.x < 1) {
          const s = Math.min(1, b.mesh.scale.x + dt * 4);
          b.mesh.scale.setScalar(s);
          if (b.badge) b.badge.scale.set(2.4 * s, 2.4 * s, 1);
        } else if (b.badge && b.badge.scale.x !== 2.4) {
          b.badge.scale.set(2.4, 2.4, 1);
        }
      } else {
        b.timer -= dt;
        if (b.netGrace > 0) b.netGrace -= dt;
        if (b.timer <= 0) {
          b.active = true;
          b.mesh.visible = true;
          b.mesh.scale.setScalar(0.05); // kiçikdən böyüyür
          b.rolls++;
          b.type = this._rowUniqueType(b.i, b.rolls); // yeni item — hamıda EYNİ (seed-li)
          tintItemGlow(b.mesh, b.type.id);
          if (b.badge) {
            b.badge.material.map = abilityBadgeTexture(b.type.id);
            b.badge.material.needsUpdate = true;
            b.badge.visible = true;
          }
        }
      }
    }

    // Götürmə — item olsa belə qutu götürülür və slot YENİLƏNİR
    if (racingActive) {
      for (const r of this.racers) {
        if (r.isRemote || r.finished) continue; // uzaqlar öz müştərisində; finişlilər yığmır
        const car = r.car;
        for (const b of this.boxes) {
          if (!b.active && !(b.netGrace > 0)) continue;
          const dx = car.position.x - b.mesh.position.x;
          const dz = car.position.z - b.mesh.position.z;
          if (dx * dx + dz * dz < PICKUP_R * PICKUP_R) {
            const wasActive = b.active;
            b.active = false;
            b.timer = BOX_RESPAWN;
            b.mesh.visible = false;
            if (b.badge) b.badge.visible = false;
            b.netGrace = 0;
            this.pickupCount++;
            this.effects?.spawnSparkle(b.mesh.position); // götürmə effekti
            if (wasActive) this.onBoxTaken?.(this.boxes.indexOf(b)); // onlayn: hamıda itsin
            if (r.items.length < 2) {
              // Boş slot var — qutunun ÜZÜNDƏKİ item verilir
              // KLON: yük sayğacı (uses) ortaq tip obyektini korlamasın
              const it = { ...b.type };
              if (it.id === 'trishot') it.uses = 3;
              r.items.push(it);
              if (r.isPlayer) {
                audio.sfx('pickup');
                this.onPlayerPickup?.(it);
              }
            } else if (r.isPlayer) {
              // Hər iki slot doludur — qutu itir, ability GƏLMİR (X ilə yer aç)
              audio.sfx('click');
            }
            break; // bir qutu bəsdir
          }
        }
      }

      // AI item istifadəsi
      for (const r of this.racers) {
        if (r.isPlayer || r.isRemote || r.finished || !r.items.length) continue;
        r._aiItemDelay -= dt;
        if (r._aiItemDelay <= 0) {
          // Təmiri boş yerə yandırma — canı azalanda saxla
          const it = r.items[r.itemIdx];
          if (it?.id === 'repair' && (r.car.hp ?? 100) > 55) {
            r._aiItemDelay = 2 + Math.random() * 2;
          } else {
            this.use(r);
            r._aiItemDelay = 1 + Math.random() * 2.5;
          }
        }
      }
    }

    this._updateProjectiles(dt);
    this._updateBullets(dt);
    this._updateBolts(dt);
    this._updateMines(dt);
  }

  // Seçilmiş ability-ni at (X düyməsi) — sonra yenisini götürmək olar
  discard(racer) {
    if (!racer.items.length) return false;
    racer.items.splice(racer.itemIdx, 1);
    racer.itemIdx = 0;
    if (racer.isPlayer) audio.sfx('discard');
    return true;
  }

  // İki slot arasında keçid (Q düyməsi)
  switchItem(racer) {
    if (racer.items.length < 2) return false;
    racer.itemIdx = (racer.itemIdx + 1) % racer.items.length;
    if (racer.isPlayer) audio.sfx('chat');
    return true;
  }

  // backward: arxadakı rəqibə at (S/↓ basılı ikən)
  // slot: konkret slotu işlət (mobil — ikinci düymə birbaşa işlədir)
  use(racer, { backward = false, slot = null } = {}) {
    if (racer.finished) return null; // finişdən sonra ability atmaq olmaz
    const idx = slot != null ? slot : racer.itemIdx;
    const item = racer.items[idx];
    if (!item) return null;
    if (item.id === 'trishot') {
      // 3 yüklü: hər istifadə 1 güllə — 3-cü atəşdən sonra bitir
      item.uses = (item.uses ?? 3) - 1;
      if (item.uses <= 0) { racer.items.splice(idx, 1); racer.itemIdx = 0; }
    } else {
      racer.items.splice(idx, 1);
      racer.itemIdx = 0;
    }
    if (racer.isPlayer) {
      const sound = { nitro: 'boost', shield: 'shield', missile: 'missile', mine: 'oil', repair: 'pickup' }[item.id];
      if (sound) audio.sfx(sound);
    }
    switch (item.id) {
      case 'nitro':
        racer.car.boostTimer = TUNING.boost.time;
        break;
      case 'shield':
        racer.car.shieldTimer = TUNING.items.shieldTime;
        break;
      case 'repair':
        this.onRepair?.(racer); // canı GameplayScene bərpa edir (hz limiti orada)
        break;
      case 'trishot': {
        // Hər istifadə 1 kiçik güllə — düz xətlə, AZ stun (Blur bolt)
        const car = racer.car;
        const h = car.heading + (backward ? Math.PI : 0);
        this.bullets.push({
          mesh: null,
          delay: 0,
          x: car.position.x + Math.sin(h) * 2.4,
          z: car.position.z + Math.cos(h) * 2.4,
          dx: Math.sin(h),
          dz: Math.cos(h),
          life: TUNING.items.trishotLife,
          shooter: racer,
          cosmetic: false,
        });
        if (racer.isPlayer) audio.sfx('trishot');
        this.onTrishotFired?.(car.position.x, car.position.z, h);
        break;
      }
      case 'bolt': {
        // TELEQRAFLI şimşək: əvvəl xəbərdarlıq (səs + bənövşəyi halqa),
        // ~1 saniyə sonra zərbə — qalxanı vaxtında işlətmək olur (Blur şoku)
        const R = TUNING.items.boltRange;
        // Məsafə göstəricisi: yerdən genişlənən halqa — hara qədər vurduğunu göstərir
        if (racer.isPlayer) this.effects?.spawnRangeRing(racer.car.position, R);
        const targets = [];
        for (const r of this.racers) {
          if (r === racer || r.finished) continue;
          const dx = r.car.position.x - racer.car.position.x;
          const dz = r.car.position.z - racer.car.position.z;
          if (Math.hypot(dx, dz) > R) continue;
          targets.push(r);
        }
        if (!targets.length) {
          // Heç kim radiusda deyil — dərhal boş ildırım + fizzle səsi
          const h = racer.car.heading;
          this.effects?.spawnLightning({
            x: racer.car.position.x + Math.sin(h) * 9,
            y: 0,
            z: racer.car.position.z + Math.cos(h) * 9,
          });
          if (racer.isPlayer) audio.sfx('boltmiss');
        } else {
          for (const t of targets) this.effects?.spawnWarnMark(t.car, TUNING.items.boltDelay);
          audio.sfx('boltcast'); // yüklənmə səsi — hamı eşidir (xəbərdarlıq)
          this.pendingBolts.push({ timer: TUNING.items.boltDelay, targets, caster: racer });
        }
        this.onBoltFired?.(); // onlayn yayım (qəbul edən öz gecikməsini işlədir)
        break;
      }
      case 'missile': {
        // Fiziki ƏN YAXIN rəqib: irəli atışda öndəki, arxaya atışda arxadakı.
        // Hədəf yoxdursa (məs. sərbəst gəzinti) → DÜZ uçan raket (nitro effekti YOX)
        const target = this._findTarget(racer, backward);
        const car = racer.car;
        const h = car.heading + (backward ? Math.PI : 0);
        const m = makeMissile();
        m.position.set(
          car.position.x + Math.sin(h) * 2.6,
          0.85,
          car.position.z + Math.cos(h) * 2.6
        );
        m.lookAt(m.position.x + Math.sin(h), 0.85, m.position.z + Math.cos(h));
        this.group.add(m);
        this.projectiles.push({
          mesh: m,
          target,
          dx: Math.sin(h),
          dz: Math.cos(h),
          shooter: racer,
          life: TUNING.items.missileLife,
        });
        this.onMissileFired?.(target, m.position.x, m.position.z, h); // onlayn yayım
        break;
      }
      case 'mine': {
        const h = racer.car.heading;
        const px = racer.car.position.x - Math.sin(h) * 3.6;
        const pz = racer.car.position.z - Math.cos(h) * 3.6;
        const id = (racer.netId || 'ai') + '-' + (this._mineSeq++);
        this._placeMine(id, px, pz, racer);
        this.onMineDropped?.(id, px, pz); // onlayn yayım
        break;
      }
    }
    return item;
  }

  _placeMine(id, x, z, owner) {
    const m = makeMine();
    m.position.set(x, 0, z);
    this.group.add(m);
    this.mines.push({ id, mesh: m, owner, grace: 1.2, t: Math.random() * 3 });
    // Hər sahibin maksimum 4 aktiv minası — köhnəsi sakitcə itir
    // (deterministik: bütün müştərilərdə eyni qayda → sinxron qalır)
    const own = this.mines.filter((x2) => x2.owner === owner);
    if (own.length > 4) {
      const old = own[0];
      const oi = this.mines.indexOf(old);
      this.group.remove(old.mesh);
      this.mines.splice(oi, 1);
    }
  }

  // Şəbəkədən gələn mina
  spawnNetMine(id, x, z, owner) {
    this._placeMine(id, x, z, owner);
  }

  // Şəbəkədən: mina başqasının müştərisində partladı — burada da silinsin
  removeNetMine(id) {
    const i = this.mines.findIndex((m) => m.id === id);
    if (i < 0) return null;
    const m = this.mines[i];
    this.effects?.spawnExplosion(new THREE.Vector3(m.mesh.position.x, 0.8, m.mesh.position.z));
    audio.sfx('explosion');
    this.group.remove(m.mesh);
    this.mines.splice(i, 1);
    return m; // sahibi bilinsin (xal üçün)
  }

  // Şəbəkədən: başqa oyunçu qutunu götürdü — burada da itsin
  takeNetBox(index) {
    const b = this.boxes[index];
    if (!b || !b.active) return;
    b.active = false;
    b.timer = BOX_RESPAWN;
    b.mesh.visible = false;
    if (b.badge) b.badge.visible = false;
    // GECİKMƏ ƏDALƏTİ: şəbəkə ləngiməsində qutuya eyni anda çatan yerli
    // oyunçu da götürə bilsin (hər ikisi item alır — Mario Kart yanaşması)
    b.netGrace = 0.5;
    this.effects?.spawnSparkle(b.mesh.position);
  }

  // Şəbəkədən: mənə tərəf şimşək atıldı — radiusdayamsa xəbərdarlıq + gecikmə + zərbə
  incomingBolt(senderRacer, selfRacer) {
    const dx = selfRacer.car.position.x - senderRacer.car.position.x;
    const dz = selfRacer.car.position.z - senderRacer.car.position.z;
    if (Math.hypot(dx, dz) > TUNING.items.boltRange) return;
    this.effects?.spawnWarnMark(selfRacer.car, TUNING.items.boltDelay);
    audio.sfx('boltcast');
    this.pendingBolts.push({ timer: TUNING.items.boltDelay, targets: [selfRacer], caster: senderRacer });
  }

  // Şəbəkədən gələn üçlü atəş — kosmetik güllə (hər istifadə = 1 hadisə)
  spawnNetTrishot(x, z, h, shooterRacer) {
    this.bullets.push({
      mesh: null,
      delay: 0,
      x: x + Math.sin(h) * 2.4,
      z: z + Math.cos(h) * 2.4,
      dx: Math.sin(h),
      dz: Math.cos(h),
      life: TUNING.items.trishotLife,
      shooter: shooterRacer,
      cosmetic: true,
    });
  }

  // Şəbəkədən gələn raket — KOSMETİK (real stun 'hit' hadisəsi ilə gəlir)
  spawnNetMissile(x, z, targetRacer, shooterRacer, h = 0) {
    const m = makeMissile();
    m.position.set(x, 0.85, z);
    this.group.add(m);
    this.projectiles.push({
      mesh: m,
      target: targetRacer,
      dx: Math.sin(h),
      dz: Math.cos(h),
      shooter: shooterRacer,
      cosmetic: true,
      life: TUNING.items.missileLife,
    });
  }

  // Fiziki məsafəyə görə hədəf: backward=false → öndəki ən yaxın, true → arxadakı ən yaxın.
  // Həmin tərəfdə heç kim yoxdursa → istənilən ən yaxın (raket boşa getməsin).
  _findTarget(racer, backward) {
    const car = racer.car;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    let bestSide = null, bestSideD = Infinity;
    let bestAny = null, bestAnyD = Infinity;
    for (const r of this.racers) {
      if (r === racer || r.finished) continue;
      if ((r.car._sigCloak || 0) > 0) continue; // "Kölgə rejimi" — hədəf alına bilmir
      const dx = r.car.position.x - car.position.x;
      const dz = r.car.position.z - car.position.z;
      const d = Math.hypot(dx, dz);
      const dot = dx * fx + dz * fz; // + = maşının önündə
      const onSide = backward ? dot < 0 : dot > 0;
      if (onSide && d < bestSideD) { bestSideD = d; bestSide = r; }
      if (d < bestAnyD) { bestAnyD = d; bestAny = r; }
    }
    return bestSide || bestAny;
  }

  // Homing raket: hədəfi izləyir; yolda İSTƏNİLƏN rəqibə yaxınlaşsa, ona partlayır
  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      const step = MISSILE_SPEED * dt;
      if (p.target) {
        // Homing: hədəfə doğru uç
        const t = p.target.car;
        const dx = t.position.x - p.mesh.position.x;
        const dz = t.position.z - p.mesh.position.z;
        const d = Math.hypot(dx, dz) || 0.001;
        p.mesh.position.x += (dx / d) * step;
        p.mesh.position.z += (dz / d) * step;
        p.mesh.lookAt(t.position.x, 0.85, t.position.z);
      } else {
        // Hədəfsiz: atıldığı istiqamətdə düz uçur
        p.mesh.position.x += p.dx * step;
        p.mesh.position.z += p.dz * step;
      }
      // Egzoz alovunun titrəməsi
      const flame = p.mesh.getObjectByName('flame');
      if (flame) flame.scale.setScalar(0.75 + Math.random() * 0.55);

      // KƏSİŞMƏ 1: qarşı raket — arxaya atılan raket gələn raketi vurub söndürür
      let intercepted = false;
      for (let j = this.projectiles.length - 1; j >= 0; j--) {
        if (j === i) continue;
        const o = this.projectiles[j];
        if (o.shooter === p.shooter) continue; // öz raketlərin bir-birini vurmasın
        if (p.mesh.position.distanceTo(o.mesh.position) > 3.2) continue;
        const mid = p.mesh.position.clone().lerp(o.mesh.position, 0.5);
        this.effects?.spawnExplosion(mid);
        this.effects?.spawnSparkle(mid, 0xffd27a);
        audio.sfx('explosion');
        this._removeProjectile(Math.max(i, j));
        this._removeProjectile(Math.min(i, j));
        if (j < i) i--; // silinən element indeksi sürüşdürür
        intercepted = true;
        break;
      }
      if (intercepted) continue;

      // KƏSİŞMƏ 2: mina yalnız MÜDAFİƏ vasitəsi kimi raketi tutur —
      // hədəf raket gələndə təzə mina atıbsa. Yolda sərbəst duran minalar
      // (başqasının, yaxud köhnə) raketi cəlb etmir, raket üstündən keçir.
      let mineHit = false;
      for (let mi = this.mines.length - 1; mi >= 0; mi--) {
        const m = this.mines[mi];
        if (!p.target || m.owner !== p.target) continue; // yalnız hədəfin öz minası
        if (m.t > MINE_SHIELD_T) continue;               // reaksiya kimi təzə olmalıdır
        const dxm = m.mesh.position.x - p.mesh.position.x;
        const dzm = m.mesh.position.z - p.mesh.position.z;
        if (Math.hypot(dxm, dzm) > MINE_RADIUS + 1.2) continue;
        this.effects?.spawnExplosion(new THREE.Vector3(m.mesh.position.x, 0.8, m.mesh.position.z));
        audio.sfx('explosion');
        this.group.remove(m.mesh);
        this.mines.splice(mi, 1);
        this.onMineBoom?.(m.id); // onlayn: hamıda silinsin
        this._removeProjectile(i);
        mineHit = true;
        break;
      }
      if (mineHit) continue;

      // Yaxınlıq partlayıcısı: atıcıdan başqa KİMƏ yaxındırsa, ona dəyir
      let hitRacer = null;
      let hitD = 3.0;
      for (const r of this.racers) {
        if (r === p.shooter || r.finished) continue;
        const hx = r.car.position.x - p.mesh.position.x;
        const hz = r.car.position.z - p.mesh.position.z;
        const hd = Math.hypot(hx, hz);
        if (hd < hitD) { hitD = hd; hitRacer = r; }
      }
      if (hitRacer) {
        if (p.cosmetic) {
          // Kosmetik raket: yalnız partlayış görüntüsü (stun 'hit' hadisəsindən gəlir)
          this.effects?.spawnExplosion(new THREE.Vector3(
            hitRacer.car.position.x, 1.0, hitRacer.car.position.z
          ));
          audio.sfx('explosion');
        } else {
          this._applyMissileHit(hitRacer, p.shooter);
        }
        this._removeProjectile(i);
        continue;
      }
      // Ömrü bitdi / hədəf finişdə
      if (p.life <= 0 || p.target?.finished) {
        // Hədəfsiz raket ömrünün sonunda partlayır (görüntü üçün)
        if (!p.target && p.life <= 0) {
          this.effects?.spawnExplosion(p.mesh.position.clone());
          audio.sfx('explosion');
        }
        this._removeProjectile(i);
      }
    }
  }

  _applyMissileHit(racer, shooter = null) {
    const t = racer.car;
    this.effects?.spawnExplosion(new THREE.Vector3(t.position.x, 1.0, t.position.z));
    audio.sfx('explosion');
    if (shooter) this.onScore?.(shooter, 'missile', racer);
    if (racer.isRemote) {
      this.onRemoteHit?.(racer); // stun hədəfin öz müştərisində tətbiq olunur
    } else if (t.shieldTimer > 0) {
      t.shieldTimer = 0; // qalxan raketi udub sınır
      this.effects?.spawnSparkle(t.position);
    } else {
      t.hitTimer = TUNING.items.hitStun * (t.stunMul || 1);
      this.onHit?.(racer);
    }
  }

  _removeProjectile(i) {
    const p = this.projectiles[i];
    this.group.remove(p.mesh);
    this.projectiles.splice(i, 1);
  }

  // Üçlü atəş güllələri: düz uçur, dəyəndə KİÇİK stun
  _updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (b.delay > 0) { b.delay -= dt; continue; }
      if (!b.mesh) {
        b.mesh = makeBullet();
        b.mesh.position.set(b.x, 0.8, b.z);
        b.mesh.lookAt(b.x + b.dx, 0.8, b.z + b.dz);
        this.group.add(b.mesh);
      }
      b.life -= dt;
      b.x += b.dx * TUNING.items.trishotSpeed * dt;
      b.z += b.dz * TUNING.items.trishotSpeed * dt;
      b.mesh.position.set(b.x, 0.8, b.z);

      let hit = false;
      if (!b.cosmetic) {
        for (const r of this.racers) {
          if (r === b.shooter || r.finished) continue;
          const hx = r.car.position.x - b.x;
          const hz = r.car.position.z - b.z;
          if (hx * hx + hz * hz < 1.7 * 1.7) {
            this.effects?.spawnSparkle(r.car.position, 0xdbe6f5);
            this.onScore?.(b.shooter, 'trishot', r);
            if (r.isRemote) {
              this.onRemoteSmallHit?.(r);
            } else if (r.car.shieldTimer > 0) {
              // qalxan kiçik gülləni udur (sınmır)
            } else {
              r.car.hitTimer = Math.max(r.car.hitTimer, TUNING.items.trishotStun * (r.car.stunMul || 1));
              if (r.isPlayer) audio.sfx('tick');
              this.onHit?.(r);
            }
            hit = true;
            break;
          }
        }
      }
      if (hit || b.life <= 0) {
        if (b.mesh) this.group.remove(b.mesh);
        this.bullets.splice(i, 1);
      }
    }
  }

  // Teleqraflı şimşək: gecikmə bitəndə zərbə
  _updateBolts(dt) {
    for (let i = this.pendingBolts.length - 1; i >= 0; i--) {
      const p = this.pendingBolts[i];
      p.timer -= dt;
      if (p.timer > 0) continue;
      for (const r of p.targets) {
        this.effects?.spawnLightning(r.car.position);
        if (p.caster) this.onScore?.(p.caster, 'bolt', r);
        if (r.isRemote) continue; // uzağın stunu öz müştərisində
        if (r.car.shieldTimer > 0) {
          this.effects?.spawnSparkle(r.car.position); // qalxan qorudu!
          continue;
        }
        r.car.hitTimer = TUNING.items.boltStun * (r.car.stunMul || 1);
        if (r.isPlayer) this.onHit?.(r);
      }
      audio.sfx('bolt');
      this.pendingBolts.splice(i, 1);
    }
  }

  // Minalar: yanıb-sönən lampa + toxunanda RAKET KİMİ partlayış
  _updateMines(dt) {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.grace = Math.max(0, m.grace - dt);
      m.t += dt;
      const lamp = m.mesh.getObjectByName('minelamp');
      if (lamp) lamp.material.emissiveIntensity = 1.2 + Math.sin(m.t * 8) * 1.1;
      let exploded = false;
      for (const r of this.racers) {
        if (r.isRemote || r.finished) continue; // uzaqların dəyməsi öz müştərisində
        if (m.grace > 0 && r === m.owner) continue;
        const dx = r.car.position.x - m.mesh.position.x;
        const dz = r.car.position.z - m.mesh.position.z;
        if (dx * dx + dz * dz < MINE_RADIUS * MINE_RADIUS) {
          // BOOM — raket dəymiş kimi
          this.effects?.spawnExplosion(new THREE.Vector3(m.mesh.position.x, 0.8, m.mesh.position.z));
          audio.sfx('explosion');
          if (m.owner) this.onScore?.(m.owner, 'mine', r);
          if (r.car.shieldTimer > 0) {
            r.car.shieldTimer = 0; // qalxan minanı udub sınır
            this.effects?.spawnSparkle(r.car.position);
          } else {
            r.car.hitTimer = TUNING.items.hitStun * (r.car.stunMul || 1);
            this.onHit?.(r);
          }
          this.group.remove(m.mesh);
          this.mines.splice(i, 1);
          this.onMineBoom?.(m.id); // onlayn: hamıda silinsin
          exploded = true;
          break;
        }
      }
      if (exploded) continue;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
    });
  }
}
