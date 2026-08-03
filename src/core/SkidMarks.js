import * as THREE from 'three';

// Drift təkər izləri — TƏK mesh, ring-buffer quad hovuzu (1 draw call).
// Hər seqment yaşlandıqca şəffaflaşır və hovuz dolanda ən köhnəsi yenidən istifadə olunur.
export class SkidMarks {
  constructor(scene, max = 600) {
    this.max = max;
    this.life = 11;         // saniyə — iz nə qədər qalır
    this._baseAlpha = 0.66; // əvvəl 0.42 idi: oyunda demək olar görünmürdü

    this._positions = new Float32Array(max * 4 * 3);
    this._colors = new Float32Array(max * 4 * 4); // RGBA (vertex alpha ilə fade)
    this._ages = new Float32Array(max).fill(Infinity);
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) {
      const o = i * 4;
      idx.set([o, o + 1, o + 2, o + 2, o + 1, o + 3], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this._colors, 4));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));

    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      // Yol səthi ilə z-fighting olmasın
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }));
    this.mesh.frustumCulled = false; // izlər hər yerdədir — culling hesabına dəyməz
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this._scene = scene;
    this._head = 0;
  }

  // a → b seqmenti üzərinə en (width) ilə quad yaz
  add(ax, az, bx, bz, width = 0.44) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (dz / len) * width * 0.5;
    const nz = (-dx / len) * width * 0.5;
    const i = this._head;
    this._head = (this._head + 1) % this.max;
    const y = 0.033; // yol (0.02) ilə mərkəz xətti (0.04) arasında
    const p = this._positions;
    const o = i * 12;
    p[o] = ax + nx; p[o + 1] = y; p[o + 2] = az + nz;
    p[o + 3] = ax - nx; p[o + 4] = y; p[o + 5] = az - nz;
    p[o + 6] = bx + nx; p[o + 7] = y; p[o + 8] = bz + nz;
    p[o + 9] = bx - nx; p[o + 10] = y; p[o + 11] = bz - nz;
    this._ages[i] = 0;
    const c = this._colors;
    const co = i * 16;
    for (let v = 0; v < 4; v++) {
      c[co + v * 4] = 0.05; c[co + v * 4 + 1] = 0.05; c[co + v * 4 + 2] = 0.06;
      c[co + v * 4 + 3] = this._baseAlpha;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  update(dt) {
    const c = this._colors;
    let dirty = false;
    for (let i = 0; i < this.max; i++) {
      if (this._ages[i] === Infinity) continue;
      this._ages[i] += dt;
      const k = this._ages[i] / this.life;
      const a = k >= 1 ? 0 : this._baseAlpha * (1 - k * k);
      if (k >= 1) this._ages[i] = Infinity;
      const co = i * 16;
      c[co + 3] = a; c[co + 7] = a; c[co + 11] = a; c[co + 15] = a;
      dirty = true;
    }
    if (dirty) this.mesh.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this._scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
