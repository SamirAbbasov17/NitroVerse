import * as THREE from 'three';

// Procedural low-poly obyekt qurucular. Hamısı flat shading.
const rand = (a, b) => a + Math.random() * (b - a);

export function flatMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0.0,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
}

// ————— Şam ağacı —————
export function makePine() {
  const g = new THREE.Group();
  const h = rand(3.2, 5.5);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.4, h * 0.35, 5),
    flatMat(0x6b4b2a)
  );
  trunk.position.y = h * 0.17;
  trunk.castShadow = true;
  g.add(trunk);

  const green = 0x2f7d43 + (Math.floor(rand(0, 3)) * 0x001500);
  let y = h * 0.3;
  for (let i = 0; i < 3; i++) {
    const r = (1.5 - i * 0.35) * (h / 4.4);
    const ch = h * 0.32;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, ch, 6), flatMat(green));
    cone.position.y = y + ch / 2;
    cone.castShadow = true;
    g.add(cone);
    y += ch * 0.62;
  }
  return g;
}

// ————— Kaktus —————
export function makeCactus(tint = 0x6f8f52) {
  const g = new THREE.Group();
  // Doymuş çəmən yaşılı (0x3f8f4e) isti səhra palitrasında yad görünürdü —
  // sage/zeytun tonu səhnəyə oturur (bax docs/DESIGN.md palitra qaydası)
  const mat = flatMat(tint);
  const h = rand(2.2, 3.6);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, h, 7), mat);
  body.position.y = h / 2;
  body.castShadow = true;
  g.add(body);
  const arms = Math.floor(rand(1, 3));
  for (let i = 0; i < arms; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, h * 0.45, 6), mat);
    arm.position.set(side * 0.55, h * (0.45 + i * 0.12), 0);
    arm.rotation.z = side * 0.5;
    arm.castShadow = true;
    g.add(arm);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, h * 0.3, 6), mat);
    tip.position.set(side * 0.85, h * (0.62 + i * 0.12), 0);
    tip.castShadow = true;
    g.add(tip);
  }
  return g;
}

// ————— Qaya —————
export function makeRock(tint = 0x8b8f9a) {
  const s = rand(0.7, 2.1);
  const geo = new THREE.DodecahedronGeometry(s, 0);
  const rock = new THREE.Mesh(geo, flatMat(tint, { roughness: 1 }));
  rock.position.y = s * 0.45;
  rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  rock.scale.y = rand(0.6, 0.9);
  rock.castShadow = true;
  rock.receiveShadow = true;
  return rock;
}

// ————— Qum təpəsi —————
export function makeDune(color = 0xd99b57) {
  const s = rand(6, 14);
  const geo = new THREE.IcosahedronGeometry(s, 1);
  const dune = new THREE.Mesh(geo, flatMat(color, { roughness: 1 }));
  dune.scale.set(1.4, rand(0.28, 0.42), 1);
  dune.position.y = -s * 0.5;
  dune.rotation.y = rand(0, 6);
  dune.receiveShadow = true;
  return dune;
}

