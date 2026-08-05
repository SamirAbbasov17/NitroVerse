import * as THREE from 'three';
import { makeDecor, makeFence, makeSignpost, makeUtilityPole } from '../core/AssetFactory.js';
import { mergeStaticGroup } from '../core/MergeUtils.js';
import { CITY_ROWS } from './CityKit.js';

// Sonsuz prosedural yol: qabaqda chunk-lar yaranır, arxadakılar silinir.
// Car.update üçün TrackBuilder-uyğun interfeys verir (getNearest, halfWidth, maxRadius).
const SEG = 8;         // nöqtələr arası (m)
// Chunk qurulması ƏSAS AXINDA işləyir — 36 seqmentlik parça kadrı 11-21 ms
// yeyirdi və hər ~7 saniyədə bir 36-40 ms-lik kadr donması verirdi (ölçülüb:
// spike vaxtları chunk vaxtları ilə üst-üstə düşür). Yarıya bölünəndə hər
// qurulma ~6-11 ms olur və kadr büdcəsinə sığır; draw-call artımı cüzidir.
const CHUNK = 12;      // chunk başına seqment (≈96 m)
const AHEAD = 760;     // hərəkət istiqamətində hazır yol (m)
const BACK_AHEAD = 520; // arxaya dönəndə də hazır yol (m)
const TRIM_FAR = 1050; // bu məsafədən uzaq chunk-lar silinir

// ————— DÜNYA RELYEFİ —————
// Hündürlük dünya koordinatının funksiyasıdır: həm yol, həm yer meshi eyni
// funksiyanı oxuyur → yol torpağın ÜSTÜNDƏ oturur, havada üzmür.
// Su səviyyəsindən aşağı çuxurlar göl/çay olur, yol oradan körpü ilə keçir.
export const WATER_LEVEL = 0.9;
export const BRIDGE_CLEAR = 3.6;   // su üzərində yolun minimum hündürlüyü

export function terrainY(x, z) {
  const a = Math.sin(x * 0.0041 + 1.3) * Math.cos(z * 0.0036 - 0.7);   // ~1.6 km
  const b = Math.sin((x + z * 0.7) * 0.0091 + 2.1);                    // ~700 m
  const c = Math.sin(x * 0.0195 - 0.4) * Math.sin(z * 0.0168 + 1.1);   // ~330 m
  return a * 12 + b * 8 + c * 3.2 + 11; // hiss olunan qalxma/eniş; ≈10% su altı
}

// Yolun hündürlüyü: torpaq, amma suyun üstündən körpü ilə keçir (yumşaq keçid)
export function roadYAt(x, z) {
  const t = terrainY(x, z);
  // Yol torpağın üstündədir; YALNIZ su səviyyəsinə yaxın alçaq yerlərdə
  // körpü səviyyəsinə yumşaq qalxır (sahildən başlayan enişli yanaşma)
  const k = Math.max(0, Math.min(1, (WATER_LEVEL + 1.2 - t) / 3));
  if (k <= 0) return t;
  const s = k * k * (3 - 2 * k);
  return t * (1 - s) + Math.max(t, WATER_LEVEL + BRIDGE_CLEAR) * s;
}

// ————— GÖRÜNƏN YER SƏTHİ —————
// Yer meshi relyefi yolun yanında KƏSİR (yol torpaqdan aşağıdırsa, yəni qazma).
// Maşının oturduğu hündürlük eyni funksiyadan oxunmalıdır — yoxsa maşın ya
// təpənin içinə girir, ya da havada qalır. EndlessScene həm mesh vertexləri,
// həm də maşın üçün bunu çağırır.
// TAM KƏSİK RADİUSU yol yarım eni (8) + yer torunun xanası (10 m) cəmindən
// BÖYÜK olmalıdır. Əvvəl 11 idi: kəsilməmiş qonşu vertex öz üçbucağı ilə
// torpağı yolun kənarına 0.4–0.75 m qaldırırdı (şüa testi ilə ölçüldü) —
// oyunçu yolun üstündə torpaq/daş görürdü.
export const CUT_IN = 20, CUT_OUT = 34;   // kəsiyin tam / bitmə radiusu (m)
export function groundYAt(x, z, roadY = null, dist = Infinity) {
  const y = terrainY(x, z);
  if (roadY == null || roadY >= y || dist >= CUT_OUT) return y;
  const k = dist <= CUT_IN ? 1 : 1 - (dist - CUT_IN) / (CUT_OUT - CUT_IN);
  const s = k * k * (3 - 2 * k);
  return y * (1 - s) + (roadY - 0.35) * s;
}

// Körpü/estakada: yol torpaqdan bu qədər yuxarıdırsa sürahi qurulur
// (bax _buildChunk → "KÖRPÜ" bloku). Fizika eyni həddi işlətməlidir.
export const RAIL_ABOVE = 2.2;

