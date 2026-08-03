import * as THREE from 'three';
import { TrackBuilder } from '../world/TrackBuilder.js';
import { Environment } from '../world/Environment.js';
import { applyLegendaryFx } from './LegendaryFx.js';
import { applyPaintPattern } from './PaintPatterns.js';
import { disposeObject3D } from './MergeUtils.js';
import { playFinishFx } from './FinishFx.js';

// Menyu arxa fonu: seçilmiş trekdə seçilmiş maşın, yavaş orbit kamera.
// Menyudakı seçimlər dəyişdikcə canlı yenilənir — UI ilə oyun tam eyni görünür.
export class ShowcaseScene {
  constructor(renderer, library) {
    this.renderer = renderer;
    this.library = library;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.5, 1400);

    this.trackId = null;
    this.carModel = null;
    this.carRoot = null;
    this.track = null;
    this.environment = null;
    this.trackGroup = null;
    this._angle = 0;
    this._carPos = new THREE.Vector3();

    // "Avtosalon" işığı — qaranlıq treklərdə də maşın aydın görünsün
    this.spot = new THREE.SpotLight(0xffffff, 320, 60, Math.PI / 5, 0.45, 1.6);
    this.spot.position.set(6, 14, 6);
    this.scene.add(this.spot);
    this.scene.add(this.spot.target);
    this.fill = new THREE.PointLight(0xbfd4ff, 40, 30, 1.8);
    this.scene.add(this.fill);
  }

  setTrack(trackData) {
    if (this.trackId === trackData.id) return;
    this.trackId = trackData.id;

    // Köhnəni sil
    if (this.trackGroup) this.scene.remove(this.trackGroup);
    this.track?.dispose();
    this.environment?.dispose();

    this.track = new TrackBuilder(trackData, 400);
    this.trackGroup = this.track.build();
    this.scene.add(this.trackGroup);
    this.environment = new Environment(this.scene, trackData, this.track, this.renderer);

    this._placeCar();
  }

  setCar(carData) {
    // Kosmetika dəyişəndə də yenidən qurulmalıdır (yalnız model yoxlamaq azdır —
    // boya/disk seçiləndə önizləmədə heç nə dəyişmirdi)
    const cos = carData.cosmetics || null;
    const key = carData.model + '|' + (cos ? JSON.stringify(cos) : (carData.tint ?? ''))
      + '|' + (carData.kit ? JSON.stringify(carData.kit) : '');
    if (this.carKey === key) return;
    this.carKey = key;
    this.carModel = carData.model;
    if (this.carRoot) this.scene.remove(this.carRoot);
    const baseHex = cos?.fx?.hex ?? cos?.paint ?? carData.tint ?? null;
    const inst = this.library.instantiate(carData.model, baseHex, cos?.rim ?? null, carData.kit ?? null);
    this.carRoot = inst.root;
    // Əfsanəvi örtük — oyundakı Car ilə EYNİ şeyder (bax LegendaryFx.js)
    this._fx = applyLegendaryFx(inst.root, cos?.fx?.kind);
    if (cos?.skin) applyPaintPattern(inst.root, cos.skin);
    this.scene.add(this.carRoot);
    this._placeCar();
    this._demoCos = cos;
    this._buildFlameDemo(); // maşın dəyişəndə nümayiş alovu yenidən qurulur
  }

  _placeCar() {
    if (!this.carRoot || !this.track) return;
    const p = this.track.startPosition;
    this.carRoot.position.set(p.x, 0, p.z);
    this.carRoot.rotation.y = this.track.startHeading;
    this._carPos.set(p.x, 0, p.z);

    // Günəşi maşının üstünə yönəlt (kölgə görünsün)
    const sun = this.environment?.sun;
    if (sun) {
      sun.position.set(p.x + 60, 110, p.z + 40);
      sun.target.position.set(p.x, 0, p.z);
      sun.target.updateMatrixWorld();
    }
    // Avtosalon işığı maşının üstündə
    this.spot.position.set(p.x + 5, 15, p.z + 5);
    this.spot.target.position.set(p.x, 0, p.z);
    this.spot.target.updateMatrixWorld();
    this.fill.position.set(p.x - 7, 5, p.z - 7);
  }

  // ————— QARAJ NÜMAYİŞİ: nitro alovu —————
  // Alov yalnız nitro basanda görünür, ona görə "Nitro alovu" tabı açılanda
  // burada canlandırılır ki, oyunçu aldığı şeyi görsün.
  setDemo(kind, cos = null) {
    const opened = kind === 'flame' && this._demo !== 'flame';
    const finOpened = kind === 'finish' && (this._demo !== 'finish' || this._demoFinKind !== cos?.finish?.kind);
    this._demo = kind || null;
    this._demoCos = cos;
    this._buildFlameDemo();
    // FİNİŞ ANİMASİYASI nümayişi — tab açılanda və seçim dəyişəndə oynayır,
    // sonra 3.5 s-dən bir təkrarlanır ki, oyunçu aldığı şeyi görsün
    if (kind !== 'finish') { this._finDemo?.dispose(); this._finDemo = null; this._finLoop = 0; this._demoFinKind = null; }
    else if (finOpened) { this._demoFinKind = cos?.finish?.kind || null; this._playFinishDemo(); }
    // Alov arxadadır — tab açılanda orbit maşının arxa-yan tərəfindən başlasın,
    // yoxsa oyunçu aldığı şeyi yarım dövrə gözləməli olur
    if (opened && this.track) this._angle = this.track.startHeading + Math.PI * 0.82;
  }

  _buildFlameDemo() {
    if (this._demoFlame) {
      this._demoFlame.parent?.remove(this._demoFlame);
      this._demoFlame.traverse?.((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      this._demoFlame = null;
    }
    if (this._demo !== 'flame' || !this.carRoot) return;
    const spec = this._demoCos?.flame || { hex: 0x6fd2ff };
    const col = new THREE.Color(spec.hex);
    const g = new THREE.Group();
    g.userData.parts = [];
    // Oyundakı Car ilə eyni forma: rəngli örtük + ağ-isti nüvə + işıq topası
    for (const sx of [-0.36, 0.36]) {
      const shell = new THREE.Mesh(new THREE.ConeGeometry(0.30, 1.15, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color: col.clone(), transparent: true, opacity: 0.42,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }));
      shell.rotation.x = -Math.PI / 2;
      shell.position.set(sx, 0.40, -2.3);
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.8, 8, 1, true),
        new THREE.MeshBasicMaterial({
          color: col.clone().lerp(new THREE.Color(0xffffff), 0.20), transparent: true,
          opacity: 0.52, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }));
      core.rotation.x = -Math.PI / 2;
      core.position.set(sx, 0.40, -2.16);
      g.add(shell, core);
      g.userData.parts.push({ shell, core, ph: Math.random() * 6.28 });
    }
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 10, 8),
      new THREE.MeshBasicMaterial({
        color: col.clone(), transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    glow.scale.set(2.1, 0.85, 1.2);
    glow.position.set(0, 0.42, -2.05);
    g.add(glow);
    g.userData.glow = glow;
    g.userData.rainbow = !!spec.rainbow;
    this._demoFlame = g;
    this.carRoot.add(g);
  }

  _playFinishDemo() {
    this._finDemo?.dispose();
    const f = this._demoCos?.finish;
    if (!f?.kind || !this.carRoot) { this._finDemo = null; return; }
    this._finDemo = playFinishFx(this.scene, f.kind, this.carRoot.position, f.hex);
    this._finLoop = 3.6;
  }

  _animFx(dt) {
    this._fx?.tick(dt);
    if (this._demo === 'finish') {
      this._finDemo?.update(dt);
      this._finLoop = (this._finLoop || 0) - dt;
      if (this._finLoop <= 0) this._playFinishDemo();   // dövrə vur
    }
  }

  update(dt) {
    this._animFx(dt);
    if (this._demoFlame) {
      // alovun titrəyişi — oyundakı ilə eyni ritm
      this._flameT = (this._flameT || 0) + dt;
      const ud = this._demoFlame.userData;
      if (ud.rainbow) {
        const h = (this._flameT * 0.55) % 1;
        for (const p of ud.parts) {
          p.shell.material.color.setHSL(h, 1, 0.55);
          p.core.material.color.setHSL(h, 1, 0.85);
        }
        ud.glow.material.color.setHSL(h, 1, 0.6);
      }
      for (const p of ud.parts) {
        const f = 0.75 + Math.abs(Math.sin(this._flameT * 34 + p.ph)) * 0.5 + Math.random() * 0.18;
        p.shell.scale.set(1, f, 1);
        p.core.scale.set(1, f * 0.9, 1);
        p.shell.material.opacity = 0.34 + (f - 0.75) * 0.42;
      }
      const gs = 0.85 + Math.random() * 0.4;
      ud.glow.scale.set(1.9 * gs, 0.8 * gs, 1.3 * gs);
    }
    if (!this.carRoot) return;
    this._angle += dt * 0.22;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const small = w <= 950;
    const r = small ? 12 : 10.5;
    const cx = this._carPos.x + Math.sin(this._angle) * r;
    const cz = this._carPos.z + Math.cos(this._angle) * r;
    this.camera.position.set(cx, 3.1, cz);
    this.camera.lookAt(this._carPos.x, 1.0, this._carPos.z);

    // Telefonda menyu paneli solu örtür — maşını boş sahənin MƏRKƏZİNƏ sürüşdür
    if (small) {
      const panelW = Math.min(440, w * 0.94);
      const offX = -panelW / 2;
      if (!this.camera.view || this.camera.view.offsetX !== offX || this.camera.view.fullWidth !== w) {
        this.camera.setViewOffset(w, h, offX, 0, w, h);
      }
    } else if (this.camera.view) {
      this.camera.clearViewOffset();
    }
  }

  dispose() {
    if (this.trackGroup) this.scene.remove(this.trackGroup);
    this.track?.dispose();
    this.environment?.dispose();
    if (this.carRoot) this.scene.remove(this.carRoot);
    this._finDemo?.dispose(); this._finDemo = null;
    this._demoFlame = null;
    disposeObject3D(this.scene);
    this.scene.clear();
  }
}