// ————— Neon şəhər binası —————
// opts.hMin/hMax — sıraya görə hündürlük diapazonu (şəhər rayonunda yola
// yaxın sıra alçaq, arxa sıralar göydələn olur). Verilməsə köhnə davranış.
// ————— NEON ŞƏHƏRİ: pəncərəli binalar (Faza 3.2) —————
// Bütün binalar BİR pəncərə teksturasını (emissiveMap) və iki materialı (yaxın /
// uzaq) paylaşır — birləşdirmədən sonra bütün şəhər 2 draw call-dur. Hər binanın
// UV-si teksturada təsadüfi sürüşdürülür, ona görə yanan pəncərələrin naxışı
// təkrarlanmır. Pəncərə ölçüsü dünyada sabitdir (bina böyüdükcə pəncərə böyümür).
const WIN_COLS = 16, WIN_ROWS = 32;   // teksturadakı pəncərə şəbəkəsi
// Bir pəncərə xanasının dünyadakı ölçüsü (m). 1.35×1.9 sınandı — istifadəçi: "çox
// balacadır, orta olsun". Uzaq siluetdə xana 2.6× böyükdür (yoxsa nöqtəyə çevrilir).
const WIN_W = 2.0, WIN_H = 2.7;
const WIN_FAR = 2.6;
let _winTex = null;
function windowTexture() {
  if (_winTex) return _winTex;
  const cw = 16, ch = 16; // xana (piksel)
  const cv = document.createElement('canvas');
  cv.width = WIN_COLS * cw; cv.height = WIN_ROWS * ch;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cv.width, cv.height);
  // İsti sarı üstünlük təşkil edir; mavi/çəhrayı trekin neon vurğularıdır
  const cols = ['#ffd98a', '#ffd98a', '#ffe9c0', '#ffc46b', '#7fe9ff', '#ff7ab8', '#dfe8ff'];
  for (let r = 0; r < WIN_ROWS; r++) {
    // Bəzi mərtəbələr tam qaranlıqdır, bəziləri demək olar tam işıqlı (ofis mərtəbəsi)
    const floor = Math.random();
    const p = floor < 0.18 ? 0.04 : floor > 0.86 ? 0.85 : 0.34;
    const floorCol = cols[Math.floor(Math.random() * cols.length)];
    for (let c = 0; c < WIN_COLS; c++) {
      if (Math.random() > p) continue;
      ctx.globalAlpha = 0.55 + Math.random() * 0.45;
      ctx.fillStyle = Math.random() < 0.7 ? floorCol : cols[Math.floor(Math.random() * cols.length)];
      ctx.fillRect(c * cw + 3, r * ch + 4, cw - 6, ch - 8);
    }
  }
  ctx.globalAlpha = 1;
  _winTex = new THREE.CanvasTexture(cv);
  _winTex.wrapS = _winTex.wrapT = THREE.RepeatWrapping;
  _winTex.colorSpace = THREE.SRGBColorSpace;
  _winTex.anisotropy = 4;
  _winTex.userData = { shared: true };
  return _winTex;
}

const _cityMats = {};
export function cityMat(far = false) {
  const k = far ? 'far' : 'near';
  if (!_cityMats[k]) {
    const m = new THREE.MeshStandardMaterial({
      color: far ? 0x0a0f22 : 0x1a2142,
      roughness: far ? 0.9 : 0.7,
      flatShading: true,
      emissive: 0xffffff,
      emissiveMap: windowTexture(),
      emissiveIntensity: far ? 0.9 : 1.5,
    });
    m.userData = { shared: true };
    _cityMats[k] = m;
  }
  return _cityMats[k];
}

// Pəncərə UV-li qutu: yan üzlərdə pəncərə şəbəkəsi, dam və dib qaranlıq
export function cityBoxGeometry(w, h, d, far = false) {
  const ww = far ? WIN_W * WIN_FAR : WIN_W, wh = far ? WIN_H * WIN_FAR : WIN_H;
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const u0 = Math.floor(Math.random() * WIN_COLS) / WIN_COLS;
  const v0 = Math.floor(Math.random() * WIN_ROWS) / WIN_ROWS;
  // BoxGeometry üz sırası: +x, −x, +y, −y, +z, −z (hər üz 4 təpə)
  for (let f = 0; f < 6; f++) {
    const top = f === 2 || f === 3;
    const faceW = f < 2 ? d : w;
    // tam ədəd pəncərə: xana kəsilmir
    const nu = Math.max(1, Math.round(faceW / ww)) / WIN_COLS;
    const nv = Math.max(1, Math.round(h / wh)) / WIN_ROWS;
    for (let i = f * 4; i < f * 4 + 4; i++) {
      // dam: xanalar arası qaranlıq künc nöqtəsi (bütün təpələr eyni texel)
      if (top) uv.setXY(i, u0, v0);
      else uv.setXY(i, u0 + uv.getX(i) * nu + f * 3 / WIN_COLS, v0 + uv.getY(i) * nv);
    }
  }
  return geo;
}

