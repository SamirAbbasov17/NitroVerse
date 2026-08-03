import * as THREE from 'three';

// Power-up 3D asset-ləri: "?" qutusu, raket, nitro balonu, yağ ləkəsi.
// HUD ikonları da bu modellərdən render olunur — UI ↔ oyun eyni görünür.

// ════════════════════════════════════════════════════════
// ABILITY VİZUAL SİSTEMİ (Blur üslubu): hər ability-nin öz RƏNGİ
// və professional vektor qlifi — badge ikonları + rəngli parlaq qutular.
// ════════════════════════════════════════════════════════
export const ABILITY_COLORS = {
  nitro: '#29d0ff',   // mavi — sürət
  missile: '#ff5040', // qırmızı — hücum
  mine: '#ffb02e',    // narıncı — tələ
  shield: '#47e08a',  // yaşıl — müdafiə
  bolt: '#b44bff',    // bənövşəyi — şok
  trishot: '#dbe6f5', // gümüşü — üçlü atəş (yüngül hücum)
  repair: '#ff6f9c',  // çəhrayı — can bərpası (tibbi)
};

function shade(hex, k) {
  // k>0 açıqlaşdırır, k<0 tündləşdirir
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (k > 0 ? (255 - v) * k : v * k))));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `rgb(${r},${g},${b})`;
}

// Ağ vektor qlif — mərkəz (cx,cy), miqyas s
function drawGlyph(ctx, id, cx, cy, s, color) {
  const P = (x, y) => [cx + x * s, cy + y * s];
  const poly = (pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(...P(x, y)) : ctx.lineTo(...P(x, y))));
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = '#fff';
  switch (id) {
    case 'bolt':
      // Klassik ildırım poliqonu
      poly([[-0.02, -0.46], [0.2, -0.46], [0.04, -0.08], [0.24, -0.08], [-0.14, 0.46], [-0.02, 0.07], [-0.22, 0.07]]);
      break;
    case 'nitro': {
      // Sürət şevronları »
      ctx.lineWidth = 0.15 * s;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(...P(-0.3, -0.26)); ctx.lineTo(...P(-0.04, 0)); ctx.lineTo(...P(-0.3, 0.26));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(...P(0.06, -0.26)); ctx.lineTo(...P(0.32, 0)); ctx.lineTo(...P(0.06, 0.26));
      ctx.stroke();
      break;
    }
    case 'missile': {
      // Raket silueti (yuxarı baxır)
      poly([[0, -0.46], [-0.13, -0.14], [0.13, -0.14]]); // burun
      ctx.beginPath();
      ctx.roundRect(...P(-0.13, -0.16), 0.26 * s, 0.4 * s, 0.05 * s); // gövdə
      ctx.fill();
      poly([[-0.13, 0.08], [-0.27, 0.3], [-0.13, 0.3]]); // sol qanad
      poly([[0.13, 0.08], [0.27, 0.3], [0.13, 0.3]]);    // sağ qanad
      poly([[-0.06, 0.26], [0.06, 0.26], [0, 0.44]]);    // alov
      // İlluminator (badge rəngində)
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(...P(0, -0.04), 0.055 * s, 0, 7);
      ctx.fill();
      break;
    }
    case 'mine': {
      // Tikanlı mina
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const dx = Math.cos(a), dy = Math.sin(a);
        poly([
          [dx * 0.42, dy * 0.42],
          [dx * 0.16 - dy * 0.09, dy * 0.16 + dx * 0.09],
          [dx * 0.16 + dy * 0.09, dy * 0.16 - dx * 0.09],
        ]);
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 0.22 * s, 0, 7);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(...P(-0.06, -0.06), 0.06 * s, 0, 7);
      ctx.fill();
      break;
    }
    case 'trishot': {
      // Üç kiçik güllə (diaqonal düzülüş)
      const bullet = (bx, by) => {
        ctx.beginPath();
        ctx.roundRect(...P(bx - 0.055, by - 0.16), 0.11 * s, 0.32 * s, 0.055 * s);
        ctx.fill();
        // Burun
        poly([[bx - 0.055, by - 0.14], [bx + 0.055, by - 0.14], [bx, by - 0.24]]);
      };
      ctx.fillStyle = '#3a4152'; // tünd güllələr (gümüşü fonda oxunsun)
      bullet(-0.22, 0.1);
      bullet(0, -0.02);
      bullet(0.22, 0.1);
      break;
    }
    case 'repair': {
      // Tibbi xaç — digər qliflərlə eyni dildə: ağ, dolğun, yumru künclü
      const w = 0.15, l = 0.4;
      ctx.beginPath();
      ctx.roundRect(...P(-w, -l), w * 2 * s, l * 2 * s, 0.07 * s);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(...P(-l, -w), l * 2 * s, w * 2 * s, 0.07 * s);
      ctx.fill();
      break;
    }
    case 'shield': {
      // Qalxan
      ctx.beginPath();
      ctx.moveTo(...P(0, -0.42));
      ctx.quadraticCurveTo(...P(0.3, -0.36), ...P(0.32, -0.3));
      ctx.lineTo(...P(0.32, 0.02));
      ctx.quadraticCurveTo(...P(0.3, 0.3), ...P(0, 0.45));
      ctx.quadraticCurveTo(...P(-0.3, 0.3), ...P(-0.32, 0.02));
      ctx.lineTo(...P(-0.32, -0.3));
      ctx.quadraticCurveTo(...P(-0.3, -0.36), ...P(0, -0.42));
      ctx.fill();
      // Daxili xətt (badge rəngində)
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.05 * s;
      ctx.beginPath();
      ctx.moveTo(...P(0, -0.28));
      ctx.quadraticCurveTo(...P(0.2, -0.22), ...P(0.2, -0.16));
      ctx.lineTo(...P(0.2, 0.0));
      ctx.quadraticCurveTo(...P(0.18, 0.2), ...P(0, 0.3));
      ctx.quadraticCurveTo(...P(-0.18, 0.2), ...P(-0.2, 0.0));
      ctx.lineTo(...P(-0.2, -0.16));
      ctx.quadraticCurveTo(...P(-0.2, -0.22), ...P(0, -0.28));
      ctx.stroke();
      break;
    }
  }
}

