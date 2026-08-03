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
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.active) {
      if (this.active.update) this.active.update(dt);
      if (this.active.scene && this.active.camera) {
        this.renderer.render(this.active.scene, this.active.camera);
      } else {
        this.renderer.setClearColor(0x070a14, 1);
        this.renderer.clear();
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
