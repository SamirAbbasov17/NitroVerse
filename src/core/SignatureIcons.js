// İmza güclərinin loqoları — hər biri kanvasda vektor kimi çəkilir.
// Emoji işlətmirik: platformalar arasında fərqli görünür və kiçildikdə oxunmur.
// Hər loqo dairəvi nişan içində, öz rəngində, ağ konturlu — HUD-da, mobil
// düymədə və maşın kartında eyni faylı işlədir.

const hexStr = (n) => '#' + n.toString(16).padStart(6, '0');

// ————— Ayrı-ayrı simvollar (mərkəz 0,0; radius ~1 vahid) —————
const GLYPH = {
  // Alov dili + arxada iz
  flametrail(c) {
    c.beginPath();
    c.moveTo(0.1, -0.62); c.quadraticCurveTo(0.5, -0.1, 0.24, 0.28);
    c.quadraticCurveTo(0.42, 0.42, 0.1, 0.62);
    c.quadraticCurveTo(-0.42, 0.36, -0.24, -0.06);
    c.quadraticCurveTo(-0.1, 0.16, 0.02, 0.02);
    c.quadraticCurveTo(-0.16, -0.34, 0.1, -0.62);
    c.closePath(); c.fill();
    c.globalAlpha = 0.5;
    for (let i = 0; i < 3; i++) { c.fillRect(-0.86 + i * 0.16, 0.24 + i * 0.06, 0.1, 0.06); }
    c.globalAlpha = 1;
  },
  // İki sürət oxu (raket itkisi)
  thrust(c) {
    for (const dx of [-0.26, 0.26]) {
      c.beginPath();
      c.moveTo(dx, -0.66); c.lineTo(dx + 0.26, 0.1); c.lineTo(dx, -0.06);
      c.lineTo(dx - 0.26, 0.1); c.closePath(); c.fill();
    }
    c.globalAlpha = 0.55;
    c.fillRect(-0.5, 0.34, 1.0, 0.11);
    c.fillRect(-0.32, 0.54, 0.64, 0.09);
    c.globalAlpha = 1;
  },
  // Hədəf + irəli ox (təqib)
  chase(c) {
    c.lineWidth = 0.17; c.strokeStyle = c.fillStyle;
    c.beginPath(); c.arc(0, 0, 0.52, 0.5, Math.PI * 2 - 0.5); c.stroke();
    c.beginPath();
    c.moveTo(0.66, 0); c.lineTo(0.16, -0.3); c.lineTo(0.16, 0.3);
    c.closePath(); c.fill();
    c.beginPath(); c.arc(0, 0, 0.14, 0, Math.PI * 2); c.fill();
  },
  // Günəş şüaları
  flare(c) {
    c.beginPath(); c.arc(0, 0, 0.3, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.save(); c.rotate(a);
      c.beginPath(); c.moveTo(0.42, -0.09); c.lineTo(0.78, 0); c.lineTo(0.42, 0.09);
      c.closePath(); c.fill(); c.restore();
    }
  },
  // Damla + qabarcıqlar (zəhər)
  venom(c) {
    c.beginPath();
    c.moveTo(0, -0.66);
    c.bezierCurveTo(0.46, -0.1, 0.42, 0.5, 0, 0.5);
    c.bezierCurveTo(-0.42, 0.5, -0.46, -0.1, 0, -0.66);
    c.closePath(); c.fill();
    c.globalAlpha = 0.55;
    c.beginPath(); c.arc(-0.56, 0.28, 0.15, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(0.58, 0.1, 0.11, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
  },
  // Duman divarı — üst-üstə buludlar
  smokewall(c) {
    const puff = (x, y, r, a) => {
      c.globalAlpha = a;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    };
    puff(-0.34, 0.12, 0.36, 0.95);
    puff(0.08, -0.12, 0.42, 0.8);
    puff(0.44, 0.2, 0.3, 0.6);
    puff(-0.05, 0.36, 0.3, 0.45);
    c.globalAlpha = 1;
  },
  // Qar dənəsi + iz
  icetrail(c) {
    c.lineWidth = 0.14; c.strokeStyle = c.fillStyle; c.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      c.save(); c.rotate(a);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -0.62); c.stroke();
      c.beginPath(); c.moveTo(0, -0.36); c.lineTo(0.16, -0.5); c.stroke();
      c.beginPath(); c.moveTo(0, -0.36); c.lineTo(-0.16, -0.5); c.stroke();
      c.restore();
    }
  },
  // Kök / lövbər torpaqda
  root(c) {
    c.lineWidth = 0.16; c.strokeStyle = c.fillStyle; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, -0.62); c.lineTo(0, 0.2); c.stroke();
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(0, 0.06); c.quadraticCurveTo(s * 0.4, 0.2, s * 0.52, 0.6); c.stroke();
      c.beginPath(); c.moveTo(0, -0.3); c.quadraticCurveTo(s * 0.3, -0.34, s * 0.44, -0.14); c.stroke();
    }
    c.beginPath(); c.moveTo(0, 0.2); c.lineTo(0, 0.62); c.stroke();
  },
  // Lövbər (ağır yük)
  anchor(c) {
    c.lineWidth = 0.16; c.strokeStyle = c.fillStyle; c.lineCap = 'round';
    c.beginPath(); c.arc(0, -0.46, 0.17, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(0, -0.28); c.lineTo(0, 0.5); c.stroke();
    c.beginPath(); c.moveTo(-0.34, -0.1); c.lineTo(0.34, -0.1); c.stroke();
    c.beginPath(); c.arc(0, 0.16, 0.46, 0.28, Math.PI - 0.28); c.stroke();
  },
  // Kölgə — yarı görünən sima
  cloak(c) {
    c.beginPath();
    c.moveTo(0, -0.64);
    c.bezierCurveTo(0.5, -0.6, 0.56, 0.1, 0.4, 0.6);
    c.lineTo(-0.4, 0.6);
    c.bezierCurveTo(-0.56, 0.1, -0.5, -0.6, 0, -0.64);
    c.closePath(); c.fill();
    c.save(); c.globalCompositeOperation = 'destination-out';
    for (let i = -2; i <= 2; i++) c.fillRect(-0.6, i * 0.24 - 0.05, 1.2, 0.1);
    c.restore();
  },
  // Dalğa xətləri
  wave(c) {
    c.lineWidth = 0.15; c.strokeStyle = c.fillStyle; c.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(-0.66, i * 0.34);
      c.bezierCurveTo(-0.3, i * 0.34 - 0.3, 0.1, i * 0.34 + 0.3, 0.66, i * 0.34);
      c.stroke();
    }
  },
  // Dağ + təkər izi (hər yerdə yol)
  allterrain(c) {
    c.beginPath();
    c.moveTo(-0.7, 0.34); c.lineTo(-0.2, -0.4); c.lineTo(0.12, 0.02);
    c.lineTo(0.36, -0.26); c.lineTo(0.72, 0.34);
    c.closePath(); c.fill();
    c.globalAlpha = 0.6;
    for (let i = 0; i < 4; i++) c.fillRect(-0.62 + i * 0.34, 0.5, 0.2, 0.12);
    c.globalAlpha = 1;
  },
  // Ürək nəbzi (ikinci nəfəs)
  secondwind(c) {
    c.lineWidth = 0.17; c.strokeStyle = c.fillStyle; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(-0.72, 0.04); c.lineTo(-0.34, 0.04); c.lineTo(-0.16, -0.42);
    c.lineTo(0.06, 0.42); c.lineTo(0.24, 0.04); c.lineTo(0.72, 0.04);
    c.stroke();
  },
  // Geri sarma (saat oxu + ox)
  rewind(c) {
    c.lineWidth = 0.17; c.strokeStyle = c.fillStyle; c.lineCap = 'round';
    c.beginPath(); c.arc(0, 0, 0.5, Math.PI * 0.72, Math.PI * 2.05); c.stroke();
    c.beginPath();
    c.moveTo(-0.5, -0.05); c.lineTo(-0.16, -0.22); c.lineTo(-0.2, 0.2);
    c.closePath(); c.fill();
  },
  // Tullanış qövsü
  leap(c) {
    c.lineWidth = 0.15; c.strokeStyle = c.fillStyle; c.lineCap = 'round';
    c.setLineDash([0.16, 0.13]);
    c.beginPath(); c.arc(0, 0.42, 0.6, Math.PI, 0); c.stroke();
    c.setLineDash([]);
    c.beginPath();
    c.moveTo(0.6, 0.42); c.lineTo(0.44, 0.08); c.lineTo(0.78, 0.16);
    c.closePath(); c.fill();
    c.beginPath(); c.arc(-0.6, 0.42, 0.15, 0, Math.PI * 2); c.fill();
  },
  // Qısa yol — zigzag ox
  shortcut(c) {
    c.lineWidth = 0.17; c.strokeStyle = c.fillStyle; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(-0.62, 0.44); c.lineTo(-0.1, 0.06); c.lineTo(-0.34, -0.1); c.lineTo(0.3, -0.5);
    c.stroke();
    c.beginPath();
    c.moveTo(0.62, -0.58); c.lineTo(0.2, -0.6); c.lineTo(0.46, -0.2);
    c.closePath(); c.fill();
  },
  // Nal maqnit
  magnet(c) {
    c.lineWidth = 0.26; c.strokeStyle = c.fillStyle; c.lineCap = 'butt';
    c.beginPath(); c.arc(0, 0.06, 0.44, Math.PI, 0); c.stroke();
    c.fillRect(-0.57, 0.06, 0.26, 0.34);
    c.fillRect(0.31, 0.06, 0.26, 0.34);
    c.globalAlpha = 0.5;
    c.fillRect(-0.57, 0.4, 0.26, 0.16);
    c.fillRect(0.31, 0.4, 0.26, 0.16);
    c.globalAlpha = 1;
  },
  // Partlayış dalğası — konsentrik qövslər
  shockwave(c) {
    c.beginPath(); c.arc(0, 0, 0.16, 0, Math.PI * 2); c.fill();
    c.lineWidth = 0.13; c.strokeStyle = c.fillStyle;
    for (let i = 1; i <= 3; i++) {
      c.globalAlpha = 1 - i * 0.22;
      c.beginPath(); c.arc(0, 0, 0.16 + i * 0.2, 0, Math.PI * 2); c.stroke();
    }
    c.globalAlpha = 1;
  },
};