// HUD / mobil düymələr üçün dairəvi badge ikonları (dataURL)
// Tək ability üçün badge kanvası — sprite teksturası kimi sinxron istifadə olunur
export function abilityIconCanvas(id, size = 64) {
  const color = ABILITY_COLORS[id] || '#8fa2bd';
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size * 0.38, size * 0.32, size * 0.06, size / 2, size / 2, size * 0.52);
  g.addColorStop(0, shade(color, 0.4));
  g.addColorStop(0.6, color);
  g.addColorStop(1, shade(color, -0.4));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.45, 0, 7);
  ctx.fill();
  ctx.lineWidth = size * 0.045;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = size * 0.05;
  ctx.shadowOffsetY = size * 0.02;
  drawGlyph(ctx, id, size / 2, size / 2, size * 0.85, color);
  ctx.restore();
  return c;
}

export function renderAbilityIcons(size = 128) {
  const out = {};
  for (const id of Object.keys(ABILITY_COLORS)) {
    out[id] = abilityIconCanvas(id, size).toDataURL('image/png');
  }
  return out;
}

// ————— Rəngli item qutuları — uzaqdan hansı ability olduğu bilinir —————
const _boxMats = new Map();

export function itemBoxMaterial(type) {
  let mat = _boxMats.get(type.id);
  if (!mat) {
    const color = ABILITY_COLORS[type.id] || '#ffb62e';
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    // Rəngli fon (tünd → parlaq diaqonal)
    const g = ctx.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, shade(color, -0.5));
    g.addColorStop(0.5, shade(color, -0.15));
    g.addColorStop(1, shade(color, -0.5));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    // Parlaq haşiyə
    ctx.strokeStyle = shade(color, 0.35);
    ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, 238, 238);
    // Künc pərçimləri
    ctx.fillStyle = shade(color, 0.5);
    for (const [x, y] of [[34, 34], [222, 34], [34, 222], [222, 222]]) {
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, 7);
      ctx.fill();
    }
    // Böyük ağ qlif
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    drawGlyph(ctx, type.id, 128, 128, 200, shade(color, -0.2));
    ctx.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.55, // rəngli parıltı — gecə trekində də seçilir
      roughness: 0.35,
      metalness: 0.15,
    });
    _boxMats.set(type.id, mat);
  }
  return mat;
}

// ————— Qutu üstü billboard nişanı — uzaqdan hansı ability olduğu OXUNUR —————
const _badgeTex = new Map();

export function abilityBadgeTexture(id) {
  let tex = _badgeTex.get(id);
  if (!tex) {
    tex = new THREE.CanvasTexture(abilityIconCanvas(id, 128));
    tex.colorSpace = THREE.SRGBColorSpace;
    _badgeTex.set(id, tex);
  }
  return tex;
}

