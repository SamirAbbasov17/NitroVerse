import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TARGET_LENGTH = 4.4; // dünya vahidində maşın uzunluğu (fizika ilə uyğun)

// ————— Palitra rəng analizi (boya və disk dəyişimi üçün ortaq) —————
const lumOf = (c) => c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
const chromaOf = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
const hueOf = (c) => {
  const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b), dl = mx - mn;
  if (!dl) return -1;
  let h;
  if (mx === c.r) h = ((c.g - c.b) / dl) % 6;
  else if (mx === c.g) h = (c.b - c.r) / dl + 2;
  else h = (c.r - c.g) / dl + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
};

// Rəng AİLƏSİ: ən böyük rəng + onun çalarları. Palitra düz deyil — bir gövdə
// onlarla yaxın çalardan ibarətdir, hamısı boyanmalıdır, yoxsa maşının yalnız
// bir hissəsi rəng dəyişir.
function famOf(pool) {
  if (!pool.length) return null;
  const dom = pool.reduce((a, c) => (c.a > a.a ? c : a));
  const dh = hueOf(dom), domC = chromaOf(dom);
  const fam = pool.filter((c) => {
    if (c === dom) return true;
    if (c.a < dom.a * 0.03) return false; // xırda ləkə — far, işıq, loqo
    if (domC < 28) return chromaOf(c) < 28;
    const h = hueOf(c);
    if (h < 0) return false;
    const diff = Math.abs(h - dh);
    return Math.min(diff, 360 - diff) <= 26;
  });
  return { dom, fam, area: fam.reduce((s, c) => s + c.a, 0) };
}

// Kenney Car Kit GLB modellərini yükləyir, normallaşdırır və UI thumbnail-ləri render edir.
export class ModelLibrary {
  constructor() {
    this.loader = new GLTFLoader();
    this.cars = new Map(); // model adı -> { template, scale, wheelRadius }
  }

  async loadCars(modelNames) {
    await Promise.all(modelNames.map(async (name) => {
      const gltf = await this.loader.loadAsync(`models/cars/${name}.glb`);
      const template = this._normalize(gltf.scene);
      this.cars.set(name, template);
    }));
  }

