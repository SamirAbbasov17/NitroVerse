import * as THREE from 'three';
import { makeStartArch } from '../core/AssetFactory.js';
import { mergeStaticGroup } from '../core/MergeUtils.js';

const UP = new THREE.Vector3(0, 1, 0);

// Trek datasından yol mesh-i, kənar zolaqlar, start tağı və proqres üçün nöqtələr qurur.
export class TrackBuilder {
  constructor(trackData, segments = 600) {
    this.data = trackData;
    this.halfWidth = trackData.roadWidth;
    this.N = segments;
    this.group = new THREE.Group();

    const s = trackData.scale ?? 1;
    const pts = trackData.controlPoints.map(([x, z]) => new THREE.Vector3(x * s, 0, z * s));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    this.length = this.curve.getLength();
    // Trekin ən uzaq radiusu (dekor/dağ yerləşdirməsi üçün)
    this.maxRadius = pts.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.z)), 0);

    this.obstacles = []; // postlar, tağ dirəkləri — toqquşma üçün

    // Bərabər (qövs boyu) paylanmış nöqtələr — sabit sürət hissi
    const spaced = this.curve.getSpacedPoints(this.N); // N+1 nöqtə, son == ilk
    this.points = spaced.slice(0, this.N);
    this.tangents = this.points.map((p, i) => {
      const n = this.points[(i + 1) % this.N];
      return new THREE.Vector3().subVectors(n, p).setY(0).normalize();
    });
    // Sol istiqamət normalı: up × tangent
    this.normals = this.tangents.map((t) => new THREE.Vector3(t.z, 0, -t.x));

    this._lastIndex = 0;

    // Şaxələnib yenidən birləşən alternativ yollar
    this.branches = (trackData.branches || []).map((br) => this._buildBranchData(br, s));
  }

  // Şaxə əyrisi: əsas yolun t0 nöqtəsindən ayrılır, via nöqtələrindən keçib t1-də birləşir.
  // Uclar əsas yolun ÜSTÜNDƏN başlayır (bir az aşağı y ilə) — qovşaq təbii çəngəl kimi görünür.
  _buildBranchData(br, s) {
    const i0 = Math.round(br.t0 * this.N) % this.N;
    const i1 = Math.round(br.t1 * this.N) % this.N;
    const P = this.points;
    const mids = br.via.map(([x, z]) => new THREE.Vector3(x * s, 0, z * s));
    const halfWidth = this.halfWidth * 0.85;
    // via hansı tərəfdədir? (ayrılma/birləşmə həmin səmtə açılır)
    const sideOf = (pt, i) =>
      Math.sign((pt.x - P[i].x) * this.normals[i].x + (pt.z - P[i].z) * this.normals[i].z) || 1;
    const s0 = sideOf(mids[0], i0);
    const s1 = sideOf(mids[mids.length - 1], i1);
    // MAGİSTRAL ÇIXIŞI HİSSİ: yol əvvəlcə əsas yola kənar-kənara paralel zolaq kimi
    // açılır (geniş yol effekti), sonra rəvan şəkildə ayrılır — Blur/kart oyunlarındakı kimi
    const rampOff = this.halfWidth + halfWidth - 0.8; // -0.8: tikiş görünməsin deyə yüngül üst-üstə
    const iA = (i0 + 10) % this.N;
    const iB = (i1 - 10 + this.N) % this.N;
    const rampA = P[iA].clone().addScaledVector(this.normals[iA], s0 * rampOff);
    const rampB = P[iB].clone().addScaledVector(this.normals[iB], s1 * rampOff);
    const curve = new THREE.CatmullRomCurve3(
      [P[(i0 - 6 + this.N) % this.N], P[i0], rampA, ...mids, rampB, P[i1], P[(i1 + 6) % this.N]],
      false, 'catmullrom', 0.5
    );
    const bN = Math.max(80, Math.round((curve.getLength() / this.length) * this.N));
    const points = curve.getSpacedPoints(bN);
    const tangents = points.map((p, i) => {
      const a = points[Math.min(i + 1, points.length - 1)];
      const b = points[Math.max(i - 1, 0)];
      return new THREE.Vector3().subVectors(a, b).setY(0).normalize();
    });
    const normals = tangents.map((t) => new THREE.Vector3(t.z, 0, -t.x));
    // Sürətli rədd üçün bounding box
    const bb = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const p of points) {
      bb.minX = Math.min(bb.minX, p.x); bb.maxX = Math.max(bb.maxX, p.x);
      bb.minZ = Math.min(bb.minZ, p.z); bb.maxZ = Math.max(bb.maxZ, p.z);
    }
    return { i0, i1, points, tangents, normals, halfWidth, bb };
  }

  // Mövqe şaxə üzərindədirsə ən yaxın şaxə nöqtəsi + gedişat istiqaməti.
  // Səhv-istiqamət yoxlaması və rescue şaxədə DÜZGÜN işləsin deyə lazımdır.
  getBranchNearest(position, margin = 0.5) {
    for (const b of this.branches) {
      const pad = b.halfWidth + margin;
      if (position.x < b.bb.minX - pad || position.x > b.bb.maxX + pad ||
          position.z < b.bb.minZ - pad || position.z > b.bb.maxZ + pad) continue;
      let bestD = Infinity, best = 0;
      for (let i = 0; i < b.points.length; i++) {
        const dx = position.x - b.points[i].x;
        const dz = position.z - b.points[i].z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
      const c = b.points[best];
      const lat = (position.x - c.x) * b.normals[best].x + (position.z - c.z) * b.normals[best].z;
      if (Math.abs(lat) <= pad) {
        return { point: c, tangent: b.tangents[best], index: best, branch: b };
      }
    }
    return null;
  }

  // Nöqtə əsas yolun üstündədirmi? (qovşaqda curb kəsimi üçün — yalnız build zamanı)
  _onMainRoad(pos, margin = 0) {
    const n = this.getNearest(pos);
    return Math.abs(n.lateral) <= this.halfWidth + margin;
  }

  // Mövqe hər hansı şaxə yolunun üstündədirmi? (yol yoxlaması + dekor üçün)
  isOnBranch(position, margin = 0.5) {
    for (const b of this.branches) {
      const pad = b.halfWidth + margin;
      if (position.x < b.bb.minX - pad || position.x > b.bb.maxX + pad ||
          position.z < b.bb.minZ - pad || position.z > b.bb.maxZ + pad) continue;
      let bestD = Infinity, best = 0;
      for (let i = 0; i < b.points.length; i++) {
        const dx = position.x - b.points[i].x;
        const dz = position.z - b.points[i].z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
      const c = b.points[best];
      const lat = (position.x - c.x) * b.normals[best].x + (position.z - c.z) * b.normals[best].z;
      if (Math.abs(lat) <= pad) return true;
    }
    return false;
  }

  build() {
    const p = this.data.palette;
    // Qovşaq kəsim funksiyaları: curb digər yolun səthindən keçməsin
    const onBranch = this.branches.length ? (pos) => this.isOnBranch(pos, 0.2) : null;
    const onMain = (pos) => this._onMainRoad(pos, 0.2);
    // TOXUMALAR: asfalt (noise + təkər izi qaralması) və zolaqlı curb
    const roadTex = this._asphaltTexture();
    const curbTex = this._curbTexture(p.curb);
    const roadOpts = { roughness: 0.95, map: roadTex, uvMeters: 26 };
    const curbOpts = { emissive: 0xffffff, emissiveMap: curbTex, emissiveIntensity: 0.3, map: curbTex, uvMeters: 4.4 };
    // Yol lenti
    // ASFALT TONU: palitra rəngləri çox tünd idi (0x28…0x3a) və tekstura ilə
    // birlikdə səth demək olar QAPQARA çıxırdı — ekranın yarısını tutan
    // fakturasız qara sahə "ucuz" görünür. Çalar saxlanılır, yalnız
    // parlaqlıq qaldırılır (real asfalt işıqda tünd-boz oxunur).
    const roadCol = new THREE.Color(p.road).lerp(new THREE.Color(0xffffff), 0.16).getHex();
    this.group.add(this._ribbonFor(this.points, this.normals, true, -this.halfWidth, this.halfWidth, roadCol, 0.02, roadOpts));
    // Kənar zolaqlar (curb) — şaxə girişlərində KƏSİLİR (təmiz çəngəl ağzı)
    this.group.add(this._ribbonFor(this.points, this.normals, true, this.halfWidth, this.halfWidth + 0.7, 0xffffff, 0.05, curbOpts, onBranch));
    this.group.add(this._ribbonFor(this.points, this.normals, true, -this.halfWidth - 0.7, -this.halfWidth, 0xffffff, 0.05, curbOpts, onBranch));
    // Şaxə yolları — bir az aşağı y: qovşaqda əsas yol üstünü örtür (z-fighting yox).
    // Rəngi bir az tozlu/köhnədir — "gizli yol" oxunuşu
    const branchRoadC = new THREE.Color(roadCol).lerp(new THREE.Color(0x9a8a6a), 0.14).getHex();
    for (const b of this.branches) {
      const hw = b.halfWidth;
      this.group.add(this._ribbonFor(b.points, b.normals, false, -hw, hw, branchRoadC, 0.012, roadOpts));
      // Şaxə curb-ları əsas yolun üstündə çəkilmir — yalnız ayrılandan sonra başlayır
      this.group.add(this._ribbonFor(b.points, b.normals, false, hw, hw + 0.6, 0xffffff, 0.042, curbOpts, onMain));
      this.group.add(this._ribbonFor(b.points, b.normals, false, -hw - 0.6, -hw, 0xffffff, 0.042, curbOpts, onMain));
      // Şaxənin öz mərkəz kəsik xətti (əsas yol üstündə yox)
      this.group.add(this._dashesFor(b.points, b.normals, false, p.curb, onMain));
      // Ayrılma nöqtəsində işıqlı istiqamət lövhəsi (Blur stili çəngəl işarəsi)
      this._addForkSigns(b, p.curb);
    }
    // Mərkəz kəsik xətti
    this.group.add(this._dashes(p.curb));
    // Yol kənarı postları (yolun oxunaqlığı üçün)
    this.group.add(this._posts(p.curb));
    // Start/Finish tağı
    const arch = makeStartArch(this.halfWidth * 2, p.curb);
    const s = this.startPosition;
    arch.position.set(s.x, 0, s.z);
    arch.rotation.y = this.startHeading;
    this.group.add(arch);

    // Şahmat naxışlı start xətti
    const cc = document.createElement('canvas');
    cc.width = 128; cc.height = 16;
    const cctx = cc.getContext('2d');
    for (let yy = 0; yy < 2; yy++) {
      for (let xx = 0; xx < 16; xx++) {
        cctx.fillStyle = (xx + yy) % 2 === 0 ? '#f2f2f2' : '#17181e';
        cctx.fillRect(xx * 8, yy * 8, 8, 8);
      }
    }
    const checkTex = new THREE.CanvasTexture(cc);
    checkTex.colorSpace = THREE.SRGBColorSpace;
    const lineGroup = new THREE.Group();
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(this.halfWidth * 2, 2.4),
      new THREE.MeshStandardMaterial({ map: checkTex, roughness: 0.85 })
    );
    line.rotation.x = -Math.PI / 2;
    lineGroup.add(line);
    lineGroup.position.set(s.x, 0.043, s.z);
    lineGroup.rotation.y = this.startHeading;
    this.group.add(lineGroup);

    // Bayraq dirəkləri — tağın yanlarında
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xd8dce4, roughness: 0.6 });
    const flagMat = new THREE.MeshStandardMaterial({
      color: p.curb, emissive: p.curb, emissiveIntensity: 0.5, side: THREE.DoubleSide,
    });
    for (const side of [-1, 1]) {
      const off = (this.halfWidth + 2.6) * side;
      const px = s.x + this.normals[0].x * off;
      const pz = s.z + this.normals[0].z * off;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 5.2, 6), poleMat);
      pole.position.set(px, 2.6, pz);
      this.group.add(pole);
      // Üçbucaq bayraq
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0, 0, 0, -0.8, 0, 1.4, -0.4, 0,
      ], 3));
      fg.setIndex([0, 1, 2]);
      fg.computeVertexNormals();
      const flag = new THREE.Mesh(fg, flagMat);
      flag.position.set(px, 5.1, pz);
      flag.rotation.y = this.startHeading + Math.PI / 2;
      this.group.add(flag);
      this.obstacles.push({ x: px, z: pz, r: 0.45 });
    }
    // Tağ dirəkləri toqquşma siyahısına
    const n0 = this.normals[0];
    for (const side of [-1, 1]) {
      const off = (this.halfWidth + 1.2) * side;
      this.obstacles.push({ x: s.x + n0.x * off, z: s.z + n0.z * off, r: 0.9 });
    }

    return this.group;
  }

  get startPosition() {
    return this.points[0];
  }

  get startHeading() {
    const t = this.tangents[0];
    return Math.atan2(t.x, t.z);
  }

  // Kənardan-kənara lent (offsetInner..offsetOuter sol normal boyu) — əsas qapalı loop
  _ribbon(offA, offB, color, y, matOpts = {}) {
    return this._ribbonFor(this.points, this.normals, true, offA, offB, color, y, matOpts);
  }

  // Ümumi lent quruculuğu: istənilən nöqtə/normal ardıcıllığı (qapalı və ya açıq).
  // skipFn(pos) → true olan seqmentlər çəkilmir (qovşaqlarda curb kəsimi — təmiz Y-çəngəl)
  _ribbonFor(points, normals, closed, offA, offB, color, y, matOpts = {}, skipFn = null) {
    const geo = new THREE.BufferGeometry();
    const verts = [];
    const uvs = [];
    const idx = [];
    const n = points.length;
    const segs = closed ? n : n - 1;
    const midOff = (offA + offB) / 2;
    // Toxuma üçün UV: u — en boyu 0..1, v — uzunluq boyu (m-lə vurulur ki, təkrar olsun)
    const vScale = matOpts.uvMeters ? 1 / matOpts.uvMeters : 0;
    let vAcc = 0;
    for (let i = 0; i <= segs; i++) {
      const k = i % n;
      const c = points[k];
      const nrm = normals[k];
      const a = new THREE.Vector3().copy(c).addScaledVector(nrm, offA);
      const b = new THREE.Vector3().copy(c).addScaledVector(nrm, offB);
      verts.push(a.x, y, a.z, b.x, y, b.z);
      if (vScale) {
        uvs.push(0, vAcc * vScale, 1, vAcc * vScale);
        if (i < segs) vAcc += points[k].distanceTo(points[(k + 1) % n]);
      }
    }
    for (let i = 0; i < segs; i++) {
      if (skipFn) {
        const k = i % n;
        const c = points[k];
        const nrm = normals[k];
        const px = c.x + nrm.x * midOff;
        const pz = c.z + nrm.z * midOff;
        if (skipFn({ x: px, z: pz })) continue;
      }
      const o = i * 2;
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    if (uvs.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color,
        map: matOpts.map ?? null,
        roughness: matOpts.roughness ?? 0.9,
        metalness: 0,
        emissive: matOpts.emissive ?? 0x000000,
        emissiveMap: matOpts.emissiveMap ?? null,
        emissiveIntensity: matOpts.emissiveIntensity ?? 1,
        side: THREE.DoubleSide, // üz istiqamətindən asılı olmadan görünsün
      })
    );
    mesh.receiveShadow = true;
    return mesh;
  }

  // Mərkəz kəsik xətti — birbaşa əyri üzərində qurulur (heç vaxt əyri durmur).
  // Qovşaq zonalarında (şaxə səthi ilə üst-üstə düşən yerdə) kəsilir —
  // yoxsa xətt şaxənin üstündən diaqonal keçib çirkin görünür
  _dashes(color) {
    const skip = this.branches.length ? (pos) => this.isOnBranch(pos, 1.0) : null;
    return this._dashesFor(this.points, this.normals, true, color, skip);
  }

  _dashesFor(points, normals, closed, color, skipFn = null) {
    const verts = [];
    const idx = [];
    const n = points.length;
    const y = closed ? 0.04 : 0.032; // şaxə xətti bir az aşağı — qovşaqda əsas yol örtür
    const hw = 0.22; // xəttin yarım eni
    const step = Math.max(8, Math.floor(n / 80));
    const dashLen = Math.max(2, Math.floor(step * 0.45));
    let vi = 0;
    const end = closed ? n : n - dashLen - 1;
    for (let i = 0; i < end; i += step) {
      // Dash-ın həm başı, həm sonu təmiz zonada olmalıdır
      if (skipFn && (skipFn(points[i % n]) || skipFn(points[(i + dashLen) % n]))) continue;
      for (let k = 0; k <= dashLen; k++) {
        const j = (i + k) % n;
        const c = points[j];
        const nr = normals[j];
        verts.push(
          c.x + nr.x * hw, y, c.z + nr.z * hw,
          c.x - nr.x * hw, y, c.z - nr.z * hw
        );
      }
      for (let k = 0; k < dashLen; k++) {
        const o = vi + k * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
      vi += (dashLen + 1) * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color, roughness: 0.6, emissive: color, emissiveIntensity: 0.2, side: THREE.DoubleSide,
      })
    );
  }

  // Asfalt toxuması: noise səpintisi + iki təkər izi qaralması (rəng material tint-i ilə)
  _asphaltTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(0, 0, 256, 256);
    // AQREQAT: yaxın planda görünən çınqıl dənəsi — səth "plastik" olmasın
    for (let i = 0; i < 4200; i++) {
      const v = 108 + Math.floor(Math.random() * 62);
      ctx.fillStyle = `rgba(${v},${v},${v},0.22)`;
      const r = 1 + Math.random() * 1.8;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, r, r);
    }
    // İRİ LƏKƏLƏR: təmir yamaqları / köhnəlmiş sahələr (təkrar hiss olunmasın)
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      const rad = 18 + Math.random() * 46;
      const g2 = ctx.createRadialGradient(x, y, 2, x, y, rad);
      const tünd = Math.random() < 0.5;
      g2.addColorStop(0, tünd ? 'rgba(96,96,102,0.20)' : 'rgba(168,168,174,0.16)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
    }
    // Təkər izləri: u oxu yolun eni — iki tünd zolaq
    for (const u of [0.30, 0.70]) {
      const g = ctx.createLinearGradient((u - 0.10) * 256, 0, (u + 0.10) * 256, 0);
      g.addColorStop(0, 'rgba(30,30,34,0)');
      g.addColorStop(0.5, 'rgba(30,30,34,0.16)');
      g.addColorStop(1, 'rgba(30,30,34,0)');
      ctx.fillStyle = g;
      ctx.fillRect((u - 0.10) * 256, 0, 0.2 * 256, 256);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Curb toxuması: klassik yarış zolaqları (trek rəngi + ağ, v boyu növbələşir)
  _curbTexture(curbColor) {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#' + curbColor.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, 8, 32);
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 32, 8, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Ayrılma nöqtəsində "gore" lövhəsi: yollar tam ayrılan yerdə, sürücüyə baxan
  // işıqlı ikili-ox paneli — hansı nöqtədə seçim etdiyini uzaqdan göstərir
  _addForkSigns(b, accent) {
    // Pazın içində ETİBARLI yer axtar: namizəd nöqtə HEÇ BİR yol səthinə
    // düşməməlidir (yoxlama ilə) — tapılana qədər şaxə boyu irəli sürüşdürülür
    let cx = null, cz = null, tg = null;
    for (let k = 8; k < b.points.length - 8; k++) {
      const near = this.getNearest(b.points[k]);
      const gap = Math.abs(near.lateral) - (this.halfWidth + b.halfWidth);
      if (gap < 6) continue;
      const bp = b.points[k];
      const mp = this.points[near.index];
      const ux = bp.x - mp.x, uz = bp.z - mp.z;
      const uLen = Math.hypot(ux, uz) || 1;
      const edgeA = this.halfWidth + 0.9;        // əsas yolun kənarı (curb daxil)
      const edgeB = uLen - b.halfWidth - 0.8;    // şaxənin iç kənarı
      const mid = (edgeA + edgeB) / 2;
      const px = mp.x + (ux / uLen) * mid;
      const pz = mp.z + (uz / uLen) * mid;
      // TƏSDİQ: lövhə nə əsas yolda, nə şaxədə olsun (1.6m təhlükəsizlik payı)
      if (this._onMainRoad({ x: px, z: pz }, 1.6)) continue;
      if (this.isOnBranch({ x: px, z: pz }, 1.6)) continue;
      cx = px; cz = pz; tg = this.tangents[near.index];
      // QISAYOL QAPISI: girişdə şaxə kənarlarında iki qısa dirək ("gizli yol" işarəsi)
      this._branchGate(b, k, accent);
      break;
    }
    if (cx === null) return;

    const sign = new THREE.Group();
    // Panel: tünd lövhə + parlaq ayrılan oxlar (canvas toxuması)
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#14161e';
    ctx.fillRect(0, 0, 256, 128);
    const col = '#' + accent.toString(16).padStart(6, '0');
    ctx.strokeStyle = col;
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Ayrılan iki ox: ▲ formasında sola və sağa
    for (const dir of [-1, 1]) {
      const x0 = 128 + dir * 18;
      ctx.beginPath();
      ctx.moveTo(x0, 100);
      ctx.lineTo(x0 + dir * 52, 42);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0 + dir * 52 - dir * 26, 34);
      ctx.lineTo(x0 + dir * 52, 42);
      ctx.lineTo(x0 + dir * 52 - dir * 4, 70);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 5;
    ctx.strokeRect(5, 5, 246, 118);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1.3, 0.14),
      new THREE.MeshStandardMaterial({
        map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.55,
      })
    );
    panel.position.y = 1.75;
    sign.add(panel);
    // Dayaqlar
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2c2f3a, roughness: 0.8 });
    for (const sx of [-0.9, 0.9]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.2, 0.16), legMat);
      leg.position.set(sx, 0.6, 0);
      sign.add(leg);
    }
    sign.position.set(cx, 0, cz);
    // Sürücüyə baxsın (gedişata əks üz)
    sign.rotation.y = Math.atan2(tg.x, tg.z) + Math.PI;
    this.group.add(sign);
    this.obstacles.push({ x: cx, z: cz, r: 1.0 });
  }

  // Şaxə girişində qapı dirəkləri — kiçik bayraqlı sütunlar
  _branchGate(b, k, accent) {
    const bp = b.points[k];
    const bn = b.normals[k];
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f3a, roughness: 0.8 });
    const capMat = new THREE.MeshStandardMaterial({
      color: accent, emissive: accent, emissiveIntensity: 0.9,
    });
    for (const side of [-1, 1]) {
      const px = bp.x + bn.x * (b.halfWidth + 1.1) * side;
      const pz = bp.z + bn.z * (b.halfWidth + 1.1) * side;
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 0.3), poleMat);
      pole.position.set(px, 1.1, pz);
      this.group.add(pole);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), capMat);
      cap.position.set(px, 2.4, pz);
      this.group.add(cap);
      this.obstacles.push({ x: px, z: pz, r: 0.5 });
    }
  }

  // Yol kənarı postları — hər iki tərəfdə, bərabər aralıqla
  _posts(accent) {
    const g = new THREE.Group();
    const postGeo = new THREE.BoxGeometry(0.28, 1.0, 0.28);
    const capGeo = new THREE.BoxGeometry(0.32, 0.3, 0.32);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.7 });
    const capMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.6 });
    const step = Math.max(8, Math.floor(this.N / 46));
    const off = this.halfWidth + 1.6;
    for (let i = 0; i < this.N; i += step) {
      const c = this.points[i];
      const nrm = this.normals[i];
      for (const side of [-1, 1]) {
        const px = c.x + nrm.x * off * side;
        const pz = c.z + nrm.z * off * side;
        // Şaxə qovşağının ağzını bağlamasın
        if (this.branches.length && this.isOnBranch({ x: px, z: pz }, 2.0)) continue;
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(px, 0.5, pz);
        post.castShadow = true;
        g.add(post);
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set(post.position.x, 1.1, post.position.z);
        g.add(cap);
        // Postların toqquşması
        this.obstacles.push({ x: post.position.x, z: post.position.z, r: 0.5 });
      }
    }
    // PERFORMANS: ~180 post mesh-i 2 mesh-ə birləşdirilir
    return mergeStaticGroup(g);
  }

  // Ən yaxın nöqtəni tap → { index, t(0..1), lateral(işarəli), onRoad }
  getNearest(position, hint = null) {
    let best = -1;
    let bestD = Infinity;
    const search = hint != null;
    const range = search ? 40 : this.N;
    const start = search ? hint - 8 : 0;
    for (let s = 0; s < range; s++) {
      const i = ((start + s) % this.N + this.N) % this.N;
      const p = this.points[i];
      const dx = position.x - p.x;
      const dz = position.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    const c = this.points[best];
    const nrm = this.normals[best];
    const v = new THREE.Vector3(position.x - c.x, 0, position.z - c.z);
    const lateral = v.dot(nrm);
    return {
      index: best,
      t: best / this.N,
      lateral,
      onRoad: Math.abs(lateral) <= this.halfWidth + 0.5,
    };
  }

  // AI üçün lookahead hədəf nöqtəsi
  getWaypoint(index, ahead = 12, sideOffset = 0) {
    const i = (index + ahead) % this.N;
    const p = this.points[i];
    if (sideOffset === 0) return p.clone();
    return p.clone().addScaledVector(this.normals[i], sideOffset);
  }

  pointAt(index) {
    return this.points[((index % this.N) + this.N) % this.N];
  }

  // Yarış üçün start pilləkəni: yolun əyrisi boyunca geriyə, 2 sütun
  getGridSlots(count) {
    const slots = [];
    const step = this.length / this.N; // bir indeksin qövs uzunluğu
    const rowGap = 9;
    const colOff = this.halfWidth * 0.4;
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2 === 0 ? 1 : -1;
      const dist = 6 + row * rowGap;
      const idx = ((this.N - Math.round(dist / step)) % this.N + this.N) % this.N;
      const t = this.tangents[idx];
      const pos = this.points[idx].clone().addScaledVector(this.normals[idx], col * colOff);
      slots.push({ position: pos, heading: Math.atan2(t.x, t.z) });
    }
    return slots;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
  }
}
