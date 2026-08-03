import * as THREE from 'three';
import { makeDecor, makeLamp, flatMat, makeTireStack, makeBarrier,
  makeGrandstand, makeFloodlight, makeMarshalPost, makeSponsorBoard, makeBunting } from '../core/AssetFactory.js';
import { mergeStaticGroup } from '../core/MergeUtils.js';
import { sharedNature, NATURE_BY_TRACK } from './NatureKit.js';

// Səhnə mühiti: göy, fog, IBL env-map, işıqlar, yer, uzaq relyef və dekor.
export class Environment {
  // Kenney modelləri (CC0) — prosedural konus/dodekaedrdən qat-qat keyfiyyətli.
  // Yüklənmə asinxrondur: hazır olmayanda prosedural dekor işləyir, hazır
  // olan kimi TƏBİƏT qatı əlavə olunur (yenidən qurulma yoxdur).
  constructor(scene, trackData, track, renderer = null) {
    this.scene = scene;
    this.data = trackData;
    this.track = track;
    this.renderer = renderer;
    this.objects = [];
    this._build();
  }

  // YER BOŞDURMU: yeni obyekt mövcud heç bir maneə ilə kəsişməməlidir.
  // Bunsuz iri obyektlər (bina, mesa, təpə, tribuna) bir-birinin İÇİNDƏN
  // çıxırdı (istifadəçi rəyi: şəhər trekində tribunalar üst-üstə düşür).
  _free(x, z, r, pad = 1.2) {
    return !this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + pad);
  }

  _build() {
    const p = this.data.palette;
    this.obstacles = []; // { x, z, r } — bütün bərk obyektlər (toqquşma üçün)

    // Trek-üzrə rəng qradasiyası (exposure) — hər xəritənin öz "saat/hava" hissi
    if (this.renderer) this.renderer.toneMappingExposure = p.exposure ?? 1.15;

    // Fon + fog
    this.scene.background = new THREE.Color(p.sky);
    this.scene.fog = new THREE.Fog(p.fog, p.fogNear ?? 90, p.fogFar ?? 460);

    // Göy günbəzi (3 dayaqlı qradient + üfüq işıq zolağı — dərinlik hissinin açarı)
    const skyTex = this._skyTexture(p);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(760, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    this.scene.add(sky);
    this._track(sky);

    // Günəş / Ay diski + halo — səhnəyə fokus nöqtəsi verir
    this._celestialBody(p);
    // Gecə trekində ulduzlar
    if (p.night) this._stars();

    // IBL — materialları canlandırır (parıltı, dolğun rəng).
    // KEŞ: PMREM hər səhnə açılışında 3 daxili tekstura yaradırdı və
    // pmrem.dispose() onları tam azad etmirdi (ölçüldü: 8 dövrdə 23 → 50
    // tekstura). Xəritə YALNIZ trek palitrasından asılıdır → trek üzrə bir
    // dəfə qurulur, sonra paylaşılır. Yan fayda: səhnə açılışı sürətlənir.
    if (this.renderer) {
      const key = this.data.id || 'default';
      if (!Environment._envCache) Environment._envCache = new Map();
      let envTex = Environment._envCache.get(key);
      if (!envTex) {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const rt = pmrem.fromEquirectangular(skyTex);
        envTex = rt.texture;
        envTex.userData = { shared: true };   // səhnə təmizləməsi toxunmasın
        pmrem.dispose();
        Environment._envCache.set(key, envTex);
      }
      this.scene.environment = envTex;
      this.scene.environmentIntensity = 0.6;
      this._envRT = null;   // keşlənmiş — bu səhnəyə aid deyil
    }

    // İşıqlar (palitra intensivlikləri ilə tənzimlənə bilir)
    const hemi = new THREE.HemisphereLight(p.sky, p.ambient ?? 0x444444, p.hemiIntensity ?? 0.9);
    this.scene.add(hemi);
    this._track(hemi);

    const sun = new THREE.DirectionalLight(p.sun ?? 0xffffff, p.sunIntensity ?? 1.25);
    sun.position.set(60, 110, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -70; cam.right = 70; cam.top = 70; cam.bottom = -70;
    cam.near = 10; cam.far = 320;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun; // GameplayScene oyunçunu izlətmək üçün istifadə edir
    this._track(sun);

    // Dolğun (fill) işıq — arxa üzlər qaralmasın
    const fill = new THREE.DirectionalLight(p.sun ?? 0xffffff, 0.45);
    fill.position.set(-110, 90, -80);
    this.scene.add(fill);
    this._track(fill);

    const amb = new THREE.AmbientLight(0xffffff, p.ambientIntensity ?? 0.32);
    this.scene.add(amb);
    this._track(amb);

    // Yer — incə noise toxuması ilə (düz rəngin "plastik" görkəmi itir)
    const groundTex = this._noiseTexture();
    groundTex.repeat.set(30, 30);
    // ƏVVƏL: tək CircleGeometry (mərkəzdən 64 üçbucaq) — tamamilə düz və
    // tək rəngli səth. Uzaqdan "plastik masa" kimi görünürdü.
    // İNDİ: şəbəkəli halqa + VERTEX RƏNGİ (iri miqyaslı ləkələr, təkrarsız)
    // + trekdən uzaqda yüngül relyef dalğası. Draw call artmır (tək mesh),
    // yalnız vertex sayı 65 → ~3 600 (yüklənmə vaxtı ~10 ms).
    const gGeo = new THREE.RingGeometry(0.4, 720, 128, 26);
    {
      const pos = gGeo.attributes.position;
      const col = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
      const tmp = new THREE.Vector3();
      const baza = new THREE.Color(p.ground);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);   // düzlük XY-dədir
        const wx = x, wz = -y;                     // döndərmədən sonra dünya
        // Trekə yaxın hissə TAM DÜZ qalır (maşın kəsişməsin)
        tmp.set(wx, 0, wz);
        const yan = Math.abs(this.track.getNearest(tmp).lateral);
        const uzaq = Math.max(0, Math.min(1, (yan - 34) / 90));
        const dalğa = Math.sin(wx * 0.011 + 1.3) * Math.cos(wz * 0.009 - 0.7)
          + Math.sin((wx + wz) * 0.021 + 2.1) * 0.5;
        pos.setZ(i, dalğa * 1.7 * uzaq);           // ±1.7 m, yalnız uzaqda
        // Rəng: üç oktava alçaq tezlik → təkrarlanmayan ləkələr
        const n1 = Math.sin(wx * 0.006 + 0.4) * Math.cos(wz * 0.0052 - 1.1);
        const n2 = Math.sin((wx * 0.7 + wz) * 0.013 + 2.4);
        const n3 = Math.sin(wx * 0.026 - wz * 0.019 + 4.1);
        const k = 0.955 + (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) * 0.075;
        col.setXYZ(i, baza.r * k, baza.g * k, baza.b * k * (1 + n2 * 0.02));
      }
      gGeo.setAttribute('color', col);
      gGeo.computeVertexNormals();
    }
    const ground = new THREE.Mesh(
      gGeo,
      new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0,
        vertexColors: true, flatShading: true })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this._track(ground);

    // Kənar halqa (daha tünd, dərinlik hissi)
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(200, 720, 64),
      new THREE.MeshStandardMaterial({ color: p.groundEdge ?? p.ground, map: groundTex, roughness: 1 })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = -0.01;
    rim.receiveShadow = true;
    this.scene.add(rim);
    this._track(rim);

    // Dəniz sahili varsa, dağ halqası hesablamadan ƏVVƏL bilinməlidir
    if (this.data.sea) this._seaCoast = this.track.maxRadius + 20;
    this._distant();
    this._clouds();
    if (this.data.sea) this._sea();
    if (this.data.id === 'canyon') this._canyonWalls();
    if (['desert', 'alpine', 'riviera'].includes(this.data.id)) this._hills();
    if (this.data.id === 'neon') this._billboards();
    this._tracksideProps(); // şin qüllələri + bariyerlər — peşəkar trek görkəmi
    if (this.data.river) this._river(this.data.river);
    this._scatterDecor();
    this._nearDetail();     // yaxın plan: ot dəstələri, çınqıl, kol — dərinlik
    this._natureLayer();    // Kenney modelləri (asinxron — hazır olanda əlavə olunur)
    this._trackside();      // tribuna, projektor, marşal, sponsor, bayraq
    this._autoObstacles();   // təhlükəsizlik toru — bax aşağı
    // Gecə trekində yol küçə lampaları ilə işıqlanır
    if (this.data.roadLamps) this._roadLamps();
  }

  // Yol boyunca küçə lampaları (növbəli tərəflərdə)
  _roadLamps() {
    const g = new THREE.Group();
    const N = this.track.N;
    const step = Math.max(10, Math.floor(N / 30));
    const off = this.track.halfWidth + 3.4;
    // Trekə uyğun lampa rəngləri (default: neon cütlüyü)
    const colors = this.data.palette.lampColors ?? [0x34e0ff, 0xff3d8a];
    let side = 1;
    let ci = 0;
    for (let i = 0; i < N; i += step) {
      const p = this.track.points[i];
      const n = this.track.normals[i];
      // Performans: hər 3-cü lampada real işıq, qalanı emissive parıltı
      const lamp = makeLamp(colors[ci % colors.length], ci % 3 === 0);
      const lx = p.x + n.x * off * side, lz = p.z + n.z * off * side;
      lamp.position.set(lx, 0, lz);
      g.add(lamp);
      this.obstacles.push({ x: lx, z: lz, r: 0.55 });   // dirək bərkdir
      side *= -1;
      ci++;
    }
    this.scene.add(g);
    this._track(g);
  }

  // Uzaq relyef — dağlar / şəhər silueti
  _distant() {
    const g = new THREE.Group();
    const id = this.data.id;
    const base = this.track.maxRadius + 90; // trekdən kənarda
    if (id === 'neon') {
      for (let i = 0; i < 70; i++) {
        const a = (i / 70) * Math.PI * 2 + Math.random() * 0.06;
        const r = base + Math.random() * 150;
        const h = 30 + Math.random() * 110;
        const w = 12 + Math.random() * 22;
        const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
        if (!this._free(bx, bz, w * 0.72)) continue;
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), flatMat(0x0a0f22, { roughness: 0.9 }));
        b.position.set(bx, h / 2 - 8, bz);
        g.add(b);
        this.obstacles.push({ x: b.position.x, z: b.position.z, r: w * 0.72 });
        // bəzi binalarda neon zolaq
        if (Math.random() < 0.5) {
          const neon = [0x34e0ff, 0xff3d8a, 0xffd257][Math.floor(Math.random() * 3)];
          const strip = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.8, h * 0.5, 0.4),
            new THREE.MeshStandardMaterial({ color: neon, emissive: neon, emissiveIntensity: 2.0, flatShading: true })
          );
          strip.position.set(Math.cos(a) * r, h / 2 - 8, Math.sin(a) * r + w / 2);
          g.add(strip);
        }
      }
    } else {
      // Trekə uyğun dağ silueti rəngi
      const mountainColor = {
        desert: 0xbc7c42, alpine: 0x556878, canyon: 0x6b3550, riviera: 0x8a5f86,
      }[id] ?? 0x556878;
      // HAVA PERSPEKTİVİ: uzaq pillələr duman rənginə qarışır (3 pillə —
      // hər pillə bir materiala düşür ki, merge pozulmasın → cəmi 3 draw call)
      const fogC = new THREE.Color(this.data.palette.fog);
      const tiers = [0.18, 0.42, 0.62].map((k) =>
        flatMat(new THREE.Color(mountainColor).lerp(fogC, k).getHex(), { roughness: 1 }));
      for (let i = 0; i < 52; i++) {
        const a = (i / 52) * Math.PI * 2 + Math.random() * 0.08;
        // Dəniz tərəfi (cənub) açıq qalır — sahil üfüqü
        if (this._seaCoast && Math.sin(a) < -0.45) continue;
        const tier = i % 3;
        const r = base + 20 + tier * 85 + Math.random() * 55;
        const h = 55 + tier * 22 + Math.random() * 95;
        const rad = 45 + Math.random() * 45;
        const m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 5), tiers[tier]);
        m.position.set(Math.cos(a) * r, h / 2 - 12, Math.sin(a) * r);
        m.rotation.y = Math.random() * 6;
        g.add(m);
        this.obstacles.push({ x: m.position.x, z: m.position.z, r: rad * 0.6 });
        if (id === 'alpine' && h > 90) {
          const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.42, h * 0.32, 5), flatMat(0xf2f7ff));
          cap.position.set(Math.cos(a) * r, h / 2 - 12 + h * 0.34, Math.sin(a) * r);
          cap.rotation.y = m.rotation.y;
          g.add(cap);
        }
      }
    }
    // PERFORMANS: uzaq relyef bir neçə mesh-ə birləşdirilir
    const merged = mergeStaticGroup(g);
    g.traverse((o) => o.geometry?.dispose?.());
    this.scene.add(merged);
    this._track(merged);
  }

  // Buludlar: TƏK InstancedMesh (1 draw call), çox yavaş orbit dreyfi
  _clouds() {
    const p = this.data.palette;
    if (p.night) return; // gecə səmasında ulduzlar var
    // Şablon: 4 yumru topa birləşir
    const puffs = [];
    const mk = (x, y, z, s) => {
      const g = new THREE.IcosahedronGeometry(1, 0);
      g.scale(s, s * 0.62, s * 0.8);
      g.translate(x, y, z);
      return g;
    };
    puffs.push(mk(0, 0, 0, 1.6), mk(1.7, -0.2, 0.3, 1.15), mk(-1.6, -0.15, -0.2, 1.05), mk(0.4, 0.55, -0.4, 0.95));
    // sadə birləşdirmə: BufferGeometryUtils-siz — qrupu klonlaya bilmərik,
    // ona görə hər puff ayrı instans atributu yox, geometry-ləri əl ilə birləşdiririk
    const totalVerts = puffs.reduce((n, g) => n + g.attributes.position.count, 0);
    const pos = new Float32Array(totalVerts * 3);
    let off = 0;
    const idx = [];
    for (const g of puffs) {
      pos.set(g.attributes.position.array, off * 3);
      const gi = g.index ? Array.from(g.index.array) : [...Array(g.attributes.position.count).keys()];
      for (const ii of gi) idx.push(ii + off);
      off += g.attributes.position.count;
      g.dispose();
    }
    const cloudGeo = new THREE.BufferGeometry();
    cloudGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    cloudGeo.setIndex(idx);
    cloudGeo.computeVertexNormals();
    const cloudColor = new THREE.Color(0xffffff).lerp(new THREE.Color(p.skyBottom ?? p.sky), 0.16);
    const mat = new THREE.MeshStandardMaterial({
      color: cloudColor, flatShading: true, roughness: 1, metalness: 0,
      // Kölgəli üzlər qaralmasın — buludlar yumşaq və işıqlı qalsın
      emissive: cloudColor, emissiveIntensity: 0.42,
    });
    const n = 16;
    const mesh = new THREE.InstancedMesh(cloudGeo, mat, n);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const r = 160 + Math.random() * (this.track.maxRadius + 220);
      const s = 9 + Math.random() * 11;
      e.set(0, Math.random() * 6, 0);
      q.setFromEuler(e);
      m4.compose(
        new THREE.Vector3(Math.cos(a) * r, 95 + Math.random() * 65, Math.sin(a) * r),
        q,
        new THREE.Vector3(s, s, s)
      );
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    this._cloudMesh = mesh;
    this._track(mesh);
  }

  // Dəniz (cənub üfüqü): su səthi + sahil köpüyü + adalar + mayak
  _sea() {
    const p = this.data.palette;
    const coast = this._seaCoast;
    const seaC = new THREE.Color(0x2b8fae).lerp(new THREE.Color(p.fog), 0.12);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(1700, 720),
      new THREE.MeshStandardMaterial({
        color: seaC, roughness: 0.32, metalness: 0,
        emissive: seaC, emissiveIntensity: 0.14,
      })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.012, -(coast + 360));
    this.scene.add(sea);
    this._track(sea);
    // Sahil köpük xətti
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(1700, 2.6),
      new THREE.MeshBasicMaterial({ color: 0xf2f7f2, transparent: true, opacity: 0.55 })
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(0, 0.02, -coast);
    this.scene.add(foam);
    this._track(foam);
    // Uzaq adalar (dumanlı siluet)
    const islandMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x8a5f86).lerp(new THREE.Color(p.fog), 0.55),
      flatShading: true, roughness: 1,
    });
    for (const [ix, iz, s] of [[-260, coast + 150, 26], [180, coast + 210, 34], [420, coast + 120, 20]]) {
      const isl = new THREE.Mesh(new THREE.ConeGeometry(s, s * 0.7, 5), islandMat);
      isl.position.set(ix, s * 0.18, -iz);
      this.scene.add(isl);
      this._track(isl);
    }
    // Mayak — sahildə landmark
    this._lighthouse(90, -(coast + 6));
  }

  _lighthouse(x, z) {
    const g = new THREE.Group();
    // Zolaqlı gövdə (canvas toxuma)
    const c = document.createElement('canvas');
    c.width = 8; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f2ede4';
    ctx.fillRect(0, 0, 8, 64);
    ctx.fillStyle = '#c4392e';
    ctx.fillRect(0, 0, 8, 16);
    ctx.fillRect(0, 32, 8, 16);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.3, 13, 10),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })
    );
    tower.position.y = 6.5;
    tower.castShadow = true;
    g.add(tower);
    // Fənər başlığı
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 1.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd257, emissiveIntensity: 1.6 })
    );
    lamp.position.y = 13.9;
    g.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.2, 8), flatMat(0xc4392e));
    cap.position.y = 15.1;
    g.add(cap);
    // Daş özül
    const baseRock = new THREE.Mesh(new THREE.DodecahedronGeometry(4, 0), flatMat(0x8a8276));
    baseRock.scale.set(1.4, 0.5, 1.2);
    baseRock.position.y = -0.4;
    g.add(baseRock);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this._track(g);
    this.obstacles.push({ x, z, r: 4.5 });
  }

  // Kanyon dərə divarları: yolu "sıxan" mesa cütlükləri + qaya tağı
  _canyonWalls() {
    const g = new THREE.Group();
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const wallMats = [flatMat(0x8a4a34, { roughness: 1 }), flatMat(0x7a3e2c, { roughness: 1 })];
    const N = this.track.N;
    // Şaxə zonalarından (0.055-0.262, 0.548-0.707) və startdan kənar nöqtələr
    for (const [wi, t] of [0.33, 0.40, 0.46, 0.80, 0.90].entries()) {
      const i = Math.round(t * N) % N;
      const c = this.track.points[i];
      const n = this.track.normals[i];
      for (const side of [-1, 1]) {
        const off = this.track.halfWidth + 10 + Math.random() * 5;
        const sx = 6 + Math.random() * 3.5;
        const sy = 9 + Math.random() * 6;
        const mesa = new THREE.Mesh(rockGeo, wallMats[(wi + (side > 0 ? 1 : 0)) % 2]);
        mesa.scale.set(sx, sy, sx * 0.8);
        mesa.position.set(c.x + n.x * off * side, sy * 0.35, c.z + n.z * off * side);
        mesa.rotation.y = Math.random() * 6;
        if (!this._free(mesa.position.x, mesa.position.z, sx * 0.85)) continue;
        g.add(mesa);
        this.obstacles.push({ x: mesa.position.x, z: mesa.position.z, r: sx * 0.85 });
      }
    }
    // QAYA TAĞI — yol tağın altından keçir (landmark)
    const ti = Math.round(0.86 * N) % N;
    const c = this.track.points[ti];
    const n = this.track.normals[ti];
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(rockGeo, wallMats[0]);
      pillar.scale.set(3.2, 9.5, 3.2);
      pillar.position.set(
        c.x + n.x * (this.track.halfWidth + 3.2) * side, 3.4,
        c.z + n.z * (this.track.halfWidth + 3.2) * side
      );
      g.add(pillar);
      if (this._free(pillar.position.x, pillar.position.z, 2.8, 0.5)) {
        this.obstacles.push({ x: pillar.position.x, z: pillar.position.z, r: 2.8 });
      }
    }
    const lintel = new THREE.Mesh(rockGeo, wallMats[1]);
    lintel.scale.set(this.track.halfWidth + 6.5, 2.6, 4.2);
    lintel.position.set(c.x, 9.6, c.z);
    lintel.rotation.z = 0.06;
    lintel.rotation.y = Math.atan2(this.track.tangents[ti].x, this.track.tangents[ti].z) + Math.PI / 2;
    g.add(lintel);
    const merged = mergeStaticGroup(g);
    g.traverse((o) => o.geometry?.dispose?.());
    this.scene.add(merged);
    this._track(merged);
  }

  // Orta qat relyefi: yumru təpələr (dərinlik + təbiilik)
  _hills() {
    const g = new THREE.Group();
    const p = this.data.palette;
    const base = new THREE.Color(p.ground);
    const mats = [
      new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.86), flatShading: true, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.74), flatShading: true, roughness: 1 }),
    ];
    let placed = 0;
    for (let i = 0; i < 40 && placed < 12; i++) {
      const r = 13 + Math.random() * 13;
      const pos = this._freeSpot(r + 6, this.track.maxRadius * 0.5, this.track.maxRadius + 60);
      if (!pos) continue;
      // Dəniz sahilinə düşməsin
      if (this._seaCoast && pos.z < -(this._seaCoast - 30)) continue;
      // Göl/çay maneələri ilə toqquşmasın
      let clash = false;
      for (const o of this.obstacles) {
        if (o.r > 5 && Math.hypot(o.x - pos.x, o.z - pos.z) < o.r + r + 4) { clash = true; break; }
      }
      if (clash) continue;
      const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mats[placed % 2]);
      hill.scale.y = 0.32;
      hill.position.set(pos.x, -r * 0.06, pos.z);
      hill.rotation.y = Math.random() * 6;
      if (!this._free(pos.x, pos.z, r * 0.8)) continue;
      g.add(hill);
      this.obstacles.push({ x: pos.x, z: pos.z, r: r * 0.8 });
      placed++;
    }
    const merged = mergeStaticGroup(g);
    g.traverse((o) => o.geometry?.dispose?.());
    this.scene.add(merged);
    this._track(merged);
  }

  // Yol kənarı yarış rekvizitləri: döngələrdə şin qüllələri və zolaqlı bariyerlər
  _tracksideProps() {
    const g = new THREE.Group();
    const N = this.track.N;
    const hw = this.track.halfWidth;
    for (let i = 0; i < N; i += 5) {
      const t0 = this.track.tangents[i];
      const t1 = this.track.tangents[(i + 4) % N];
      const cross = t0.x * t1.z - t0.z * t1.x; // döngə şiddəti/istiqaməti
      const curved = Math.abs(cross) > 0.1;
      if (!curved && Math.random() > 0.14) continue;
      const side = curved ? (cross > 0 ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1); // döngənin bayır tərəfi
      const c = this.track.points[i];
      const n = this.track.normals[i];
      const off = hw + 2.1 + Math.random() * 1.5;
      const tyre = Math.random() < 0.55;
      const obj = tyre ? makeTireStack() : makeBarrier();
      const ox = c.x + n.x * off * side, oz = c.z + n.z * off * side;
      obj.position.set(ox, 0, oz);
      obj.rotation.y = Math.atan2(t0.x, t0.z);
      if (!this._free(ox, oz, tyre ? 1.35 : 1.7, 0.6)) continue;
      g.add(obj);
      // Trek kənarı maneələri toqquşma siyahısına DÜŞMÜRDÜ — təkər yığınının
      // və baryerin içindən keçmək olurdu (fiziki testlə təsdiqləndi)
      this.obstacles.push({ x: ox, z: oz, r: tyre ? 1.35 : 1.7 });
    }
    const merged = mergeStaticGroup(g);
    g.traverse((o) => o.geometry?.dispose?.());
    this.scene.add(merged);
    this._track(merged);
  }

  // Neon reklam lövhələri — yol boyu böyük işıqlı panellər
  _billboards() {
    const texts = [
      ['NITROVERSE', '#34e0ff'], ['DRIFT', '#ff3d8a'], ['TURBO', '#ffd257'],
      ['NEON', '#b44bff'], ['GO GO', '#46d47e'],
    ];
    const N = this.track.N;
    for (const [bi, t] of [0.12, 0.30, 0.52, 0.70, 0.88].entries()) {
      const i = Math.round(t * N) % N;
      const c = this.track.points[i];
      const n = this.track.normals[i];
      const side = bi % 2 === 0 ? 1 : -1;
      const off = this.track.halfWidth + 7 + Math.random() * 3;
      const [txt, col] = texts[bi % texts.length];
      // Canvas paneli
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 96;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#0a0d1c';
      ctx.fillRect(0, 0, 256, 96);
      ctx.strokeStyle = col;
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, 244, 84);
      // Mətn çərçivəyə sığsın — uzun ad (məs. NITROVERSE) kəsilirdi
      let size = 52;
      const fit = (s) => { ctx.font = `900 ${s}px Rajdhani, Arial Black, sans-serif`; };
      fit(size);
      while (ctx.measureText(txt).width > 232 && size > 20) fit(--size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = col;
      ctx.fillText(txt, 128, 52);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(8.5, 3.2, 0.3),
        new THREE.MeshStandardMaterial({
          map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.1, roughness: 0.6,
        })
      );
      const px = c.x + n.x * off * side;
      const pz = c.z + n.z * off * side;
      panel.position.set(px, 6.2, pz);
      const tg = this.track.tangents[i];
      panel.rotation.y = Math.atan2(tg.x, tg.z) + Math.PI / 2 + (side > 0 ? Math.PI : 0);
      this.scene.add(panel);
      this._track(panel);
      // Dayaqlar
      const legMat = flatMat(0x1b1e2b);
      for (const lx of [-3.4, 3.4]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.2, 0.35), legMat);
        leg.position.set(
          px + Math.cos(panel.rotation.y) * lx, 3.1,
          pz - Math.sin(panel.rotation.y) * lx
        );
        this.scene.add(leg);
        this._track(leg);
      }
      if (this._free(px, pz, 2.2, 0.8)) this.obstacles.push({ x: px, z: pz, r: 2.2 });
    }
  }

  // İncə boz noise toxuması (material rəngi tint edir)
  _noiseTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#909090';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const v = 128 + Math.floor((Math.random() - 0.5) * 26);
      ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Çay: trekin altından keçir (körpü ilə), daxili qolu gölə tökülür
  _river(def) {
    const p = this.data.palette;
    const N = this.track.N;
    const i0 = Math.round((def.t ?? 0.5) * N) % N;
    const c = this.track.points[i0];
    const tg = this.track.tangents[i0];
    const nrm = this.track.normals[i0];
    const half = (def.width ?? 12) / 2;
    const maxR = this.track.maxRadius + 170;
    const waterC = new THREE.Color(def.color ?? 0x3fa8c8);

    // Qol qurucusu: körpüdən kənara, meander ilə; yol yaxınlığında göllə bitir
    const buildArm = (dir) => {
      const pts = [];
      let lake = false;
      for (let s = 0; s <= 460; s += 7) {
        const mx = Math.sin(s * 0.04) * 9;
        const pos = new THREE.Vector3(
          c.x + nrm.x * s * dir + tg.x * mx, 0,
          c.z + nrm.z * s * dir + tg.z * mx
        );
        if (Math.hypot(pos.x, pos.z) > maxR) break;
        if (s > 34) {
          const near = this.track.getNearest(pos);
          if (Math.abs(near.lateral) < this.track.halfWidth + 16 ||
              this.track.isOnBranch?.(pos, 14)) { lake = true; pts.push(pos); break; }
        }
        pts.push(pos);
      }
      return { pts, lake };
    };
    const armA = buildArm(1);
    const armB = buildArm(-1);
    // GÖL YOLA DAŞMASIN: göl mərkəzi üçün qol boyu GERİYƏ gedərək yoldan
    // (göl radiusu + pay) qədər uzaq nöqtə tapılır; çay həmin nöqtəyə qədər kəsilir
    for (const arm of [armA, armB]) {
      if (!arm.lake || arm.pts.length < 4) continue;
      arm.R = 15 + Math.random() * 6;
      const need = this.track.halfWidth + arm.R * 1.55 + 4;
      let ji = -1;
      for (let j = arm.pts.length - 1; j >= 3; j--) {
        const near = this.track.getNearest(arm.pts[j]);
        if (Math.abs(near.lateral) >= need &&
            !(this.track.isOnBranch?.(arm.pts[j], need - this.track.halfWidth))) { ji = j; break; }
      }
      if (ji < 0) { arm.lake = false; continue; }
      arm.pts = arm.pts.slice(0, ji + 1); // çay gölə tökülür, yola çatmır
    }
    const pts = [...armB.pts.slice(1).reverse(), c.clone(), ...armA.pts.slice(1)];
    if (pts.length < 4) return;

    // Lent qurucusu (su + sahil zolaqları)
    const strip = (width, y, mat) => {
      const verts = [];
      const idx = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const t = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
        const n = new THREE.Vector3(t.z, 0, -t.x);
        verts.push(
          pts[i].x + n.x * width, y, pts[i].z + n.z * width,
          pts[i].x - n.x * width, y, pts[i].z - n.z * width
        );
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const o = i * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, mat);
    };
    const waterMat = new THREE.MeshStandardMaterial({
      color: waterC, roughness: 0.28, metalness: 0,
      emissive: waterC, emissiveIntensity: 0.18,
    });
    const bankMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(p.groundEdge ?? p.ground).multiplyScalar(0.8),
      roughness: 1,
    });
    const g = new THREE.Group();
    g.add(strip(half + 2.4, 0.005, bankMat)); // sahil
    g.add(strip(half, 0.009, waterMat));      // su (yolun ALTINDA qalır: yol y=0.02)

    // ÇAYA GİRMƏK OLMAZ: mərkəz xətti boyu toqquşma dairələri
    // (körpü zonası açıq qalır) + sahildə TƏBİİ maneə kimi daşlar
    const bridgeClear = this.track.halfWidth + half + 6;
    const rockMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(p.groundEdge ?? 0x888888).multiplyScalar(0.7),
      roughness: 1, flatShading: true,
    });
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < pts.length; i += 2) {
      const pt = pts[i];
      if (pt.distanceTo(c) < bridgeClear) continue;
      this.obstacles.push({ x: pt.x, z: pt.z, r: half + 1.2 });
      // Hər 4-cü nöqtədə sahil daşları (vizual xəbərdarlıq)
      if (i % 4 === 0) {
        const a = pts[Math.max(0, i - 1)];
        const b2 = pts[Math.min(pts.length - 1, i + 1)];
        const t = new THREE.Vector3().subVectors(b2, a).setY(0).normalize();
        const n = new THREE.Vector3(t.z, 0, -t.x);
        for (const side of [-1, 1]) {
          if (Math.random() < 0.35) continue;
          const s = 0.7 + Math.random() * 0.9;
          const rock = new THREE.Mesh(rockGeo, rockMat);
          rock.scale.set(s, s * 0.7, s);
          rock.position.set(
            pt.x + n.x * (half + 2.0 + Math.random() * 1.5), s * 0.3,
            pt.z + n.z * (half + 2.0 + Math.random() * 1.5)
          );
          rock.rotation.y = Math.random() * 6;
          g.add(rock);
        }
      }
    }

    // Göl(lər): ORQANİK formalı (dairə yox), sahil daşları ilə
    for (const arm of [armA, armB]) {
      if (!arm.lake || !arm.pts.length) continue;
      const end = arm.pts[arm.pts.length - 1];
      const R = arm.R;
      const phase = Math.random() * 6;
      const blob = (scale) => {
        const shape = new THREE.Shape();
        for (let k = 0; k <= 30; k++) {
          const th = (k / 30) * Math.PI * 2;
          const rr = R * scale * (1 + 0.20 * Math.sin(3 * th + phase) + 0.10 * Math.sin(7 * th + phase * 2));
          const px = Math.cos(th) * rr, py = Math.sin(th) * rr;
          if (k === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
        }
        return new THREE.ShapeGeometry(shape);
      };
      const bank = new THREE.Mesh(blob(1.16), bankMat);
      bank.rotation.x = -Math.PI / 2;
      bank.position.set(end.x, 0.004, end.z);
      g.add(bank);
      const lake = new THREE.Mesh(blob(1), waterMat);
      lake.rotation.x = -Math.PI / 2;
      lake.position.set(end.x, 0.008, end.z);
      g.add(lake);
      // Göl sahili daşları + toqquşma
      for (let k = 0; k < 9; k++) {
        const th = (k / 9) * Math.PI * 2 + Math.random() * 0.4;
        const rr = R * 1.12 * (1 + 0.20 * Math.sin(3 * th + phase));
        const s = 0.8 + Math.random() * 1.1;
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.scale.set(s, s * 0.7, s);
        rock.position.set(end.x + Math.cos(th) * rr, s * 0.3, end.z + Math.sin(th) * rr);
        rock.rotation.y = Math.random() * 6;
        g.add(rock);
      }
      this.obstacles.push({ x: end.x, z: end.z, r: R * 1.1 + 1.2 });
    }

    // KÖRPÜ: keçiddə yol kənarı məhəccərlər + dayaq daşları
    const railLen = half * 2 + 10;
    const heading = Math.atan2(tg.x, tg.z);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.85, railLen), new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 0.85 }));
      rail.position.set(
        c.x + nrm.x * (this.track.halfWidth + 0.55) * side, 0.42,
        c.z + nrm.z * (this.track.halfWidth + 0.55) * side
      );
      rail.rotation.y = heading;
      rail.castShadow = true;
      g.add(rail);
      // Uclarda dayaq daşları
      for (const e of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.7), new THREE.MeshStandardMaterial({ color: 0x9a9284, roughness: 0.9 }));
        post.position.set(
          c.x + nrm.x * (this.track.halfWidth + 0.55) * side + tg.x * e * railLen / 2, 0.55,
          c.z + nrm.z * (this.track.halfWidth + 0.55) * side + tg.z * e * railLen / 2
        );
        post.rotation.y = heading;
        g.add(post);
      }
      // Məhəccər toqquşması
      for (const s of [-railLen / 3, 0, railLen / 3]) {
        this.obstacles.push({
          x: c.x + nrm.x * (this.track.halfWidth + 0.55) * side + tg.x * s,
          z: c.z + nrm.z * (this.track.halfWidth + 0.55) * side + tg.z * s,
          r: 1.0,
        });
      }
    }
    const merged = mergeStaticGroup(g);
    this.scene.add(merged);
    this._track(merged);
  }

  // Yavaş animasiyalar (dəyirman qanadları, bulud dreyfi)
  update(dt) {
    if (this._blades) {
      for (const b of this._blades) b.rotation.z += dt * b.userData.speed;
    }
    if (this._cloudMesh) this._cloudMesh.rotation.y += dt * 0.004;
  }

  // Boş, yol/şaxə/çaydan təmiz mövqe tap (rejection sampling)
  _freeSpot(objR, rMin, rMax, tries = 30) {
    const half = this.track.halfWidth;
    for (let i = 0; i < tries; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = rMin + Math.random() * (rMax - rMin);
      const pos = new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
      const near = this.track.getNearest(pos);
      if (Math.abs(near.lateral) < half + objR + 3) continue;
      if (this.track.branches?.length && this.track.isOnBranch(pos, objR + 3)) continue;
      return pos;
    }
    return null;
  }

  // ————— TREK KƏNARI QURĞULARI —————
  // Xəritələr boş görünürdü: yalnız ağac/daş vardı, yarış atmosferi yox idi.
  // Hamısı YOLDAN kənarda, döngələrə və düz hissələrə paylanır və tək qrupda
  // birləşdirilir (draw call artmır).
  _trackside() {
    const g = new THREE.Group();
    const N = this.track.points.length;
    const hw = this.track.halfWidth;
    const accent = this.data.palette?.accent ?? 0xff7a2f;
    const night = !!this.data.palette?.night;
    // YER TUTMA XƏRİTƏSİ: əvvəl hər dekor müstəqil qoyulurdu və obyektlər
    // bir-birinin İÇİNDƏN çıxırdı (istifadəçi: şəhər trekində tribunalar
    // üst-üstə düşür). İndi yer tutulubsa obyekt qoyulmur.
    const tutulan = [];
    // ƏVVƏLKİ dekor da yoxlanılır (şin qüllələri, bilbordlar, ağaclar…) —
    // yoxsa tribuna başqa obyektin içinə düşürdü
    const boşdur = (x, z, r) => !tutulan.some((o) =>
      Math.hypot(o.x - x, o.z - z) < o.r + r + 2)
      && !this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 1.5);
    const put = (obj, i, off, side, faceRoad = true, r = 2.5) => {
      const c = this.track.points[i], n = this.track.normals[i], t = this.track.tangents[i];
      const x = c.x + n.x * off * side, z = c.z + n.z * off * side;
      if (!boşdur(x, z, r)) { obj.traverse?.((o) => o.geometry?.dispose?.()); return null; }
      obj.position.set(x, 0, z);
      obj.rotation.y = faceRoad
        ? Math.atan2(-n.x * side, -n.z * side)
        : Math.atan2(t.x, t.z);
      g.add(obj);
      tutulan.push({ x, z, r });
      return obj.position;
    };
    // 1) Tribunalar — düz hissələrdə, 2-4 ədəd
    {
      const want = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < want; k++) {
        const i = Math.floor((k + 0.5) / want * N + Math.random() * 8) % N;
        const t0 = this.track.tangents[i], t1 = this.track.tangents[(i + 5) % N];
        if (Math.abs(t0.x * t1.z - t0.z * t1.x) > 0.08) continue;   // düz olsun
        const side = Math.random() < 0.5 ? -1 : 1;
        const len = 14 + Math.random() * 8;
        const pos = put(makeGrandstand(len, accent), i, hw + 9 + Math.random() * 3, side, true, len * 0.42);
        if (pos) this.obstacles.push({ x: pos.x, z: pos.z, r: len * 0.42 });
      }
    }
    // 2) Projektor qüllələri — trek boyu bərabər
    {
      const want = 4;
      for (let k = 0; k < want; k++) {
        const i = Math.floor((k / want) * N + 6) % N;
        const side = k % 2 ? 1 : -1;
        const pos = put(makeFloodlight(13 + Math.random() * 4, night || Math.random() < 0.4), i, hw + 7.5, side, false, 1.6);
        if (pos) this.obstacles.push({ x: pos.x, z: pos.z, r: 0.9 });
      }
    }
    // 3) Marşal məntəqələri — döngə çıxışlarında
    {
      for (let i = 0; i < N; i += 7) {
        const t0 = this.track.tangents[i], t1 = this.track.tangents[(i + 4) % N];
        const cross = t0.x * t1.z - t0.z * t1.x;
        if (Math.abs(cross) < 0.12) continue;                 // yalnız döngə
        if (Math.random() > 0.45) continue;
        const side = cross > 0 ? -1 : 1;                      // döngənin bayırı
        const pos = put(makeMarshalPost(accent), i, hw + 5.5, side, true, 2.2);
        if (pos) this.obstacles.push({ x: pos.x, z: pos.z, r: 1.6 });
      }
    }
    // 4) Sponsor lövhələri — düz hissələrdə sıra ilə
    {
      for (let i = 0; i < N; i += 4) {
        const t0 = this.track.tangents[i], t1 = this.track.tangents[(i + 4) % N];
        if (Math.abs(t0.x * t1.z - t0.z * t1.x) > 0.07) continue;
        if (Math.random() > 0.4) continue;
        const side = Math.random() < 0.5 ? -1 : 1;
        const w = 5 + Math.random() * 3;
        const cols = [0x1f6feb, 0xe0342c, 0x22a06b, 0x8a3df0, 0xff7a2f];
        const pos = put(makeSponsorBoard(w, cols[(Math.random() * cols.length) | 0]), i, hw + 3.4, side, true, w * 0.4);
        if (pos) this.obstacles.push({ x: pos.x, z: pos.z, r: w * 0.4 });
      }
    }
    // 5) Bayraq sıraları — start-finiş yaxınlığı
    for (const idx of [4, N - 10]) {
      const i = ((idx % N) + N) % N;
      put(makeBunting(11 + Math.random() * 4), i, hw + 6.5, Math.random() < 0.5 ? -1 : 1, false, 5);
    }
    const merged = mergeStaticGroup(g);
    g.traverse((o) => o.geometry?.dispose?.());
    this.scene.add(merged);
    this._track(merged);
  }

  // ————— TOQQUŞMA TƏHLÜKƏSİZLİK TORU —————
  // Bəzi dekor qurucuları maneə qeydini unudurdu (fiziki testlə tapıldı:
  // ağacların, təkər yığınlarının içindən keçmək olurdu). Bu keçid səhnəni
  // gəzir və qeydsiz qalmış İRİ obyektlərə avtomatik maneə verir.
  // Buraxılır: alçaq obyektlər (üstündən keçmək olar), nəhəng/birləşdirilmiş
  // bloklar və yolun ÜSTÜNDƏKİ elementlər (start tağı, banner).
  _autoObstacles() {
    const box = new THREE.Box3(), size = new THREE.Vector3();
    const half = this.track.halfWidth;
    const tmp = new THREE.Vector3();
    let added = 0;
    for (const root of this.objects) {
      root.traverse?.((n) => {
        if (!n.isMesh) return;
        box.setFromObject(n); box.getSize(size);
        if (size.y < 1.5) return;
        if (size.x > 26 || size.z > 26) return;
        const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
        tmp.set(cx, 0, cz);
        const near = this.track.getNearest(tmp);
        if (Math.abs(near.lateral) < half + 1.2) return;   // yolun üstü/kənarı
        const r = Math.max(size.x, size.z) * 0.42;
        for (const q of this.obstacles) {
          if (Math.hypot(q.x - cx, q.z - cz) < r + q.r) return;
        }
        this.obstacles.push({ x: cx, z: cz, r });
        added++;
      });
    }
    return added;
  }

  // ————— YAXIN PLAN DETALI —————
  // Yol kənarı çılpaq idi: dekor 30 m-dən uzaqda başlayırdı və sürətdə
  // "boş masa" hissi verirdi. Dərinlik məhz yaxın plandakı xırda
  // detaldan gəlir. Hamısı TƏK mesh-ə birləşir — draw call artmır.
  _nearDetail() {
    const g = new THREE.Group();
    const N = this.track.N;
    const half = this.track.halfWidth;
    const p = this.data.palette;
    // Biomun öz palitrası: quru xəritələrdə çınqıl/kol, yaşılda ot dəstəsi
    const quru = ['desert', 'canyon', 'riviera', 'zavod'].includes(this.data.id);
    const otMat = new THREE.MeshStandardMaterial({
      color: quru ? (p.grassDry ?? 0x9c7b4a) : (p.grass ?? 0x3f8f4e),
      roughness: 1, flatShading: true,
    });
    const daşMat = new THREE.MeshStandardMaterial({
      color: p.rock ?? 0x8b8b93, roughness: 1, flatShading: true,
    });
    const otGeo = new THREE.ConeGeometry(0.22, 0.75, 4);
    const daşGeo = new THREE.DodecahedronGeometry(0.32, 0);
    const say = 420;
    for (let k = 0; k < say; k++) {
      const i = Math.floor(Math.random() * N);
      const c = this.track.points[i], n = this.track.normals[i];
      const side = Math.random() < 0.5 ? -1 : 1;
      // 4–26 m: asfaltın kənarından başlayır, dekor zonasına qədər
      const off = half + 3.2 + Math.random() * 22;
      const x = c.x + n.x * off * side + (Math.random() - 0.5) * 4;
      const z = c.z + n.z * off * side + (Math.random() - 0.5) * 4;
      // Maneələrin içində bitməsin
      if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.8)) continue;
      const daş = Math.random() < (quru ? 0.45 : 0.22);
      const m = new THREE.Mesh(daş ? daşGeo : otGeo, daş ? daşMat : otMat);
      m.position.set(x, daş ? 0.1 : 0.32, z);
      m.rotation.y = Math.random() * Math.PI * 2;
      const sc = 0.6 + Math.random() * 0.9;
      m.scale.set(sc, sc * (daş ? 0.7 : 1.3), sc);
      g.add(m);
    }
    const merged = mergeStaticGroup(g);
    this.scene.add(merged);
    this._track(merged);
  }

  // ————— KENNEY TƏBİƏT QATI —————
  _natureLayer() {
    const adlar = NATURE_BY_TRACK[this.data.id];
    if (!adlar?.length) return;
    const kit = sharedNature();
    const qur = () => {
      if (!kit.ready) return;
      const g = new THREE.Group();
      const N = this.track.N;
      const box = new THREE.Box3(), size = new THREE.Vector3();
      let qoyulan = 0;
      for (let k = 0; k < 260; k++) {
        const obj = kit.get(adlar[(Math.random() * adlar.length) | 0]);
        if (!obj) continue;
        const i = Math.floor(Math.random() * N);
        const c = this.track.points[i], n = this.track.normals[i];
        const side = Math.random() < 0.5 ? -1 : 1;
        const off = this.track.halfWidth + 12 + Math.random() * 120;
        const x = c.x + n.x * off * side + (Math.random() - 0.5) * 18;
        const z = c.z + n.z * off * side + (Math.random() - 0.5) * 18;
        const sc = 0.75 + Math.random() * 0.7;
        obj.scale.setScalar(sc);
        obj.position.set(x, 0, z);
        obj.rotation.y = Math.random() * Math.PI * 2;
        box.setFromObject(obj); box.getSize(size);
        const r = Math.max(size.x, size.z) * 0.42;
        // Yolun üstünə və başqa obyektin içinə düşməsin
        const yan = Math.abs(this.track.getNearest(obj.position).lateral);
        if (yan < this.track.halfWidth + r + 4) continue;
        if (!this._free(x, z, r * 1.25, 2.5)) continue;
        g.add(obj);
        this.obstacles.push({ x, z, r });
        qoyulan++;
      }
      if (!qoyulan) return;
      const merged = mergeStaticGroup(g);
      this.scene.add(merged);
      this._track(merged);
    };
    if (kit.ready) qur();
    else kit._loading?.then(qur);
  }

  _scatterDecor() {
    const decorGroup = new THREE.Group();
    const half = this.track.halfWidth;
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    // ZONALAR: xəritə 3 bucaq sektoruna bölünür — hər dekor tipi öz sektoruna
    // meyllidir (65%) → dövrə boyu mühit dəyişir, "səyahət" hissi yaranır
    const sectorOf = (pos) =>
      Math.floor(((Math.atan2(pos.z, pos.x) + Math.PI) / (Math.PI * 2)) * 3) % 3;
    for (const [ri, rule] of (this.data.decor || []).entries()) {
      const homeSector = ri % 3;
      // ————— KƏND KLASTERLƏRİ: evlər tək-tək yox, 3-5-lik qruplarla —————
      if (rule.type === 'house') {
        const clusters = Math.max(1, Math.ceil(rule.count / 4));
        for (let ci = 0; ci < clusters; ci++) {
          let anchor = null;
          for (let att = 0; att < 8 && !anchor; att++) {
            const cand = this._freeSpot(16, this.track.maxRadius * 0.45, this.track.maxRadius + 40);
            if (cand && (sectorOf(cand) === homeSector || att > 4)) anchor = cand;
          }
          if (!anchor) continue;
          const n = 3 + Math.floor(Math.random() * 3);
          for (let hi = 0; hi < n; hi++) {
            const a = (hi / n) * Math.PI * 2 + Math.random() * 0.8;
            const rr = 7 + Math.random() * 9;
            const pos = new THREE.Vector3(anchor.x + Math.cos(a) * rr, 0, anchor.z + Math.sin(a) * rr);
            const near = this.track.getNearest(pos);
            if (Math.abs(near.lateral) < half + 6) continue;
            if (this.track.branches?.length && this.track.isOnBranch(pos, 6)) continue;
            const obj = makeDecor('house');
            obj.position.copy(pos);
            // Evlər klaster mərkəzinə (meydana) baxır — kənd hissi
            obj.rotation.y = Math.atan2(anchor.x - pos.x, anchor.z - pos.z) + (Math.random() - 0.5) * 0.5;
            decorGroup.add(obj);
            this.obstacles.push({ x: pos.x, z: pos.z, r: 3.2 });
          }
        }
        continue;
      }
      // ————— DƏYİRMAN: birləşdirilmir (qanadlar fırlanır), landmark kimi tək-tək —————
      if (rule.type === 'windmill') {
        this._blades = this._blades || [];
        for (let wi = 0; wi < rule.count; wi++) {
          const pos = this._freeSpot(6, this.track.maxRadius * 0.3, this.track.maxRadius + 20);
          if (!pos) continue;
          const wm = makeDecor('windmill');
          wm.position.copy(pos);
          wm.rotation.y = Math.random() * Math.PI * 2;
          this.scene.add(wm);
          this._track(wm);
          const blades = wm.getObjectByName('wmblades');
          if (blades) {
            blades.userData.speed = 0.45 + Math.random() * 0.4;
            this._blades.push(blades);
          }
          this.obstacles.push({ x: pos.x, z: pos.z, r: 2.6 });
        }
        continue;
      }
      let placed = 0;
      let attempts = 0;
      while (placed < rule.count && attempts < rule.count * 16) {
        attempts++;
        const ang = Math.random() * Math.PI * 2;
        const r = 18 + Math.random() * (this.track.maxRadius + 70);
        const pos = new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);

        const obj = makeDecor(rule.type);
        const s = 0.8 + Math.random() * 0.7;
        obj.scale.setScalar(s);
        // Obyektin üfüqi radiusu
        box.setFromObject(obj);
        box.getSize(size);
        const objR = Math.max(size.x, size.z) / 2;

        // Yoldan məsafə: yol yarım-eni + obyekt radiusu + buffer
        const near = this.track.getNearest(pos);
        if (Math.abs(near.lateral) < half + objR + 3) continue;
        // Şaxə yollarının üstünə düşməsin
        if (this.track.branches?.length && this.track.isOnBranch(pos, objR + 3)) continue;
        // Zona meyli: 65% öz sektorunda
        if (sectorOf(pos) !== homeSector && Math.random() > 0.35) continue;

        // İri obyektlər üçün yer tutma yoxlaması (kiçik ot/daş klasteri
        // təbii yaxınlıqdır — yalnız r≥3 yoxlanır)
        {
          box.setFromObject(obj); box.getSize(size);
          const rr = Math.max(size.x, size.z) * 0.42;
          if (rr >= 3 && !this._free(pos.x, pos.z, rr, 0.5)) continue;
        }
        obj.position.copy(pos);
        obj.rotation.y = Math.random() * Math.PI * 2;
        decorGroup.add(obj);
        // Hamısı toqquşma siyahısına düşür — heç nəyin içinə girmək olmaz
        this.obstacles.push({ x: pos.x, z: pos.z, r: Math.min(objR * 0.85, 40) });
        placed++;
      }
    }
    // PERFORMANS: yüzlərlə dekor mesh-i material üzrə birləşdirilir
    const merged = mergeStaticGroup(decorGroup);
    decorGroup.traverse((o) => o.geometry?.dispose?.());
    this.scene.add(merged);
    this._track(merged);
  }

  // 3 dayaqlı səma: zenit → orta → ÜFÜQ İŞIQ ZOLAĞI → aşağı
  _skyTexture(p) {
    const top = p.sky;
    const bottom = p.skyBottom ?? p.sky;
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 512;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    const T = new THREE.Color(top);
    const B = new THREE.Color(bottom);
    const mid = T.clone().lerp(B, 0.55);
    // Üfüqdə açıq parıltı zolağı (günəşin havada səpələnməsi)
    const glow = B.clone().lerp(new THREE.Color(0xffffff), p.night ? 0.10 : 0.38);
    const below = B.clone().lerp(T, 0.5).multiplyScalar(0.8); // üfüq altı tündləşir
    g.addColorStop(0.0, '#' + T.getHexString());
    g.addColorStop(0.38, '#' + mid.getHexString());
    g.addColorStop(0.475, '#' + B.getHexString());
    g.addColorStop(0.5, '#' + glow.getHexString());
    g.addColorStop(0.53, '#' + B.getHexString());
    g.addColorStop(1.0, '#' + below.getHexString());
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Günəş (gündüz) və ya ay (gecə) diski + yumşaq halo
  _celestialBody(p) {
    // Günəş istiqaməti işıq mənbəyi ilə üst-üstə düşür (60, 110, 40)
    const dir = new THREE.Vector3(60, 42, 40).normalize(); // üfüqə yaxın — daha dramatik
    const pos = dir.multiplyScalar(700);
    const night = !!p.night;
    const discColor = night
      ? 0xdfe8ff
      : new THREE.Color(p.sun ?? 0xffe6b0).lerp(new THREE.Color(0xffffff), 0.35).getHex();

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(night ? 30 : 44, 40),
      new THREE.MeshBasicMaterial({ color: discColor, fog: false, depthWrite: false })
    );
    disc.position.copy(pos);
    disc.lookAt(0, 0, 0);
    this.scene.add(disc);
    this._track(disc);

    // Halo — radial qradiyent sprite (additiv)
    const hc = document.createElement('canvas');
    hc.width = hc.height = 128;
    const hctx = hc.getContext('2d');
    const hg = hctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    const haloCol = new THREE.Color(discColor);
    hg.addColorStop(0, 'rgba(' + Math.round(haloCol.r * 255) + ',' + Math.round(haloCol.g * 255) + ',' + Math.round(haloCol.b * 255) + ',' + (night ? 0.35 : 0.55) + ')');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    hctx.fillStyle = hg;
    hctx.fillRect(0, 0, 128, 128);
    const haloTex = new THREE.CanvasTexture(hc);
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(night ? 90 : 150, 32),
      new THREE.MeshBasicMaterial({
        map: haloTex, transparent: true, fog: false, depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    halo.position.copy(pos.clone().multiplyScalar(0.985));
    halo.lookAt(0, 0, 0);
    this.scene.add(halo);
    this._track(halo);

    // İkinci, daha geniş və zəif halo — "hava işıqlanması" dərinliyi
    const halo2 = new THREE.Mesh(
      new THREE.CircleGeometry(night ? 150 : 300, 32),
      new THREE.MeshBasicMaterial({
        map: haloTex, transparent: true, opacity: 0.4, fog: false, depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    halo2.position.copy(pos.clone().multiplyScalar(0.97));
    halo2.lookAt(0, 0, 0);
    this.scene.add(halo2);
    this._track(halo2);
  }

  // Gecə səmasında ulduzlar — tək draw call
  _stars() {
    const n = 450;
    const verts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // Yuxarı yarımkürə üzərində təsadüfi nöqtələr
      const a = Math.random() * Math.PI * 2;
      const y = 0.12 + Math.random() * 0.88; // üfüqdən yuxarı
      const r = Math.sqrt(1 - y * y);
      verts[i * 3] = Math.cos(a) * r * 740;
      verts[i * 3 + 1] = y * 740;
      verts[i * 3 + 2] = Math.sin(a) * r * 740;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xcfdcff, size: 2.1, sizeAttenuation: false,
      fog: false, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.scene.add(stars);
    this._track(stars);
  }

  _gradientTexture(top, bottom) {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    const mid = new THREE.Color(top).lerp(new THREE.Color(bottom), 0.5);
    g.addColorStop(0, '#' + new THREE.Color(top).getHexString());
    g.addColorStop(0.55, '#' + mid.getHexString());
    g.addColorStop(1, '#' + new THREE.Color(bottom).getHexString());
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _track(o) {
    this.objects.push(o);
  }

  dispose() {
    for (const o of this.objects) {
      this.scene.remove(o);
      o.traverse?.((n) => {
        // İşığın kölgə xəritəsi (2048²) obyektlə birlikdə azad olunmurdu
        if (n.isLight) { n.shadow?.map?.dispose(); n.dispose?.(); }
        if (n.geometry) n.geometry.dispose();
        if (n.material) {
          const mats = Array.isArray(n.material) ? n.material : [n.material];
          mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
    }
    this._envRT?.dispose();
    this.scene.environment = null;
    this.scene.background = null;
    this.scene.fog = null;
    this.objects = [];
  }
}