  // Modeli TARGET_LENGTH uzunluğuna gətir, yerə oturt, kölgə/materyal sazla
  _normalize(scene) {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const scale = TARGET_LENGTH / size.z;

    const wrapper = new THREE.Group();
    wrapper.add(scene);
    scene.scale.setScalar(scale);

    // Yenidən ölç: yerə oturt və mərkəzləşdir (x/z)
    const box2 = new THREE.Box3().setFromObject(wrapper);
    const c = box2.getCenter(new THREE.Vector3());
    scene.position.x -= c.x;
    scene.position.z -= c.z;
    scene.position.y -= box2.min.y;

    let wheelRadius = 0.55;
    wrapper.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        if (o.material) {
          o.material.roughness = 0.85;
          o.material.metalness = 0.05;
          // Şablon materialı bütün səhnələrdə təkrar işlənir — səhnə
          // təmizlənməsi ona toxunmamalıdır (bax disposeObject3D)
          o.material.userData = { ...(o.material.userData || {}), shared: true };
          if (o.material.map) o.material.map.userData = { ...(o.material.map.userData || {}), shared: true };
        }
      }
      if (/^wheel-front-left$/.test(o.name)) {
        const wb = new THREE.Box3().setFromObject(o);
        wheelRadius = ((wb.max.y - wb.min.y) / 2) * scale;
      }
    });

    return { object: wrapper, scale, wheelRadius };
  }

  // Klon + təkər qovşaqlarını tap (fırlanma üçün hər təkəri spinner qrupuna bük)
  // tint: gövdə boyasını dəyişir (ən böyük doymuş rəngli material klonlanıb boyanır)
  instantiate(name, tint = null, rim = null, kit = null) {
    const entry = this.cars.get(name);
    if (!entry) throw new Error(`Model tapılmadı: ${name}`);
    const root = entry.object.clone(true);
    if (tint != null) this._applyTint(root, tint, name + '@' + tint.toString(16), name);
    if (rim != null) this.applyRim(root, rim, name + '#' + rim.toString(16));
    // Gövdə dəsti boyadan SONRA qurulur ki, hissələr eyni (boyanmış) materialı
    // paylaşsın — naxış və əfsanəvi örtük də avtomatik onlara düşür
    if (kit) this._applyKit(root, kit);

    const wheels = [];      // fırlanan qruplar
    const steerPivots = []; // ön təkər dönmə qrupları
    root.traverse((o) => {
      if (/^wheel-(front|back)-(left|right)$/.test(o.name)) wheels.push(o);
    });
    for (const w of wheels) {
      const parent = w.parent;
      const pivot = new THREE.Group();
      pivot.position.copy(w.position);
      w.position.set(0, 0, 0);
      parent.add(pivot);
      pivot.add(w);
      pivot.name = w.name + '-pivot';
      if (w.name.includes('front')) steerPivots.push(pivot);
    }

    return { root, wheels, steerPivots, wheelRadius: entry.wheelRadius };
  }

  // Gövdə boyası: body mesh-i + eyni teksturanı bölüşən hissələr.
  // Doymuş rəng gövdənin boyasıdır; boz tonlar şassi, kabina örtüyü, şüşə və
  // buferdir — onlara toxunmuruq. Yalnız doymuş rəng cüzi olanda (polis: 4%)
  // açıq-boz ailəyə keçirik. Ölçülüb: ən aşağı normal model suv = 19%.
  // LİVREYALI modellər: gövdəsi ağ/qara olan xidmət maşınları (polis).
  // Onlarda AĞ gövdəni boyamaq orijinal dizaynı öldürür — yalnız zolaqlar
  // (doymuş rəng ailəsi) boyanır, ağ gövdə toxunulmaz qalır.
  static LIVERY_MODELS = new Set(['police']);

  _applyTint(root, tint, cacheKey = null, modelName = null) {
    let body = null;
    root.traverse((o) => { if (!body && o.isMesh && o.name === 'body') body = o; });
    const srcTex = body?.material?.map;
    if (!srcTex) return;
    const livery = ModelLibrary.LIVERY_MODELS.has(modelName);
    const mat = this._recolor([body], tint, (list, total) => {
      const sat = famOf(list.filter((c) => chromaOf(c) >= 28 && Math.max(c.r, c.g, c.b) >= 50));
      // Polis: zolaq payı kiçik olsa da MƏHZ onu boyayırıq (ağ gövdə qalır)
      if (livery) return sat;
      if (sat && sat.area >= total * 0.12) return sat;
      const pale = famOf(list.filter((c) => chromaOf(c) < 28 && lumOf(c) >= 110));
      return pale && (!sat || pale.area > sat.area) ? pale : sat;
    }, cacheKey);
    if (mat) this._paintParts(root, srcTex, mat);
  }

  // Disk rəngi: təkər teksturasında rezin (tünd) toxunulmaz qalır, yalnız disk üzü
  // boyanır. `material.color` ilə boyamaq OLMAZ — o, teksturanı VURUR: narıncı F1
  // diski × firuzəyi = yaşıl çıxırdı və rezin də rənglənirdi.
  // Ölçülüb: rezin L54-69, disk üzü L103+ (F1 #ff9832, adi maşın #8c93b0).
  applyRim(root, hex, cacheKey = null) {
    const wheels = [];
    root.traverse((o) => { if (o.isMesh && /^wheel-/.test(o.name)) wheels.push(o); });
    if (!wheels.length) return;
    const mat = this._recolor(wheels, hex, (list) => famOf(list.filter((c) => lumOf(c) >= 90)), cacheKey);
    if (!mat) return;
    for (const w of wheels) w.material = mat;
  }

  // Rəng dəyişiminin ümumi hissəsi (Kenney palitra teksturası): verilmiş mesh-lərin
  // UV-lərindən rəng "ailəsi" tapılır — əsas ton VƏ onun açıq/tünd çalarları — klon
  // teksturada hamısı tint-in uyğun çalarları ilə əvəz olunur. Material keşlənir.
  // `choose(list, totalArea)` hansı rənglərin boyanacağını seçir.
  _recolor(meshes, tint, choose, cacheKey = null) {
    this._tintCache = this._tintCache || new Map();
    if (cacheKey && this._tintCache.has(cacheKey)) return this._tintCache.get(cacheKey);
    const srcTex = meshes[0]?.material?.map;
    const img = srcTex?.image;
    if (!img?.width) return null;
    const W = img.width, H = img.height;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const im = cx.getImageData(0, 0, W, H);
    const d = im.data;
    const flip = srcTex.flipY; // GLTF-də adətən false

    // Üçbucaqlar SAHƏYƏ görə çəkilir. Böyük panellər cəmi bir neçə iri üçbucaqdan,
    // kiçik ətək/bufer hissələri isə onlarla xırda üçbucaqdan ibarətdir — sayla
    // ölçəndə alqoritm əsas gövdəni yox, əyilmə hissəsini "boya" sanırdı.
    const swatches = new Map(); // rəng → toplam sahə
    let totalArea = 0;
    for (const m of meshes) {
      const pos = m.geometry?.attributes?.position;
      const uv = m.geometry?.attributes?.uv;
      const idx = m.geometry?.index;
      const n = idx ? idx.count : (uv?.count || 0);
      if (!pos || !uv || !n) continue;
      for (let t = 0; t < n; t += 3) {
        const i0 = idx ? idx.getX(t) : t;
        const i1 = idx ? idx.getX(t + 1) : t + 1;
        const i2 = idx ? idx.getX(t + 2) : t + 2;
        const ax = pos.getX(i0), ay = pos.getY(i0), az = pos.getZ(i0);
        const ux = pos.getX(i1) - ax, uy = pos.getY(i1) - ay, uz = pos.getZ(i1) - az;
        const vx = pos.getX(i2) - ax, vy = pos.getY(i2) - ay, vz = pos.getZ(i2) - az;
        const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        if (!(area > 0)) continue;
        let u = ((uv.getX(i0) + uv.getX(i1) + uv.getX(i2)) / 3) % 1;
        let v = ((uv.getY(i0) + uv.getY(i1) + uv.getY(i2)) / 3) % 1;
        if (u < 0) u += 1;
        if (v < 0) v += 1;
        const px = Math.min(W - 1, Math.round(u * W));
        const py = Math.min(H - 1, Math.round((flip ? 1 - v : v) * H));
        const o = (py * W + px) * 4;
        const r = d[o], g = d[o + 1], bl = d[o + 2];
        const key = (r << 16) | (g << 8) | bl;
        const rec = swatches.get(key) || { r, g, b: bl, a: 0 };
        rec.a += area;
        swatches.set(key, rec);
        totalArea += area;
      }
    }
    if (!swatches.size) return null;

    const chosen = choose([...swatches.values()], totalArea);
    if (!chosen) return null;
    const { dom, fam: family } = chosen;

    // Hər ailə üzvü tint-in öz parlaqlıq nisbətinə uyğun çalarına çevrilir —
    // iki tonlu gövdə (tünd ətək + açıq dam) təbii görünüşünü saxlayır.
    const dl0 = Math.max(1, lumOf(dom));
    const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255;
    const targets = family.map((c) => {
      const k = Math.min(1.8, Math.max(0.35, lumOf(c) / dl0));
      return {
        r: c.r, g: c.g, b: c.b,
        tr: Math.min(255, Math.round(tr * k)),
        tg: Math.min(255, Math.round(tg * k)),
        tb: Math.min(255, Math.round(tb * k)),
      };
    });

    // Ən yaxın ailə üzvü ilə əvəz edilir. Atlasda fərqli rəng sayı azdır (palitra),
    // ona görə hər rəngin hədəfi bir dəfə hesablanıb keşlənir — əks halda 6 maşınlıq
    // yarışın startında hiss olunan gecikmə yaranırdı.
    const R2 = 620;
    const lut = new Map();
    // MASKA: hansı piksellər boyaya aiddir. Əfsanəvi örtük yalnız BURADA işləsin —
    // şüşə, bufer, şassi və digər hissələr toxunulmaz qalsın (bax LegendaryFx.js).
    const mcv = document.createElement('canvas');
    mcv.width = W; mcv.height = H;
    const mcx = mcv.getContext('2d', { willReadFrequently: true });
    const mim = mcx.createImageData(W, H);
    const md = mim.data;
    for (let o = 0; o < d.length; o += 4) {
      const key = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
      let hit = lut.get(key);
      if (hit === undefined) {
        let best = null, bd = R2;
        for (const q of targets) {
          const dr = d[o] - q.r, dg = d[o + 1] - q.g, db = d[o + 2] - q.b;
          const s = dr * dr + dg * dg + db * db;
          if (s < bd) { bd = s; best = q; }
        }
        hit = best ? (best.tr << 16) | (best.tg << 8) | best.tb : -1;
        lut.set(key, hit);
      }
      const on = hit >= 0 ? 255 : 0;
      md[o] = on; md[o + 1] = on; md[o + 2] = on; md[o + 3] = 255;
      if (hit >= 0) { d[o] = (hit >> 16) & 255; d[o + 1] = (hit >> 8) & 255; d[o + 2] = hit & 255; }
    }
    cx.putImageData(im, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.flipY = srcTex.flipY;
    tex.colorSpace = srcTex.colorSpace;
    tex.wrapS = srcTex.wrapS;
    tex.wrapT = srcTex.wrapT;
    tex.needsUpdate = true;
    mcx.putImageData(mim, 0, 0);
    const maskTex = new THREE.CanvasTexture(mcv);
    maskTex.flipY = srcTex.flipY;
    maskTex.colorSpace = THREE.NoColorSpace; // maska rəng deyil, məlumatdır
    maskTex.wrapS = srcTex.wrapS;
    maskTex.wrapT = srcTex.wrapT;
    // KRİTİK: Kenney atlasında gövdə cəmi bir neçə tekselə düşür. Xətti
    // süzgəc + mipmap qonşu QARA tekselləri qarışdırır → maska 1 əvəzinə
    // ~0.2 oxunurdu və həm naxışlar, həm əfsanəvi örtüklər solğun görünürdü.
    // Ən yaxın qonşu + mipmapsız: dəyər ya 0-dır, ya 1.
    maskTex.magFilter = THREE.NearestFilter;
    maskTex.minFilter = THREE.NearestFilter;
    maskTex.generateMipmaps = false;
    maskTex.needsUpdate = true;
    const nm = meshes[0].material.clone();
    nm.map = tex;
    // Boyanmış material/tekstura keşlənir və maşınlar arasında paylaşılır
    nm.userData = { ...(nm.userData || {}), shared: true };
    tex.userData = { shared: true };
    maskTex.userData = { shared: true };
    nm.userData = { ...(nm.userData || {}), fxMask: maskTex };
    if (cacheKey) this._tintCache.set(cacheKey, nm);
    return nm;
  }

  // ————— PROSEDURAL GÖVDƏ DƏSTİ —————
  // Kenney kitində 10 model var, oyunda isə 18 maşın: 8 model iki dəfə işlənir
  // (məs. Blaze GT və Violetta R eyni `race.glb`-dir). Kitdə ikinci formula
  // modeli yoxdur, ona görə siluet PROSEDURAL hissələrlə fərqləndirilir:
  // qanad, hava qəbulu, ön bufer, baqajnik, yan ətək, egzoz.
  //
  // Hissələr gövdənin ÖZ materialını paylaşır → boya, naxışlı skin və əfsanəvi
  // örtük onlara da düşür. UV tək teksel üzərinə kilidlənir (aşağıya bax).
  _applyKit(root, kit) {
    let body = null;
    root.traverse((o) => { if (!body && o.isMesh && o.name === 'body') body = o; });
    if (!body) return;
    if (!body.geometry.boundingBox) body.geometry.computeBoundingBox();
    const bb = body.geometry.boundingBox;
    const W = bb.max.x - bb.min.x, H = bb.max.y - bb.min.y, L = bb.max.z - bb.min.z;
    const cx = (bb.max.x + bb.min.x) / 2;
    const parent = body.parent;

    // ————— RƏNG —————
    // ƏVVƏL hissələr gövdənin palitra tekselini işlədirdi və şassi-boz
    // çıxırdı: maşından qopuq, "gülməli" görünürdü (istifadəçi rəyi).
    // İndi tünd MAT PLASTİK — real body kit belədir və hər boyaya yaraşır.
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1c1f26, roughness: 0.62, metalness: 0.05, flatShading: true,
    });
    mat.userData = { kitPart: true };

    const geos = [];
    const add = (sx, sy, sz, px, py, pz) => {
      const geo = new THREE.BoxGeometry(sx, sy, sz);
      geo.translate(px, py, pz);
      geo.deleteAttribute('normal');
      geo.computeVertexNormals();
      geos.push(geo);
    };

    // Kompakt spoyler: gövdənin QUYRUĞUNA OTURUR (havada asılı qalmır)
    if (kit.wing === 'spoiler') {
      const wy = bb.max.y + H * 0.035;
      add(W * 0.66, H * 0.045, L * 0.075, cx, wy, bb.min.z + L * 0.10);
      for (const s of [-1, 1]) {
        add(W * 0.05, H * 0.10, L * 0.05, cx + s * W * 0.24, wy - H * 0.055, bb.min.z + L * 0.10);
      }
    }
    // Lip spoyler: bagajın kənarında incə qalxma
    if (kit.wing === 'lip') {
      add(W * 0.60, H * 0.035, L * 0.055, cx, bb.max.y - H * 0.02, bb.min.z + L * 0.07);
    }
    // Formula yan qutuları — F1 gövdəsinə yaraşan yeganə detal
    if (kit.pods) {
      for (const s of [-1, 1]) {
        add(W * 0.13, H * 0.22, L * 0.26, cx + s * W * 0.40, bb.min.y + H * 0.30, bb.min.z + L * 0.46);
      }
    }
    // Tavan relsləri — İNCƏ (əvvəl qalın lövhə kimi idi)
    if (kit.rails) {
      for (const s of [-1, 1]) {
        add(W * 0.045, H * 0.028, L * 0.44, cx + s * W * 0.30, bb.max.y + H * 0.018, bb.min.z + L * 0.46);
      }
    }
    // Ön bufer — nazik və alçaq
    if (kit.bar) {
      add(W * 0.80, H * 0.055, L * 0.035, cx, bb.min.y + H * 0.30, bb.max.z + L * 0.008);
      for (const s of [-1, 1]) {
        add(W * 0.045, H * 0.20, L * 0.035, cx + s * W * 0.28, bb.min.y + H * 0.38, bb.max.z + L * 0.008);
      }
    }
    // Yan ətəklər
    if (kit.skirt) {
      for (const s of [-1, 1]) {
        add(W * 0.045, H * 0.055, L * 0.46, cx + s * W * 0.46, bb.min.y + H * 0.14, bb.min.z + L * 0.50);
      }
    }
    // Cüt egzoz
    if (kit.exhaust) {
      for (const s of [-1, 1]) {
        add(W * 0.075, H * 0.06, L * 0.05, cx + s * W * 0.19, bb.min.y + H * 0.15, bb.min.z - L * 0.008);
      }
    }

    if (!geos.length) return;
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'kit';
    mesh.castShadow = true;
    parent.add(mesh);
  }

  // Gövdənin ƏN ÇOX işlətdiyi UV tekseli — dəst hissələri məhz ora bağlanır
  _bodyUV(body) {
    const uv = body.geometry.attributes.uv;
    if (!uv) return [0.5, 0.5];
    const tally = new Map();
    for (let i = 0; i < uv.count; i++) {
      const k = Math.round(uv.getX(i) * 512) + '|' + Math.round(uv.getY(i) * 512);
      tally.set(k, (tally.get(k) || 0) + 1);
    }
    let best = null, bn = -1;
    for (const [k, n] of tally) if (n > bn) { bn = n; best = k; }
    const [u, v] = best.split('|').map(Number);
    return [u / 512, v / 512];
  }

  // Eyni palitra teksturasını işlədən BÜTÜN gövdə hissələri boyanır
  // (spoyler, barmaqlıq və s.) — təkərlər öz rənglərində qalır.
  _paintParts(root, srcTex, mat) {
    const parts = [];
    root.traverse((o) => {
      if (o.isMesh && o.material?.map === srcTex && !/wheel/i.test(o.name)) parts.push(o);
    });
    for (const o of parts) o.material = mat;
  }

  // Kart üçün thumbnail-lər — oyundakı EYNİ modeldən render (UI ↔ oyun uyğunluğu)
  renderThumbnails(modelNames, { width = 420, height = 260 } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 60);
    camera.position.set(5.4, 3.1, 6.4);
    camera.lookAt(0, 0.72, 0);

    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x36404f, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x88bbff, 0.9);
    rim.position.set(-6, 4, -5);
    scene.add(rim);

    // Kölgə qəbul edən şəffaf yer
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(6, 40),
      new THREE.ShadowMaterial({ opacity: 0.3 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const thumbs = {};
    for (const it of modelNames) {
      const name = typeof it === 'string' ? it : it.model;
      const tint = typeof it === 'string' ? null : (it.tint ?? null);
      const kit = typeof it === 'string' ? null : (it.kit ?? null);
      // Açar cars.js-dəki carSkin() ilə EYNİ olmalıdır (model+boya+dəst)
      const key = typeof it === 'string' ? it
        : name + (tint != null ? '@' + tint.toString(16) : '')
          + (kit ? '+' + Object.entries(kit).map((e) => e.join('')).join('') : '');
      if (thumbs[key]) continue;
      const inst = this.instantiate(name, tint, null, kit);
      inst.root.rotation.y = Math.PI * 0.82; // ön-yan baxış
      scene.add(inst.root);
      renderer.render(scene, camera);
      thumbs[key] = canvas.toDataURL('image/png');
      scene.remove(inst.root);
    }

    renderer.dispose();
    return thumbs;
  }
}
