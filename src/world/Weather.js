import * as THREE from 'three';

// ————— YARIŞ TREKİNİN HAVASI: qar, yağış, köz —————
// Kameranın ətrafındakı sabit həcmdə dövr edən hissəciklər (kamera irəlilədikcə arxada
// qalan hissəcik qabağa köçür) — bütün trek boyu yağır, amma tək draw call-dur.
// Mövqelər CPU-da yenilənir (≤ 700 nöqtə); kadr dövründə obyekt yaradılmır.
const BOX = 64;       // həcmin eni/dərinliyi (m)
const TOP = 30;       // hündürlüyü (m)

const KINDS = {
  snow: { n: 700, size: 0.26, color: 0xffffff, opacity: 0.9, fall: [2.2, 4.2], sway: 1.3, additive: false },
  rain: { n: 520, streak: 0.95, color: 0xc4d6e6, opacity: 0.42, fall: [26, 36], wind: [3.5, 0, 1.5] },
  embers: { n: 280, size: 0.3, color: 0xff8a2a, opacity: 0.95, fall: [-3.8, -1.2], sway: 1.8, additive: true },
};

function dotTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const cx = cv.getContext('2d');
  const g = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g;
  cx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(cv);
}

export class Weather {
  constructor(scene, kind, { lite = false } = {}) {
    const K = KINDS[kind];
    this.kind = kind;
    this.K = K;
    this.scene = scene;
    const n = this.n = Math.round(K.n * (lite ? 0.5 : 1));
    this.p = new Float32Array(n * 3);      // hissəciyin həcm daxilindəki yeri
    this.v = new Float32Array(n);          // düşmə sürəti
    this.ph = new Float32Array(n);         // yellənmə fazası
    for (let i = 0; i < n; i++) {
      this.p[i * 3] = (Math.random() - 0.5) * BOX;
      this.p[i * 3 + 1] = Math.random() * TOP;
      this.p[i * 3 + 2] = (Math.random() - 0.5) * BOX;
      this.v[i] = K.fall[0] + Math.random() * (K.fall[1] - K.fall[0]);
      this.ph[i] = Math.random() * 6.283;
    }
    const geo = new THREE.BufferGeometry();
    if (K.streak) {
      // yağış: hər damcı qısa xətt (2 təpə)
      this.pos = new Float32Array(n * 6);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      this.mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color: K.color, transparent: true, opacity: K.opacity, depthWrite: false, fog: false,
      }));
    } else {
      this.pos = new Float32Array(n * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      this.tex = dotTexture();
      this.mesh = new THREE.Points(geo, new THREE.PointsMaterial({
        color: K.color, size: K.size, map: this.tex, transparent: true, opacity: K.opacity,
        depthWrite: false, sizeAttenuation: true, fog: false,
        blending: K.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }));
    }
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this._t = 0;
  }

  update(dt, camera) {
    const K = this.K, n = this.n, p = this.p, out = this.pos;
    this._t += dt;
    const cx = camera.position.x, cz = camera.position.z;
    const half = BOX / 2;
    const wx = K.wind ? K.wind[0] : 0, wz = K.wind ? K.wind[2] : 0;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      p[j + 1] -= this.v[i] * dt;
      if (K.sway) {
        p[j] += Math.sin(this._t * 1.3 + this.ph[i]) * K.sway * dt;
        p[j + 2] += Math.cos(this._t * 1.1 + this.ph[i] * 1.7) * K.sway * dt;
      } else {
        p[j] += wx * dt; p[j + 2] += wz * dt;
      }
      // şaquli dövr (qar/yağış aşağı düşür, köz yuxarı qalxır)
      if (p[j + 1] < 0) p[j + 1] += TOP; else if (p[j + 1] > TOP) p[j + 1] -= TOP;
      // üfüqi dövr: hissəcik kameranın ətrafındakı qutuda qalır
      let x = p[j] + ((cx - p[j]) > half ? BOX : (cx - p[j]) < -half ? -BOX : 0);
      let z = p[j + 2] + ((cz - p[j + 2]) > half ? BOX : (cz - p[j + 2]) < -half ? -BOX : 0);
      if (Math.abs(cx - x) > half) x = cx + (Math.random() - 0.5) * BOX;   // uzaq sıçrayış (yenidən doğulma)
      if (Math.abs(cz - z) > half) z = cz + (Math.random() - 0.5) * BOX;
      p[j] = x; p[j + 2] = z;
      if (K.streak) {
        const k = i * 6, s = K.streak / this.v[i];
        out[k] = x; out[k + 1] = p[j + 1]; out[k + 2] = z;
        out[k + 3] = x + wx * s; out[k + 4] = p[j + 1] + K.streak; out[k + 5] = z + wz * s;
      } else {
        out[j] = x; out[j + 1] = p[j + 1]; out[j + 2] = z;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.tex?.dispose();
  }
}