// Paylaşılan su materialı — bütün su səthi eyni teksturanı sürüşdürür (1 animasiya)
let _waterMat = null;
export function waterMaterial() {
  if (_waterMat) return _waterMat;
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#2f6f9e';
  ctx.fillRect(0, 0, 128, 128);
  // Yumşaq dalğa zolaqları
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.09})`;
    ctx.lineWidth = 1 + Math.random() * 3;
    const y = Math.random() * 128;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(40, y + 5, 88, y - 5, 128, y + 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  _waterMat = new THREE.MeshStandardMaterial({
    map: tex, color: 0x9fd8f0, transparent: true, opacity: 0.86,
    roughness: 0.18, metalness: 0.1,
  });
  _waterMat.userData = { shared: true };   // bütün zen səhnələri paylaşır
  tex.userData = { shared: true };
  return _waterMat;
}

export class EndlessRoad {
  constructor(scene) {
    this.scene = scene;
    this.halfWidth = 7.5;
    this.maxRadius = Infinity; // dünya sərhədi klampı işə düşməsin
    this.branches = [];

    this.points = [];   // pəncərə (THREE.Vector3)
    this.tangents = [];
    this.normals = [];
    this.base = 0;      // points[0]-ın mütləq indeksi

    this._heading = 0;
    this._curv = 0;
    this._curvTarget = 0;
    this._sinceTurn = 0;
    this._tunY = null;      // tunel girişindəki səviyyə (irəli)
    this._backTunY = null;  // eyni — arxa generator
    this._pos = new THREE.Vector3(0, 0, 0);
    this._pending = 0;  // chunk-a yığılan yeni seqmentlər
    this._pendingBack = 0; // arxa istiqamətdə yığılanlar
    this._backCurv = 0;
    this._backCurvTarget = 0;
    this._backSinceTurn = 0;
    this.chunks = [];   // {startAbs, endAbs, group, obstacles[], spots[]}
    this.obstacles = []; // aktiv pəncərənin maneələri (chunk-lardan)
    this.decorSpots = []; // BÜTÜN dekor mövqeləri — yeni yol onlardan yayınır

    // Cari biom görkəmi (EndlessScene idarə edir)
    this.style = {
      road: 0x33343c, curb: 0xff7a2f, curvMul: 1,
      decor: ['rock'], mountainColor: 0x8a6a4a, fog: 0xf2b47a,
      postEvery: 10,
    };

    this._roadTex = this._asphaltTexture();
    this._group = new THREE.Group();
    scene.add(this._group);

    // Başlanğıc düz yol
    for (let i = 0; i < CHUNK + 6; i++) this._addPoint();
    this._buildChunk();
  }

  get length() { return (this.base + this.points.length) * SEG; }

  // Tunelin İÇ yarım eni (divarlar burada qurulur — bax "TUNEL" bloku).
  // Fizika da eyni dəyəri işlədir ki, maşın divardan keçməsin.
  get tunnelHalfWidth() { return this.halfWidth + 1.4; }

  // FİZİKA üçün: divar MƏHZ burada qurulur (`_tunnelT > 0`).
  // `tunnelAtPos` yumşaq keçid zolağını da qaytarır — o, yağış/səs üçündür,
  // divar yoxlaması üçün yaramır.
  isInTunnel(position, hint = null) {
    return this._tunnelT(this.getNearest(position, hint).index) > 0;
  }

  // Tunel zonası: hər 2600 m-də bir ~230 m tunel (şəhər pəncərəsindən uzaqda)
  _tunnelT(abs) {
    const m = ((abs * SEG) % 2600 + 2600) % 2600;
    return (m >= 1480 && m <= 1710) ? 1 : 0;
  }

  // Yumşaq tunel çəkisi: kənarlarda 0→1 tədricən — girişdə/çıxışda
  // yolun birdən diklənməsi olmasın
  _tunnelW(abs) {
    const m = ((abs * SEG) % 2600 + 2600) % 2600;
    const A = 1480, B = 1710, R = 90; // R = keçid zolağı (m)
    if (m < A - R || m > B + R) return 0;
    let k = 1;
    if (m < A) k = (m - (A - R)) / R;
    else if (m > B) k = 1 - (m - B) / R;
    return k * k * (3 - 2 * k);
  }

  // Şəhərdəlik 0..1 — mütləq indeksdən determinist pəncərə (kənarlar yumşaq)
  _cityT(abs) {
    const m = ((abs * SEG) % 2600 + 2600) % 2600;
    const IN0 = 200, IN1 = 560, RAMP = 100;
    if (m < IN0 - RAMP || m > IN1 + RAMP) return 0;
    if (m >= IN0 && m <= IN1) return 1;
    return m < IN0 ? 1 - (IN0 - m) / RAMP : 1 - (m - IN1) / RAMP;
  }

  // ŞƏHƏRİN MƏRKƏZİLİYİ 0..1 — rayonun ortasında 1, kənarlarında 0.
  // Bununla mərkəzdə hündür binalar, kənarda alçaq tikili alınır: şəhər
  // yol boyu düzülmüş TƏK-TƏK evlər yox, əsl SİLUET verir.
  _cityCore(abs) {
    const m = ((abs * SEG) % 2600 + 2600) % 2600;
    const IN0 = 200, IN1 = 560;
    const k = (m - IN0) / (IN1 - IN0);
    if (k < 0 || k > 1) return 0;
    return Math.sin(k * Math.PI) ** 1.4;
  }

  // Nöqtə indeksinə görə yol hündürlüyü (maşın/kamera üçün)
  heightAt(absIdx) {
    const i = Math.max(0, Math.min(this.points.length - 1, absIdx - this.base));
    return this.points[i] ? this.points[i].y : 0;
  }

  // DƏQİQ hündürlük: mövqe seqment boyu proyeksiya olunur, y interpolyasiya —
  // 8m-lik nöqtə addımları ilə "yerə girib-çıxma" olmur
  // Verilmiş mövqedə tunel gücü (0..1) — yağış/qar və səs üçün
  tunnelAtPos(position, hint = null) {
    const near = this.getNearest(position, hint);
    return this._tunnelT(near.index) * this._tunnelW(near.index);
  }

  // ÇİYİN ZOLAĞININ DƏQİQ HÜNDÜRLÜYÜ — `_verge` həndəsəsi ilə HƏRFƏN eyni:
  // daxili kənar (hw+0.65) yol səviyyəsində, xarici kənar (hw+4.2) torpaqda,
  // arada XƏTTİ rampa. Əvvəl fizika smoothstep işlədirdi və maşın zolağın
  // ortasında 30–37 sm səthin ALTINA düşürdü (istifadəçi rəyi: yerə girir).
  // Qaytarır: {y, k} — k=1 xarici kənardan kənarda (torpaq hökmranlığı).
  vergeYAt(position, hint = null) {
    const near = this.getNearest(position, hint);
    const li = Math.max(0, Math.min(this.points.length - 1, near.index - this.base));
    const c = this.points[li], n = this.normals[li];
    if (!c || !n) return null;
    const hw = this.halfWidth;
    const lat = near.lateral;
    const off = Math.abs(lat) - (hw + 0.65);
    if (off <= 0) return { y: this.heightAtPos(position, hint), k: 0 };
    const sd = Math.sign(lat) || 1;
    const roadY = this.heightAtPos(position, hint);
    const içY = roadY + 0.04;
    // xarici kənar nöqtəsi (hw+4.2) — terrainY orada oxunur
    const ox = c.x + n.x * sd * (hw + 4.2);
    const oz = c.z + n.z * sd * (hw + 4.2);
    const çölY = Math.min(içY, Math.max(terrainY(ox, oz), WATER_LEVEL - 0.5));
    const t = Math.min(1, off / 3.55);
    return { y: içY + (çölY - içY) * t, k: t };
  }

  heightAtPos(position, hint = null) {
    const near = this.getNearest(position, hint);
    const li = Math.max(0, Math.min(this.points.length - 2, near.index - this.base));
    const p0 = this.points[li], p1 = this.points[li + 1];
    const dx = p1.x - p0.x, dz = p1.z - p0.z;
    const len2 = dx * dx + dz * dz || 1;
    let tt = ((position.x - p0.x) * dx + (position.z - p0.z) * dz) / len2;
    tt = Math.max(-1, Math.min(2, tt)); // qonşu seqmentə yüngül ekstrapolyasiya
    return p0.y + (p1.y - p0.y) * tt;
  }

  setStyle(patch) { Object.assign(this.style, patch); }

  _addPoint() {
    this._sinceTurn++;
    if (this._sinceTurn > 12 + Math.random() * 12) {
      this._sinceTurn = 0;
      // Geniş, axıcı virajlar — tez-tez, amma sakit (radius ~150 m+)
      this._curvTarget = (Math.random() - 0.5) * 0.11 * this.style.curvMul;
      if (Math.random() < 0.12) this._curvTarget *= 0.25; // arabir sakit hissə
    }
    // Tuneldə yol DÜZDÜR (qazma düz gedir)
    {
      const tw = this._tunnelW(this.base + this.points.length);
      if (tw > 0.15) { this._curvTarget *= (1 - tw); this._curv *= 1 - 0.3 * tw; }
    }
    // YAYINMA: yeni yol həm KÖHNƏ YOLDAN, həm də DEKORDAN (daş/təpə/dağ) qaçır
    {
      const n = this.points.length;
      let tx = 0, tz = 0, found = false, worst = Infinity;
      for (let i = 0; i < n - 30; i++) {
        const dx = this._pos.x - this.points[i].x;
        const dz = this._pos.z - this.points[i].z;
        const d = dx * dx + dz * dz - 55 * 55; // limitdən nə qədər içəridədir
        if (d < worst) { worst = d; tx = this.points[i].x; tz = this.points[i].z; found = d < 0; }
      }
      for (const sp of this.decorSpots) {
        const lim = sp.r + this.halfWidth + 8;
        const dx = this._pos.x - sp.x;
        const dz = this._pos.z - sp.z;
        const d = dx * dx + dz * dz - lim * lim;
        if (d < worst) { worst = d; tx = sp.x; tz = sp.z; found = d < 0; }
      }
      if (found) {
        const hx = Math.sin(this._heading), hz = Math.cos(this._heading);
        const cross = hx * (tz - this._pos.z) - hz * (tx - this._pos.x);
        this._curvTarget = (cross > 0 ? 1 : -1) * 0.06; // təhlükədən ƏKS tərəfə dön
        this._sinceTurn = -14; // bir müddət bu qərar qüvvədə qalsın
      }
    }

    // ————— SƏRT ZƏMANƏT: yol nöqtəsi dekorun İÇİNƏ girə bilməz —————
    // Yuxarıdakı yayınma YUMŞAQ sükandır: iri dağ (ətək radiusu 160 m-ə
    // qədər) qarşısında gec qalır və yol dağın içindən keçirdi (şüa testi
    // ilə tapıldı: biom keçidində 93 pozuntu). İndi nöqtə zonaya girirsə
    // MƏCBURİ kənara itələnir. İtələmə addımı 1.8 m ilə məhdudlaşır —
    // yol IIR hamarlaması ilə birlikdə bu, gözə görünmür.
    for (let cəhd = 0; cəhd < 3; cəhd++) {
      let ən = null, ənDərin = 0;
      for (const sp of this.decorSpots) {
        // İri obyektlər (dağ) üçün ehtiyat daha genişdir: onların ətəyi
        // silsilə deformasiyası ilə genişlənir və yumşaq sükan gec qalır
        const lim = sp.r + this.halfWidth + (sp.r > 40 ? 14 : 6);
        const dx = this._pos.x - sp.x, dz = this._pos.z - sp.z;
        const d = Math.hypot(dx, dz);
        const dərin = lim - d;
        if (dərin > ənDərin) { ənDərin = dərin; ən = { sp, dx, dz, d }; }
      }
      if (!ən) break;
      const { sp, dx, dz, d } = ən;
      const nx = d > 0.001 ? dx / d : 1, nz = d > 0.001 ? dz / d : 0;
      const addım = Math.min(1.8, ənDərin);
      this._pos.x += nx * addım;
      this._pos.z += nz * addım;
      if (ənDərin <= 1.8) break;
    }
    this._curv += (this._curvTarget - this._curv) * 0.16;
    this._heading += this._curv;
    this._pos.x += Math.sin(this._heading) * SEG;
    this._pos.z += Math.cos(this._heading) * SEG;
    const p = this._pos.clone();
    p.y = roadYAt(p.x, p.z);
    // TUNEL: determinist zonada yol qalxmır — dağın/təpənin içindən keçir
    {
      const absIdx = this.base + this.points.length;
      const w = this._tunnelW(absIdx);
      if (w > 0) {
        if (this._tunY == null) this._tunY = p.y;   // keçidin başındakı səviyyə
        p.y = p.y * (1 - w) + this._tunY * w;       // yumşaq düzləşmə
      } else this._tunY = null;
    }
    // Şaquli profilin hamarlanması: qonşu nöqtələrlə yüngül filtr —
    // tunel giriş/çıxışında və relyef kəsişmələrində kəskin künc qalmasın
    {
      const n = this.points.length;
      if (n >= 2) p.y = p.y * 0.5 + this.points[n - 1].y * 0.32 + this.points[n - 2].y * 0.18;
      else if (n === 1) p.y = p.y * 0.6 + this.points[0].y * 0.4;
    }
    const t = new THREE.Vector3(Math.sin(this._heading), 0, Math.cos(this._heading));
    this.points.push(p);
    this.tangents.push(t);
    this.normals.push(new THREE.Vector3(t.z, 0, -t.x));
    this._pending++;
    if (this._pending >= CHUNK) this._buildChunk();
  }

  // Maşının olduğu yerə görə yol HƏR İKİ istiqamətdə hazır saxlanır —
  // arxaya dönsən də yol bitmir, generasiya davam edir.
  ensure(carDist) {
    // Qoruyucu limitlər: patoloji halda belə kadr başına generasiya bağlıdır
    for (let g = 0; g < 220 && this.length < carDist + AHEAD; g++) this._addPoint();
    for (let g = 0; g < 220 && this.base * SEG > carDist - BACK_AHEAD; g++) this._addPointBack();
    this._trim(carDist - TRIM_FAR);
    this._trimFront(carDist + TRIM_FAR);
  }

  // Arxaya doğru nöqtə əlavə et — əyrilik gəzintisi ilə (öz "keçmişini" uydurur)
  _addPointBack() {
    const p0 = this.points[0];
    const p1 = this.points[1];
    const h1 = Math.atan2(p1.x - p0.x, p1.z - p0.z); // ilk seqmentin istiqaməti
    this._backSinceTurn++;
    if (this._backSinceTurn > 12 + Math.random() * 10) {
      this._backSinceTurn = 0;
      this._backCurvTarget = (Math.random() - 0.5) * 0.055 * this.style.curvMul;
      if (Math.random() < 0.25) this._backCurvTarget = 0;
    }
    // YAYINMA (arxa istiqamət): köhnə yol + dekor
    {
      const n = this.points.length;
      let px2 = 0, pz2 = 0, found = false, worst = Infinity;
      for (let i = 30; i < n; i++) {
        const dx = p0.x - this.points[i].x;
        const dz = p0.z - this.points[i].z;
        const d = dx * dx + dz * dz - 55 * 55;
        if (d < worst) { worst = d; px2 = this.points[i].x; pz2 = this.points[i].z; found = d < 0; }
      }
      for (const sp of this.decorSpots) {
        const lim = sp.r + this.halfWidth + 8;
        const dx = p0.x - sp.x;
        const dz = p0.z - sp.z;
        const d = dx * dx + dz * dz - lim * lim;
        if (d < worst) { worst = d; px2 = sp.x; pz2 = sp.z; found = d < 0; }
      }
      if (found) {
        // Hərəkət istiqaməti geriyədir (-dir(hb)); təhlükədən əks tərəfə dön
        const tx = -Math.sin(h1), tz = -Math.cos(h1);
        const cross = tx * (pz2 - p0.z) - tz * (px2 - p0.x);
        this._backCurvTarget = (cross > 0 ? -1 : 1) * 0.06;
        this._backSinceTurn = -14;
      }
    }
    this._backCurv += (this._backCurvTarget - this._backCurv) * 0.1;
    const hb = h1 - this._backCurv; // bir seqment əvvəlki istiqamət
    const t = new THREE.Vector3(Math.sin(hb), 0, Math.cos(hb));
    const np = new THREE.Vector3(p0.x - t.x * SEG, 0, p0.z - t.z * SEG);
    np.y = roadYAt(np.x, np.z);
    {
      const bw = this._tunnelW(this.base - 1);
      if (bw > 0) {
        if (this._backTunY == null) this._backTunY = np.y;
        np.y = np.y * (1 - bw) + this._backTunY * bw;
      } else this._backTunY = null;
      // Şaquli hamarlama (arxa istiqamət) — siyahının başındakı nöqtələrlə
      if (this.points.length >= 2) {
        np.y = np.y * 0.5 + this.points[0].y * 0.32 + this.points[1].y * 0.18;
      }
    }
    this.points.unshift(np);
    this.tangents.unshift(t);
    this.normals.unshift(new THREE.Vector3(t.z, 0, -t.x));
    this.base -= 1;
    this._pendingBack++;
    if (this._pendingBack >= CHUNK) this._buildChunkBack();
  }

  // Şaquli divar lenti: yol boyunca, verilmiş yan məsafədə, y0..y1 arası
  _wall(pts, nrms, off, y0, y1, color, opts = {}) {
    const verts = [], uvs = [], idx = [];
    for (let i = 0; i < pts.length; i++) {
      const c = pts[i], n = nrms[i];
      verts.push(c.x + n.x * off, c.y + y0, c.z + n.z * off);
      verts.push(c.x + n.x * off, c.y + y1, c.z + n.z * off);
      const v = i * 0.25;
      uvs.push(0, v, 1, v);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const o = i * 2;
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color, roughness: 0.95, metalness: 0, flatShading: true,
      side: THREE.DoubleSide, ...opts,
    }));
  }

  // Tunel tağı: divar başından yarımdairə ilə qübbəyə qalxır.
  // (Düz tavan tuneli nazik qutu kimi göstərirdi.)
  _arch(pts, nrms, W, wallH, archR, color, RIB = 9) {
    const verts = [], idx = [];
    const cols = RIB + 1;
    for (let i = 0; i < pts.length; i++) {
      const c = pts[i], n = nrms[i];
      for (let j = 0; j <= RIB; j++) {
        const a = Math.PI * (j / RIB);
        const off = W * Math.cos(a);
        const y = c.y + wallH + archR * Math.sin(a);
        verts.push(c.x + n.x * off, y, c.z + n.z * off);
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = 0; j < RIB; j++) {
        const o = i * cols + j;
        idx.push(o, o + cols, o + 1, o + 1, o + cols, o + cols + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const ar = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color, roughness: 1, metalness: 0, side: THREE.DoubleSide,
      emissive: 0x2b2e37, emissiveIntensity: 0.9,
    }));
    ar.userData.roadPart = true;   // tunel qabığı — dəhlizin öz hissəsi
    return ar;
  }

  // Çiyin zolağı: daxili kənar YOL hündürlüyündə, xarici kənar TORPAQ
  // hündürlüyündə — beləcə yol relyefə təbii oturur, kəsik görünmür.
  _verge(pts, nrms, offIn, offOut, color) {
    const verts = [], idx = [];
    for (let i = 0; i < pts.length; i++) {
      const c = pts[i], n = nrms[i];
      const ix = c.x + n.x * offIn, iz = c.z + n.z * offIn;
      const ox = c.x + n.x * offOut, oz = c.z + n.z * offOut;
      // Xarici kənar torpaqla eyni səviyyədə (körpüdə yolun altına düşməsin)
      const oy = Math.min(c.y + 0.04, Math.max(terrainY(ox, oz), WATER_LEVEL - 0.5));
      verts.push(ix, c.y + 0.04, iz, ox, oy, oz);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const o = i * 2;
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color, roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide,
    }));
    mesh.userData.roadPart = true;   // dəhliz süpürgəsi toxunmasın
    mesh.receiveShadow = true;
    return mesh;
  }

  _ribbon(pts, nrms, offA, offB, color, y, opts = {}) {
    const verts = [];
    const uvs = [];
    const idx = [];
    for (let i = 0; i < pts.length; i++) {
      const c = pts[i];
      const n = nrms[i];
      verts.push(c.x + n.x * offA, c.y + y, c.z + n.z * offA, c.x + n.x * offB, c.y + y, c.z + n.z * offB);
      const v = (opts.absStart + i) * SEG / 26;
      uvs.push(0, v, 1, v);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const o = i * 2;
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    if (opts.tans) {
      // ANALİTİK NORMALLAR: üçbucaq ortalaması hər parçada (chunk) ayrı
      // hesablanır və TİKİŞDƏ normallar uyğun gəlmirdi — gecə fara işığında
      // yolun eninə sərt qaranlıq xətt kimi görünürdü ("görünməz obyektin
      // kölgəsi" — istifadəçi rəyi). Qlobal hamar tangensdən hesablananda
      // tikişdəki nöqtə hər iki parçada EYNİ normalı alır.
      const nor = new Float32Array(pts.length * 6);
      for (let i = 0; i < pts.length; i++) {
        const f = opts.tans[i], sN = nrms[i];
        // n = f × s  (yuxarı baxan səth normalı)
        let nx = f.y * sN.z, ny = f.z * sN.x - f.x * sN.z, nz = -f.y * sN.x;
        // İSTİQAMƏT ÜÇBUCAQ SARĞISINA UYĞUN OLMALIDIR (kritik buq idi):
        // lent indeksləri səthi AŞAĞI baxan kimi qurur; three.js DoubleSide-da
        // arxa üzün normalını çevirir. Yuxarı (+Y) versək çevrilmə onu aşağı
        // salırdı və asfalt gündüz QAPQARA render olunurdu — gecə isə fara
        // konusunun kənarı "kəsik kölgə" kimi görünürdü.
        if (ny > 0) { nx = -nx; ny = -ny; nz = -nz; }
        const L = Math.hypot(nx, ny, nz) || 1;
        nx /= L; ny /= L; nz /= L;
        nor[i * 6] = nx; nor[i * 6 + 1] = ny; nor[i * 6 + 2] = nz;
        nor[i * 6 + 3] = nx; nor[i * 6 + 4] = ny; nor[i * 6 + 5] = nz;
      }
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    } else {
      geo.computeVertexNormals();
    }
    const rb = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color, map: opts.map ?? null, roughness: opts.roughness ?? 0.95, metalness: 0,
      emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
      side: THREE.DoubleSide,
    }));
    rb.userData.roadPart = true;
    rb.receiveShadow = true;      // maşın/dekor kölgəsi asfaltda görünsün
    return rb;
  }

  _buildChunk() {
    if (this._pending < 2) return;
    const n = this.points.length;
    const i0 = Math.max(0, n - this._pending - 1); // 1 nöqtə üst-üstə — tikişsiz
    const pts = this.points.slice(i0);
    const nrms = this.normals.slice(i0);
    const tans = this.tangents.slice(i0);
    const absStart = this.base + i0;
    this._pending = 0;
    const { merged, obstacles, spots } = this._makeChunkMesh(pts, nrms, absStart, tans);
    this._group.add(merged);
    this.decorSpots.push(...spots);
    this.chunks.push({ startAbs: absStart, endAbs: this.base + n - 1, group: merged, obstacles, spots });
  }

  // Arxa istiqamət chunk-ı — siyahının ƏVVƏLİNƏ daxil olur
  _buildChunkBack() {
    if (this._pendingBack < 2) return;
    const cnt = Math.min(this._pendingBack + 1, this.points.length); // 1 nöqtə üst-üstə
    const pts = this.points.slice(0, cnt);
    const nrms = this.normals.slice(0, cnt);
    const tans = this.tangents.slice(0, cnt);
    const absStart = this.base;
    this._pendingBack = 0;
    const { merged, obstacles, spots } = this._makeChunkMesh(pts, nrms, absStart, tans);
    this._group.add(merged);
    this.decorSpots.push(...spots);
    this.chunks.unshift({ startAbs: absStart, endAbs: absStart + cnt - 1, group: merged, obstacles, spots });
  }

  // Dəhlizə girən obyektləri silir. `keep` payı: yol yarımeni + obyekt radiusu
  // + 1.5 m ehtiyat. Yol lentinin ÖZ hissələri (asfalt, kənar, sürahi, tunel)
  // toxunulmazdır — onları ada görə ayırırıq.
  // Yer boşdurmu — yeni obyekt mövcud maneə ilə kəsişməməlidir.
  // Zen-də dekor müstəqil qoyulurdu və daş binanın İÇİNDƏ qala bilirdi
  // (istifadəçi rəyi).
  _spotFree(x, z, r, pad = 0.8) {
    const ob = this.obstacles;
    for (let i = ob.length - 1; i >= 0 && i > ob.length - 400; i--) {
      const o = ob[i];
      if (Math.hypot(o.x - x, o.z - z) < o.r + r + pad) return false;
    }
    return true;
  }

  _clearRoadCorridor(group, pts) {
    const box = new THREE.Box3(), size = new THREE.Vector3();
    const kill = [];
    for (const o of group.children) {
      if (o.userData?.roadPart) continue;      // yolun öz hissəsi
      box.setFromObject(o);
      if (!isFinite(box.min.x)) continue;
      box.getSize(size);
      const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
      const r = Math.max(size.x, size.z) * 0.5;
      if (r > 60) {
        // NƏHƏNG obyekt (dağ, təpə silsiləsi): sərhəd qutusu ilə ölçmək
        // ədalətsizdir — konus daralır. Həqiqi TƏPƏLƏRİ yoxlayırıq.
        if (this._geomHitsRoad(o, pts)) kill.push(o);
        continue;
      }
      const need = this.halfWidth + r + 1.5;
      const need2 = need * need;
      for (let i = 0; i < pts.length; i++) {
        const dx = cx - pts[i].x, dz = cz - pts[i].z;
        if (dx * dx + dz * dz < need2) { kill.push(o); break; }
      }
    }
    for (const o of kill) {
      group.remove(o);
      o.traverse?.((n) => n.geometry?.dispose?.());
    }
    // QALAN hər obyekt yayınma xəritəsinə yazılır: yol sonradan uzananda
    // ONLARIN ÜSTÜNDƏN KEÇMƏSİN. Əvvəl yalnız bir hissəsi yazılırdı və
    // "yolun ortasında ev/dağ" məhz bundan yaranırdı.
    const spots = [];
    for (const o of group.children) {
      if (o.userData?.roadPart) continue;
      box.setFromObject(o);
      if (!isFinite(box.min.x)) continue;
      box.getSize(size);
      const r = Math.max(size.x, size.z) * 0.5;
      if (r > 60 || r < 0.6) continue;         // nəhəng siluet və xırda ot — yox
      spots.push({ x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2, r });
    }
    this.decorSpots.push(...spots);
    return kill.length;
  }

  // Obyektin HƏQİQİ həndəsəsi yol dəhlizinə girirmi? (nəhəng obyektlər üçün)
  _geomHitsRoad(obj, pts) {
    const lim = this.halfWidth + 2.0;
    const lim2 = lim * lim;
    const v = new THREE.Vector3();
    let hit = false;
    obj.updateMatrixWorld(true);
    obj.traverse((n) => {
      if (hit || !n.isMesh) return;
      const pos = n.geometry?.attributes?.position;
      if (!pos) return;
      const step = Math.max(1, Math.floor(pos.count / 260));   // seyrək seçmə
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(n.matrixWorld);
        for (let k = 0; k < pts.length; k += 2) {
          const q = pts[k];
          if (Math.abs(v.y - q.y) > 10) continue;               // fərqli səviyyə
          const dx = v.x - q.x, dz = v.z - q.z;
          if (dx * dx + dz * dz < lim2) { hit = true; return; }
        }
      }
    });
    return hit;
  }

  _makeChunkMesh(pts, nrms, absStart, tans = null) {
    const g = new THREE.Group();
    const hw = this.halfWidth;
    const s = this.style;
    // ZƏMANƏT: asfalt torpaqdan bir neçə sm YUXARIDA çəkilir (0.02 → 0.08).
    // Prosedural relyefdə yer bəzən yolun səviyyəsinə çox yaxın düşür və
    // kənarlarda kəsişmə/z-döyüşü görünürdü. Kənar zolaq və ayırıcı xətt
    // də uyğun qaldırılıb (sıra pozulmasın). Fizika toxunulmazdır.
    // Asfalt tonu yarış trekləri ilə eyni qaydada açılır (bax
    // TrackBuilder: qapqara səth "ucuz" görünürdü)
    const roadCol = new THREE.Color(s.road).lerp(new THREE.Color(0xffffff), 0.16).getHex();
    g.add(this._ribbon(pts, nrms, -hw, hw, roadCol, 0.08, { map: this._roadTex, absStart, tans }));
    g.add(this._ribbon(pts, nrms, hw, hw + 0.65, s.curb, 0.105, { emissive: s.curb, emissiveIntensity: 0.3, absStart, tans }));
    g.add(this._ribbon(pts, nrms, -hw - 0.65, -hw, s.curb, 0.105, { emissive: s.curb, emissiveIntensity: 0.3, absStart, tans }));
    // ÇİYİN: səkidən torpağa maili keçid. Olmayanda yol qara qalın plita kimi
    // görünürdü və yandan çıxanda kənarda uçurum vardı.
    for (const sd of [1, -1]) g.add(this._verge(pts, nrms, sd * (hw + 0.65), sd * (hw + 4.2), s.ground ?? 0x6b5a3e));
    // Mərkəz kəsik xətləri
    for (let i = 2; i < pts.length - 2; i += 5) {
      const seg = pts.slice(i, i + 2);
      const nseg = nrms.slice(i, i + 2);
      const tseg = tans ? tans.slice(i, i + 2) : null;
      g.add(this._ribbon(seg, nseg, -0.2, 0.2, 0xe8e6da, 0.095, { absStart: absStart + i, tans: tseg }));
    }
    const chunkObstacles = [];
    const chunkSpots = []; // yol generatorunun yayınma xəritəsi

    // Yol postları (seyrək)
    const postGeo = new THREE.BoxGeometry(0.26, 1.0, 0.26);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.7 });
    for (let i = 3; i < pts.length; i += s.postEvery) {
      if (pts[i].y - terrainY(pts[i].x, pts[i].z) > 2.2) continue; // körpüdə post yox
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.userData.roadPart = true;
        // Postlar bərkdir — əvvəl içindən keçmək olurdu
        {
          const ox = pts[i].x + nrms[i].x * (hw + 1.5) * side;
          const oz = pts[i].z + nrms[i].z * (hw + 1.5) * side;
          const ob = { x: ox, z: oz, r: 0.3 };
          chunkObstacles.push(ob); this.obstacles.push(ob);
        }
        post.position.set(
          pts[i].x + nrms[i].x * (hw + 1.5) * side, pts[i].y + 0.5,
          pts[i].z + nrms[i].z * (hw + 1.5) * side
        );
        g.add(post);
      }
    }


    // ————— TUNEL: relyef yolun üstündədirsə qabıq qur (tavan + divar + portal) —————
    {
      const inTun = (i) => this._tunnelT(absStart + i) > 0;
      const H = 5.6, W = hw + 1.4;
      const wallC = 0x767b8c, ceilC = 0x4a4e5a;
      let run = -1;
      const WALL_H = 2.6;                 // şaquli divar hündürlüyü
      const build = (a, b) => {
        if (b - a < 2) return;
        const tp = pts.slice(a, b + 1), tn = nrms.slice(a, b + 1);
        // TAĞ: içəri qabıq + XARİCİ qalın qabıq. Tək səth çöldən "nazik kağız"
        // kimi görünürdü — indi divar qalınlığı real hiss olunur.
        const THICK = 1.15;
        g.add(this._arch(tp, tn, W, WALL_H, H - WALL_H, ceilC));
        g.add(this._arch(tp, tn, W + THICK, WALL_H, H - WALL_H + THICK, 0x5d6270));
        // KRİTİK: divar/zolaq mesh-lərinə roadPart qoyulmalıdır — dəhliz
        // süpürgəsi (_clearRoadCorridor) onları 'yol üstündəki maneə' sanıb
        // SİLİRDİ. Nəticədə tunelin içi divarsız-işıqsız qara boşluq idi
        // (vizual audit tapıntısı).
        const qoru = (m) => { m.userData.roadPart = true; return m; };
        for (const sd of [1, -1]) {
          g.add(qoru(this._wall(tp, tn, sd * W, 0, WALL_H, wallC, { emissive: 0x3a3e4a, emissiveIntensity: 0.75 })));
          // xarici divar üzü — qalınlıq çöldən görünsün
          g.add(qoru(this._wall(tp, tn, sd * (W + 1.15), 0, WALL_H, 0x5d6270, { roughness: 1 })));
          // Divar boyu işıq zolağı — tunel işıqlandırması
          g.add(qoru(this._wall(tp, tn, sd * (W - 0.05), WALL_H - 0.62, WALL_H - 0.24, 0xfff0c8, {
            emissive: 0xffdca0, emissiveIntensity: 2.6, roughness: 0.4,
          })));
        }
        // Tavan lampaları — tunel içi işıqlı olsun
        for (let i = 2; i < tp.length - 1; i += 3) {
          const lamp = new THREE.Mesh(
            new THREE.BoxGeometry(2.6, 0.14, 0.6),
            new THREE.MeshStandardMaterial({
              color: 0xfff6e0, emissive: 0xffd98a, emissiveIntensity: 3.2, roughness: 0.4,
            })
          );
          lamp.position.set(tp[i].x, tp[i].y + H - 0.25, tp[i].z);
          lamp.rotation.y = Math.atan2(tn[i].x, tn[i].z);
          lamp.userData.roadPart = true;   // süpürgə tavan lampasını silməsin
          g.add(lamp);
        }
        // ————— DAĞ SİLSİLƏSİ —————
        // 1-ci cəhd (konuslar) portalı udurdu və yolun üstündən kütlə
        // asılırdı (vizual audit: maşın 'qayanın içinə girirdi'). İndi qabığın
        // üstünə oturan, yol boyu uzanan SİLSİLƏ prizması qurulur: en kəsiyi
        // qabıqdan kənarda başlayır (±(W+0.9), H+0.5), zirvəsi mərkəzdə,
        // ətəkləri terrainə enir. Portallardan 1 seqment içəridə başlayır —
        // giriş üzü açıq qalır. Ucları qapaqla bağlanır (içi görünməsin).
        {
          const mCol = this.style.mountainColor ?? 0x8a6a4a;
          const mMat = new THREE.MeshStandardMaterial({
            color: mCol, roughness: 1, metalness: 0, flatShading: true,
          });
          const a0 = 1, b0 = tp.length - 2;
          if (b0 - a0 >= 2) {
            const rnd = (i) => Math.sin(i * 12.9898 + 78.233) * 0.5 + 0.5;
            const verts = [], idx = [];
            const PROF = 5;   // profil nöqtəsi sayı
            for (let i = a0; i <= b0; i++) {
              const c = tp[i], n = tn[i];
              // ucları alçalt — silsilə təbii şəkildə yerə enir
              const k = Math.min(1, Math.min(i - a0, b0 - i) / 2.5);
              const zirvə = c.y + H + (3 + 6.5 * k) + rnd(absStart + i) * 2.2 * k;
              const çiyinY = c.y + H + 0.5;
              const döşəmə = c.y - 3;   // göl/dərin çuxur ətəyi dartmasın
              const solƏtəkY = Math.min(çiyinY, Math.max(terrainY(c.x - n.x * (W + 17), c.z - n.z * (W + 17)), döşəmə));
              const sağƏtəkY = Math.min(çiyinY, Math.max(terrainY(c.x + n.x * (W + 17), c.z + n.z * (W + 17)), döşəmə));
              const prof = [
                [-(W + 17), solƏtəkY],
                [-(W + 0.9), çiyinY],
                [rnd(absStart + i + 7) * 2 - 1, zirvə],
                [(W + 0.9), çiyinY],
                [(W + 17), sağƏtəkY],
              ];
              for (const [off, y] of prof) verts.push(c.x + n.x * off, y, c.z + n.z * off);
            }
            const rows = b0 - a0 + 1;
            for (let i = 0; i < rows - 1; i++) {
              for (let j = 0; j < PROF - 1; j++) {
                const o = i * PROF + j;
                idx.push(o, o + PROF, o + 1, o + 1, o + PROF, o + PROF + 1);
              }
            }
            // UC QAPAQLARI: profil halqasından çiyin ortasına yelpik
            for (const [ring, çevir] of [[0, true], [rows - 1, false]]) {
              const base = ring * PROF;
              const cIdx = verts.length / 3;
              // mərkəz nöqtəsi: profilin orta hündürlüyündə
              const cx = (verts[base * 3] + verts[(base + PROF - 1) * 3]) / 2;
              const cy = verts[(base + 1) * 3 + 1];
              const cz = (verts[base * 3 + 2] + verts[(base + PROF - 1) * 3 + 2]) / 2;
              verts.push(cx, cy, cz);
              for (let j = 0; j < PROF - 1; j++) {
                if (çevir) idx.push(base + j, base + j + 1, cIdx);
                else idx.push(base + j + 1, base + j, cIdx);
              }
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
            geo.setIndex(idx);
            geo.computeVertexNormals();
            const silsilə = new THREE.Mesh(geo, mMat);
            silsilə.userData.roadPart = true;   // dəhliz süpürgəsi toxunmasın
            silsilə.castShadow = true;
            silsilə.receiveShadow = true;
            g.add(silsilə);
          }
        }

        // Giriş/çıxış portalları — beton çərçivə
        const portMat = new THREE.MeshStandardMaterial({ color: 0x6a6e7c, roughness: 0.9, flatShading: true });
        for (const e of [0, tp.length - 1]) {
          const c = tp[e], n = tn[e];
          for (const sd of [-1, 1]) {
            const col = new THREE.Mesh(new THREE.BoxGeometry(1.5, H + 1.4, 1.6), portMat);
            col.position.set(c.x + n.x * (W + 0.7) * sd, c.y + (H + 1.4) / 2, c.z + n.z * (W + 0.7) * sd);
            col.rotation.y = Math.atan2(n.x, n.z);
            col.userData.roadPart = true;
            g.add(col);
          }
          const lint = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 3.2, 1.5, 1.8), portMat);
          lint.position.set(c.x, c.y + H + 0.7, c.z);
          lint.rotation.y = Math.atan2(n.x, n.z);
          lint.userData.roadPart = true;
          g.add(lint);
        }
      };
      for (let i = 0; i < pts.length; i++) {
        if (inTun(i)) { if (run < 0) run = i; }
        else if (run >= 0) { build(run, i - 1); run = -1; }
      }
      if (run >= 0) build(run, pts.length - 1);
    }

    // ————— MƏNZƏRƏ DAYANACAĞI: göl kənarında sürahili baxış meydançası —————
    {
      for (let i = 6; i < pts.length - 6; i += 7) {
        if (this._tunnelT(absStart + i)) continue;                      // tuneldə yox
        if (pts[i].y - terrainY(pts[i].x, pts[i].z) > 2) continue;      // körpüdə yox
        const n = nrms[i];
        let side = 0;
        for (const sd of [-1, 1]) {
          const wx = pts[i].x + n.x * 34 * sd, wz = pts[i].z + n.z * 34 * sd;
          if (terrainY(wx, wz) < WATER_LEVEL + 0.2) { side = sd; break; } // yaxınlıqda su
        }
        if (!side) continue;
        const px = pts[i].x + n.x * (hw + 7.5) * side;
        const pz = pts[i].z + n.z * (hw + 7.5) * side;
        // Meydançanın ÖZ yeri quru və yol səviyyəsinə yaxın olmalıdır —
        // əvvəl yalnız uzaqda su olub-olmadığına baxılırdı, ona görə
        // skamya bəzən suyun ortasında qalırdı
        const pTer = terrainY(px, pz);
        if (pTer < WATER_LEVEL + 0.8) continue;
        if (Math.abs(pTer - pts[i].y) > 2.0) continue;
        const py = pts[i].y;
        const rot = Math.atan2(n.x * side, n.z * side);
        const padMat = new THREE.MeshStandardMaterial({ color: 0x9b9384, roughness: 1, flatShading: true });
        const pad = new THREE.Mesh(new THREE.BoxGeometry(13, 0.35, 9), padMat);
        pad.position.set(px, py - 0.1, pz);
        pad.rotation.y = rot;
        g.add(pad);
        // Sürahi (suya baxan kənar)
        const railMat = new THREE.MeshStandardMaterial({
          color: 0xdfe4ec, emissive: 0x8899aa, emissiveIntensity: 0.15, roughness: 0.7, flatShading: true,
        });
        const rail = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.22, 0.22), railMat);
        rail.position.set(px + n.x * 4.2 * side, py + 0.95, pz + n.z * 4.2 * side);
        rail.rotation.y = rot;
        g.add(rail);
        for (const o of [-5.2, 0, 5.2]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.05, 0.2), railMat);
          const tx = -n.z, tz = n.x;
          post.position.set(
            px + n.x * 4.2 * side + tx * o, py + 0.45,
            pz + n.z * 4.2 * side + tz * o
          );
          g.add(post);
        }
        // Skamya — suya baxır
        const benchMat = new THREE.MeshStandardMaterial({ color: 0x8a6242, roughness: 0.95, flatShading: true });
        const seat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 0.9), benchMat);
        seat.position.set(px - n.x * 1.4 * side, py + 0.6, pz - n.z * 1.4 * side);
        seat.rotation.y = rot;
        g.add(seat);
        for (const o of [-1.3, 1.3]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.7), benchMat);
          const tx = -n.z, tz = n.x;
          leg.position.set(px - n.x * 1.4 * side + tx * o, py + 0.3, pz - n.z * 1.4 * side + tz * o);
          leg.rotation.y = rot;
          g.add(leg);
        }
        break; // hər chunk-da ən çox bir dayanacaq
      }
    }

    // ————— KÖRPÜ: hündür seqmentlərdə dayaq sütunları + qoruyucu sürahi —————
    {
      const pilMat = new THREE.MeshStandardMaterial({ color: 0x4a4f5e, roughness: 0.9, flatShading: true });
      const railMat = 0xc7ccd8;
      for (let i = 2; i < pts.length; i += 4) {
        const py = pts[i].y;
        const tY = terrainY(pts[i].x, pts[i].z);
        if (tY > py - 0.5) continue; // torpaq yolun səviyyəsində/üstündə → dayaq lazım deyil
        const gy = Math.min(tY, WATER_LEVEL); // su dibi/torpaq
        const h = py - gy;
        if (h > 2.6) {
          // Zirvəsi yol səthinin ALTINDA qalmalıdır — yoxsa yolun ortasından çıxır
          const pil = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, h, 8), pilMat);
          pil.userData.roadPart = true;   // körpü dayağı
          pil.position.set(pts[i].x, gy + h / 2 - 0.2, pts[i].z);
          g.add(pil);
        }
      }
      // Sürahi zolaqları: ardıcıl hündür hissələr üçün
      let run0 = -1;
      const flushRail = (a, b) => {
        if (b - a < 2) return;
        const rp = pts.slice(a, b + 1), rn = nrms.slice(a, b + 1);
        for (const sd of [1, -1]) {
          g.add(this._ribbon(rp, rn, sd * (hw + 0.3), sd * (hw + 0.72), railMat, 0.95,
            { absStart: absStart + a, emissive: railMat, emissiveIntensity: 0.12 }));
        }
      };
      for (let i = 0; i < pts.length; i++) {
        const above = pts[i].y - terrainY(pts[i].x, pts[i].z);
        if (above > 2.2 && above < 40) { if (run0 < 0) run0 = i; }
        else if (run0 >= 0) { flushRail(run0, i - 1); run0 = -1; }
      }
      if (run0 >= 0) flushRail(run0, pts.length - 1);
    }

    // ————— ŞƏHƏR ZOLAĞI: binalar + küçə lampaları (düz hissədə) —————
    {
      const rnd01 = (a) => { const x = Math.sin(a * 127.1 + 311.7) * 43758.55; return x - Math.floor(x); };
      const ROW_OFF = [20, 34, 49];   // sıraların yoldan uzaqlığı (m)
      for (let i = 2; i < pts.length - 2; i++) {
        const abs = absStart + i;
        if (this._cityT(abs) < 1) continue;
        // ————— RAYON ŞƏBƏKƏSİ —————
        // ƏVVƏL: binalar hər 4-cü nöqtədə yolun 9–18 m yanına DÜZÜLÜRDÜ —
        // nəticədə yol boyu tək-tək dayanan tikililər alınırdı ("ortada bir
        // bina" görüntüsü). İNDİ şəhər əsl rayondur:
        //   · 3 SIRA dərinlik (yoldan 20 / 34 / 49 m) — küçə blokları
        //   · hər 5-ci sütun boş = KÜÇƏ (şəbəkə görünsün)
        //   · mərkəzdə hündür binalar, kənarlarda alçaq evlər (siluet)
        // Yol kənarına bina qoyulmur; ən yaxın sıra 20 m-dədir.
        if (abs % 3 === 0) {
          const col = Math.floor(abs / 3);
          if (col % 5 === 0) continue;                 // eninə küçə: bütün sıralar boş
          const core = this._cityCore(abs);
          if (core < 0.12) continue;                   // rayonun kənarı: tikili yox
          for (const side of [-1, 1]) {
            if (rnd01(abs * 2 + side) < 0.1) continue; // seyrək boşluq (meydan/park)
            // Sıralar ƏVVƏLCƏ seçilir: tək bir ön ev qalmasın deyə
            // (rayonun ucunda yolun kənarında tənha ev gülməli görünürdü)
            const rows = [];
            for (let row = 0; row < ROW_OFF.length; row++) {
              if (rnd01(abs * 17 + row * 31 + side) > 0.46 + core * 0.46 - row * 0.13) continue;
              rows.push(row);
            }
            if (!rows.length) continue;
            if (rows.length === 1 && rows[0] === 0 && core < 0.4) continue; // tənha ön ev yox
            for (const row of rows) {
              const off = hw + ROW_OFF[row] + rnd01(abs * 3 + row * 7 + side) * 3.5;
              // Mərkəz + arxa sıralar = BİNA, kənar/ön sıra = alçaq ev.
              // Ev modeli bərabər miqyaslanır — "uzunsov ev" problemi yoxdur.
              const tower = core > 0.35 || row > 0;
              // KayKit şəhər modeli varsa ONDAN istifadə et (prosedural
              // qutudan qat-qat keyfiyyətli); hazır deyilsə köhnə yola düş
              const kitAd = this.cityFactory
                ? CITY_ROWS[Math.min(row, 2)][(Math.floor(rnd01(abs * 23 + row + side) * 9)) % CITY_ROWS[Math.min(row, 2)].length]
                : null;
              const kitObj = tower && kitAd ? this.cityFactory(kitAd) : null;
              // Hündürlük SIRAYA görə: ön sıra alçaq mağaza/ofis, arxa
              // sıralar göydələn — yaxın planda "karton divar" olmur
              const hRange = [[9, 17], [15, 26], [21, 34]][row];
              // KÖHNƏ PROSEDURAL BİNALAR SİLİNDİ (istifadəçi qərarı):
              // qara qutu siluetləri KayKit modellərinin yanında ucuz
              // görünürdü. Kit hazır deyilsə bina QOYULMUR — yarımçıq
              // görüntüdənsə boşluq yaxşıdır (dəst proqram açılanda
              // əvvəlcədən yüklənir, ona görə praktikada həmişə hazırdır).
              if (tower && !kitObj) continue;
              const b = kitObj || makeDecor('house');
              // HÜNDÜRLÜK ARXA SIRALARDA: yola ən yaxın sıra alçaqdır, göydələn
              // arxada dayanır — belə siluet dərinlik verir, yol kənarında isə
              // nəhəng lövhə divarı yaratmır (yaxından "karton" görünürdü)
              // Miqyas artıq hündürlüyü daşımır (onu hRange verir) — yalnız
              // yüngül ölçü müxtəlifliyi üçün
              const sc = tower
                ? 0.9 + core * 0.25 + rnd01(abs * 5 + row + side) * 0.3
                : 0.95 + rnd01(abs * 5 + side) * 0.4;
              if (!kitObj) b.scale.setScalar(sc);   // kit modeli öz ölçüsündədir
              const bx = pts[i].x + nrms[i].x * off * side;
              const bz = pts[i].z + nrms[i].z * off * side;
              // SUYUN İÇİNDƏ tikili olmamalıdır — həm nöqtənin özü, həm də
              // binanın dörd küncü quru olmalıdır (sahil kənarında yarısı
              // suya girirdi)
              const half = 3.2 * sc;
              let dry = true;
              for (const [ox, oz] of [[0, 0], [half, half], [-half, half], [half, -half], [-half, -half]]) {
                if (terrainY(bx + ox, bz + oz) < WATER_LEVEL + 0.6) { dry = false; break; }
              }
              if (!dry) continue;
              // Yol kəsiyinin içində terrainY havada asılı bina verir —
              // görünən səth (groundYAt) işlədilir
              b.position.set(bx, groundYAt(bx, bz, pts[i].y, off), bz);
              b.rotation.y = Math.atan2(-nrms[i].x * side, -nrms[i].z * side); // üzü küçəyə
              g.add(b);
              // XƏTA İDİ: radius sabit 3.2 idi. KayKit binaları 8–14 m
              // enindədir → maşın binanın İÇİNƏ girib içini görürdü.
              // İndi radius əsl həndəsədən (bbox) hesablanır.
              const bb = new THREE.Box3().setFromObject(b);
              const bs = bb.getSize(new THREE.Vector3());
              const br = Math.max(2.4, Math.max(bs.x, bs.z) * 0.46);
              // KayKit modellərinin eni fərqlidir (8–15 m): sabit şəbəkə
              // addımı ilə qonşu binalar bir-birinin içinə girirdi
              if (!this._spotFree(b.position.x, b.position.z, br, 2.5)) { g.remove(b); continue; }
              const ob = { x: b.position.x, z: b.position.z, r: br, kind: 'city' };
              chunkObstacles.push(ob);
              this.obstacles.push(ob);
            }
          }
        }
        if (abs % 7 === 0) {
          for (const side of [-1, 1]) {
            const lp = makeDecor('lamp');
            const lx = pts[i].x + nrms[i].x * (hw + 2.2) * side;
            const lz = pts[i].z + nrms[i].z * (hw + 2.2) * side;
            if (terrainY(lx, lz) < WATER_LEVEL + 0.4) continue;   // suda fənər yox
            lp.position.set(lx, groundYAt(lx, lz, pts[i].y, hw + 2.2), lz);
            g.add(lp);
            // Dirəyin kollideri: əvvəl yoxdu və küçə lampasının İÇİNDƏN
            // keçmək olurdu
            const ob = { x: lx, z: lz, r: 0.35, kind: 'lamp' };
            chunkObstacles.push(ob);
            this.obstacles.push(ob);
          }
        }
      }
    }

    // ————— KƏND KLASTERİ —————
    // Şəhərdən kənarda ev QRUP halında olur: ortada meydan, ətrafında 4–7 ev,
    // hamısı üzü meydana. Tək-tək səpilən ev artıq yoxdur (biom dekorundan da
    // çıxarıldı) — çöldə tənha bina gülməli görünürdü.
    if (s.id === 'alpine' || s.id === 'coast' || s.id === 'snow') {
      const rnd01 = (a) => { const x = Math.sin(a * 269.5 + 183.3) * 43758.55; return x - Math.floor(x); };
      for (let i = 6; i < pts.length - 6; i++) {
        const abs = absStart + i;
        if (abs % 16 !== 0) continue;              // ~128 m-dən bir namizəd
        if (this._cityT(abs) > 0) continue;        // şəhərlə üst-üstə düşməsin
        if (this._tunnelT(abs) > 0) continue;      // tunelin üstündə kənd olmaz
        if (rnd01(abs * 31) > 0.62) continue;      // hər namizəd kənd olmur
        const side = rnd01(abs * 7) < 0.5 ? -1 : 1;
        const cOff = 48 + rnd01(abs * 13) * 26;    // kəsik zonasından (24 m) kənarda
        const cx = pts[i].x + nrms[i].x * cOff * side;
        const cz = pts[i].z + nrms[i].z * cOff * side;
        if (terrainY(cx, cz) < WATER_LEVEL + 1.4) continue;
        // SAHƏ DÜZLÜYÜ: kənd yalnız nisbətən hamar ərazidə qurulur. Yamacda
        // evlərin çoxu rədd olunurdu və geriyə 1–2 tənha ev qalırdı.
        {
          let lo = Infinity, hi = -Infinity;
          for (let a = 0; a < 8; a++) {
            const ang = (a / 8) * Math.PI * 2;
            const ty = terrainY(cx + Math.cos(ang) * 18, cz + Math.sin(ang) * 18);
            if (ty < lo) lo = ty;
            if (ty > hi) hi = ty;
          }
          if (hi - lo > 5.5 || lo < WATER_LEVEL + 1.0) continue;
        }
        // ƏVVƏLCƏ yerləri seç, SONRA tik: relyef testləri evlərin çoxunu rədd
        // edəndə geriyə 1–2 ev qalır və yenə "çöldə tənha ev" alınırdı.
        // İndi ən azı 4 yararlı yer yoxdursa kənd ümumiyyətlə qurulmur.
        const n = 5 + Math.floor(rnd01(abs * 3) * 3);
        const spots = [];
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + rnd01(abs + k * 17) * 0.8;
          const rr = 12 + rnd01(abs * 5 + k * 3) * 14;
          const hx = cx + Math.cos(a) * rr;
          const hz = cz + Math.sin(a) * rr;
          const sc = 0.9 + rnd01(abs * 9 + k) * 0.45;
          const half = 3.2 * sc;
          let dry = true;
          for (const [ox, oz] of [[0, 0], [half, half], [-half, half], [half, -half], [-half, -half]]) {
            if (terrainY(hx + ox, hz + oz) < WATER_LEVEL + 0.6) { dry = false; break; }
          }
          if (!dry) continue;
          // Dik yamacda ev "havada" qalır — meyl yoxlanır
          const slope = Math.abs(terrainY(hx + half, hz) - terrainY(hx - half, hz))
            + Math.abs(terrainY(hx, hz + half) - terrainY(hx, hz - half));
          if (slope > 4.2) continue;
          spots.push({ hx, hz, sc });
        }
        if (spots.length < 4) continue;   // yarımçıq kənd qurulmur
        for (const { hx, hz, sc } of spots) {
          const h = makeDecor('house');
          h.scale.setScalar(sc);
          h.position.set(hx, terrainY(hx, hz) - 0.12, hz);   // yüngül maylda boşluq görünməsin
          h.rotation.y = Math.atan2(cx - hx, cz - hz);   // üzü kənd meydanına
          g.add(h);
          const hb = new THREE.Box3().setFromObject(h);
          const hs = hb.getSize(new THREE.Vector3());
          const hr = Math.max(2.4, Math.max(hs.x, hs.z) * 0.46);
          if (!this._spotFree(hx, hz, hr, 1.2)) { g.remove(h); continue; }
          const ob = { x: hx, z: hz, r: hr, kind: 'village' };
          chunkObstacles.push(ob);
          this.obstacles.push(ob);
        }
      }
    }

    // Dekor + təpələr + dağlar — dünya DOLU görünsün
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    const decorCount = 16 + Math.floor(Math.random() * 10);
    for (let d = 0; d < decorCount; d++) {
      const i = 2 + Math.floor(Math.random() * (pts.length - 4));
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = 30 + Math.random() * 95; // kəsik zonasından (24 m) kənarda
      const type = s.decor[Math.floor(Math.random() * s.decor.length)];
      if (pts[i].y > 2.2 && off < 46) continue; // körpü yanında üzən dekor olmasın
      const px = pts[i].x + nrms[i].x * off * side;
      const pz = pts[i].z + nrms[i].z * off * side;
      // Hündürlük GÖRÜNƏN səthdən oxunur: yolun 24 m yaxınlığında torpaq
      // kəsilir və terrainY işlətsək obyekt havada asılı qalır (ölçüldü)
      const gy = groundYAt(px, pz, pts[i].y, off);
      if (gy < WATER_LEVEL + 0.4) continue; // suyun içində ağac/daş bitməsin
      // 'nk:...' → Kenney Nature Kit modeli; hazır deyilsə prosedural daş
      const obj = type.startsWith('nk:')
        ? (this.natureFactory?.(type.slice(3)) || makeDecor('rock'))
        : makeDecor(type);
      const sc = 0.8 + Math.random() * 0.7;
      obj.scale.setScalar(sc);
      obj.position.set(px, gy, pz); // torpağın səthinə otur
      obj.rotation.y = Math.random() * Math.PI * 2;
      // Radius həqiqi ölçüdən (bounding box)
      box.setFromObject(obj);
      box.getSize(size);
      const rr2 = Math.max(1.0, Math.max(size.x, size.z) * 0.42);
      // KRİTİK UZLAŞMA: tələb olunan boşluq ≥ yayınma radiusu (rr2 + hw + 9).
      // Əks halda mövcud yol dekorun yayınma zonasının içində qalır və
      // generator spiralda kilidlənərək səhifəni çökdürə bilər.
      if (off < 60) {
        const need = rr2 + this.halfWidth + 9;
        let clear = true;
        for (let q = 0; q < this.points.length; q++) {
          const dq = Math.hypot(px - this.points[q].x, pz - this.points[q].z);
          if (dq < need) { clear = false; break; }
        }
        if (!clear) continue; // yerləşməz — bu dekoru burax
      }
      // Mövcud tikili/dekorun içinə düşməsin
      if (!this._spotFree(px, pz, rr2, 1.0)) continue;
      g.add(obj);
      // TOPLU YERLƏŞDİRMƏ: təbiətdə ağac/daş tək-tək durmur. Böyük obyektin
      // yanına 1–3 kiçik yoldaş qoyulur — mənzərə "səpələnmiş" yox, "yaşayan"
      // görünür. Yoldaşlar əsas obyektin yayınma zonasının içindədir, ona görə
      // əlavə yol yoxlaması lazım deyil.
      if (rr2 <= 14 && Math.random() < 0.7) {
        const buddies = 1 + Math.floor(Math.random() * 3);
        for (let q = 0; q < buddies; q++) {
          const bt = s.decor[Math.floor(Math.random() * s.decor.length)];
          const bo = bt.startsWith('nk:') ? this.natureFactory?.(bt.slice(3)) : makeDecor(bt);
          if (!bo) continue;
          const ba = Math.random() * Math.PI * 2;
          // YOLDAŞ ƏSAS OBYEKTİN NÜVƏSİNƏ GİRMƏSİN: böyük obyektdə (təpə,
          // iri qaya) məsafə onun öz radiusundan başlayır — daş təpənin
          // ƏTƏYİNDƏ durur, içində yox
          const bd = (rr2 > 4 ? rr2 * 0.8 : 3.5) + Math.random() * 6;
          const bx = px + Math.cos(ba) * bd, bz = pz + Math.sin(ba) * bd;
          const bDist = Math.hypot(bx - pts[i].x, bz - pts[i].z);
          const by = groundYAt(bx, bz, pts[i].y, bDist);
          if (by < WATER_LEVEL + 0.4) continue;
          bo.scale.setScalar(sc * (0.45 + Math.random() * 0.4));
          // Yoxlama YOLDAŞIN ÖZ ölçüsü ilə (əvvəl sabit 1.2 idi — iri yoldaş
          // qonşu obyektin içinə girirdi)
          box.setFromObject(bo);
          box.getSize(size);
          const brÖn = Math.max(1.0, Math.max(size.x, size.z) * 0.42);
          if (!this._spotFree(bx, bz, brÖn, 0.5)) continue;
          bo.position.set(bx, by, bz);
          bo.rotation.y = Math.random() * Math.PI * 2;
          g.add(bo);
          // Yoldaşların da toqquşması olmalıdır — əvvəl ağac/daşın içindən
          // keçmək olurdu (istifadəçi rəyi)
          const br = brÖn;
          if (br >= 0.9 && bDist < 60) {
            const bob = { x: bx, z: bz, r: br };
            chunkObstacles.push(bob);
            this.obstacles.push(bob);
          }
        }
      }
      // Yayınma xəritəsinə yalnız kiçik/orta obyektlər (dağlar YOX — kilid riski)
      if (rr2 <= 30) chunkSpots.push({ x: px, z: pz, r: rr2 });
      // 34 m çox dar idi: oyunçu zen-də 50 m-ə qədər gəzir və oradakı
      // ağacların içindən keçirdi
      if (off < 60 && Math.abs(gy - pts[i].y) < 6) {
        const ob = { x: px, z: pz, r: rr2 };
        chunkObstacles.push(ob);
        this.obstacles.push(ob);
      }
    }
    // ————— YAXIN PLAN SƏPİNİ —————
    // Dünya "boş" hiss verirdi: dekor 30 m-dən uzaqda idi, yolun kənarı isə
    // çılpaq qalırdı. Dərinlik məhz yaxın plandakı xırda detaldan gəlir.
    // Hamısı chunk birləşdirməsinə düşür (bax mergeStaticGroup) — draw call
    // artmır. Hündürlük groundYAt ilə oxunur: yol kəsiyinin içində torpaq
    // aşağıdır, terrainY işlətsək bitkilər havada qalardı.
    if (s.small?.length) {
      const nSmall = 24 + Math.floor(Math.random() * 16);
      for (let d = 0; d < nSmall; d++) {
        const i = 2 + Math.floor(Math.random() * (pts.length - 4));
        if (pts[i].y - terrainY(pts[i].x, pts[i].z) > 2.0) continue; // körpüdə yox
        const side = Math.random() < 0.5 ? -1 : 1;
        const off = 12.5 + Math.random() * 18;
        const px = pts[i].x + nrms[i].x * off * side;
        const pz = pts[i].z + nrms[i].z * off * side;
        const gy = groundYAt(px, pz, pts[i].y, off);
        if (gy < WATER_LEVEL + 0.25) continue;             // suda bitki yox
        const type = s.small[Math.floor(Math.random() * s.small.length)];
        const obj = type.startsWith('nk:')
          ? this.natureFactory?.(type.slice(3))
          : makeDecor(type);
        if (!obj) continue;
        obj.scale.setScalar(0.35 + Math.random() * 0.45);  // xırda plan
        obj.position.set(px, gy, pz);
        obj.rotation.y = Math.random() * Math.PI * 2;
        g.add(obj);
      }
    }

    // ————— YOL KƏNARI QURĞULARI —————
    // Zen "boş yol" hissi verirdi: yalnız təbiət vardı, insan izi yox idi.
    // Hasar sıraları, nişanlar və telefon dirəkləri yolun ritmini yaradır.
    // Hamısı chunk qrupundadır → birləşir, draw call artmır.
    {
      const hwB = this.halfWidth;
      // 1) Telefon dirəkləri — bir tərəfdə bərabər aralıqla
      const poleSide = (absStart % 2 === 0) ? 1 : -1;
      for (let i = 3; i < pts.length - 3; i += 9) {
        if (pts[i].y - terrainY(pts[i].x, pts[i].z) > 2.0) continue;   // körpüdə yox
        const off = hwB + 6.5;
        const px = pts[i].x + nrms[i].x * off * poleSide;
        const pz = pts[i].z + nrms[i].z * off * poleSide;
        const gy = groundYAt(px, pz, pts[i].y, off);
        if (gy < WATER_LEVEL + 0.3) continue;
        const po = makeUtilityPole(7 + Math.random() * 1.5);
        po.position.set(px, gy, pz);
        po.rotation.y = Math.atan2(nrms[i].x, nrms[i].z);
        g.add(po);
        { const ob = { x: px, z: pz, r: 0.5 }; chunkObstacles.push(ob); this.obstacles.push(ob); }
      }
      // 2) Hasar sıraları — təsadüfi hissələrdə 4-8 seqment ard-arda
      // QEYD: chunk qısa da ola bilər (ilk/son parça) — `pts.length - 16`
      // mənfi çıxıb başlanğıc indeksini MƏNFİ edirdi və səhnə çökürdü
      const maxStart = pts.length - 16;
      for (let run = 0; run < 2 && maxStart > 3; run++) {
        if (Math.random() > 0.62) continue;
        const start = 3 + Math.floor(Math.random() * maxStart);
        const len = 4 + Math.floor(Math.random() * 5);
        const side = Math.random() < 0.5 ? -1 : 1;
        const off = hwB + 5.5 + Math.random() * 3;
        for (let k = 0; k < len; k++) {
          const i = start + k;
          if (i < 0 || i >= pts.length - 2) break;
          if (pts[i].y - terrainY(pts[i].x, pts[i].z) > 2.0) continue;
          const px = pts[i].x + nrms[i].x * off * side;
          const pz = pts[i].z + nrms[i].z * off * side;
          const gy = groundYAt(px, pz, pts[i].y, off);
          if (gy < WATER_LEVEL + 0.3) continue;
          // DEDUPE: hasar qaçışları kəsişəndə eyni nöqtəyə iki seqment
          // düşürdü (üst-üstə model + z-döyüşü). Yaxında hasar varsa keç.
          if (!this._spotFree(px, pz, 1.2, 0)) continue;
          const fe = makeFence(8.4);
          { const ob = { x: px, z: pz, r: 3.4 }; chunkObstacles.push(ob); this.obstacles.push(ob); }
          fe.position.set(px, gy, pz);
          const nx2 = pts[Math.min(i + 1, pts.length - 1)];
          fe.rotation.y = Math.atan2(nx2.x - pts[i].x, nx2.z - pts[i].z);
          g.add(fe);
        }
      }
      // 3) Yol nişanları — seyrək
      for (let i = 6; i < pts.length - 6; i += 17) {
        if (Math.random() > 0.55) continue;
        if (pts[i].y - terrainY(pts[i].x, pts[i].z) > 2.0) continue;
        const side = Math.random() < 0.5 ? -1 : 1;
        const off = hwB + 2.6;
        const px = pts[i].x + nrms[i].x * off * side;
        const pz = pts[i].z + nrms[i].z * off * side;
        const gy = groundYAt(px, pz, pts[i].y, off);
        if (gy < WATER_LEVEL + 0.3) continue;
        const sg = makeSignpost([0x2e7d5b, 0x2f6fe0, 0xb8862b][(Math.random() * 3) | 0]);
        { const ob = { x: px, z: pz, r: 0.45 }; chunkObstacles.push(ob); this.obstacles.push(ob); }
        sg.position.set(px, gy, pz);
        sg.rotation.y = Math.atan2(-nrms[i].x * side, -nrms[i].z * side);
        g.add(sg);
      }
    }

    // Orta plan təpələri (yumru)
    const hillMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(s.mountainColor).lerp(new THREE.Color(s.fog), 0.2),
      flatShading: true, roughness: 1,
    });
    for (let h = 0; h < 2 + Math.floor(Math.random() * 3); h++) {
      const i = Math.floor(Math.random() * pts.length);
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = 70 + Math.random() * 110;
      const r = 12 + Math.random() * 16;
      let hx = pts[i].x + nrms[i].x * off * side;
      let hz = pts[i].z + nrms[i].z * off * side;
      // TƏPƏ DƏ BÜTÜN YOLDAN UZAQ OLMALIDIR (istifadəçi buqu: "tunelin
      // içinə dağ girdi") — yol pəncərə daxilində geri qayıdanda təpə
      // BAŞQA seqmentin (o cümlədən tunelin) üstünə düşürdü. Dağlardakı
      // qayda tətbiq olunur: yaxındırsa uzağa itələ, yenə yaxındırsa qurulmur.
      const yolaMəsafə = () => {
        let cmin = Infinity;
        for (let q = 0; q < this.points.length; q += 2) {
          const dq = Math.hypot(hx - this.points[q].x, hz - this.points[q].z);
          if (dq < cmin) cmin = dq;
        }
        return cmin;
      };
      const NEED = r * 1.25 + this.halfWidth + 12;
      let clear = yolaMəsafə();
      for (let cəhd = 0; cəhd < 2 && clear < NEED; cəhd++) {
        hx += nrms[i].x * side * (r + 18);
        hz += nrms[i].z * side * (r + 18);
        clear = yolaMəsafə();
      }
      this._hillStats = this._hillStats || { placed: 0, skipped: 0, minClear: Infinity };
      if (clear < NEED) { this._hillStats.skipped++; continue; }  // yer tapılmadı
      this._hillStats.placed++;
      this._hillStats.minClear = Math.min(this._hillStats.minClear, clear - NEED);
      const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), hillMat);
      hill.scale.y = 0.3;
      hill.position.set(hx, terrainY(hx, hz) - r * 0.06, hz);
      g.add(hill);
      chunkSpots.push({ x: hill.position.x, z: hill.position.z, r: r * 0.95 });
    }
    // Uzaq dağ siluetləri (dumana qarışan) — hər chunk-da
    {
      const mCount = 2 + Math.floor(Math.random() * 3);
      const mMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(s.mountainColor).lerp(new THREE.Color(s.fog), 0.45),
        flatShading: true, roughness: 1,
      });
      // Zirvə örtüyü: alp tipində qar, isti biomlarda günəş vurmuş açıq qaya
      const capMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(s.mountainColor).lerp(new THREE.Color(0xffffff), 0.72)
          .lerp(new THREE.Color(s.fog), 0.22),
        flatShading: true, roughness: 1,
      });
      // Eyni qırış sahəsi həm dağa, həm örtüyə tətbiq olunur ki, üst-üstə otursun
      const ridgeAt = (ang, t01, ph1, ph2) => 1
        + 0.22 * Math.sin(ang * 3 + ph1) * (1 - t01 * 0.5)
        + 0.1 * Math.sin(ang * 6 + ph2) * (1 - t01 * 0.35)
        + 0.05 * Math.sin(ang * 11 + ph1 * 1.7) * (1 - t01 * 0.3);
      for (let m = 0; m < mCount; m++) {
        const i = Math.floor(Math.random() * pts.length);
        const side = Math.random() < 0.5 ? -1 : 1;
        // MASSİV: 2-4 zirvə bir-birinin içinə keçir — silsilə silueti (piramida yox)
        const peaks = 2 + Math.floor(Math.random() * 3);
        const h0 = 65 + Math.random() * 70;
        const r0 = Math.min(120, h0 * (0.7 + Math.random() * 0.35));
        // Ofset ölçüyə bağlıdır — dağın ətəyi heç vaxt yola çatmır
        const off = r0 * 1.45 + 115 + Math.random() * 200;
        const bx0 = pts[i].x + nrms[i].x * off * side;
        const bz0 = pts[i].z + nrms[i].z * off * side;
        let px3 = bx0, pz3 = bz0;
        for (let pk = 0; pk < peaks; pk++) {
          // Enli oturacaq + mötədil hündürlük — dik şiş yox, dağ kütləsi
          const h = pk === 0 ? h0 : 45 + Math.random() * 70;
          const coneR = pk === 0 ? r0 : Math.min(120, h * (0.7 + Math.random() * 0.35));
          // ƏSL ƏTƏK RADİUSU konusun radiusundan böyükdür: silsilə deformasiyası
          // (ridgeAt) oturacağı 1.37 dəfəyə qədər genişləndirir. Əvvəl bu nəzərə
          // alınmırdı və dağ yolun üstünə düşürdü (şüa testi ilə tutuldu).
          const RE = coneR * 1.37;
          // Yola yaxındırsa uzağa itələ və YENİDƏN yoxla; hələ də yaxındırsa
          // zirvə ÜMUMİYYƏTLƏ qurulmur. Əvvəl bir dəfə itələnib buraxılırdı,
          // üstəlik belə zirvə yayınma xəritəsinə yazılmırdı — sonrakı yol
          // düz onun içindən keçirdi.
          const məsafə = () => {
            let c = Infinity;
            for (let q = 0; q < this.points.length; q += 2) {
              const dq = Math.hypot(px3 - this.points[q].x, pz3 - this.points[q].z);
              if (dq < c) c = dq;
            }
            for (let q = 0; q < pts.length; q += 2) {
              const dq = Math.hypot(px3 - pts[q].x, pz3 - pts[q].z);
              if (dq < c) c = dq;
            }
            return c;
          };
          const TƏHLÜKƏSİZ = RE + this.halfWidth + 60;
          let clear = məsafə();
          for (let cəhd = 0; cəhd < 3 && clear < TƏHLÜKƏSİZ; cəhd++) {
            px3 += nrms[i].x * side * coneR * 0.9;
            pz3 += nrms[i].z * side * coneR * 0.9;
            clear = məsafə();
          }
          if (clear < TƏHLÜKƏSİZ) continue;   // yer tapılmadı — bu zirvə qurulmur
          const geo2 = new THREE.ConeGeometry(coneR, h, 10, 3);
          const pa = geo2.attributes.position;
          const ph1 = Math.random() * Math.PI * 2;
          const ph2 = Math.random() * Math.PI * 2;
          const lean = Math.random() * 0.14; // zirvənin yüngül əyilməsi
          for (let v = 0; v < pa.count; v++) {
            const x = pa.getX(v), yv = pa.getY(v), z = pa.getZ(v);
            if (Math.hypot(x, z) < 0.001) continue; // zirvə təpə nöqtəsi
            const ang = Math.atan2(z, x);
            const t01 = (yv + h / 2) / h; // 0 ətək → 1 zirvə
            const rid = ridgeAt(ang, t01, ph1, ph2);
            pa.setX(v, x * rid + Math.cos(ph1) * coneR * lean * t01);
            pa.setZ(v, z * rid + Math.sin(ph1) * coneR * lean * t01);
          }
          geo2.computeVertexNormals();
          const cone = new THREE.Mesh(geo2, mMat);
          cone.position.set(px3, h / 2 - 14, pz3);
          g.add(cone);
          // Yayınma xəritəsinə DAXİL edilir — yoxsa yol sonradan dönüb dağın
          // içindən keçir. KRİTİK İNVARİANT: yalnız mövcud yoldan yayınma
          // limitindən uzaqdırsa qeyd olunur, yoxsa generator kilidlənə bilər.
          {
            const need = RE + this.halfWidth + 10;
            let ok = true;
            for (let q = 0; q < this.points.length; q++) {
              if (Math.hypot(px3 - this.points[q].x, pz3 - this.points[q].z) < need) { ok = false; break; }
            }
            // r = ƏSL ətək radiusu — yoxsa yol siluetin kənarından keçir
            if (ok) chunkSpots.push({ x: px3, z: pz3, r: RE });
          }
          // Hündür zirvələrə örtük papağı — siluet dərhal "dağ" oxunur
          if (h > 78) {
            const capF = 0.34; // hündürlüyün üst 34%-i
            const capH = h * capF;
            const capR = coneR * capF * 1.05;
            const geo3 = new THREE.ConeGeometry(capR, capH, 10, 2);
            const pc = geo3.attributes.position;
            for (let v = 0; v < pc.count; v++) {
              const x = pc.getX(v), yv = pc.getY(v), z = pc.getZ(v);
              if (Math.hypot(x, z) < 0.001) continue;
              const ang = Math.atan2(z, x);
              const t01 = 1 - capF + capF * ((yv + capH / 2) / capH);
              const rid = ridgeAt(ang, t01, ph1, ph2);
              pc.setX(v, x * rid + Math.cos(ph1) * coneR * lean * t01);
              pc.setZ(v, z * rid + Math.sin(ph1) * coneR * lean * t01);
            }
            geo3.computeVertexNormals();
            const cap = new THREE.Mesh(geo3, capMat);
            cap.position.set(px3, h * (1 - capF) + capH / 2 - 14 + 0.4, pz3);
            g.add(cap);
          }
          const na = Math.random() * Math.PI * 2;
          const step = coneR * (0.5 + Math.random() * 0.4); // zirvələr bir-birinə keçir
          px3 += Math.cos(na) * step;
          pz3 += Math.sin(na) * step;
        }
      }
    }

    // ————— YOL DƏHLİZİNİN SÜPÜRÜLMƏSİ —————
    // Obyektlər müxtəlif qurucudan gəlir və hamısı yayınma xəritəsinə
    // yazılmır (dağ, bina, dirək, hasar…). Nəticədə yol sonradan onların
    // üstündən keçirdi. Bu keçid HƏR obyektin ÖZ ÖLÇÜSÜNÜ (bounding box)
    // yolun eni ilə müqayisə edir və dəhlizə girəni SİLİR.
    this._clearRoadCorridor(g, pts);

    const merged = mergeStaticGroup(g);
    g.traverse((o) => o.geometry?.dispose?.());
    return { merged, obstacles: chunkObstacles, spots: chunkSpots };
  }

  _trim(minDist) {
    // Köhnə chunk-ları sil
    while (this.chunks.length > 2 && this.chunks[0].endAbs * SEG < minDist) {
      const c = this.chunks.shift();
      this._group.remove(c.group);
      c.group.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material && !o.material.map) o.material.dispose?.();
      });
      for (const ob of c.obstacles) {
        const i = this.obstacles.indexOf(ob);
        if (i >= 0) this.obstacles.splice(i, 1);
      }
      for (const sp of c.spots || []) {
        const i = this.decorSpots.indexOf(sp);
        if (i >= 0) this.decorSpots.splice(i, 1);
      }
    }
    // Nöqtə pəncərəsini sürüşdür
    const keepFrom = Math.max(0, Math.floor(minDist / SEG) - 4 - this.base);
    if (keepFrom > 0) {
      this.points.splice(0, keepFrom);
      this.tangents.splice(0, keepFrom);
      this.normals.splice(0, keepFrom);
      this.base += keepFrom;
    }
  }

  // Arxaya sürərkən çox uzaqda qalan QABAQ chunk-ları sil
  _trimFront(maxDist) {
    let cut = false;
    while (this.chunks.length > 2
      && this.chunks[this.chunks.length - 1].startAbs * SEG > maxDist) {
      const c = this.chunks.pop();
      this._group.remove(c.group);
      c.group.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material && !o.material.map) o.material.dispose?.();
      });
      for (const ob of c.obstacles) {
        const i = this.obstacles.indexOf(ob);
        if (i >= 0) this.obstacles.splice(i, 1);
      }
      for (const sp of c.spots || []) {
        const i = this.decorSpots.indexOf(sp);
        if (i >= 0) this.decorSpots.splice(i, 1);
      }
      cut = true;
    }
    if (!cut) return;
    // Nöqtə pəncərəsinin quyruğunu son saxlanan chunk-a qədər kəs
    const last = this.chunks[this.chunks.length - 1];
    const keepTo = last.endAbs - this.base + 1;
    if (keepTo < this.points.length) {
      this.points.length = keepTo;
      this.tangents.length = keepTo;
      this.normals.length = keepTo;
    }
    // Qabaq generatorun vəziyyətini yeni quyruqdan bərpa et
    const n = this.points.length;
    const a = this.points[n - 2], b = this.points[n - 1];
    this._heading = Math.atan2(b.x - a.x, b.z - a.z);
    this._pos.copy(b);
    this._curv = 0;
    this._pending = 0;
  }

  // Car.update interfeysi — hint mütləq indeksdir
  getNearest(position, hint = null) {
    const n = this.points.length;
    let s0 = 0, s1 = n;
    if (hint != null) {
      const lh = hint - this.base;
      s0 = Math.max(0, lh - 10);
      s1 = Math.min(n, lh + 45);
      if (s0 >= s1) { s0 = 0; s1 = n; }
    }
    let best = s0, bd = Infinity;
    for (let i = s0; i < s1; i++) {
      const dx = position.x - this.points[i].x;
      const dz = position.z - this.points[i].z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    const c = this.points[best];
    const nrm = this.normals[best];
    const lateral = (position.x - c.x) * nrm.x + (position.z - c.z) * nrm.z;
    return {
      index: this.base + best,
      t: this.base + best,
      lateral,
      onRoad: Math.abs(lateral) <= this.halfWidth + 0.5,
    };
  }

  // Rescue üçün: ən yaxın yol nöqtəsi + istiqamət
  nearestSpot(position) {
    const near = this.getNearest(position);
    const li = near.index - this.base;
    const p = this.points[Math.min(li, this.points.length - 1)];
    const t = this.tangents[Math.min(li, this.tangents.length - 1)];
    return { point: p.clone(), heading: Math.atan2(t.x, t.z) };
  }

  _asphaltTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4200; i++) {
      const v = 108 + Math.floor(Math.random() * 62);
      ctx.fillStyle = `rgba(${v},${v},${v},0.22)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.6, 1.6);
    }
    for (const u of [0.3, 0.7]) {
      const g = ctx.createLinearGradient((u - 0.1) * 256, 0, (u + 0.1) * 256, 0);
      g.addColorStop(0, 'rgba(30,30,34,0)');
      // 0.28 → 0.13: gecə fara işığında tünd zolaqlar "görünməz obyektin
      // kölgəsi" kimi oxunurdu (istifadəçi rəyi)
      g.addColorStop(0.5, 'rgba(30,30,34,0.13)');
      g.addColorStop(1, 'rgba(30,30,34,0)');
      ctx.fillStyle = g;
      ctx.fillRect((u - 0.1) * 256, 0, 51, 256);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;   // kiçik bucaqda cizgilənmə olmasın
    return tex;
  }

  dispose() {
    for (const c of this.chunks) {
      this._group.remove(c.group);
      c.group.traverse((o) => o.geometry?.dispose?.());
    }
    this.scene.remove(this._group);
    this._roadTex.dispose();
  }
}