const _glowMats = new Map();
export function glowMat(color) {
  let m = _glowMats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2, flatShading: true });
    m.userData = { shared: true };
    _glowMats.set(color, m);
  }
  return m;
}

// Üç forma: qüllə (tək blok), pilləli (yuxarı daralan 2–3 blok), enli (alçaq blok + üst qat)
export function makeCityBuilding(opts = {}) {
  const g = new THREE.Group();
  const mat = cityMat(false);
  const neonColors = [0x34e0ff, 0xff3d8a, 0xffd257, 0xb44bff];
  const neon = neonColors[Math.floor(rand(0, neonColors.length))];
  const form = Math.random();
  const block = (w, h, d, y) => {
    const m = new THREE.Mesh(cityBoxGeometry(w, h, d), mat);
    m.position.y = y + h / 2;
    m.castShadow = true;
    g.add(m);
    return y + h;
  };
  let w = rand(4.5, 8), d = rand(4.5, 8);
  let top;
  if (opts.low) {
    // Küçə səviyyəsi: alçaq blok + yola baxan işıqlı vitrin zolağı (+z üzü)
    w = rand(7, 10); d = rand(6, 8);
    top = block(w, rand(6, 11), d, 0);
    const shop = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 1.3, 0.2), glowMat(neon));
    shop.position.set(0, 1.9, d / 2 + 0.06);
    g.add(shop);
    if (Math.random() < 0.45) { w *= 0.6; d *= 0.7; top = block(w, rand(3, 6), d, top); }
  } else if (form < 0.4) {
    top = block(w, rand(opts.hMin ?? 14, opts.hMax ?? 36), d, 0);
  } else if (form < 0.75) {
    top = block(w, rand(8, 16), d, 0);
    w *= 0.74; d *= 0.74;
    top = block(w, rand(7, 13), d, top);
    if (Math.random() < 0.5) { w *= 0.7; d *= 0.7; top = block(w, rand(4, 9), d, top); }
  } else {
    w = rand(7, 8); d = rand(4.5, 6);
    top = block(w, rand(7, 12), d, 0);
    w *= 0.5; d *= 0.8;
    top = block(w, rand(4, 9), d, top);
  }
  // Dam kənarı neon haşiyə (üst blokun perimetri boyu nazik zolaq)
  if (Math.random() < 0.6) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.3, d + 0.3), glowMat(neon));
    trim.position.y = top - 0.5;
    g.add(trim);
  }
  // Antena + qırmızı siqnal işığı (yalnız hündür binalarda)
  if (top > 22) {
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4, 0.22), mat);
    mast.geometry.attributes.uv.array.fill(0);
    mast.position.y = top + 2;
    g.add(mast);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), glowMat(0xff3b30));
    lamp.position.y = top + 4.2;
    g.add(lamp);
  }
  return g;
}

export function makeBuilding(opts = {}) {
  if (opts.city) return makeCityBuilding(opts);
  const g = new THREE.Group();
  const w = rand(4, 8);
  const d = rand(4, 8);
  const h = rand(opts.hMin ?? 8, opts.hMax ?? 34);
  const shade = 0x272e52 + Math.floor(rand(0, 3)) * 0x060810;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flatMat(shade, { roughness: 0.7 }));
  body.position.y = h / 2;
  body.castShadow = true;
  g.add(body);

  // Neon zolaq (emissive)
  const neonColors = [0x34e0ff, 0xff3d8a, 0xffd257, 0x8bff3b];
  const neon = neonColors[Math.floor(rand(0, neonColors.length))];
  const stripeMat = new THREE.MeshStandardMaterial({
    color: neon,
    emissive: neon,
    emissiveIntensity: 2.2,
    flatShading: true,
  });
  const rows = Math.floor(h / 4);
  for (let i = 1; i < rows; i++) {
    if (Math.random() < 0.2) continue;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.35, 0.15), stripeMat);
    strip.position.set(0, i * 4, d / 2 + 0.02);
    g.add(strip);
  }
  return g;
}

