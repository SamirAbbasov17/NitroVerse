import * as THREE from 'three';
import { isTouchDevice } from './TouchControls.js';

// Renderer + əsas loop mühərriki. Aktiv "scene" obyektini idarə edir.
// Aktiv scene interfeysi: { scene: THREE.Scene, camera: THREE.Camera, update(dt), dispose() }
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    // Mobildə performans: aşağı pixel ratio + kölgəsiz render
    const touch = isTouchDevice();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, touch ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = !touch;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Anizotrop filtrin cihaz maksimumu — yol teksturaları bunu işlədir
    // (bunsuz səth kiçik bucaqda düz cizgilərə parçalanır)
    try {
      const maks = this.renderer.capabilities.getMaxAnisotropy();
      import('../world/TrackBuilder.js').then((m) => { m.TrackBuilder._maxAniso = maks; });
    } catch { /* köhnə brauzer — standart qiymət qalır */ }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.active = null;
    this.clock = new THREE.Clock();
    this.running = false;

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    this._loop = this._loop.bind(this);
  }

  setActive(sceneObj) {
    if (this.active && this.active.dispose) this.active.dispose();
    this.active = sceneObj;
    // Yeni səhnənin yüklənmə sıçrayışları adaptiv ölçüyə düşməsin
    if (this._ad) { this._ad.isti = 0; this._ad.t = 0; this._ad.n = 0; this._ad.yavaş = 0; }
    if (import.meta.env.DEV) window.__active = sceneObj; // avtomatik testlər üçün
    if (sceneObj && sceneObj.camera) this.resize();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(this._loop);
  }

  _loop() {
    // dt-ni məhdudlaşdır (tab arxa plana keçəndə sıçrayış olmasın)
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    if (this.active) {
      if (this.active.update) this.active.update(dt);
      if (this.active.scene && this.active.camera) {
        this.renderer.render(this.active.scene, this.active.camera);
      } else {
        this.renderer.setClearColor(0x070a14, 1);
        this.renderer.clear();
      }
      this._adapt(rawDt);
    }
  }

  // ADAPTİV KEYFİYYƏT QORUMASI: cihaz davamlı 60-a çatmırsa pixel ratio
  // BİR pillə endirilir (2 → 1.5 → 1.25). Yalnız aşağı enir (osilasiya
  // yoxdur), yalnız görünən tabda və səhnənin ilk 6 saniyəsindən sonra —
  // yüklənmə sıçrayışları ölçüyə düşmür. Güclü cihaza heç vaxt toxunmur.
  _adapt(rawDt) {
    if (document.visibilityState !== 'visible' || rawDt > 0.1) { return; }
    const A = (this._ad ||= { t: 0, n: 0, yavaş: 0, isti: 0 });
    A.isti += rawDt;
    if (A.isti < 6) return;                 // səhnə istiləşsin
    A.t += rawDt; A.n++;
    if (rawDt > 0.023) A.yavaş++;           // 43 fps-dən pis kadr
    if (A.t < 4) return;                    // 4 saniyəlik pəncərə
    const pay = A.yavaş / Math.max(1, A.n);
    A.t = 0; A.n = 0; A.yavaş = 0;
    if (pay > 0.5) {                        // pəncərənin yarıdan çoxu yavaşdır
      const indiki = this.renderer.getPixelRatio();
      const hədəf = indiki > 1.5 ? 1.5 : indiki > 1.25 ? 1.25 : null;
      if (hədəf) {
        this.renderer.setPixelRatio(hədəf);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      }
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    const cam = this.active && this.active.camera;
    if (cam && cam.isPerspectiveCamera) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.setAnimationLoop(null);
    if (this.active && this.active.dispose) this.active.dispose();
    this.renderer.dispose();
  }
}
