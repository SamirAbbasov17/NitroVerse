import * as THREE from 'three';

// ————— FİNİŞ ANİMASİYALARI —————
// Yarışı bitirəndə (və ya matçı udanda) maşının ətrafında oynayan qeyd effekti.
// Mağazadan alınır (bax data/cosmetics.js → FINISHES) və oyunçunun öz imzasıdır.
//
// PRİNSİP: hamısı ~2.5 saniyəlik, additiv, kölgəsiz və GEOMETRİYASI PAYLAŞILAN
// obyektlərdir — mobil GPU-da da sərbəst işləyir. Heç biri oyun gedişinə
// təsir etmir, yalnız görüntüdür.

const TAU = Math.PI * 2;

// Ortaq: sadə hissəcik idarəsi
class Burst {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.frustumCulled = false;
    scene.add(this.group);
    this.items = [];
    this.t = 0;
    this.done = false;
  }

  add(mesh, spec) {
    this.group.add(mesh);
    this.items.push({ mesh, ...spec });
  }

  update(dt) {
    this.t += dt;
    // Maşın ötürülübsə effekt onu İZLƏYİR: əvvəl finiş xəttində qalırdı,
    // maşın çıxıb gedirdi (istifadəçi rəyi) — halbuki bu, maşının öz
    // qeyd auraşıdır
    if (this.follow) {
      const f = this.follow.position;
      this.group.position.set(f.x, f.y || 0, f.z);
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age = (it.age || 0) + dt;
      const k = it.age / it.life;
      if (k >= 1) {
        this.group.remove(it.mesh);
        it.mesh.material.dispose?.();
        this.items.splice(i, 1);
        continue;
      }
      it.tick?.(it, k, dt);
    }
    if (!this.items.length && this.t > 0.3) this.done = true;
  }

  dispose() {
    for (const it of this.items) { it.mesh.material.dispose?.(); }
    this.group.traverse((o) => o.geometry?.dispose?.());
    this.scene.remove(this.group);
    this.items.length = 0;
  }
}

const matOf = (color, opacity = 1, additive = true) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, depthWrite: false,
  blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  side: THREE.DoubleSide,
});

// ————— 1) ATƏŞFƏŞANLIQ: göydə açılan rəngli partlayışlar —————
function fireworks(b, pos, hex) {
  const cols = [hex, 0xffd257, 0x37b8ff, 0xff3d8a, 0x46d47e];
  const geo = new THREE.SphereGeometry(0.16, 6, 4);
  for (let s = 0; s < 4; s++) {
    const delay = s * 0.35;
    const cx = pos.x + (Math.random() - 0.5) * 8;
    const cz = pos.z + (Math.random() - 0.5) * 8;
    const cy = 6.5 + Math.random() * 3.5;   // təqib kamerasının kadrında qalsın
    const col = cols[s % cols.length];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(geo, matOf(col, 0));
      m.position.set(cx, cy, cz);
      const a = Math.random() * TAU, e = Math.acos(2 * Math.random() - 1);
      const sp = 5 + Math.random() * 5;
      const v = new THREE.Vector3(Math.sin(e) * Math.cos(a), Math.cos(e), Math.sin(e) * Math.sin(a)).multiplyScalar(sp);
      b.add(m, {
        life: 1.5 + delay, v, delay,
        tick: (it, k, dt) => {
          if (it.age < it.delay) { it.mesh.material.opacity = 0; return; }
          const kk = (it.age - it.delay) / (it.life - it.delay);
          it.mesh.position.addScaledVector(it.v, dt);
          it.v.y -= 9 * dt;
          it.v.multiplyScalar(1 - dt * 1.1);
          it.mesh.material.opacity = Math.max(0, 1 - kk * kk);
        },
      });
    }
  }
}

// ————— 2) İŞIQ SÜTUNU: maşından göyə qalxan sütun + halqalar —————
function pillar(b, pos, hex) {
  const col = new THREE.Color(hex);
  // Şəffaflıq aşağı olmalıdır: additiv qarışdırmada 0.5 ağ divar kimi çıxırdı
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.7, 26, 16, 1, true), matOf(col.getHex(), 0.18));
  beam.position.set(pos.x, 13, pos.z);
  b.add(beam, {
    life: 2.4,
    tick: (it, k) => {
      it.mesh.material.opacity = 0.2 * Math.sin(Math.min(1, k * 1.6) * Math.PI);
      it.mesh.scale.set(1 + k * 0.5, 1, 1 + k * 0.5);
      it.mesh.rotation.y += 0.01;
    },
  });
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.13, 6, 28), matOf(col.getHex(), 0.9));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(pos.x, 0.4, pos.z);
    b.add(ring, {
      life: 2.2, delay: i * 0.22,
      tick: (it, k) => {
        if (it.age < it.delay) { it.mesh.material.opacity = 0; return; }
        const kk = (it.age - it.delay) / (it.life - it.delay);
        it.mesh.position.y = 0.4 + kk * 16;
        it.mesh.scale.setScalar(1 + kk * 2.4);
        it.mesh.material.opacity = 0.9 * (1 - kk);
      },
    });
  }
}