// ————— Küçə lampası —————
// withLight=false: yalnız emissive baş (performans üçün — çox PointLight FPS öldürür)
// Lampa baş materialları RƏNGƏ görə keşlənir və PAYLAŞILIR: birləşmiş
// chunk-larda da eyni instansiya qalır, ona görə səhnə gecə payına görə
// hamısının emissiveIntensity-ni dəyişə bilir (gündüz lampa YANMIR —
// istifadəçi auditində gün ortası parlayan kürələr qüsur kimi qeydə alındı).
// DİQQƏT: rəng parametri qorunur — neon trekdə mavi/çəhrayı növbələşməsi
// köhnə davranışdır, itməməlidir.
const LAMP_MATS = new Map();
export function lampHeadMat(color = 0x34e0ff) {
  let m = LAMP_MATS.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 2.1, flatShading: true,
    });
    m.userData = { shared: true };
    LAMP_MATS.set(color, m);
  }
  return m;
}
// Bütün lampa başlarının parıltısı birdən (zen gün əyrisi / səhnə resetı)
export function setLampGlow(k) {
  for (const m of LAMP_MATS.values()) m.emissiveIntensity = k;
}
export const LAMP_HEAD_MAT = lampHeadMat(0x34e0ff);

export function makeLamp(color = 0x34e0ff, withLight = false) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 6, 6), flatMat(0x20242e));
  pole.position.y = 3;
  g.add(pole);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampHeadMat(color));
  head.position.y = 6;
  g.add(head);
  if (withLight) {
    const light = new THREE.PointLight(color, 42, 58, 1.8);
    light.position.y = 6;
    g.add(light);
  }
  return g;
}

// ————— Start/Finish tağı —————
export function makeStartArch(width, accent) {
  const g = new THREE.Group();
  const postMat = flatMat(0x1b1e2b, { roughness: 0.6 });
  const half = width / 2 + 1.2;
  for (const x of [-half, half]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 8, 0.9), postMat);
    post.position.set(x, 4, 0);
    post.castShadow = true;
    g.add(post);
    // Post başlığı (aksent)
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.5, 1.1),
      new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.7, flatShading: true })
    );
    cap.position.set(x, 8.15, 0);
    g.add(cap);
  }
  // Banner: şahmat + "FINISH" yazısı (ağappaq deyil)
  const bannerTex = makeFinishBannerTexture(accent);
  const sideMat = flatMat(0x14161e, { roughness: 0.7 });
  const faceMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.65 });
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(width + 3.4, 2.0, 0.5),
    [sideMat, sideMat, sideMat, sideMat, faceMat, faceMat] // ön/arxa üzlərdə tekstura
  );
  banner.position.set(0, 8.2, 0);
  g.add(banner);
  // Şahmat zolağı yerdə
  const tex = makeCheckerTexture();
  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 1, 3),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
  );
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.y = 0.06;
  g.add(stripe);
  return g;
}

// Banner teksturası: tünd fon, üst/alt şahmat zolağı, ortada FINISH yazısı
function makeFinishBannerTexture(accent) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#14161e';
  ctx.fillRect(0, 0, 1024, 160);
  // Şahmat zolaqları
  const sq = 20;
  for (const yBase of [0, 160 - sq * 2]) {
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 1024 / sq; x++) {
        ctx.fillStyle = (x + y + yBase / sq) % 2 === 0 ? '#e8e8ea' : '#17181f';
        ctx.fillRect(x * sq, yBase + y * sq, sq, sq);
      }
    }
  }
  // FINISH yazısı
  const accentCss = '#' + new THREE.Color(accent).getHexString();
  ctx.font = '900 74px "Russo One", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = accentCss;
  ctx.fillText('F I N I S H', 512, 82);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeCheckerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const n = 8;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f4f4f4' : '#15151a';
      ctx.fillRect((x * 64) / n, (y * 64) / n, 64 / n, 64 / n);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 1);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