// ————— Item işığı: qutu əvəzinə parlayan nüvə + yerdə halo —————
let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 3, 64, 64, 63);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(cv);
  return _glowTex;
}

const _haloGeo = new THREE.CircleGeometry(1.5, 24);

// Qrup: parlaq nüvə (billboard) + yol səthində yumşaq halqa
export function makeItemGlow(id) {
  const g = new THREE.Group();
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  core.name = 'glowcore';
  core.scale.set(2.3, 2.3, 1);
  g.add(core);
  const halo = new THREE.Mesh(_haloGeo, new THREE.MeshBasicMaterial({
    map: glowTexture(), transparent: true, opacity: 0.5, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  halo.name = 'glowhalo';
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -1.0; // yol səthinə düşür (qrup y≈1.05-dədir)
  g.add(halo);
  tintItemGlow(g, id);
  return g;
}

export function tintItemGlow(group, id) {
  const c = new THREE.Color(ABILITY_COLORS[id] || '#ffb62e');
  const core = group.getObjectByName('glowcore');
  const halo = group.getObjectByName('glowhalo');
  if (core) core.material.color.copy(c);
  if (halo) halo.material.color.copy(c);
}

export function makeAbilityBadge(id) {
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: abilityBadgeTexture(id), transparent: true, depthTest: true, alphaTest: 0.06,
  }));
  spr.scale.set(2.4, 2.4, 1);
  return spr;
}

const _boxGeo = new THREE.BoxGeometry(1.25, 1.25, 1.25);

export function makeItemBox(type) {
  const mesh = new THREE.Mesh(_boxGeo, itemBoxMaterial(type));
  mesh.castShadow = true;
  return mesh;
}

// ————— Üçlü atəş gülləsi — kiçik parlaq izləyici —————
const _bulletGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.55, 6);
const _bulletMat = new THREE.MeshStandardMaterial({
  color: 0xdbe6f5, emissive: 0xbfd6ff, emissiveIntensity: 2.2, flatShading: true,
});

export function makeBullet() {
  // Qrupda — lookAt(+Z) düzgün işləsin
  const g = new THREE.Group();
  const m = new THREE.Mesh(_bulletGeo, _bulletMat);
  m.rotation.x = Math.PI / 2; // +Z boyunca uzanır
  g.add(m);
  return g;
}

// ————— Raket (burnu +Z istiqamətində) —————
export function makeMissile() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xe33225, roughness: 0.4, metalness: 0.3, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23252e, roughness: 0.5, flatShading: true });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, flatShading: true });

  // Gövdə
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.0, 10), white);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  // Burun konusu
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.45, 10), red);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 0.72;
  g.add(nose);
  // Quyruq halqası
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.22, 10), red);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = -0.5;
  g.add(tail);
  // 4 qanad
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.34), red);
    const a = (i / 4) * Math.PI * 2;
    fin.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, -0.42);
    fin.rotation.z = a;
    g.add(fin);
  }
  // Egzoz alovu
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.55, 8),
    new THREE.MeshStandardMaterial({ color: 0xffa32e, emissive: 0xff8c1a, emissiveIntensity: 2.2, flatShading: true })
  );
  flame.rotation.x = -Math.PI / 2;
  flame.position.z = -0.85;
  flame.name = 'flame';
  g.add(flame);
  // QEYD: raketə PointLight qoymuruq — dinamik işıq sayı dəyişəndə
  // bütün shaderlər yenidən kompilyasiya olunur (FPS donması)

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ————— Nitro balonu (HUD ikonu + istəyə görə səhnə) —————
export function makeNitroBottle() {
  const g = new THREE.Group();
  const cyan = new THREE.MeshStandardMaterial({ color: 0x18c8ff, roughness: 0.25, metalness: 0.6, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23252e, roughness: 0.5, flatShading: true });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.05, 12), cyan);
  g.add(body);
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 0.25, 12), cyan);
  shoulder.position.y = 0.65;
  g.add(shoulder);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8), dark);
  valve.position.y = 0.88;
  g.add(valve);
  // Üstündə ⚡ zolağı
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.34, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xfff05a, emissive: 0xffd94d, emissiveIntensity: 0.8 })
  );
  stripe.position.set(0, 0.05, 0.33);
  g.add(stripe);
  return g;
}