// Loqonu kanvasa çəkir (şəffaf fon, dairəvi nişan + simvol)
export function signatureIconCanvas(iconKey, colorHex, size = 128, plate = true) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const col = hexStr(colorHex);
  c.translate(size / 2, size / 2);

  if (plate) {
    // Dairəvi fon: tünd disk + rəngli halqa (hər fonda oxunur)
    const r = size * 0.46;
    const g = c.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, 'rgba(28,32,42,0.96)');
    g.addColorStop(1, 'rgba(12,14,20,0.96)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = col; c.lineWidth = size * 0.055;
    c.beginPath(); c.arc(0, 0, r - size * 0.028, 0, Math.PI * 2); c.stroke();
  }

  // Simvol
  const s = size * (plate ? 0.30 : 0.42);
  c.save();
  c.scale(s, s);
  c.fillStyle = col;
  c.strokeStyle = col;
  c.lineWidth = 0.15;
  (GLYPH[iconKey] || GLYPH.flare)(c);
  c.restore();
  return cv;
}

// id → dataURL keşi (HUD/menyu dəfələrlə çağırır)
const cache = new Map();
export function signatureIconURL(iconKey, colorHex, size = 128) {
  const k = iconKey + '|' + colorHex + '|' + size;
  let u = cache.get(k);
  if (!u) { u = signatureIconCanvas(iconKey, colorHex, size).toDataURL('image/png'); cache.set(k, u); }
  return u;
}