// Trek tipinə görə dekor yaradıcısı
export function makeDecor(type, opts = {}) {
  switch (type) {
    case 'pine': return makePine();
    case 'cactus': return makeCactus();
    case 'rock': return makeRock();
    case 'dune': return makeDune();
    case 'building': return makeBuilding(opts);
    case 'lamp': return makeLamp();
    case 'house': return makeHouse();
    case 'windmill': return makeWindmill();
    case 'container': return makeContainer();
    case 'tires': return makeTireStack();
    case 'barrier': return makeBarrier();
    case 'chimney': return makeChimney();
    default: return makeRock();
  }
}

// Onlayn rəqibin adı — maşının üstündə üzən etiket (Sprite həmişə kameraya baxır)
// Yarış rekviziti: qara şin qülləsi (2-3 şin üst-üstə)
export function makeTireStack() {
  const g = new THREE.Group();
  const tireMat = flatMat(0x1d1e22, 0.9);
  const stripeMat = flatMat(0xd8dce4, 0.7);
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.24, 7, 14), tireMat);
    tire.rotation.x = Math.PI / 2;
    tire.position.set((Math.random() - 0.5) * 0.12, 0.25 + i * 0.46, (Math.random() - 0.5) * 0.12);
    g.add(tire);
    if (i === n - 1 && Math.random() < 0.5) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 14), stripeMat);
      band.rotation.x = Math.PI / 2;
      band.position.copy(tire.position);
      g.add(band);
    }
  }
  return g;
}

// Yarış rekviziti: qırmızı-ağ zolaqlı bariyer
export function makeBarrier() {
  const g = new THREE.Group();
  const segs = 3;
  for (let i = 0; i < segs; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.62, 0.34),
      flatMat(i % 2 ? 0xe8ecf2 : 0xd8332f, 0.75)
    );
    m.position.set((i - (segs - 1) / 2) * 0.72, 0.31, 0);
    g.add(m);
  }
  const foot = new THREE.Mesh(new THREE.BoxGeometry(segs * 0.72 + 0.2, 0.1, 0.5), flatMat(0x2a2d36, 0.9));
  foot.position.y = 0.05;
  g.add(foot);
  return g;
}

export function makeNameTag(name) {
  const text = String(name || 'Oyunçu').slice(0, 14);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = '700 30px Rajdhani, sans-serif';
  const w = Math.min(236, ctx.measureText(text).width + 34);
  const x = (256 - w) / 2;
  // Yumru arxa fon
  ctx.fillStyle = 'rgba(10, 14, 26, 0.72)';
  ctx.beginPath();
  ctx.roundRect(x, 8, w, 44, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 31);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false,
  }));
  sprite.position.y = 3.0;
  sprite.scale.set(3.6, 0.9, 1);
  sprite.renderOrder = 5;
  return sprite;
}

// ————— Balaca ev — divarlar + ikiyamaclı dam + baca + işıqlı pəncərələr —————
const HOUSE_WALLS = [0xf2ede4, 0xe8b4a8, 0xa8c4e0, 0xd8c49a, 0xe0d6c4];
const HOUSE_ROOFS = [0xa84a3a, 0x5a4a42, 0x8a3a4a, 0x6a5a8a];