// ————— 3) QIZIL YAĞIŞ: yuxarıdan tökülən parıltılar —————
function goldrain(b, pos, hex) {
  const geo = new THREE.PlaneGeometry(0.26, 0.5);
  for (let i = 0; i < 90; i++) {
    const m = new THREE.Mesh(geo, matOf(i % 4 === 0 ? 0xffffff : hex, 0.95));
    m.position.set(pos.x + (Math.random() - 0.5) * 16, 9 + Math.random() * 7, pos.z + (Math.random() - 0.5) * 16);
    m.rotation.z = Math.random() * TAU;
    b.add(m, {
      life: 2.6, vy: -(5 + Math.random() * 4), sp: (Math.random() - 0.5) * 5,
      tick: (it, k, dt) => {
        it.mesh.position.y += it.vy * dt;
        it.mesh.position.x += Math.sin(it.age * 3 + it.sp) * dt * 1.4;
        it.mesh.rotation.z += dt * 4;
        it.mesh.material.opacity = k > 0.75 ? (1 - k) * 4 : 0.95;
      },
    });
  }
}

// ————— 4) ALOV ÇEVRƏSİ: maşından yayılan od dalğası —————
function fireRing(b, pos, hex) {
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.0, 32), matOf(i ? 0xff8a1a : hex, 0.85));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.25 + i * 0.05, pos.z);
    b.add(ring, {
      life: 1.9, delay: i * 0.24,
      tick: (it, k) => {
        if (it.age < it.delay) { it.mesh.material.opacity = 0; return; }
        const kk = (it.age - it.delay) / (it.life - it.delay);
        it.mesh.scale.setScalar(1 + kk * 9);
        it.mesh.material.opacity = 0.85 * (1 - kk);
      },
    });
  }
  const geo = new THREE.SphereGeometry(0.22, 6, 4);
  for (let i = 0; i < 30; i++) {
    const m = new THREE.Mesh(geo, matOf(0xffb45a, 0.9));
    m.position.set(pos.x, 0.6, pos.z);
    const a = Math.random() * TAU;
    b.add(m, {
      life: 1.5, v: new THREE.Vector3(Math.cos(a) * (4 + Math.random() * 5), 4 + Math.random() * 5, Math.sin(a) * (4 + Math.random() * 5)),
      tick: (it, k, dt) => {
        it.mesh.position.addScaledVector(it.v, dt);
        it.v.y -= 7 * dt;
        it.mesh.material.opacity = 0.9 * (1 - k);
      },
    });
  }
}

// ————— 5) ULDUZ BURULĞANI: spiral şəklində qalxan ulduzlar —————
function starSpiral(b, pos, hex) {
  const geo = new THREE.PlaneGeometry(0.5, 0.5);
  for (let i = 0; i < 60; i++) {
    const m = new THREE.Mesh(geo, matOf(i % 3 === 0 ? 0xffffff : hex, 0.95));
    const a0 = (i / 60) * TAU * 3;
    b.add(m, {
      life: 2.4, a0, r0: 1.2 + (i % 5) * 0.5, delay: i * 0.012,
      tick: (it, k) => {
        if (it.age < it.delay) { it.mesh.material.opacity = 0; return; }
        const kk = (it.age - it.delay) / (it.life - it.delay);
        const a = it.a0 + kk * 5.2;
        const r = it.r0 + kk * 5.5;
        it.mesh.position.set(pos.x + Math.cos(a) * r, 0.6 + kk * 12, pos.z + Math.sin(a) * r);
        it.mesh.rotation.z = a;
        it.mesh.scale.setScalar(1 - kk * 0.5);
        it.mesh.material.opacity = 0.95 * (1 - kk * kk);
      },
    });
  }
}

const KINDS = { fireworks, pillar, goldrain, firering: fireRing, starspiral: starSpiral };
export const FINISH_KINDS = Object.keys(KINDS);

// Finiş effektini oynadır. Qaytarır: { update(dt), dispose(), done }
// target: Vector3 (statik nöqtə) VƏ YA maşın ({position: Vector3}) —
// maşın ötürülsə effekt bütün ömrü boyu onu izləyir.
const ORIGIN = new THREE.Vector3(0, 0, 0);
export function playFinishFx(scene, kind, target, hex = 0xffd257) {
  const fn = KINDS[kind];
  if (!fn || !scene) return null;
  const b = new Burst(scene);
  b.follow = target && target.position ? target : null;
  const p0 = b.follow ? b.follow.position : target;
  b.group.position.set(p0.x, p0.y || 0, p0.z);
  fn(b, ORIGIN, hex);
  return b;
}
