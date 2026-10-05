import * as THREE from 'three';

// Yüngül low-poly VFX sistemi: partlayış, qığılcım (pickup), tüstü.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.list = [];
    this._tmpCol = new THREE.Color();

    this._shardGeo = new THREE.TetrahedronGeometry(0.34);
    this._sparkGeo = new THREE.TetrahedronGeometry(0.18);
    this._puffGeo = new THREE.IcosahedronGeometry(0.4, 0);
    this._flashGeo = new THREE.SphereGeometry(1, 10, 8);

    // İNSTANS HOVUZLARI: tüstü, qəlpə, qığılcım və konfeti hər növü TƏK çəkimlə
    // (InstancedMesh) render olunur. ƏVVƏL hər hissəcik ayrı Mesh idi — arenada
    // tüstü 85 draw call, futbolda qol anı 392-yə çatırdı (ölçüldü).
    this._confettiGeo = new THREE.PlaneGeometry(0.3, 0.2);
    this._inst = {
      puff: this._makeInst(this._puffGeo, 220, { emissive: 0 }),
      shard: this._makeInst(this._shardGeo, 140, { emissive: 0.6 }),
      spark: this._makeInst(this._sparkGeo, 140, { emissive: 1.6 }),
      confetti: this._makeInst(this._confettiGeo, 240, { basic: true }),
    };

    // İŞIQ HOVUZU: runtime-da işıq sayı DƏYİŞMİR — yeni PointLight əlavə etmək
    // bütün shaderlərin yenidən kompilyasiyasına (FPS donmasına) səbəb olur.
    this._lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 34, 2);
      this.group.add(l);
      this._lights.push(l);
    }
  }

  // Bir hissəcik növü üçün InstancedMesh. Hər instansın öz rəngi (instanceColor)
  // və öz şəffaflığı (instOpacity atributu — şeyderə kiçik əlavə) var; boş
  // slotların matrisi sıfırdır (görünmür). Hər slotun daimi "proxy" Object3D-si
  // var: effekt kodu əvvəlki kimi position/rotation/scale/material.opacity
  // yazır, update() onu instans buferinə köçürür.
  _makeInst(geo, cap, { emissive = 0, basic = false } = {}) {
    const mat = basic
      ? new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, flatShading: true });
    const uEmis = { value: emissive };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uEmis = uEmis;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float instOpacity;\nvarying float vInstOpacity;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstOpacity = instOpacity;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vInstOpacity;\nuniform float uEmis;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vInstOpacity;');
      if (!basic) {
        sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor * uEmis;');
      }
    };
    mat.customProgramCacheKey = () => `fxinst-${basic ? 'b' : 's'}`;
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    const opacity = new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(1), 1);
    opacity.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('instOpacity', opacity);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const white = new THREE.Color(0xffffff);
    const proxies = [];
    const free = [];
    for (let i = cap - 1; i >= 0; i--) {
      mesh.setMatrixAt(i, zero);
      mesh.setColorAt(i, white);
      free.push(i);
    }
    for (let i = 0; i < cap; i++) {
      const o = new THREE.Object3D();
      o.material = { opacity: 1 };   // köhnə kod `mesh.material.opacity` yazır
      o.userData.slot = i;
      proxies.push(o);
    }
    this.group.add(mesh);
    return { mesh, opacity, proxies, free, zero, live: 0 };
  }

  // Hovuzdan instans götür: proxy qaytarır (dolu olsa null — effekt buraxılır)
  _spawnInst(kind, color, opacity = 1) {
    const I = this._inst[kind];
    if (!I.free.length) return null;
    const slot = I.free.pop();
    const o = I.proxies[slot];
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.setScalar(1);
    o.material.opacity = opacity;
    o.userData.inst = I;
    I.mesh.setColorAt(slot, this._tmpCol.set(color));
    I.mesh.instanceColor.needsUpdate = true;
    I.live++;
    return o;
  }

  _freeInst(o) {
    const I = o.userData.inst;
    I.mesh.setMatrixAt(o.userData.slot, I.zero);
    I.mesh.instanceMatrix.needsUpdate = true;
    I.free.push(o.userData.slot);
    I.live--;
  }

  // Hovuzdan işıq götürüb qısa parlama et
  _flashLight(color, intensity, pos, life) {
    const l = this._lights.find((x) => !x.userData.busy) || this._lights[0];
    l.userData.busy = true;
    l.color.set(color);
    l.position.set(pos.x, pos.y ?? 3, pos.z);
    l.intensity = intensity;
    this.list.push({ mesh: l, kind: 'plight', t: 0, life, peak: intensity });
  }

  // MESH/MATERİAL HOVUZU: əvvəl hər spawn yeni material yaradırdı — three
  // hər yaradılışda uniform-ları klonlayır (profildə №1 ayırıcı idi) və
  // yarış boyu davamlı GC zibili yığılırdı. Ölən effekt hovuza qayıdır.
  _take(geo, std, params) {
    const key = (std ? 's' : 'b') + geo.uuid;
    if (!this._mpool) this._mpool = new Map();
    const arr = this._mpool.get(key);
    let m = arr && arr.pop();
    if (m) {
      m.material.setValues(params);
      m.material.opacity = params.opacity ?? 1;
      m.visible = true;
      m.scale.setScalar(1);
      m.rotation.set(0, 0, 0);
    } else {
      m = new THREE.Mesh(geo, std
        ? new THREE.MeshStandardMaterial(params)
        : new THREE.MeshBasicMaterial(params));
      m.userData.poolKey = key;
    }
    return m;
  }

  _release(mesh) {
    const key = mesh.userData?.poolKey;
    if (!key || !this._mpool) return false;
    mesh.visible = false;
    let arr = this._mpool.get(key);
    if (!arr) { arr = []; this._mpool.set(key, arr); }
    if (arr.length < 48) arr.push(mesh);
    return true;
  }

  // Raket partlayışı
  spawnExplosion(pos) {
    // İşıq partlaması
    const flash = this._take(this._flashGeo, false,
      { color: 0xffd27a, transparent: true, opacity: 0.95 });
    flash.position.copy(pos);
    this.group.add(flash);
    this.list.push({ mesh: flash, kind: 'flash', t: 0, life: 0.25 });

    this._flashLight(0xff9a2e, 260, pos, 0.3);

    // Qəlpələr
    const colors = [0xff6b1a, 0xffd257, 0x3a3d46, 0xe33225];
    for (let i = 0; i < 14; i++) {
      const m = this._spawnInst('shard', colors[i % colors.length]);
      if (!m) break;
      m.position.copy(pos);
      const a = Math.random() * Math.PI * 2;
      const up = 3 + Math.random() * 8;
      const sp = 5 + Math.random() * 9;
      this.list.push({
        mesh: m, kind: 'shard', t: 0, life: 0.65 + Math.random() * 0.3,
        vel: new THREE.Vector3(Math.cos(a) * sp, up, Math.sin(a) * sp),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
      });
    }
  }

  // Şimşək xəbərdarlığı — hədəfin üstündə fırlanan bənövşəyi halqa (1s)
  spawnWarnMark(car, life = 1.0) {
    if (!this._warnGeo) this._warnGeo = new THREE.TorusGeometry(1.1, 0.12, 6, 18);
    const ring = this._take(this._warnGeo, true, {
      color: 0xb44bff, emissive: 0xb44bff, emissiveIntensity: 1.8,
      transparent: true, opacity: 0.9,
    });
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);
    this.list.push({ mesh: ring, kind: 'warnmark', t: 0, life, car });
  }

  // Ability məsafə göstəricisi — yerdən genişlənib radiusda sönən halqa
  spawnRangeRing(pos, radius, color = 0xb44bff) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 64),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.55,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.14, pos.z);
    mesh.scale.setScalar(0.1);
    this.group.add(mesh);
    this.list.push({ mesh, kind: 'rangering', t: 0, life: 0.85, radius });
  }

  // Item qutusu götürüləndə qığılcımlar (rəng seçilə bilər)
  spawnSparkle(pos, color = 0xffc94d) {
    for (let i = 0; i < 9; i++) {
      const m = this._spawnInst('spark', color);
      if (!m) break;
      m.position.copy(pos);
      const a = (i / 9) * Math.PI * 2;
      this.list.push({
        mesh: m, kind: 'shard', t: 0, life: 0.5,
        vel: new THREE.Vector3(Math.cos(a) * 5, 4 + Math.random() * 3, Math.sin(a) * 5),
        spin: new THREE.Vector3(8, 8, 0),
      });
    }
  }

  // İldırım zərbəsi — göydən ziqzaqla düşür (şimşək power-up-ı)
  spawnLightning(pos) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 1 });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.55 });

    // Ziqzaq nöqtələri: göydən (y=15) maşına
    const pts = [new THREE.Vector3(pos.x + (Math.random() - 0.5) * 4, 15, pos.z + (Math.random() - 0.5) * 4)];
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      pts.push(new THREE.Vector3(
        pos.x + (Math.random() - 0.5) * 2.6 * (1 - k),
        15 * (1 - k) + 0.6 * k,
        pos.z + (Math.random() - 0.5) * 2.6 * (1 - k)
      ));
    }
    // Seqmentlər: nazik + qalın (halo) silindr
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, len, 5), mat);
      seg.position.copy(mid);
      seg.quaternion.copy(quat);
      g.add(seg);
      const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, len, 5), coreMat);
      halo.position.copy(mid);
      halo.quaternion.copy(quat);
      g.add(halo);
    }
    this.group.add(g);
    this.list.push({ mesh: g, kind: 'lightning', t: 0, life: 0.55, mats: [mat, coreMat] });

    // Zərbə nöqtəsində parlama + işıq + qığılcım
    const flash = this._take(this._flashGeo, false,
      { color: 0xcfeaff, transparent: true, opacity: 0.9 });
    flash.position.set(pos.x, 1.0, pos.z);
    this.group.add(flash);
    this.list.push({ mesh: flash, kind: 'flash', t: 0, life: 0.3 });
    this._flashLight(0xbfe4ff, 300, { x: pos.x, y: 4, z: pos.z }, 0.35);
    // Elektrik qığılcımları
    for (let i = 0; i < 7; i++) {
      const m = this._take(this._sparkGeo, true, {
        color: 0xbfe4ff, emissive: 0x8fd0ff, emissiveIntensity: 2,
        flatShading: true, transparent: true, opacity: 1,
      });
      m.position.set(pos.x, 1, pos.z);
      const a = Math.random() * Math.PI * 2;
      this.group.add(m);
      this.list.push({
        mesh: m, kind: 'shard', t: 0, life: 0.45,
        vel: new THREE.Vector3(Math.cos(a) * 6, 5 + Math.random() * 4, Math.sin(a) * 6),
        spin: new THREE.Vector3(12, 12, 0),
      });
    }
  }

  // Finiş konfetisi — rəngli lövhəciklər yağır
  spawnConfetti(pos, big = false) {
    const colors = [0xffd257, 0xff6b1a, 0x46d47e, 0x37b8ff, 0xff3d8a, 0xb44bff];
    const n = big ? 54 : 34;
    for (let i = 0; i < n; i++) {
      const m = this._spawnInst('confetti', colors[i % colors.length]);
      if (!m) break;
      m.position.set(pos.x, 1.2, pos.z);
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 6;
      this.list.push({
        mesh: m, kind: 'confetti', t: 0, life: 1.8 + Math.random() * 0.9,
        vel: new THREE.Vector3(Math.cos(a) * sp, 7 + Math.random() * 6, Math.sin(a) * sp),
        spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12),
      });
    }
  }

  // Tüstü topası (vurulma / yağda sürüşmə / drift / toz)
  spawnSmoke(pos, dark = false, color = null, scale = 1) {
    // Rəngli tüstü BOYA kimi deyil, TÜSTÜ kimi oxunmalıdır — tam doymuş rəng
    // (məs. qara maşında parlaq çəhrayı) gülməli görünürdü. Rəng boz-ağ ilə
    // qarışdırılır və şəffaflaşır: çalar seçilir, amma təbii qalır.
    let col = color ?? (dark ? 0x22242c : 0x9aa0ad);
    let opacity = 0.75;
    if (color != null) {
      const c = new THREE.Color(color);
      const hsl = { h: 0, s: 0, l: 0 };
      c.getHSL(hsl);
      c.setHSL(hsl.h, Math.min(hsl.s, 0.42), Math.min(0.86, Math.max(0.62, hsl.l * 0.55 + 0.42)));
      col = c;
      opacity = 0.58;
    }
    const m = this._spawnInst('puff', col, opacity);
    if (!m) return;
    if (scale !== 1) m.scale.setScalar(scale);
    m.position.set(pos.x + (Math.random() - 0.5), pos.y + 0.4, pos.z + (Math.random() - 0.5));
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    this.list.push({ mesh: m, kind: 'smoke', t: 0, life: 0.7 + Math.random() * 0.3 });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.t += dt;
      const k = e.t / e.life;
      if (k >= 1) {
        if (e.kind === 'plight') {
          // Hovuz işığı: silinmir, sönüb geri qaytarılır
          e.mesh.intensity = 0;
          e.mesh.userData.busy = false;
        } else if (e.mesh.userData.inst) {
          this._freeInst(e.mesh);   // instans: slot hovuza qayıdır
        } else {
          this.group.remove(e.mesh);
          // Hovuzdan gələn mesh geri qayıdır; qalanlar köhnə qayda ilə silinir
          if (!this._release(e.mesh)) {
            if (e.kind === 'rangering') e.mesh.geometry.dispose();
            if (e.mesh.material) e.mesh.material.dispose?.();
          }
        }
        this.list.splice(i, 1);
        continue;
      }
      switch (e.kind) {
        case 'flash':
          e.mesh.scale.setScalar(1 + k * 9);
          e.mesh.material.opacity = 0.95 * (1 - k);
          break;
        case 'plight':
          e.mesh.intensity = e.peak * (1 - k);
          break;
        case 'shard':
          e.mesh.position.addScaledVector(e.vel, dt);
          e.vel.y -= 22 * dt;
          e.mesh.rotation.x += e.spin.x * dt;
          e.mesh.rotation.y += e.spin.y * dt;
          e.mesh.scale.setScalar(Math.max(0.05, 1 - k));
          e.mesh.material.opacity = 1 - k * k;
          break;
        case 'smoke':
          e.mesh.position.y += 1.6 * dt;
          e.mesh.scale.setScalar(0.7 + k * 1.8);
          e.mesh.material.opacity = 0.75 * (1 - k);
          break;
        case 'lightning': {
          // Titrəyən parlaqlıq + sönmə
          const flicker = Math.random() > 0.35 ? 1 : 0.35;
          e.mats[0].opacity = flicker * (1 - k * k);
          e.mats[1].opacity = 0.55 * flicker * (1 - k * k);
          break;
        }
        case 'rangering': {
          // Yumşaq genişlənmə (ease-out) → radiusda sönür
          const g = 1 - Math.pow(1 - k, 3);
          e.mesh.scale.setScalar(Math.max(0.1, e.radius * g));
          e.mesh.material.opacity = 0.55 * (1 - k * k);
          break;
        }
        case 'confetti':
          e.mesh.position.addScaledVector(e.vel, dt);
          e.vel.y -= 11 * dt; // yüngül qravitasiya — lövhəciklər süzülür
          e.vel.x *= 0.995;
          e.vel.z *= 0.995;
          e.mesh.rotation.x += e.spin.x * dt;
          e.mesh.rotation.y += e.spin.y * dt;
          e.mesh.rotation.z += e.spin.z * dt;
          e.mesh.material.opacity = 1 - Math.max(0, k - 0.6) * 2.5;
          break;
        case 'warnmark':
          // Hədəfi izləyir, fırlanır, sona doğru sürətlə yanıb-sönür
          e.mesh.position.set(e.car.position.x, 3.4, e.car.position.z);
          e.mesh.rotation.z += dt * 5;
          e.mesh.material.opacity = 0.5 + Math.abs(Math.sin(e.t * (6 + k * 18))) * 0.5;
          e.mesh.scale.setScalar(1 - k * 0.3);
          break;
      }
      // İnstans hissəciyi: proxy-nin vəziyyətini instans buferinə köçür
      const I = e.mesh.userData.inst;
      if (I) {
        e.mesh.updateMatrix();
        I.mesh.setMatrixAt(e.mesh.userData.slot, e.mesh.matrix);
        I.opacity.array[e.mesh.userData.slot] = e.mesh.material.opacity;
        I.dirty = true;
      }
    }
    for (const I of Object.values(this._inst)) {
      if (!I.dirty) continue;
      I.dirty = false;
      I.mesh.instanceMatrix.needsUpdate = true;
      I.opacity.needsUpdate = true;
    }
  }

  dispose() {
    for (const e of this.list) {
      if (e.mesh.userData?.inst) continue;   // instans proxy-si — resursu yoxdur
      this.group.remove(e.mesh);
      e.mesh.material?.dispose?.();
    }
    this.list = [];
    for (const I of Object.values(this._inst)) {
      this.group.remove(I.mesh);
      I.mesh.material.dispose();
      I.mesh.dispose();
    }
    this.scene.remove(this.group);
    for (const arr of this._mpool?.values() || []) {
      for (const m of arr) m.material?.dispose?.();
    }
    this._mpool = null;
    this._warnGeo?.dispose();
    this._shardGeo.dispose();
    this._confettiGeo?.dispose();
    this._sparkGeo.dispose();
    this._puffGeo.dispose();
    this._flashGeo.dispose();
  }
}
