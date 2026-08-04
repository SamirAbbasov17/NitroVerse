import * as THREE from 'three';
import { playerCarData } from '../data/playerCar.js';
import { CARS, getCarById } from '../data/cars.js';
import { Car } from '../entities/Car.js';
import { PlayerController } from '../entities/PlayerController.js';
import { NetworkController } from '../entities/NetworkController.js';
import { SkidMarks } from './SkidMarks.js';
import { disposeObject3D } from './MergeUtils.js';
import { playFinishFx } from './FinishFx.js';
import { Effects } from './Effects.js';
import { SpeedLines } from './SpeedLines.js';
import { TouchControls, isTouchDevice } from './TouchControls.js';
import { audio } from './AudioManager.js';
import { t } from './i18n.js';
import { auth } from '../net/Auth.js';
import { makeNameTag, makeFloodlight, makeSponsorBoard, makeBunting } from './AssetFactory.js';
import { mergeStaticGroup } from './MergeUtils.js';

// ⚽ FUTBOL 3v3 — Rocket League ruhu: top, iki qapı, nitro + irəli atılma.
// Onlaynda top və botlar HOST-da simulyasiya olunur.
const FIELD_W = 96;    // en (x)
const FIELD_H = 150;   // uzunluq (z) — qapılar z=±H/2
const GOAL_W = 22;
const BALL_R = 2.3;
const CAR_R = 1.6;
const MATCH_TIME = 180;
const LUNGE_CD = 2.6;
const HOP_T = 0.68;    // zərbə sıçrayışının müddəti (s) — hiss olunan havalanma
const CORNER = 13;     // meydança künclərinin diaqonal kəsimi
const NITRO_REGEN_T = 8; // saniyədə bir yığım

const TEAM_COLORS = { blue: 0x37b8ff, red: 0xff4544 };

export class FootballScene {
  constructor(config, { input, uiRoot, renderer = null, library, onLeave = null, onQuit }) {
    this.config = config;
    this.input = input;
    this.uiRoot = uiRoot;
    this.renderer = renderer;
    this.library = library;
    this.onQuit = onQuit;
    this.onLeave = onLeave;
    this.online = config.online || null;
    this._state = 'countdown';
    this._time = 0;
    this._matchT = MATCH_TIME;
    this.scores = { blue: 0, red: 0 };

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 900);
    this.scene.add(this.camera);
    this.speedLines = new SpeedLines(this.camera);
    this._camTarget = new THREE.Vector3();
    if (this.renderer) this.renderer.toneMappingExposure = 1.18;

    this._buildArena();
    this._buildStadiumProps();
    this._buildBall();
    this._buildCars();
    this._buildHUD();
    this._bindKeys();
    if (this.online) this._setupNet();
    audio.playMusic('race');

    this._kickoff();
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