export function makeHouse() {
  const g = new THREE.Group();
  const wall = HOUSE_WALLS[Math.floor(Math.random() * HOUSE_WALLS.length)];
  const roofC = HOUSE_ROOFS[Math.floor(Math.random() * HOUSE_ROOFS.length)];
  const w = 3.4 + Math.random() * 1.2;
  const d = 2.8 + Math.random() * 0.8;
  const h = 2.3 + Math.random() * 0.5;

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flatMat(wall, { roughness: 0.9 }));
  body.position.y = h / 2;
  body.castShadow = true;
  g.add(body);

  // İkiyamaclı dam: iki maili lövhə + ön/arxa üçbucaq effekti üçün qalın ridge
  const slope = Math.hypot(w / 2 + 0.3, h * 0.55);
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.16, d + 0.5), flatMat(roofC, { roughness: 0.85 }));
    const ang = Math.atan2(h * 0.55, w / 2 + 0.3);
    // Yamac mərkəzdən (dam beli) kənara AŞAĞI enməlidir: ∧ forması
    panel.rotation.z = -side * ang;
    panel.position.set(side * (w / 4 + 0.02), h + h * 0.27, 0);
    panel.castShadow = true;
    g.add(panel);
  }
  // Alın divarı: HƏQİQİ üçbucaq prizma — künclər damdan çölə çıxmır
  const rise = h * 0.55;
  const hwv = w / 2, hd = d / 2 * 0.98;
  const triGeo = new THREE.BufferGeometry();
  triGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -hwv, 0, hd,   hwv, 0, hd,   0, rise, hd,   // ön üçbucaq
    hwv, 0, -hd,  -hwv, 0, -hd,  0, rise, -hd,  // arxa üçbucaq
  ], 3));
  triGeo.setIndex([0, 1, 2, 3, 4, 5, 0, 5, 4, 0, 2, 5, 1, 3, 5, 1, 5, 2]);
  triGeo.computeVertexNormals();
  const gable = new THREE.Mesh(triGeo, flatMat(wall, { roughness: 0.9 }));
  gable.position.y = h;
  g.add(gable);

  // Baca — dam yamacının İÇİNDƏN çıxır (boşluqda üzmür)
  const chimX = w * 0.26;
  const roofYAtChimney = h + rise * (1 - chimX / (w / 2 + 0.3));
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.5, 0.42), flatMat(0x8a7a6e));
  chimney.position.set(chimX, roofYAtChimney + 0.45, d * 0.2);
  g.add(chimney);

  // Qapı + işıqlı pəncərələr (qürub palitrasında xoş görünür)
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.3, 0.08), flatMat(0x5a4232));
  door.position.set(-w * 0.2, 0.65, d / 2 + 0.02);
  g.add(door);
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xffd28a, emissive: 0xffb85a, emissiveIntensity: 0.9, flatShading: true,
  });
  for (const wx of [w * 0.18, w * 0.38]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.08), winMat);
    win.position.set(wx, 1.25, d / 2 + 0.02);
    g.add(win);
  }
  return g;
}

// ————— Yel dəyirmanı — qüllə + günbəz + fırlanan qanadlar ('wmblades') —————
export function makeWindmill() {
  const g = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.3, 9, 8), flatMat(0xe8e2d4, { roughness: 0.9 }));
  tower.position.y = 4.5;
  tower.castShadow = true;
  g.add(tower);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.6, 8), flatMat(0x8a4a3a));
  cap.position.y = 9.7;
  g.add(cap);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.1), flatMat(0x5a4232));
  door.position.set(0, 0.75, 2.15);
  g.add(door);
  // Qanadlar — ayrıca qrup, Environment yavaş fırladır
  const blades = new THREE.Group();
  blades.name = 'wmblades';
  const bladeMat = flatMat(0x9a8468, { roughness: 0.85 });
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.6, 0.12), bladeMat);
    blade.position.y = 2.8;
    const holder = new THREE.Group();
    holder.add(blade);
    holder.rotation.z = (i / 4) * Math.PI * 2;
    blades.add(holder);
  }
  blades.position.set(0, 8.6, 1.55);
  g.add(blades);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), flatMat(0x6a5a4a));
  hub.position.set(0, 8.6, 1.6);
  g.add(hub);
  return g;
}

// ————— Sənaye konteyneri (Zavod) —————
const CONTAINER_COLORS = [0xc44536, 0x2e6da4, 0x3e8948, 0xd68c2c, 0x7a5ba6];
export function makeContainer() {
  const g = new THREE.Group();
  const col = CONTAINER_COLORS[Math.floor(Math.random() * CONTAINER_COLORS.length)];
  const body = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.5, 2.4), flatMat(col, { roughness: 0.85 }));
  body.position.y = 1.25;
  body.castShadow = true;
  g.add(body);
  // Qabırğa zolaqları
  const ribMat = flatMat(new THREE.Color(col).multiplyScalar(0.75).getHex());
  for (const x of [-1.8, 0, 1.8]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.5, 2.5), ribMat);
    rib.position.set(x, 1.25, 0);
    g.add(rib);
  }
  return g;
}

