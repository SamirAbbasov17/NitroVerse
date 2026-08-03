import * as THREE from 'three';

// Yüksək sürətdə kamera ətrafında geri axan "külək zolaqları" —
// arcade yarış oyunlarındakı sürət hissi (ucuz motion-blur alternativi).
export class SpeedLines {
  constructor(camera, count = 48) {
    this.count = count;
    this.meta = []; // hər zolaq: {x, y, z, len}
    this.positions = new Float32Array(count * 6);

    for (let i = 0; i < count; i++) {
      this.meta.push(this._newLine(-4 - Math.random() * 26));
      this._writeLine(i);
    }

    this.geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.positions, 3);
    this.geo.setAttribute('position', this.attr);
    this.mat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.lines.renderOrder = 5;
    camera.add(this.lines);
    this.camera = camera;
  }

  // Baxış oxu ətrafında halqada təsadüfi zolaq
  _newLine(z) {
    const a = Math.random() * Math.PI * 2;
    const r = 1.7 + Math.random() * 5;
    return {
      x: Math.cos(a) * r * 1.5, // üfüqi bir az geniş (ekran nisbəti)
      y: Math.sin(a) * r * 0.8,
      z,
      len: 1.4 + Math.random() * 2.6,
    };
  }

  _writeLine(i) {
    const m = this.meta[i];
    const o = i * 6;
    this.positions[o] = m.x;
    this.positions[o + 1] = m.y;
    this.positions[o + 2] = m.z;
    this.positions[o + 3] = m.x;
    this.positions[o + 4] = m.y;
    this.positions[o + 5] = m.z - m.len;
  }

  update(dt, speedT, speed) {
    // Yalnız sürətin ~55%-dən yuxarı görünür, tədricən güclənir
    const t = Math.max(0, (speedT - 0.55) / 0.45);
    this.lines.visible = t > 0.02;
    this.mat.opacity = t * 0.4;
    if (!this.lines.visible) return;

    for (let i = 0; i < this.count; i++) {
      const m = this.meta[i];
      m.z += speed * dt * 1.7; // kameraya doğru axır
      if (m.z - m.len > -1.5) {
        this.meta[i] = this._newLine(-28 - Math.random() * 8);
      }
      this._writeLine(i);
    }
    this.attr.needsUpdate = true;
  }

  dispose() {
    this.camera.remove(this.lines);
    this.geo.dispose();
    this.mat.dispose();
  }
}