  // ————— Arena —————
  // 4 küncdə prожektor qülləsi — stadion atmosferi (statik, ucuz)
  _buildFloodlights() {
    const poleGeo = new THREE.CylinderGeometry(0.38, 0.52, 15, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3150, roughness: 0.85, flatShading: true });
    const headGeo = new THREE.BoxGeometry(3.4, 2.0, 0.7);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xdfefff, emissive: 0xbfdcff, emissiveIntensity: 1.5, roughness: 0.4, flatShading: true,
    });
    const glowGeo = new THREE.CircleGeometry(2.4, 18);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xcfe4ff, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const g = new THREE.Group();
      const x = sx * (FIELD_W / 2 + 6.5), z = sz * (FIELD_H / 2 + 6.5);
      g.position.set(x, 0, z);
      g.rotation.y = Math.atan2(-x, -z); // meydana baxır
      const p = new THREE.Mesh(poleGeo, poleMat);
      p.position.y = 7.5;
      g.add(p);
      const h = new THREE.Mesh(headGeo, headMat);
      h.position.set(0, 15.2, 0.5);
      h.rotation.x = 0.45;
      g.add(h);
      const gl = new THREE.Mesh(glowGeo, glowMat);
      gl.position.set(0, 15.1, 1.0);
      gl.rotation.x = 0.45;
      g.add(gl);
      this.scene.add(g);
    }
  }

  // Stadion qurğuları: künc projektorları, kənar reklam lövhələri, bayraqlar.
  // Meydanın KƏNARINDA qurulur (oyuna qarışmır), tək qrupda birləşdirilir.
  _buildStadiumProps() {
    const g = new THREE.Group();
    // 4 künc projektoru
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const fl = makeFloodlight(19, true);
      fl.position.set(sx * (FIELD_W / 2 + 9), 0, sz * (FIELD_H / 2 + 9));
      fl.rotation.y = Math.atan2(-sx, -sz);
      g.add(fl);
    }
    // Yan xətt boyu reklam lövhələri
    for (const sx of [-1, 1]) {
      for (let z = -FIELD_H / 2 + 9; z < FIELD_H / 2 - 6; z += 9) {
        const cols = [0x1f6feb, 0xe0342c, 0x22a06b, 0xff7a2f, 0x8a3df0];
        const b = makeSponsorBoard(7.6, cols[Math.abs(Math.round(z / 9)) % cols.length]);
        b.position.set(sx * (FIELD_W / 2 + 2.6), 0, z);
        b.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(b);
      }
    }
    // Qapı arxasında bayraq sıraları
    for (const sz of [-1, 1]) {
      const bu = makeBunting(26);
      bu.position.set(0, 0, sz * (FIELD_H / 2 + 5.5));
      g.add(bu);
    }
    const merged = mergeStaticGroup(g);
    g.traverse((o) => o.geometry?.dispose?.());
    this.scene.add(merged);
  }

  _buildArena() {
    this._buildFloodlights();
    this.scene.background = new THREE.Color(0x0e1224);
    this.scene.fog = new THREE.Fog(0x0e1224, 160, 420);
    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x1a2030, 1.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(60, 120, 30);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    // Meydança — zolaqlı ot + xətlər (canvas)
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 512;
    const cx = cv.getContext('2d');
    // BİÇİM ZOLAQLARI: əvvəl 8 zolaq vardı, amma fərq ~5% idi və ekranda
    // görünmürdü — meydança tək düz yaşıl kimi oxunurdu. İndi 12 zolaq,
    // aydın kontrast + incə ot faktura ləkələri.
    for (let i = 0; i < 12; i++) {
      cx.fillStyle = i % 2 ? '#2a7439' : '#379752';
      cx.fillRect(0, i * (512 / 12), 256, 512 / 12);
    }
    // Ot ləkələri — düz rəngin plastik görkəmini qırır
    for (let i = 0; i < 900; i++) {
      cx.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.035})`;
      const x = Math.random() * 256, y = Math.random() * 512;
      cx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 2);
    }
    cx.strokeStyle = 'rgba(255,255,255,0.85)';
    cx.lineWidth = 4;
    cx.strokeRect(8, 8, 240, 496);
    cx.beginPath(); cx.moveTo(8, 256); cx.lineTo(248, 256); cx.stroke();
    cx.beginPath(); cx.arc(128, 256, 42, 0, 7); cx.stroke();
    cx.strokeRect(58, 8, 140, 56);
    cx.strokeRect(58, 448, 140, 56);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD_W, FIELD_H),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
    );
    pitch.rotation.x = -Math.PI / 2;
    this.scene.add(pitch);
    // Ətraf zəmin
    const around = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      new THREE.MeshStandardMaterial({ color: 0x141a2e, roughness: 1 })
    );
    around.rotation.x = -Math.PI / 2;
    around.position.y = -0.05;
    this.scene.add(around);

    // ——— Peşəkar bortlar: reklam lövhəsi zolağı + üstündə "şüşə" ———
    const wallH = 5;
    const boardCv = document.createElement('canvas');
    boardCv.width = 1024; boardCv.height = 64;
    const bx = boardCv.getContext('2d');
    bx.fillStyle = '#0d1430'; bx.fillRect(0, 0, 1024, 64);
    const brands = [
      ['NITROVERSE', '#ff6b1a'], ['NITRO+', '#ffd34d'],
      ['TURBO CUP', '#4fc3ff'], ['DRIFT ENERGY', '#7dff8a'],
    ];
    bx.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) {
      const [word, col] = brands[i];
      const x0 = i * 256;
      bx.fillStyle = i % 2 ? '#111a3a' : '#0d1430';
      bx.fillRect(x0, 0, 256, 64);
      bx.strokeStyle = 'rgba(255,255,255,0.14)';
      bx.lineWidth = 2;
      bx.strokeRect(x0 + 3, 3, 250, 58);
      // Uzun brend adı xanadan daşmasın
      let fs = 30;
      const setF = (s) => { bx.font = `bold ${s}px "Chakra Petch", sans-serif`; };
      setF(fs);
      while (bx.measureText(word).width > 238 && fs > 14) setF(--fs);
      bx.fillStyle = col;
      bx.textAlign = 'center';
      bx.fillText(word, x0 + 128, 34);
    }
    const boardTex = new THREE.CanvasTexture(boardCv);
    boardTex.colorSpace = THREE.SRGBColorSpace;
    boardTex.wrapS = THREE.RepeatWrapping;
    const mkBoardMat = (rep) => {
      const t = boardTex.clone();
      t.repeat.set(rep, 1);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({
        map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.5, roughness: 0.7,
      });
    };
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x9fc4ff, transparent: true, opacity: 0.06, roughness: 0.15,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x39456b, roughness: 0.5 });
    const BH = 2.4; // lövhə hündürlüyü
    const addWall = (cx2, cz, w, d, rotY, boardLen) => {
      const board = new THREE.Mesh(new THREE.BoxGeometry(w, BH, d), mkBoardMat(Math.max(1, Math.round(boardLen / 26))));
      board.position.set(cx2, BH / 2, cz);
      board.rotation.y = rotY;
      this.scene.add(board);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(w, d), wallH - BH), glassMat);
      glass.position.set(cx2, BH + (wallH - BH) / 2, cz);
      glass.rotation.y = rotY + (d > w ? Math.PI / 2 : 0);
      this.scene.add(glass);
    };
    const sideLen = FIELD_H - CORNER * 2;
    for (const sx of [-1, 1]) {
      addWall(sx * (FIELD_W / 2 + 0.5), 0, 1, sideLen, 0, sideLen);
      // Bort dayaqları
      for (let z = -sideLen / 2; z <= sideLen / 2; z += 25) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, wallH, 6), postMat);
        p.position.set(sx * (FIELD_W / 2 + 0.5), wallH / 2, z);
        this.scene.add(p);
      }
    }
    const endW = (FIELD_W - GOAL_W) / 2 - CORNER;
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        addWall(sx * (GOAL_W / 2 + endW / 2), sz * (FIELD_H / 2 + 0.5), endW, 1, 0, endW);
      }
      // Diaqonal künc panelləri (RL üslubu)
      for (const sx of [-1, 1]) {
        const midX = sx * (FIELD_W / 2 - CORNER / 2);
        const midZ = sz * (FIELD_H / 2 - CORNER / 2);
        const rotY = Math.atan2(sx, sz);
        const clen = CORNER * Math.SQRT2 + 1;
        const cb = new THREE.Mesh(new THREE.BoxGeometry(clen, BH, 1), mkBoardMat(1));
        cb.position.set(midX, BH / 2, midZ);
        cb.rotation.y = rotY;
        this.scene.add(cb);
        const cg = new THREE.Mesh(new THREE.PlaneGeometry(clen, wallH - BH), glassMat);
        cg.position.set(midX, BH + (wallH - BH) / 2, midZ);
        cg.rotation.y = rotY;
        this.scene.add(cg);
      }
      // Qapı: dirəklər + yuxarı tir + parıltı + tor
      const team = sz < 0 ? 'blue' : 'red';
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0xf4f7ff, emissive: 0xdfe8ff, emissiveIntensity: 0.7, roughness: 0.35,
      });
      for (const px of [-GOAL_W / 2, GOAL_W / 2]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 4.8, 8), frameMat);
        post.position.set(px, 2.4, sz * (FIELD_H / 2 + 0.6));
        this.scene.add(post);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, GOAL_W, 8), frameMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, 4.8, sz * (FIELD_H / 2 + 0.6));
      this.scene.add(bar);
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(GOAL_W, 0.5, 1.4),
        new THREE.MeshStandardMaterial({
          color: TEAM_COLORS[team], emissive: TEAM_COLORS[team], emissiveIntensity: 1.6,
        })
      );
      glow.position.set(0, 0.25, sz * (FIELD_H / 2 + 0.7));
      this.scene.add(glow);
      // TOR: əvvəl rəngli yarımşəffaf QUTU idi — duman kimi görünürdü, tor
      // oxunmurdu. İndi əsl tor teksturası (canvas şəbəkə, şəffaf fon).
      if (!FootballScene._netTex) {
        const nc = document.createElement('canvas');
        nc.width = nc.height = 64;
        const nx = nc.getContext('2d');
        nx.strokeStyle = 'rgba(255,255,255,0.75)';
        nx.lineWidth = 1.6;
        for (let i = 0; i <= 8; i++) {
          const t = (i / 8) * 64;
          nx.beginPath(); nx.moveTo(t, 0); nx.lineTo(t, 64); nx.stroke();
          nx.beginPath(); nx.moveTo(0, t); nx.lineTo(64, t); nx.stroke();
        }
        const tx = new THREE.CanvasTexture(nc);
        tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
        tx.repeat.set(GOAL_W / 2.2, 2.4);
        FootballScene._netTex = tx;
      }
      const netMat = new THREE.MeshStandardMaterial({
        map: FootballScene._netTex, color: TEAM_COLORS[team],
        transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
      });
      const net = new THREE.Mesh(new THREE.BoxGeometry(GOAL_W, 4.4, 5), netMat);
      net.position.set(0, 2.2, sz * (FIELD_H / 2 + 3.2));
      this.scene.add(net);
    }
    // KÜNC BAYRAQLARI — stadion dilinin klassik detalı, meydan sərhədini
    // oxunaqlı edir (dörd künc, ucuz həndəsə)
    {
      const dirəkMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.8 });
      const bayraqMat = new THREE.MeshStandardMaterial({
        color: 0xffd34d, roughness: 0.9, side: THREE.DoubleSide, flatShading: true,
      });
      for (const sx of [-1, 1]) {
        for (const sz2 of [-1, 1]) {
          const dirək = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.4, 6), dirəkMat);
          dirək.position.set(sx * (FIELD_W / 2 - 0.8), 1.2, sz2 * (FIELD_H / 2 - 0.8));
          this.scene.add(dirək);
          const bayraq = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.6), bayraqMat);
          bayraq.position.set(dirək.position.x - sx * 0.5, 2.05, dirək.position.z);
          bayraq.rotation.y = sx > 0 ? 0 : Math.PI;
          this.scene.add(bayraq);
        }
      }
    }

    // Tribunalar — izləyici kütləsi teksturası ilə (canvas, bir dəfə çəkilir)
    const crowdCv = document.createElement('canvas');
    crowdCv.width = 256; crowdCv.height = 32;
    const cc = crowdCv.getContext('2d');
    cc.fillStyle = '#262f4e';
    cc.fillRect(0, 0, 256, 32);
    const crowdCols = ['#ffd34d', '#ff6b6b', '#4fc3ff', '#7dff8a', '#ff9d66', '#d9a0ff', '#f2f4f8'];
    for (let i = 0; i < 900; i++) {
      cc.fillStyle = crowdCols[(Math.random() * crowdCols.length) | 0];
      cc.globalAlpha = 0.55 + Math.random() * 0.45;
      cc.fillRect(Math.random() * 256, Math.random() * 30, 1.6, 2.2);
    }
    cc.globalAlpha = 1;
    const crowdTex = new THREE.CanvasTexture(crowdCv);
    crowdTex.colorSpace = THREE.SRGBColorSpace;
    crowdTex.wrapS = THREE.RepeatWrapping;
    const standTop = new THREE.MeshStandardMaterial({ color: 0x323d63, roughness: 0.9 });
    for (let tier = 0; tier < 3; tier++) {
      const crowdMat = new THREE.MeshStandardMaterial({
        map: crowdTex.clone(), roughness: 1,
        emissive: 0x404a70, emissiveIntensity: 0.55, emissiveMap: crowdTex,
      });
      crowdMat.map.repeat.set(10 + tier * 2, 1);
      for (const [px, pz, w, d] of [
        [0, (FIELD_H / 2 + 18 + tier * 7), FIELD_W + 36 + tier * 14, 8],
        [0, -(FIELD_H / 2 + 18 + tier * 7), FIELD_W + 36 + tier * 14, 8],
        [(FIELD_W / 2 + 18 + tier * 7), 0, 8, FIELD_H + 36 + tier * 14],
        [-(FIELD_W / 2 + 18 + tier * 7), 0, 8, FIELD_H + 36 + tier * 14],
      ]) {
        const seg = new THREE.Mesh(
          new THREE.BoxGeometry(w, 2.6, d),
          [crowdMat, crowdMat, standTop, standTop, crowdMat, crowdMat]
        );
        seg.position.set(px, 1.3 + tier * 2.9, pz);
        this.scene.add(seg);
      }
    }
    // Divar üstü LED zolaq — perimetr boyu komanda rəngləri
    for (const [px, pz, w, d, col] of [
      [0, FIELD_H / 2 + 0.5, FIELD_W + 2, 1.2, TEAM_COLORS.red],
      [0, -(FIELD_H / 2 + 0.5), FIELD_W + 2, 1.2, TEAM_COLORS.blue],
      [FIELD_W / 2 + 0.5, 0, 1.2, FIELD_H + 2, 0xbf7dff],
      [-(FIELD_W / 2 + 0.5), 0, 1.2, FIELD_H + 2, 0xbf7dff],
    ]) {
      const led = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.5, d),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.4 })
      );
      led.position.set(px, wallH + 0.25, pz);
      this.scene.add(led);
    }
    // Ulduzlu gecə səması (ucuz Points buludu)
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(220 * 3);
    for (let i = 0; i < 220; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = 260 + Math.random() * 160;
      starPos[i * 3] = Math.cos(a) * rr;
      starPos[i * 3 + 1] = 40 + Math.random() * 200;
      starPos[i * 3 + 2] = Math.sin(a) * rr;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.scene.add(new THREE.Points(starGeo,
      new THREE.PointsMaterial({ color: 0xcfd8ee, size: 1.3, sizeAttenuation: false, fog: false })));
    // Projektorlar
    for (const [x, z] of [[-70, -95], [70, -95], [-70, 95], [70, 95]]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.7, 26, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a3048 })
      );
      pole.position.set(x, 13, z);
      this.scene.add(pole);
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(6, 2.4, 1),
        new THREE.MeshStandardMaterial({ color: 0xf8fbff, emissive: 0xdfe8ff, emissiveIntensity: 2.2 })
      );
      lamp.position.set(x * 0.94, 25, z * 0.94);
      lamp.lookAt(0, 0, 0);
      this.scene.add(lamp);
    }
  }

  _buildBall() {
    this.ball = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(BALL_R, 1),
      new THREE.MeshStandardMaterial({
        color: 0xf2f4f8, flatShading: true, roughness: 0.4,
        emissive: 0x8fb8ff, emissiveIntensity: 0.18,
      })
    );
    this.ball.add(core);
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(BALL_R * 0.99, 0.14, 6, 20),
      new THREE.MeshStandardMaterial({ color: 0xff6b1a, emissive: 0xff6b1a, emissiveIntensity: 0.7 })
    );
    this.ball.add(band);
    this.scene.add(this.ball);
    this.ballVel = new THREE.Vector3();
    // Top şleyfi — sürətli uçuşda parlaq iz
    this._trailPos = new Float32Array(22 * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this._trailPos, 3));
    this._trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
      color: 0x9fd8ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this._trail.frustumCulled = false;
    this.scene.add(this._trail);
    this._trailT = 0;
    this.ballPos = new THREE.Vector3(0, BALL_R, 0);
    this._netBall = null; // qonaq interpolyasiyası üçün hədəf
  }

  // ————— Komandalar + maşınlar —————
  _buildCars() {
    this.cars = [];
    this.controllers = [];
    this.racers = [];
    const pool = [...CARS];

    // Onlayn: net oyunçular + bot doldurma; offline: oyunçu + 5 bot
    const seats = []; // {team, netId|null, name, carId, isLocal, isBot}
    if (this.online) {
      const { players } = this.online;
      for (const pl of players) {
        seats.push({
          team: pl.team === 'red' ? 'red' : 'blue',
          netId: pl.id, name: pl.name, carId: pl.carId || 'blaze',
          isLocal: pl.id === this.online.net.selfId, isBot: false,
        });
      }
    } else {
      seats.push({ team: 'blue', netId: null, name: 'Sən', carId: this.config.carId, isLocal: true, isBot: false });
    }
    // Botlarla 3v3-ə doldur
    const count = (t) => seats.filter((s) => s.team === t).length;
    let bi = 1;
    while (count('blue') < 3) seats.push({ team: 'blue', name: 'Bot ' + bi++, carId: pool[(bi * 3) % pool.length].id, isBot: true });
    while (count('red') < 3) seats.push({ team: 'red', name: 'Bot ' + bi++, carId: pool[(bi * 3) % pool.length].id, isBot: true });

    // Botları yalnız host/offline simulyasiya edir
    this._simBots = !this.online || this.online.net.isHost;

    seats.forEach((seat, i) => {
      const data = seat.isLocal ? playerCarData(seat.carId) : getCarById(seat.carId);
      if (seat.isLocal) this._playerData = data;   // finiş animasiyası üçün
      const car = new Car(data, this.library, { isPlayer: !!seat.isLocal });
      car.isRemote = !seat.isLocal && !seat.isBot ? true : (seat.isBot && !this._simBots);
      car.team = seat.team;
      car._rname = seat.name; // qol müəllifi göstərmək üçün
      this.scene.add(car.root);
      // Komanda halqası
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.1, 0.16, 6, 22),
        new THREE.MeshStandardMaterial({
          color: TEAM_COLORS[seat.team], emissive: TEAM_COLORS[seat.team], emissiveIntensity: 1.2,
        })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.12;
      car.root.add(ring);
      if (!seat.isLocal) {
        const tag = makeNameTag(seat.name);
        tag.material.color.set(TEAM_COLORS[seat.team]);
        car.root.add(tag);
      }
      let ctrl = null;
      if (seat.isLocal) {
        ctrl = new PlayerController(car, this.input);
        this.playerCar = car;
        car.nitroCharges = 1;
        car._nitroT = 0;
        car._lungeCd = 0;
      } else if (car.isRemote) {
        ctrl = new NetworkController(car);
      }
      this.cars.push(car);
      this.controllers.push(ctrl);
      this.racers.push({ ...seat, car, controller: ctrl, botIdx: seat.isBot ? this.racers.filter((r) => r.isBot).length : -1 });
    });
    if (!this.playerCar) { this.playerCar = this.cars[0]; } // ehtiyat
    this.skids = new SkidMarks(this.scene);
    this.effects = new Effects(this.scene);
  }

  _kickoff() {
    this.ballPos.set(0, BALL_R, 0);
    this.ballVel.set(0, 0, 0);
    this.ball.position.copy(this.ballPos);
    this._kickT = 0; // kickoff-dan keçən vaxt — botlar dərhal lunge etməsin
    let bIdx = 0, rIdx = 0;
    for (const r of this.racers) {
      const idx = r.team === 'blue' ? bIdx++ : rIdx++;
      // Striker · cinah · qapıçı (qapı xəttində start — kickoff zərbəsini tutur)
      const rows = [[0, 26], [-15, 44], [0, 66]];
      const [x, z] = rows[idx % 3];
      const sign = r.team === 'blue' ? -1 : 1; // blue qapısı z=-H/2
      const pos = new THREE.Vector3(x, 0, z * sign);
      const heading = Math.atan2(-pos.x, -pos.z + 0); // topa (mərkəzə) baxsın
      // Uzaq maşınlar da yerləşdirilir — əks halda ilk paket gələnə qədər
      // meydanın DÜZ ORTASINDA (0,0) görünüb sonra sürüşürdülər
      r.car.reset(pos, heading);
      // Qol anında havada olan maşın "asılı" qalırdı — sıçrayış sıfırlanır
      r.car._hopT = 0;
      r.car.root.position.y = 0;
      r.car.root.rotation.x = 0;
    }
    if (this.playerCar) {
      this.playerCar.nitroCharges = Math.max(1, this.playerCar.nitroCharges | 0);
      // Kamera dərhal maşının arxasına otursun — startda 180° süpürmə olmasın
      const c = this.playerCar.position;
      const dx = c.x - this.ballPos.x, dz = c.z - this.ballPos.z;
      const d = Math.hypot(dx, dz) || 1;
      this._camDir = this._camDir || new THREE.Vector3();
      this._camDir.set(dx / d, 0, dz / d);
      this.camera.position.set(c.x + this._camDir.x * 11, 6.4, c.z + this._camDir.z * 11);
      this._camTarget.set(this.ballPos.x, 1.5, this.ballPos.z);
      this.camera.lookAt(this._camTarget);
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
      // Teleportdan sonra köməkçi vəziyyətlər sinxronlansın — yoxsa sürət
      // limiti kameranı köhnə mövqeyə dartır (qol-sonrası irəli-geri titrəmə)
      this._camPrev = this._camPrev || this.camera.position.clone();
      this._camPrev.copy(this.camera.position);
      this._lastBP = this._lastBP || this.ball.position.clone();
      this._lastBP.copy(this.ballPos);
      // Çərçivə lövbəri və dönmə tavanı da sıfırlanmalıdır — yoxsa teleportdan
      // sonra kamera köhnə bucağa doğru yavaş-yavaş sürüşür
      this._frameAnchor = this._frameAnchor || this.playerCar.position.clone();
      this._frameAnchor.copy(this.playerCar.position);
      this._aimPrev = undefined;
      this._pitchPrev = undefined;
      if (this._trailPos) {
        for (let i = 0; i < this._trailPos.length; i += 3) {
          this._trailPos[i] = this.ballPos.x;
          this._trailPos[i + 1] = this.ballPos.y;
          this._trailPos[i + 2] = this.ballPos.z;
        }
        this._trail.geometry.attributes.position.needsUpdate = true;
        this._trail.material.opacity = 0;
      }
    }
  }

  // ————— HUD —————
  _buildHUD() {
    this.uiRoot.innerHTML = `
      <div class="fhud">
        <div class="fhud__score">
          <b class="fhud__blue" id="fh-blue">0</b>
          <span id="fh-time">3:00</span>
          <b class="fhud__red" id="fh-red">0</b>
        </div>
        <div class="fhud__boost">
          <div class="fhud__charges"><span id="fh-charges">⚡</span><small class="fhud__key">E</small></div>
          <div class="fhud__lunge" id="fh-lunge">💥 Q</div>
        </div>
        <div class="fhud__toast" id="fh-toast"></div>
        <div id="fh-overlay"></div>
      </div>`;
    this._el = {
      blue: this.uiRoot.querySelector('#fh-blue'),
      red: this.uiRoot.querySelector('#fh-red'),
      time: this.uiRoot.querySelector('#fh-time'),
      charges: this.uiRoot.querySelector('#fh-charges'),
      lunge: this.uiRoot.querySelector('#fh-lunge'),
      toast: this.uiRoot.querySelector('#fh-toast'),
      overlay: this.uiRoot.querySelector('#fh-overlay'),
    };
    if (isTouchDevice()) {
      this.touchControls = new TouchControls(this.uiRoot, this.input, {
        onPause: () => this._togglePause(),
        onUse: () => this._useNitro(),
        onUseBack: () => this._lunge(),
      });
      this.touchControls.setItems({ id: 'nitro', icon: '⚡', name: 'Nitro' }, null);
      // Futbolda tullanma əsas hərəkətdir → SOL tərəfdə, nitro ölçüsündə
      this.touchControls.el.classList.add('touch--football');
      // Futbolda ↩ = lunge (həmişə görünsün); item atma/🚩 isə yoxdur
      const backBtn = this.uiRoot.querySelector('[data-t="back"]');
      if (backBtn) { backBtn.style.display = ''; backBtn.textContent = '💥'; }
      for (const sel of ['[data-t="x"]', '[data-t="swap"]', '[data-t="rescue"]']) {
        const b = this.uiRoot.querySelector(sel);
        if (b) b.style.display = 'none';
      }
    }
  }

  _toast(t) {
    this._el.toast.textContent = t;
    this._el.toast.classList.add('is-on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this._el.toast.classList.remove('is-on'), 2000);
  }

  _bindKeys() {
    this.input.bind('Escape', () => this._togglePause());
    this.input.bind('KeyE', () => this._useNitro());
    this.input.bind('ShiftLeft', () => this._useNitro());
    this.input.bind('KeyQ', () => this._lunge());
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

  _useNitro() {
    const c = this.playerCar;
    if (this._state !== 'play' || !c || (c.nitroCharges | 0) <= 0) return;
    c.nitroCharges--;
    c.boostTimer = 1.4;
    audio.sfx('boost');
  }

  _lunge(car = this.playerCar, silent = false) {
    if (this._state !== 'play' || !car) return;
    if ((car._lungeCd ?? 0) > 0) return;
    car._lungeCd = LUNGE_CD;
    car._hopT = HOP_T; // qabağa sıçrayış (RL dodge hissi)
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    car.velocity.x += fx * 24;
    car.velocity.z += fz * 24;
    if (!silent) audio.sfx('missile');
    this.effects.spawnSmoke({ x: car.position.x - fx * 1.5, y: 0.4, z: car.position.z - fz * 1.5 }, false, car.smokeColor ?? null, 0.9);
  }

  // ————— Şəbəkə —————
  _setupNet() {
    const net = this.online.net;
    this._net = net;
    this._netAcc = 0;
    net.on('state', (m) => {
      const r = this.racers.find((x) => x.netId === m.id);
      if (r?.car.isRemote) r.controller.push(m);
    });
    net.on('event', (m) => {
      if (m.kind === 'rdy2') {
        if (net.isHost) {
          (this._rdy2 = this._rdy2 || new Set()).add(m.id);
          this._checkAllScenesReady();
        }
      } else if (m.kind === 'cstart') {
        if (this._state === 'wait') { this._state = 'countdown'; this._cd = 3.2; }
      } else if (m.kind === 'kick') {
        // Qonağın top vuruşu — host topa DƏRHAL impuls verir (gecikmə hissi itir)
        if (net.isHost && this._state === 'play') {
          const r = this.racers.find((x) => x.netId === m.id);
          if (r && this._time - (r._lastKick ?? -9) > 0.12) {
            const dx = this.ballPos.x - m.x, dz = this.ballPos.z - m.z;
            const d = Math.hypot(dx, dz);
            if (d < 8) {
              r._lastKick = this._time;
              const nx = d > 0.001 ? dx / d : 1, nz = d > 0.001 ? dz / d : 0;
              const sp = Math.hypot(m.vx, m.vz);
              const push = Math.max(8, Math.min(40, sp * 1.15));
              this.ballVel.set(nx * push + m.vx * 0.4, Math.min(14, 3 + sp * 0.28), nz * push + m.vz * 0.4);
              this._capBall();
              this._lastTouch = r.name;
            }
          }
        }
      } else if (m.kind === 'ball') {
        this._netBall = { p: m.p, v: m.v };
        this.ballVel.set(m.v[0], 0, m.v[1]); // qonaqda fırlanma üçün
      } else if (m.kind === 'bot') {
        const bots = this.racers.filter((r) => r.isBot);
        const b = bots[m.i];
        if (b?.controller) b.controller.push({ p: m.p, h: m.h, v: m.v, b: 0, sh: 0 });
      } else if (m.kind === 'goal') {
        this.scores = m.scores;
        this._goalFlash(m.team, m.scorer);
      } else if (m.kind === 'ftend') {
        this._finish(m.scores);
      } else if (m.kind === 'gleave') {
        const r = this.racers.find((x) => x.netId === m.id);
        if (r) { r.car.root.visible = false; r.gone = true; this._toast(r.name + ' otağa qayıtdı'); }
      }
    });
    net.on('left', (id) => {
      const r = this.racers.find((x) => x.netId === id);
      if (r) { r.car.root.visible = false; r.gone = true; }
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

  // Üfüqi top sürəti tavanı — turbo zərbəsi qapıya "lazer" olmasın
  _capBall() {
    const v = this.ballVel;
    const h = Math.hypot(v.x, v.z);
    if (h > 46) { v.x *= 46 / h; v.z *= 46 / h; }
    if (v.y > 15) v.y = 15;
  }

  // ————— Top fizikası (host/offline) —————
  _simBall(dt) {
    const p = this.ballPos, v = this.ballVel;
    v.y -= 22 * dt;
    v.multiplyScalar(1 - 0.12 * dt);
    p.addScaledVector(v, dt);
    if (p.y < BALL_R) { p.y = BALL_R; if (v.y < 0) v.y = -v.y * 0.68; if (Math.abs(v.y) < 1.2) v.y = 0; }
    // Yan divarlar
    const hx = FIELD_W / 2 - BALL_R;
    if (Math.abs(p.x) > hx) { p.x = Math.sign(p.x) * hx; v.x = -v.x * 0.8; }
    // Qapı xətti / arxa divar
    const hz = FIELD_H / 2 - BALL_R;
    if (Math.abs(p.z) > hz) {
      if (Math.abs(p.x) < GOAL_W / 2 - 1) {
        if (Math.abs(p.z) > FIELD_H / 2 + 2.5) this._goal(p.z > 0 ? 'blue' : 'red');
      } else {
        p.z = Math.sign(p.z) * hz;
        v.z = -v.z * 0.8;
      }
    }
    // Diaqonal künclər — top küncdə ilişmir, mərkəzə sıçrayır
    const cLim = FIELD_W / 2 + FIELD_H / 2 - CORNER - BALL_R;
    const cSum = Math.abs(p.x) + Math.abs(p.z);
    if (cSum > cLim) {
      const nx = Math.sign(p.x) / Math.SQRT2;
      const nz = Math.sign(p.z) / Math.SQRT2;
      const over = (cSum - cLim) / Math.SQRT2;
      p.x -= nx * over;
      p.z -= nz * over;
      const vn = v.x * nx + v.z * nz;
      if (vn > 0) { v.x -= nx * vn * 1.8; v.z -= nz * vn * 1.8; }
    }
    // Maşın toqquşmaları
    for (const car of this.cars) {
      if (car.root.visible === false) continue;
      const dx = p.x - car.position.x;
      const dz = p.z - car.position.z;
      const d = Math.hypot(dx, dz);
      const min = BALL_R + CAR_R;
      // Yerdə: top alçaqdadırsa vur; hopda: maşının vizual hündürlüyü ilə 3D yoxlama —
      // tullanıb havadakı topa dəymək mümkün olsun (içindən keçməsin)
      const hopHit = (car._hopT ?? 0) > 0 && Math.abs(p.y - (car.root.position.y + 1.1)) < 3.3;
      if (d < min && d > 0.001 && (p.y < 3.4 || hopHit)) {
        this._lastTouch = car._rname || this._lastTouch; // qol müəllifi üçün
        const nx = dx / d, nz = dz / d;
        p.x = car.position.x + nx * min;
        p.z = car.position.z + nz * min;
        const carSpeed = car.velocity.length();
        const push = Math.max(8, Math.min(40, carSpeed * 1.15));
        v.x = nx * push + car.velocity.x * 0.4;
        v.z = nz * push + car.velocity.z * 0.4;
        v.y = Math.min(14, 3 + carSpeed * 0.28);
        this._capBall();
        if (push > 18) {
          this.effects.spawnSparkle(new THREE.Vector3(p.x, 1.6, p.z), 0xfff2c0);
          this.effects.spawnSmoke({ x: p.x, y: 0.6, z: p.z }, false, car.smokeColor ?? null, 0.6);
        }
        if (car.isPlayer) audio.sfx('click');
      }
    }
  }

  _goal(team) {
    if (this._state !== 'play') return;
    this.scores[team]++;
    this._goalFlash(team, this._lastTouch);
    this._net?.sendEvent({ kind: 'goal', team, scores: this.scores, scorer: this._lastTouch || null });
  }

  _goalFlash(team, scorer = null) {
    this._state = 'goal';
    this._goalT = 2.4;
    audio.sfx('finish');
    this.effects.spawnConfetti(this.ball.position, true);
    const gz = (FIELD_H / 2) * (team === 'blue' ? 1 : -1);
    this.effects.spawnExplosion(new THREE.Vector3(0, 2, gz));
    this.effects.spawnConfetti(new THREE.Vector3(-GOAL_W / 3, 1, gz * 0.9), true);
    this.effects.spawnConfetti(new THREE.Vector3(GOAL_W / 3, 1, gz * 0.9), true);
    this._toast((team === 'blue' ? '🔵' : '🔴') + ' ' + t('fb.goal') + (scorer ? ' — ' + scorer : ''));
    this._el.blue.textContent = this.scores.blue;
    this._el.red.textContent = this.scores.red;
  }

  _finish(scores) {
    if (this._state === 'done') return;
    this._state = 'done';
    this.scores = scores || this.scores;
    const myTeam = this.racers.find((r) => r.isLocal)?.team || 'blue';
    const my = this.scores[myTeam], other = this.scores[myTeam === 'blue' ? 'red' : 'blue'];
    const win = my > other, draw = my === other;
    const gold = win ? 120 : draw ? 60 : 30;
    if (auth.isLoggedIn) auth.award(gold, 'football');
    this.touchControls?.setVisible(false);
    audio.stopEngine();          // qalib ekranında motor səsi qalmasın
    // ÖNCƏ iri qalib bildirişi — nəticə menyusu dərhal açılanda kim udduğunu
    // görməyə macal olmurdu (istifadəçi rəyi). Menyu 2.2 s sonra gəlir.
    const winTeam = this.scores.blue === this.scores.red ? null
      : (this.scores.blue > this.scores.red ? 'blue' : 'red');
    this._el.overlay.innerHTML = `
      <div class="winbanner ${draw ? '' : (win ? 'winbanner--win' : 'winbanner--loss')}">
        <div class="winbanner__title">${draw ? 'BƏRABƏRLİK' : (winTeam === 'blue' ? '🔵 MAVİ QALİB' : '🔴 QIRMIZI QALİB')}</div>
        <div class="winbanner__sub">🔵 ${this.scores.blue} — ${this.scores.red} 🔴${win ? ' · sən qalib gəldin!' : (draw ? '' : ' · növbəti dəfə!')}</div>
      </div>`;
    if (win) {
      for (let i = 0; i < 5; i++) this.effects?.spawnConfetti?.(this.playerCar.position, true);
    }
    if (win) this._playFinishFx();
    audio.sfx(win ? 'finish' : 'click');
    this._resultT = setTimeout(() => this._showResult(win, draw, gold), 2200);
  }

  _showResult(win, draw, gold) {
    this._el.overlay.innerHTML = `
      <div class="pause">
        <div class="screen__heading">${win ? t('fb.win') : draw ? t('fb.draw') : t('fb.loss')}
          <small>🔵 ${this.scores.blue} — ${this.scores.red} 🔴 ${auth.isLoggedIn ? ` · 🪙+${gold}` : ` · Hesabla 🪙+${gold} qazanardın`}</small>
        </div>
        <div class="btn-row">
          <button class="btn btn--primary" data-quit>${this.online ? t('pause.backRoom') : t('pause.menu')}</button>
        </div>
      </div>`;
    this._el.overlay.querySelector('[data-quit]').onclick = () => this.onQuit?.();
  }

  // ————— Bot AI —————
  _botDrive(r, dt) {
    const car = r.car;
    const myGoalZ = r.team === 'blue' ? -FIELD_H / 2 : FIELD_H / 2;
    const oppGoalZ = -myGoalZ;
    const bp = this.ballPos;
    // Rol: komandada topa ən yaxın = hücumçu; digərləri dəstək/müdafiə
    const mates = this.racers.filter((x) => x.team === r.team && !x.gone);
    const dists = mates.map((m) => {
      let d = m.car.position.distanceTo(bp);
      // Dayanmış insan oyunçunu "hücumçu" sayma — botlar topu götürsün
      if (!m.isBot && d > 12 && m.car.velocity.lengthSq() < 2.5) d += 30;
      return d;
    });
    const myDist = car.position.distanceTo(bp);
    const isChaser = myDist <= Math.min(...dists) + 0.01;
    let target;
    let clearThreat = false;
    if (isChaser) {
      // Künclərə vur: top→künc xəttində topun arxasında mövqe tut
      const cornerX = (bp.x >= 0 ? 1 : -1) * (GOAL_W / 2 - 3);
      const aim = new THREE.Vector3(cornerX - bp.x, 0, oppGoalZ - bp.z).normalize();
      target = new THREE.Vector3(bp.x - aim.x * 6, 0, bp.z - aim.z * 6);
      const behind = (car.position.z - bp.z) * Math.sign(oppGoalZ - bp.z) < -2;
      if (behind && Math.abs(car.position.x - bp.x) < 6) {
        target = new THREE.Vector3(bp.x, 0, bp.z); // düz vurmağa get
      }
    } else if (dists.indexOf(Math.min(...dists)) !== mates.indexOf(r)) {
      const backIdx = mates.filter((m) => m !== r && m.car.position.distanceTo(bp) < myDist).length;
      if (backIdx >= 1) {
        // Qapıçı: top qapıya yaxındırsa üstünə çıxıb təmizləyir,
        // uzaqdırsa xətdə mövqe tutur (dirəkləri tam örtmür — künclər açıqdır)
        clearThreat = Math.abs(bp.z - myGoalZ) < 30 && car.position.distanceTo(bp) < 16;
        if (clearThreat) {
          target = new THREE.Vector3(bp.x, 0, bp.z);
        } else {
          // Top qapıma doğru uçursa: xəttə çatacağı x-i PROQNOZLA və orada dur
          const bv = this.ballVel;
          const toMe = Math.sign(myGoalZ);
          let px = bp.x * 0.7;
          if (bv.z * toMe > 6) {
            const tHit = Math.max(0, (myGoalZ * 0.93 - bp.z) / bv.z);
            if (tHit < 3.5) px = bp.x + bv.x * tHit;
          }
          const gx = Math.max(-(GOAL_W / 2 - 3), Math.min(GOAL_W / 2 - 3, px));
          target = new THREE.Vector3(gx, 0, myGoalZ * 0.93);
        }
      } else {
        target = new THREE.Vector3(bp.x * 0.4, 0, (bp.z + myGoalZ) / 2); // müdafiə dəstəyi
      }
    }
    if (!target) target = new THREE.Vector3(bp.x, 0, bp.z);
    const desired = Math.atan2(target.x - car.position.x, target.z - car.position.z);
    let err = desired - car.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    const distT = car.position.distanceTo(target);
    const throttle = Math.abs(err) > 2.2 ? -0.5 : (distT < 4 ? 0.5 : (isChaser ? 0.94 : 0.85));
    const drive = { throttle, steer: Math.max(-1, Math.min(1, -err * 2.4)), handbrake: false };
    car.update(dt, drive, this._fakeTrack);
    // Yaxın + istiqamətdə → lunge
    if ((isChaser || clearThreat) && (this._kickT ?? 9) > 3
      && myDist < 6 && Math.abs(err) < 0.35 && (car._lungeCd ?? 0) <= 0) {
      car._lungeCd = LUNGE_CD + 1.5 + Math.random() * 2.5;
      car._hopT = HOP_T;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      car.velocity.x += fx * 18;
      car.velocity.z += fz * 18;
    }
    car._lungeCd = (car._lungeCd ?? 0) - dt;
  }

  // ————— Əsas dövr —————
  update(dt) {
    if (this._state === 'paused' || this._state === 'done') return;
    this._time += dt;

    // SİNXRON START gözləməsi — maşınlar yerində, kamera işləyir
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

    if (this._state === 'play') this._kickT = (this._kickT ?? 0) + dt;

    // Countdown
    if (this._state === 'countdown') {
      this._cd -= dt;
      const n = Math.ceil(this._cd);
      if (n !== this._cdShown && n > 0) { this._cdShown = n; this._toast(String(n)); audio.sfx('count'); }
      if (this._cd <= 0) { this._state = 'play'; this._toast(t('tst.go')); audio.sfx('go'); }
    }
    if (this._state === 'goal') {
      this._goalT -= dt;
      if (this._goalT <= 0) { this._kickoff(); this._state = 'play'; }
    }

    // Meydança "trek əvəzi" — Car.update üçün saxta obyekt
    if (!this._fakeTrack) {
      this._fakeTrack = {
        halfWidth: 500, maxRadius: 400, branches: [],
        getNearest: () => ({ index: 0, t: 0, lateral: 0, onRoad: true }),
        points: [new THREE.Vector3()], tangents: [new THREE.Vector3(0, 0, 1)], normals: [new THREE.Vector3(1, 0, 0)],
      };
    }

    // İdarə
    if (this._state === 'play' || this._state === 'goal') {
      for (const r of this.racers) {
        if (r.isLocal) {
          if (this._state === 'play') r.controller?.update?.(dt, this._fakeTrack) ?? null;
          else this.playerCar.update(dt, { throttle: 0, steer: 0, handbrake: false }, this._fakeTrack);
        } else if (r.car.isRemote) {
          r.controller?.update?.(dt, this._fakeTrack);
        } else if (r.isBot && this._simBots && this._state === 'play') {
          this._botDrive(r, dt);
        }
      }
      // Lokal oyunçu idarəsi countdown-da da fiziki dursun
    } else if (this._state === 'countdown') {
      this.playerCar.update(dt, { throttle: 0, steer: 0, handbrake: false }, this._fakeTrack);
    }

    // Sıçrayış animasiyası: hündür qövs, zirvədə "asılma", oturaqlı eniş
    for (const car of this.cars) {
      if ((car._hopT ?? 0) > 0) {
        car._hopT = Math.max(0, car._hopT - dt);
        const ht = 1 - car._hopT / HOP_T;
        // ^0.75 — parabolanın zirvəsi yastılanır: havada asılma hissi
        // XƏTA İDİ: `+=` hər kadr ƏLAVƏ edirdi. Qol fasiləsində maşın
        // yenilənmədiyi üçün y sıfırlanmır və bot havaya uçurdu
        // (istifadəçi rəyi). İndi baza hündürlükdən TƏYİN olunur.
        car.root.position.y = (car.position.y || 0) + 2.9 * Math.pow(4 * ht * (1 - ht), 0.75);
        car.root.rotation.x = -Math.sin(Math.PI * ht) * 0.38;
        // Eniş anı: tüstü + yüngül zərbə səsi — çəkisi hiss olunsun
        if (car._hopT === 0) {
          const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
          this.effects.spawnSmoke({ x: car.position.x - fx, y: 0.3, z: car.position.z - fz }, false, car.smokeColor ?? null, 0.8);
          this.effects.spawnSmoke({ x: car.position.x + fx * 0.4, y: 0.3, z: car.position.z + fz * 0.4 }, false, car.smokeColor ?? null, 0.6);
          if (car.isPlayer) audio.sfx('tick');
        }
      }
    }

    // Divar sərhədləri (yerli simulyasiya olunan maşınlar)
    for (const car of this.cars) {
      if (car.isRemote) continue;
      const hx = FIELD_W / 2 - 1.4;
      if (Math.abs(car.position.x) > hx) { car.position.x = Math.sign(car.position.x) * hx; car.velocity.x *= -0.35; }
      // Qapı xətti maşınlar üçün TAM bağlıdır (yalnız top keçir)
      const hz = FIELD_H / 2 - 1.4;
      if (Math.abs(car.position.z) > hz) {
        car.position.z = Math.sign(car.position.z) * hz;
        car.velocity.z *= -0.35;
      }
      // Diaqonal künc kəsimi
      const cLim = FIELD_W / 2 + FIELD_H / 2 - CORNER - 1.4;
      const cSum = Math.abs(car.position.x) + Math.abs(car.position.z);
      if (cSum > cLim) {
        const nx = Math.sign(car.position.x) / Math.SQRT2;
        const nz = Math.sign(car.position.z) / Math.SQRT2;
        const over = (cSum - cLim) / Math.SQRT2;
        car.position.x -= nx * over;
        car.position.z -= nz * over;
        const vn = car.velocity.x * nx + car.velocity.z * nz;
        if (vn > 0) { car.velocity.x -= nx * vn * 1.35; car.velocity.z -= nz * vn * 1.35; }
      }
    }
    // Maşın-maşın toqquşması (sadə)
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i], b = this.cars[j];
        if (a.isRemote && b.isRemote) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d = Math.hypot(dx, dz);
        if (d < CAR_R * 2 && d > 0.001) {
          const nx = dx / d, nz = dz / d;
          const ov = (CAR_R * 2 - d) / 2;
          if (!a.isRemote) { a.position.x -= nx * ov; a.position.z -= nz * ov; }
          if (!b.isRemote) { b.position.x += nx * ov; b.position.z += nz * ov; }
          // SÜRƏT CAVABI: yalnız mövqe ayrılması kifayət etmirdi — maşınlar
          // bir-birinə doğru sürməyə davam edir, hər kadr yenidən üst-üstə düşür
          // və geri itələnirdi. Nəticədə mövqe titrəyir, kamera "qırılırdı"
          // (xüsusən qabaq-qabağa toqquşmada). İndi yaxınlaşma sürəti söndürülür.
          const rvn = (b.velocity.x - a.velocity.x) * nx + (b.velocity.z - a.velocity.z) * nz;
          if (rvn < 0) {
            const both = !a.isRemote && !b.isRemote;
            const imp = -rvn * (both ? 0.5 : 1) * 1.12; // 1.12 — yüngül elastiklik
            if (!a.isRemote) { a.velocity.x -= nx * imp; a.velocity.z -= nz * imp; }
            if (!b.isRemote) { b.velocity.x += nx * imp; b.velocity.z += nz * imp; }
          }
        }
      }
    }

    // Top
    const hostSim = !this.online || this.online.net.isHost;
    if (hostSim) {
      if (this._state === 'play') this._simBall(dt);
    } else {
      // QONAQ: öz maşınımın topa dəyməsini LOKAL hiss et — host təsdiqləyəcək.
      // (əvvəl top yalnız hostda hesablanırdı → qonaqda vuruş gec/heç işləmirdi)
      this._kickCd = Math.max(0, (this._kickCd ?? 0) - dt);
      this._predictT = Math.max(0, (this._predictT ?? 0) - dt);
      const c = this.playerCar;
      if (this._state === 'play' && this._kickCd <= 0 && c.alive !== false) {
        const dx = this.ballPos.x - c.position.x;
        const dz = this.ballPos.z - c.position.z;
        const d = Math.hypot(dx, dz);
        const hopHit2 = (c._hopT ?? 0) > 0 && Math.abs(this.ballPos.y - (c.root.position.y + 1.1)) < 3.3;
        if (d < BALL_R + CAR_R && d > 0.001 && (this.ballPos.y < 3.4 || hopHit2)) {
          this._kickCd = 0.15;
          const nx = dx / d, nz = dz / d;
          const sp = c.velocity.length();
          const push = Math.max(8, Math.min(40, sp * 1.15));
          this.ballVel.set(nx * push + c.velocity.x * 0.4, Math.min(14, 3 + sp * 0.28), nz * push + c.velocity.z * 0.4);
          this._capBall();
          this.ballPos.x = c.position.x + nx * (BALL_R + CAR_R);
          this.ballPos.z = c.position.z + nz * (BALL_R + CAR_R);
          this._predictT = 0.3; // qısa müddət lokal fizika — host sonra düzəldir
          audio.sfx('click');
          if (push > 18) {
            this.effects.spawnSparkle(new THREE.Vector3(this.ballPos.x, 1.6, this.ballPos.z), 0xfff2c0);
          }
          this._net.sendEvent({
            kind: 'kick',
            x: +c.position.x.toFixed(1), z: +c.position.z.toFixed(1),
            vx: +c.velocity.x.toFixed(1), vz: +c.velocity.z.toFixed(1),
          });
        }
      }
      if (this._predictT > 0) {
        // Lokal proqnoz: sadə fizika (host paketi gələnə qədər)
        const p = this.ballPos, v = this.ballVel;
        v.y -= 22 * dt;
        v.multiplyScalar(1 - 0.12 * dt);
        p.addScaledVector(v, dt);
        if (p.y < BALL_R) { p.y = BALL_R; if (v.y < 0) v.y = -v.y * 0.68; }
      } else if (this._netBall) {
        // Qonaq: interpolyasiya
        this.ballPos.x += (this._netBall.p[0] - this.ballPos.x) * Math.min(1, dt * 12);
        this.ballPos.y += (this._netBall.p[1] - this.ballPos.y) * Math.min(1, dt * 12);
        this.ballPos.z += (this._netBall.p[2] - this.ballPos.z) * Math.min(1, dt * 12);
      }
    }
    this.ball.position.copy(this.ballPos);
    this.ball.rotation.x += this.ballVel.z * dt * 0.2;
    this.ball.rotation.z -= this.ballVel.x * dt * 0.2;

    // Nitro yığımı + lunge cd (oyunçu)
    const pc = this.playerCar;
    pc._nitroT = (pc._nitroT ?? 0) + dt;
    if (pc._nitroT >= NITRO_REGEN_T && (pc.nitroCharges | 0) < 2) {
      pc._nitroT = 0;
      pc.nitroCharges = (pc.nitroCharges | 0) + 1;
      this._toast(t('tst.nitroReady'));
    }
    pc._lungeCd = Math.max(0, (pc._lungeCd ?? 0) - dt);
    this._el.charges.textContent = '⚡'.repeat(Math.max(0, pc.nitroCharges | 0)) || '·';
    this._el.lunge.style.opacity = pc._lungeCd > 0 ? 0.3 : 1;

    // Matç vaxtı (host idarə edir)
    if (this._state === 'play') {
      this._matchT -= dt;
      if (this._matchT <= 0) {
        this._matchT = 0;
        if (hostSim) {
          this._net?.sendEvent({ kind: 'ftend', scores: this.scores });
          this._finish(this.scores);
        }
      }
      const mm = Math.floor(this._matchT / 60);
      const ss = Math.floor(this._matchT % 60).toString().padStart(2, '0');
      this._el.time.textContent = mm + ':' + ss;
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
          b: c.boostTimer > 0 ? 1 : 0, sh: 0,
        });
        if (hostSim) {
          this._net.sendEvent({
            kind: 'ball',
            p: [+this.ballPos.x.toFixed(1), +this.ballPos.y.toFixed(1), +this.ballPos.z.toFixed(1)],
            v: [+this.ballVel.x.toFixed(1), +this.ballVel.z.toFixed(1)],
          });
          const bots = this.racers.filter((r) => r.isBot);
          bots.forEach((b, i) => {
            this._net.sendEvent({
              kind: 'bot', i,
              p: [+b.car.position.x.toFixed(1), +b.car.position.z.toFixed(1)],
              h: +b.car.heading.toFixed(3),
              v: +b.car.vF.toFixed(1),
            });
          });
        }
      }
    }

    this.effects.update(dt);
    this.skids.update(dt);
    this._updateCamera(dt);
    // Matç bitəndə motor səsi qalib ekranında da davam edirdi
    const over = this._state === 'done';
    const speedT = over ? 0 : Math.min(pc.velocity.length() / pc.maxSpeed, 1);
    audio.setEngine(speedT, !over && pc.boostTimer > 0);
    this.speedLines?.update(dt, speedT, pc.velocity.length());
  }

  _updateCamera(dt) {
    // Top şleyfi (offline/onlayn hər iki yol buradan keçir)
    if (this._trail) {
      this._trailT -= dt;
      if (this._trailT <= 0) {
        this._trailT = 0.024;
        this._trailPos.copyWithin(3, 0, this._trailPos.length - 3);
        this._trailPos[0] = this.ball.position.x;
        this._trailPos[1] = this.ball.position.y;
        this._trailPos[2] = this.ball.position.z;
        this._trail.geometry.attributes.position.needsUpdate = true;
      }
      // Sürət mövqe fərqindən (qonaq interpolyasiyasında da işləyir)
      this._lastBP = this._lastBP || this.ball.position.clone();
      const bs = this.ball.position.distanceTo(this._lastBP) / Math.max(dt, 0.001);
      this._lastBP.copy(this.ball.position);
      const want = bs > 13 ? Math.min(0.5, bs * 0.016) : 0;
      this._trail.material.opacity += (want - this._trail.material.opacity) * Math.min(1, dt * 6);
    }
    const car = this.playerCar;
    const bp = this.ballPos;
    // BALL-CAM (Rocket League): kamera top→maşın xətti üzərində maşının
    // arxasında durur, həmişə topa baxır — maşın da, top da daim görünür.
    if (!this._camDir) this._camDir = new THREE.Vector3(0, 0, 1);
    const speed = car.velocity.length();
    const dx = car.position.x - bp.x, dz = car.position.z - bp.z;
    const d = Math.hypot(dx, dz);
    if (d > 3) {
      this._camDirTmp = this._camDirTmp || new THREE.Vector3();
      this._camDirTmp.set(dx / d, 0, dz / d);
      // Sürətləndikcə kamera cəldləşir; top lap yaxındıkən (scrum/toqquşma)
      // istiqamət ləngiyir — kamera çırpınmır
      const calm = Math.min(1, (d - 3) / 7);
      this._camDir.lerp(this._camDirTmp, 1 - Math.exp(-dt * (2.3 + speed * 0.04) * calm)).normalize();
    }
    // Dinamik məsafə/hündürlük: sürətdə və top uzaqlaşanda kamera geri açılır —
    // top da, maşın da HƏMİŞƏ kadrda qalır
    const dist = Math.min(15, 10.8 + speed * 0.06 + Math.min(3, d * 0.03));
    const desired = new THREE.Vector3(
      car.position.x + this._camDir.x * dist, 5.1 + dist * 0.16 + Math.min(2.5, d * 0.025),
      car.position.z + this._camDir.z * dist
    );
    // Kamera bortlardan kənara çıxmasın (divar arxasından baxış olmasın)
    const mx = FIELD_W / 2 - 1.2, mz = FIELD_H / 2 - 1.2;
    desired.x = Math.max(-mx, Math.min(mx, desired.x));
    desired.z = Math.max(-mz, Math.min(mz, desired.z));
    // Küncdə/divarda kamera maşına sıxılanda hündürlüyü də azalt —
    // dik yuxarıdan baxış əvəzinə təbii alçaq rakurs
    const sqz = Math.hypot(desired.x - car.position.x, desired.z - car.position.z);
    if (sqz < 8) desired.y = Math.max(3.4, desired.y * (0.5 + 0.5 * sqz / 8));
    this._camPrev = this._camPrev || this.camera.position.clone();
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 9));
    // Sürət tavanı: toqquşmada maşın mövqeyi sıçrayanda kamera teleport etməsin
    const camStep = this.camera.position.distanceTo(this._camPrev);
    const maxStep = Math.max(0.4, (20 + speed * 1.3) * dt);
    if (camStep > maxStep) {
      this.camera.position.lerpVectors(this._camPrev, this.camera.position, maxStep / camStep);
    }
    this._camPrev.copy(this.camera.position);
    // BAXIŞ: tam topa yönəl (yumşaq lerp) — qarant SONRA tətbiq olunur
    const cp = this.camera.position;
    const aBall = Math.atan2(bp.x - cp.x, bp.z - cp.z);
    const lookD = Math.max(14, Math.hypot(bp.x - cp.x, bp.z - cp.z));
    this._lookTmp = this._lookTmp || new THREE.Vector3();
    this._lookTmp.set(cp.x + Math.sin(aBall) * lookD, 1.5, cp.z + Math.cos(aBall) * lookD);
    this._camTarget.lerp(this._lookTmp, 1 - Math.exp(-dt * 9));
    // ——— SƏRT KADR QARANTI (lerp-dən SONRA, hər kadr) ———
    // Maşının FINAL baxışa görə üfüqi VƏ şaquli kənarlaşması real FOV
    // çərçivəsinə sıxılır. Lerp gecikməsi və divar sıxılması (kamera
    // maşına yaxın düşəndə dik bucaq) daha qarantı poza bilmir.
    const vHalf = (this.camera.fov * Math.PI / 180) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const tx = this._camTarget.x - cp.x, tyv = this._camTarget.y - cp.y, tz = this._camTarget.z - cp.z;
    const tHor = Math.max(0.001, Math.hypot(tx, tz));
    // Qarant üçün maşının YUMŞALDILMIŞ mövqeyi. Qarant aktiv olanda baxış maşının
    // bucaq mövqeyinə 1:1 bağlanır — dayanmış maşına rəqib çırpılanda kamera kadr-kadr
    // sıçrayırdı. Hamarlama sürətlə artır: aşağı sürətdə (toqquşma) güclü, yüksək
    // sürətdə demək olar yoxdur ki, çərçivə zəmanəti pozulmasın.
    this._frameAnchor = this._frameAnchor || car.position.clone();
    this._frameAnchor.lerp(car.position, 1 - Math.exp(-dt * (13 + speed * 1.3)));
    const cx = this._frameAnchor.x - cp.x, cyv = car.root.position.y + 0.8 - cp.y, cz = this._frameAnchor.z - cp.z;
    const cHor = Math.max(0.001, Math.hypot(cx, cz));
    const aC = Math.atan2(cx, cz), pC = Math.atan2(cyv, cHor);
    // Maşının bucaq ölçüsü + kənar boşluğu — kamera yaxınlaşdıqca çərçivə daralır
    const maxH = Math.max(0.12, hHalf - Math.atan(2.6 / cHor) - 0.09);
    const maxV = Math.max(0.1, vHalf - Math.atan(1.7 / cHor) - 0.07);
    let offH = Math.atan2(tx, tz) - aC;
    while (offH > Math.PI) offH -= Math.PI * 2;
    while (offH < -Math.PI) offH += Math.PI * 2;
    offH = Math.max(-maxH, Math.min(maxH, offH));
    let offV = Math.atan2(tyv, tHor) - pC;
    offV = Math.max(-maxV, Math.min(maxV, offV));
    let aim = aC + offH, pitch = pC + offV;
    // Dönmə sürəti tavanı — qəfil düzəlişlər gözə çarpan sıçrayış kimi görünməsin
    if (this._aimPrev !== undefined) {
      let dA = aim - this._aimPrev;
      while (dA > Math.PI) dA -= Math.PI * 2;
      while (dA < -Math.PI) dA += Math.PI * 2;
      const limA = 2.9 * dt; // ~165°/s
      if (Math.abs(dA) > limA) aim = this._aimPrev + Math.sign(dA) * limA;
      const dP = pitch - this._pitchPrev;
      const limP = 1.8 * dt;
      if (Math.abs(dP) > limP) pitch = this._pitchPrev + Math.sign(dP) * limP;
    }
    this._aimPrev = aim;
    this._pitchPrev = pitch;
    this._camTarget.set(
      cp.x + Math.sin(aim) * tHor,
      cp.y + Math.tan(pitch) * tHor,
      cp.z + Math.cos(aim) * tHor
    );
    this.camera.lookAt(this._camTarget);
    // FOV: boost/sürət zərbəsi — yumşaq "sürət hissi"
    const wantFov = 62 + (car.boostTimer > 0 ? 7 : 0) + Math.min(4, speed * 0.09);
    this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, dt * 5);
    this.camera.updateProjectionMatrix();
  }

  // Mağazadan alınmış finiş animasiyası (yarışdakı ilə eyni)
  _playFinishFx() {
    const f = this._playerData?.cosmetics?.finish;
    if (!f?.kind) return;
    this._finishFx?.dispose();
    this._finishFx = playFinishFx(this.scene, f.kind, this.playerCar.position, f.hex);
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
    
    this.scene.clear();
    this.uiRoot.innerHTML = '';
  }
}