// ————— Zavod bacası —————
export function makeChimney() {
  const g = new THREE.Group();
  const h = 14 + Math.random() * 10;
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.7, h, 8),
    flatMat(0x8a4a3a, { roughness: 0.9 })
  );
  tower.position.y = h / 2;
  tower.castShadow = true;
  g.add(tower);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.22, 1.2, 8), flatMat(0xd8d4c8));
  band.position.y = h - 2;
  g.add(band);
  return g;
}

// ————— TREK MÜHİTİ: yarış atmosferi üçün yeni obyektlər —————
// Hamısı flat-shaded low-poly, mergeStaticGroup ilə birləşməyə uyğun
// (tekstura yoxdur, material sayı az). Xəritələr "boş" görünməsin deyə
// trek kənarına səpilir.

// Tribuna — pilləli oturacaqlar + rəngli tamaşaçı xalları
export function makeGrandstand(len = 16, accent = 0xff7a2f) {
  const g = new THREE.Group();
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const h = 1.0 + i * 0.85;
    const row = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.85, 1.7),
      flatMat(i % 2 ? 0x8d95a6 : 0x9aa2b3, { roughness: 1 })
    );
    row.position.set(0, h - 0.42, -i * 1.7);
    row.castShadow = true;
    g.add(row);
    // Tamaşaçılar — kiçik rəngli kublar (uzaqdan kütlə kimi oxunur)
    const seats = Math.floor(len / 1.15);
    for (let s = 0; s < seats; s++) {
      if (Math.random() < 0.22) continue;               // boş yerlər
      const c = [0xffd34d, 0xff6b6b, 0x4fc3ff, 0x7dff8a, 0xd9a0ff, 0xf2f4f8][(Math.random() * 6) | 0];
      const pn = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.34), flatMat(c, { roughness: 1 }));
      pn.position.set(-len / 2 + 0.6 + s * 1.15, h + 0.3, -i * 1.7 + 0.2);
      g.add(pn);
    }
  }
  // Dam çıxıntısı
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 1.2, 0.3, steps * 1.7 + 1.4), flatMat(accent, { roughness: 0.8 }));
  roof.position.set(0, steps * 0.85 + 1.5, -(steps - 1) * 0.85);
  g.add(roof);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, steps * 0.85 + 1.5, 0.34), flatMat(0x6c7484));
    post.position.set(sx * (len / 2 - 0.4), (steps * 0.85 + 1.5) / 2, -(steps - 1) * 1.7 - 0.5);
    g.add(post);
  }
  return g;
}

// Projektor qülləsi — stadion işığı (gecə xəritələrində siluet verir)
export function makeFloodlight(h = 14, on = true) {
  const g = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, h, 6), flatMat(0x6c7484));
  mast.position.y = h / 2;
  mast.castShadow = true;
  g.add(mast);
  const head = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.5, 0.7), flatMat(0x4a5162));
  head.position.set(0, h + 0.4, 0.35);
  g.add(head);
  for (let i = 0; i < 4; i++) {
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.66, 0.16),
      flatMat(on ? 0xfff4d0 : 0x8a8f9a, { emissive: on ? 0xffe9b0 : 0x000000, emissiveIntensity: on ? 1.5 : 0 })
    );
    lamp.position.set(-1.2 + i * 0.8, h + 0.4, 0.74);
    g.add(lamp);
  }
  return g;
}