// ————— Yağ çəlləyi (ikon üçün — aydın oxunur) —————
export function makeOilBarrel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12),
    new THREE.MeshStandardMaterial({ color: 0x2c2f3a, roughness: 0.45, metalness: 0.4, flatShading: true })
  );
  g.add(body);
  for (const y of [-0.28, 0.28]) {
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.09, 12),
      new THREE.MeshStandardMaterial({ color: 0xffb62e, roughness: 0.4, metalness: 0.3, flatShading: true })
    );
    ring.position.y = y;
    g.add(ring);
  }
  // Damcı işarəsi
  const drop = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x0a0a12, roughness: 0.15, metalness: 0.5 })
  );
  drop.position.set(0, 0.05, 0.4);
  drop.scale.y = 1.3;
  g.add(drop);
  return g;
}

// ————— Qalxan ikonu —————
export function makeShieldIcon() {
  const g = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 14, 10),
    new THREE.MeshStandardMaterial({
      color: 0x37b8ff, emissive: 0x1e7fd6, emissiveIntensity: 0.8,
      transparent: true, opacity: 0.45, roughness: 0.2,
    })
  );
  g.add(sphere);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.055, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x8fe0ff, emissive: 0x5cc9ff, emissiveIntensity: 1.4 })
  );
  ring.rotation.x = Math.PI / 3;
  g.add(ring);
  return g;
}

// ————— Şimşək ikonu —————
export function makeBoltIcon() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffe14d, emissive: 0xffd21e, emissiveIntensity: 1.6, flatShading: true,
  });
  // Ziqzaq: 3 maili lövhə
  const segs = [
    [0.12, 0.36, -0.22, 0],
    [-0.12, 0, 0.22, 0],
    [0.1, -0.38, -0.2, 0],
  ];
  for (const [x, y] of segs) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.14), mat);
    seg.position.set(x, y, 0);
    seg.rotation.z = -0.45;
    g.add(seg);
  }
  return g;
}

// ————— Mina (tikanlı kürə + yanıb-sönən qırmızı lampa) —————
export function makeMine() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x1b1e26, roughness: 0.35, metalness: 0.5, flatShading: true })
  );
  body.position.y = 0.45;
  body.castShadow = true;
  g.add(body);
  const spikeGeo = new THREE.ConeGeometry(0.09, 0.32, 5);
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4c, roughness: 0.4, metalness: 0.5, flatShading: true });
  const dirs = [
    [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
    [0.7, 0.5, 0], [-0.7, 0.5, 0], [0, 0.5, 0.7], [0, 0.5, -0.7],
  ];
  for (const [x, y, z] of dirs) {
    const s = new THREE.Mesh(spikeGeo, spikeMat);
    s.position.set(x * 0.52, 0.45 + y * 0.52, z * 0.52);
    s.lookAt(x * 3, 0.45 + y * 3, z * 3);
    s.rotateX(Math.PI / 2);
    g.add(s);
  }
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 2 })
  );
  lamp.position.y = 1.05;
  lamp.name = 'minelamp';
  g.add(lamp);
  return g;
}

// ————— Yağ ləkəsi (nizamsız blob) —————
export function makeOilSlick() {
  const geo = new THREE.CircleGeometry(1.7, 16);
  // Kənar nöqtələri təsadüfi "dalğalandır"
  const posAttr = geo.getAttribute('position');
  for (let i = 1; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const len = Math.hypot(x, y);
    if (len > 0.1) {
      const k = 0.78 + Math.random() * 0.42;
      posAttr.setX(i, x * k);
      posAttr.setY(i, y * k);
    }
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0x07070c,
      roughness: 0.15,
      metalness: 0.55,
      transparent: true,
      opacity: 0.94,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// ————— HUD üçün 3D ikon renderi —————
export function renderItemThumbs(size = 112) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x3a4152, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3, 5, 4);
  scene.add(key);

  const items = {
    nitro: { obj: makeNitroBottle(), cam: [1.9, 1.4, 2.4], look: [0, 0.15, 0] },
    missile: { obj: makeMissile(), cam: [1.6, 1.3, -2.6], look: [0, 0, 0] },
    mine: { obj: makeMine(), cam: [1.8, 1.5, 2.2], look: [0, 0.45, 0] },
    shield: { obj: makeShieldIcon(), cam: [1.5, 0.9, 1.9], look: [0, 0, 0] },
    bolt: { obj: makeBoltIcon(), cam: [0.4, 0.5, 2.3], look: [0, 0, 0] },
  };

  const thumbs = {};
  for (const [id, item] of Object.entries(items)) {
    scene.add(item.obj);
    camera.position.set(...item.cam);
    camera.lookAt(...item.look);
    renderer.render(scene, camera);
    thumbs[id] = canvas.toDataURL('image/png');
    scene.remove(item.obj);
  }
  renderer.dispose();
  return thumbs;
}