// Marşal məntəqəsi — kiçik kabinə + bayraq (trek kənarı canlanır)
export function makeMarshalPost(accent = 0xffb02e) {
  const g = new THREE.Group();
  const hut = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.0), flatMat(0xe8ebf0, { roughness: 1 }));
  hut.position.y = 1.1;
  hut.castShadow = true;
  g.add(hut);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 2.4), flatMat(accent));
  roof.position.y = 2.32;
  g.add(roof);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 5), flatMat(0x6c7484));
  pole.position.set(1.3, 1.7, 0);
  g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), flatMat(accent, { roughness: 0.8 }));
  flag.position.set(1.86, 3.05, 0);
  flag.rotation.y = Math.PI / 2;
  g.add(flag);
  return g;
}

// Sponsor lövhəsi — trek kənarı reklam panosu
export function makeSponsorBoard(w = 6, color = 0x1f6feb) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, 1.15, 0.16), flatMat(color, { roughness: 0.75 }));
  board.position.y = 0.95;
  g.add(board);
  // Ağ zolaq — uzaqdan "yazı" təəssüratı
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, 0.3, 0.2), flatMat(0xf2f4f8));
  stripe.position.set(0, 0.95, 0.01);
  g.add(stripe);
  for (const sx of [-1, 1]) {
    // Ayaq lövhədən NAZİKDİR (0.10 < 0.16): əvvəl eyni qalınlıqda idi və ön/arxa
    // üzləri lövhənin üzləri ilə eyni müstəvidə qalıb yanıb-sönürdü (z-fighting).
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.10), flatMat(0x565d6b));
    leg.position.set(sx * (w / 2 - 0.3), 0.45, 0);
    g.add(leg);
  }
  return g;
}

// Bayraq sırası — iki dirək arasında üçbucaq bayraqcıqlar
export function makeBunting(len = 12, colors = [0xff6b6b, 0xffd34d, 0x4fc3ff, 0x7dff8a]) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.2, 5), flatMat(0x6c7484));
    pole.position.set(sx * len / 2, 2.1, 0);
    g.add(pole);
  }
  const n = Math.floor(len / 1.1);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = -len / 2 + t * len;
    const sag = Math.sin(t * Math.PI) * 0.55;            // ip sallanır
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 3), flatMat(colors[i % colors.length]));
    fl.position.set(x, 3.9 - sag, 0);
    fl.rotation.x = Math.PI;
    g.add(fl);
  }
  return g;
}

// Taxta hasar seqmenti — zen yol kənarına "yaşayan kənd" hissi verir
export function makeFence(len = 6, color = 0x9a7b52) {
  const g = new THREE.Group();
  const rail = (y) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.09), flatMat(color, { roughness: 1 }));
    r.position.set(0, y, 0);
    g.add(r);
  };
  rail(0.95); rail(0.58);
  const n = Math.max(2, Math.round(len / 2));
  for (let i = 0; i <= n; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.25, 0.13), flatMat(color, { roughness: 1 }));
    post.position.set(-len / 2 + (i / n) * len, 0.62, 0);
    g.add(post);
  }
  return g;
}

// Yol nişanı — dirək + rəngli lövhə (məsafə/istiqamət hissi)
export function makeSignpost(color = 0x2e7d5b) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 2.6, 6), flatMat(0x9aa2b3));
  pole.position.y = 1.3;
  g.add(pole);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.62, 0.08), flatMat(color, { roughness: 0.8 }));
  plate.position.y = 2.25;
  g.add(plate);
  const line = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.1), flatMat(0xf2f4f8));
  line.position.set(0, 2.25, 0.02);
  g.add(line);
  return g;
}

// Telefon dirəyi — traverslə (uzun yol boyu ritm yaradır)
export function makeUtilityPole(h = 7.5) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, h, 6), flatMat(0x7a6248, { roughness: 1 }));
  pole.position.y = h / 2;
  pole.castShadow = true;
  g.add(pole);
  for (let i = 0; i < 2; i++) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.13, 0.13), flatMat(0x7a6248, { roughness: 1 }));
    arm.position.y = h - 0.5 - i * 0.7;
    g.add(arm);
    for (const sx of [-0.8, 0.8]) {
      const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 5), flatMat(0xd8dee9));
      ins.position.set(sx, h - 0.36 - i * 0.7, 0);
      g.add(ins);
    }
  }
  return g;
}
