// CARMAGEDDON — xəritə personajlarının spraytları.
// Hər personaj üçün kadr vərəqi BİR DƏFƏ çəkilir (tam piksellə, miqyassız — hər piksel iti qalır):
// 4 istiqamət × 6 kadr = [dayanma, nəfəs, yeriş 1–4]. Kadr 24×34, ayaqlar kadrın altındadır.
// Görünüş `look`-dan gəlir: rənglər (hair, skin, top, legs, hat, trim) və detallar (feat):
// goggles, scarf, jacket, freckles, headscarf, cap, moustache, apron, afro, glasses, mohawk, headphones,
// widehat, beard, poncho, knit; `long` — uzun saç; `kid` — uşaq boyu.
export const FW = 24, FH = 34;
const INK = '#1a0f14';

const shade = (hex, k) => {           // rəngi tündləşdir (k < 1) / açıqlaşdır (k > 1)
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

// dir: 0 bizə tərəf, 1 arxası, 2 sol, 3 sağ. ph: yeriş fazası (0 dayanıb, 1..4), up: gövdənin 1 px qalxması
function drawFrame(x, ox, look, dir, ph, up) {
  const f = new Set(look.feat || []), kid = !!look.kid;
  const cx = ox + 12, base = FH - 1;                    // ayaqların dibi
  const legH = kid ? 4 : 6, torsoH = kid ? 6 : 9;
  const hipY = base - legH - 1, torsoTop = hipY - torsoH + 1 - up, headTop = torsoTop - 13;
  const R = (px, py, w, h, c) => { if (w > 0 && h > 0) { x.fillStyle = c; x.fillRect(px, py, w, h); } };
  const front = dir === 0, back = dir === 1, side = dir >= 2, sx = dir === 2 ? -1 : 1;
  const top = look.top, topD = shade(look.top, 0.72), skin = look.skin, skinD = shade(look.skin, 0.8);
  const hair = look.hair, hairD = shade(look.hair, 0.7), legs = look.legs, shoe = shade(look.legs, 0.55);

  // ——— ayaqlar ———
  if (side) {
    // qayçı: 1 — ön ayaq irəli, 3 — arxa ayaq irəli; 2/4 — birləşir
    const spread = ph === 1 ? 3 : ph === 3 ? -3 : 0, lift = ph === 2 || ph === 4 ? 1 : 0;
    for (const [dx, far] of [[-spread, true], [spread, false]]) {
      const lx = cx - 2 + dx * sx, c = far ? shade(look.legs, 0.8) : legs;
      R(lx - 1, hipY, 5, legH + 1, INK); R(lx, hipY, 3, legH - (far ? lift : 0), c);
      R(lx - 1 + (sx > 0 ? 0 : -1), base - 1 - (far ? lift : 0), 5, 2, INK); R(lx + (sx > 0 ? 0 : -1), base - 1 - (far ? lift : 0), 4, 1, shoe);
    }
  } else {
    // öndən/arxadan: 1 — sol ayaq qalxır, 3 — sağ ayaq
    for (const [lx, liftOn] of [[cx - 5, 1], [cx + 1, 3]]) {
      const lift = ph === liftOn ? 2 : 0;
      R(lx - 1, hipY, 6, legH + 1 - lift, INK); R(lx, hipY, 4, legH - lift, legs); R(lx + 3, hipY, 1, legH - lift, shade(look.legs, 0.8));
      R(lx - 1, base - 1 - lift, 6, 2, INK); R(lx, base - 1 - lift, 4, 1, shoe);
    }
  }

  // ——— gövdə ———
  const poncho = f.has('poncho');
  const tw = side ? 8 : poncho ? 16 : 12;
  const tx = cx - tw / 2;
  R(tx - 1, torsoTop, tw + 2, torsoH + 1, INK);
  R(tx, torsoTop + 1, tw, torsoH - 1, top);
  R(tx + tw - 2, torsoTop + 1, 2, torsoH - 1, topD); R(tx, torsoTop + torsoH - 2, tw, 1, topD);
  if (poncho) { R(tx - 2, torsoTop + 3, tw + 4, torsoH - 4, INK); R(tx - 1, torsoTop + 3, tw + 2, torsoH - 5, top); R(tx - 1, torsoTop + torsoH - 4, tw + 2, 1, look.trim || topD); R(tx + 2, torsoTop + 4, 1, 1, look.trim || topD); R(tx + tw - 3, torsoTop + 4, 1, 1, look.trim || topD); }
  else if (look.trim && !f.has('apron')) R(tx, torsoTop + torsoH - 3, tw, 1, look.trim);
  if (f.has('jacket') && front) { R(cx, torsoTop + 2, 1, torsoH - 3, topD); R(cx - 3, torsoTop + 1, 2, 2, shade(look.top, 1.25)); R(cx + 2, torsoTop + 1, 2, 2, shade(look.top, 1.25)); }
  if (f.has('apron') && front) { const c = look.trim || '#8a3a1c'; R(cx - 4, torsoTop + 3, 8, torsoH - 3, c); R(cx - 4, torsoTop + 1, 1, 2, c); R(cx + 3, torsoTop + 1, 1, 2, c); R(cx - 1, torsoTop + 5, 2, 2, shade(c, 0.7)); }
  if (f.has('apron') && side) R(sx > 0 ? cx + 1 : cx - 4, torsoTop + 3, 3, torsoH - 3, look.trim || '#8a3a1c');

  // ——— qollar (yeriyəndə yellənir) ———
  if (!poncho) {
    if (side) {
      const sw = ph === 1 ? -2 : ph === 3 ? 2 : 0;       // ayağın əksinə
      const ax = cx - 1 + sw * sx;
      R(ax - 1, torsoTop + 2, 4, torsoH - 2, INK); R(ax, torsoTop + 2, 2, torsoH - 4, top); R(ax, torsoTop + torsoH - 2, 2, 1, skin);
    } else {
      for (const [ax, on] of [[tx - 3, 3], [tx + tw + 1, 1]]) {
        const sw = ph === on ? -1 : ph && ph !== on && ph % 2 ? 1 : 0;
        R(ax - 1, torsoTop + 1 + sw, 4, torsoH - 1, INK); R(ax, torsoTop + 2 + sw, 2, torsoH - 4, top); R(ax, torsoTop + torsoH - 2 + sw, 2, 1, skin);
      }
    }
  }
  if (f.has('scarf')) { const c = look.scarf || '#8a8a84'; R(side ? cx - 4 : cx - 5, torsoTop, side ? 8 : 10, 2, INK); R(side ? cx - 3 : cx - 4, torsoTop, side ? 6 : 8, 1, c); if (front) R(cx + 2, torsoTop + 1, 2, 3, c); }

  // ——— baş (yuvarlaq) ———
  const HW = [8, 10, 12, 14, 14, 14, 14, 14, 14, 14, 12, 10, 8];     // sətirlərin eni
  const hx = cx + (side ? sx : 0);
  HW.forEach((w, i) => R(hx - w / 2 - 1, headTop + i, w + 2, 1, INK));
  R(hx - 4, headTop - 1, 8, 1, INK); R(hx - 4, headTop + 13, 8, 1, INK);
  HW.forEach((w, i) => R(hx - w / 2, headTop + i, w, 1, skin));
  if (!back) { R(hx - 6 + (side && sx < 0 ? 10 : 0), headTop + 9, 2, 2, skinD); }
  // ——— saç ———
  const bald = f.has('cap') && look.bald;
  if (back) {
    HW.slice(0, look.long ? 13 : 9).forEach((w, i) => R(hx - w / 2, headTop + i, w, 1, i > 6 ? hairD : hair));
    if (look.long) { R(hx - 7, headTop + 8, 14, 9, INK); R(hx - 6, headTop + 8, 12, 8, hair); R(hx - 6, headTop + 13, 12, 3, hairD); R(hx - 3, headTop + 16, 2, 1, hair); R(hx + 2, headTop + 16, 2, 1, hair); }
  } else if (!bald) {
    HW.slice(0, 4).forEach((w, i) => R(hx - w / 2, headTop + i, w, 1, hair));
    if (front) { R(hx - 7, headTop + 4, 3, 3, hair); R(hx + 4, headTop + 4, 3, 3, hair); R(hx - 3, headTop + 4, 2, 1, hair); R(hx + 2, headTop + 4, 1, 1, hair); R(hx - 7, headTop + 3, 14, 1, hairD); }
    else { R(sx > 0 ? hx - 7 : hx + 1, headTop + 4, 6, 4, hair); R(sx > 0 ? hx - 7 : hx + 3, headTop + 8, 4, 2, hair); R(sx > 0 ? hx - 1 : hx - 1, headTop + 4, 3, 1, hair); }
    if (look.long) {
      if (front) { R(hx - 9, headTop + 4, 3, 13, INK); R(hx + 6, headTop + 4, 3, 13, INK); R(hx - 8, headTop + 4, 2, 12, hair); R(hx + 6, headTop + 4, 2, 12, hair); R(hx - 8, headTop + 13, 2, 3, hairD); R(hx + 6, headTop + 13, 2, 3, hairD); }
      else { const bx = sx > 0 ? hx - 9 : hx + 5, sway = ph === 1 ? -1 : ph === 3 ? 1 : 0; R(bx - 1 + sway * -sx, headTop + 4, 6, 14, INK); R(bx + sway * -sx, headTop + 4, 4, 13, hair); R(bx + sway * -sx, headTop + 13, 4, 4, hairD); }
    }
  }
  if (f.has('afro')) { const AW = [10, 14, 16, 18, 18, 18, 16]; AW.forEach((w, i) => R(hx - w / 2 - 1, headTop - 3 + i, w + 2, 1, INK)); AW.forEach((w, i) => R(hx - w / 2, headTop - 3 + i, w, 1, i < 2 ? shade(look.hair, 1.5) : hair)); if (!back) { R(hx - 9, headTop + 4, 3, 5, hair); R(hx + 6, headTop + 4, 3, 5, hair); } }
  if (f.has('mohawk')) { R(hx - 2, headTop - 5, 4, 8, INK); R(hx - 1, headTop - 4, 2, 7, hair); R(hx - 1, headTop - 4, 1, 3, shade(look.hair, 1.3)); }
  // ——— üz ———
  if (front) {
    R(hx - 4, headTop + 7, 2, 3, INK); R(hx + 2, headTop + 7, 2, 3, INK); R(hx - 4, headTop + 7, 1, 1, '#fff'); R(hx + 2, headTop + 7, 1, 1, '#fff');
    R(hx - 1, headTop + 11, 2, 1, skinD);
    if (f.has('freckles')) { R(hx - 6, headTop + 10, 1, 1, shade(look.skin, 0.7)); R(hx + 5, headTop + 10, 1, 1, shade(look.skin, 0.7)); }
    if (f.has('glasses')) { R(hx - 6, headTop + 6, 5, 5, INK); R(hx + 1, headTop + 6, 5, 5, INK); R(hx - 5, headTop + 7, 3, 3, '#9ab4d8'); R(hx + 2, headTop + 7, 3, 3, '#9ab4d8'); R(hx - 4, headTop + 8, 1, 1, INK); R(hx + 3, headTop + 8, 1, 1, INK); R(hx - 1, headTop + 8, 2, 1, INK); }
    if (f.has('moustache')) { R(hx - 5, headTop + 10, 10, 2, '#8a8a8a'); R(hx - 6, headTop + 11, 2, 2, '#8a8a8a'); R(hx + 4, headTop + 11, 2, 2, '#8a8a8a'); }
    if (f.has('beard')) { [12, 12, 10, 8, 6, 4].forEach((w, i) => { R(hx - w / 2 - 1, headTop + 10 + i, w + 2, 1, INK); }); [12, 12, 10, 8, 6, 4].forEach((w, i) => R(hx - w / 2, headTop + 10 + i, w, 1, i > 3 ? '#cfcfd4' : '#f2f2f2')); R(hx - 2, headTop + 11, 4, 1, skinD); }
  } else if (side) {
    R(hx + (sx > 0 ? 3 : -5), headTop + 7, 2, 3, INK); R(hx + (sx > 0 ? 4 : -5), headTop + 7, 1, 1, '#fff');
    R(hx + (sx > 0 ? 7 : -8), headTop + 9, 1, 2, skin); R(hx + (sx > 0 ? 8 : -9), headTop + 9, 1, 2, INK);       // burun
    if (f.has('glasses')) { R(hx + (sx > 0 ? 2 : -6), headTop + 6, 5, 5, INK); R(hx + (sx > 0 ? 3 : -5), headTop + 7, 3, 3, '#9ab4d8'); }
    if (f.has('moustache')) R(hx + (sx > 0 ? 3 : -8), headTop + 10, 5, 2, '#8a8a8a');
    if (f.has('beard')) { R(hx + (sx > 0 ? -1 : -7), headTop + 10, 8, 5, '#f2f2f2'); R(hx + (sx > 0 ? 1 : -5), headTop + 15, 4, 2, '#cfcfd4'); }
  }
  // ——— baş geyimləri ———
  if (f.has('goggles') && !back) { R(hx - 7, headTop + 2, 14, 4, INK); R(hx - 6, headTop + 3, 12, 2, '#4a3a30'); if (front) { R(hx - 5, headTop + 3, 4, 2, '#7ac8d8'); R(hx + 1, headTop + 3, 4, 2, '#7ac8d8'); R(hx - 5, headTop + 3, 1, 1, '#fff'); } else R(hx + (sx > 0 ? 1 : -5), headTop + 3, 4, 2, '#7ac8d8'); }
  if (f.has('goggles') && back) R(hx - 7, headTop + 3, 14, 2, '#4a3a30');
  if (f.has('headphones')) { R(hx - 6, headTop - 1, 12, 2, '#2a2a30'); if (!side) { R(hx - 9, headTop + 4, 4, 7, INK); R(hx + 5, headTop + 4, 4, 7, INK); R(hx - 8, headTop + 5, 2, 5, '#5a5a66'); R(hx + 6, headTop + 5, 2, 5, '#5a5a66'); } else { R(hx - 3, headTop + 4, 6, 7, INK); R(hx - 2, headTop + 5, 4, 5, '#5a5a66'); R(hx - 1, headTop + 6, 2, 3, '#8a8a96'); } }
  if (f.has('headscarf')) { const c = look.hat; HW.slice(0, 6).forEach((w, i) => R(hx - w / 2, headTop + i, w, 1, i > 3 ? shade(c, 0.8) : c)); if (!back) { R(hx - 7, headTop + 5, 2, 6, c); R(hx + 5, headTop + 5, 2, 6, c); R(hx - 5, headTop + 5, 10, 1, hair); R(hx + 5 * (side ? -sx : 1), headTop + 11, 3, 9, INK); R(hx + 5 * (side ? -sx : 1) + 1, headTop + 11, 1, 8, hair); } else { HW.slice(0, 12).forEach((w, i) => R(hx - w / 2, headTop + i, w, 1, i > 8 ? shade(c, 0.8) : c)); R(hx - 1, headTop + 12, 3, 9, INK); R(hx, headTop + 12, 1, 8, hair); } }
  if (f.has('cap')) { const c = look.hat; R(hx - 8, headTop - 2, 16, 7, INK); R(hx - 7, headTop - 1, 14, 5, c); R(hx - 7, headTop + 3, 14, 1, shade(c, 0.75)); if (front) { R(hx - 8, headTop + 4, 16, 3, INK); R(hx - 7, headTop + 5, 14, 1, shade(c, 0.75)); } else if (side) { R(hx + (sx > 0 ? 3 : -11), headTop + 3, 8, 3, INK); R(hx + (sx > 0 ? 4 : -10), headTop + 4, 6, 1, shade(c, 0.75)); } }
  if (f.has('widehat')) { const c = look.hat; R(hx - 12, headTop + 2, 24, 3, INK); R(hx - 11, headTop + 3, 22, 1, c); R(hx - 6, headTop - 4, 12, 7, INK); R(hx - 5, headTop - 3, 10, 5, c); R(hx - 5, headTop + 1, 10, 1, shade(c, 0.7)); R(hx - 5, headTop - 3, 3, 1, shade(c, 1.2)); }
  if (f.has('knit')) { const c = look.hat; R(hx - 8, headTop - 2, 16, 7, INK); R(hx - 7, headTop - 1, 14, 5, c); R(hx - 7, headTop + 2, 14, 1, shade(c, 1.25)); R(hx - 7, headTop + 3, 14, 1, shade(c, 0.75)); R(hx - 2, headTop - 5, 4, 4, INK); R(hx - 1, headTop - 4, 2, 2, shade(c, 1.3)); if (!side) { R(hx - 9, headTop + 4, 3, 7, INK); R(hx + 6, headTop + 4, 3, 7, INK); R(hx - 8, headTop + 4, 1, 6, c); R(hx + 7, headTop + 4, 1, 6, c); R(hx - 11, headTop + 8, 3, 5, INK); R(hx + 8, headTop + 8, 3, 5, INK); R(hx - 10, headTop + 9, 1, 3, hair); R(hx + 9, headTop + 9, 1, 3, hair); } else { R(hx - 2, headTop + 4, 4, 7, INK); R(hx - 1, headTop + 4, 2, 6, c); } }
}

const cache = new Map();
// vərəq: sətir = istiqamət (0..3), sütun = kadr (0 dayanma, 1 nəfəs, 2..5 yeriş)
export function sheetFor(look) {
  let s = cache.get(look);
  if (s) return s;
  const cv = document.createElement('canvas'); cv.width = FW * 6; cv.height = FH * 4;
  const x = cv.getContext('2d');
  for (let d = 0; d < 4; d++) {
    drawFrame(x, 0, { ...look }, d, 0, 0); x.translate(FW, 0);
    drawFrame(x, 0, look, d, 0, 1); x.translate(FW, 0);
    for (let p = 1; p <= 4; p++) { drawFrame(x, 0, look, d, p, p % 2 ? 0 : 1); x.translate(FW, 0); }
    x.setTransform(1, 0, 0, 1, 0, (d + 1) * FH);
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
  // göz mövqeləri (qırpma üçün): baş ucalığı look-dan asılıdır
  const kid = !!look.kid, headTop = (FH - 1) - (kid ? 4 : 6) - 1 - (kid ? 6 : 9) + 1 - 13;
  s = { cv, eyeY: headTop + 7 };
  cache.set(look, s);
  return s;
}

// (cx, cy) — ayaqların mərkəzi. frame: 0 dayanma, 1 nəfəs, 2..5 yeriş. blink: gözlər bağlı
export function drawSprite(x, cx, cy, look, dir, frame, blink = false) {
  const s = sheetFor(look);
  x.fillStyle = 'rgba(20,8,10,0.3)';
  x.fillRect(Math.round(cx) - 7, Math.round(cy) - 2, 14, 3); x.fillRect(Math.round(cx) - 5, Math.round(cy) - 3, 10, 5);
  const px = Math.round(cx) - FW / 2, py = Math.round(cy) - FH + 1;
  x.drawImage(s.cv, frame * FW, dir * FH, FW, FH, px, py, FW, FH);
  if (blink && dir !== 1) {
    const up = frame === 1 || frame === 3 || frame === 5 ? 1 : 0, ey = py + s.eyeY - up;
    x.fillStyle = look.skin;
    if (dir === 0) { x.fillRect(px + 8, ey, 2, 2); x.fillRect(px + 14, ey, 2, 2); x.fillStyle = INK; x.fillRect(px + 8, ey + 2, 2, 1); x.fillRect(px + 14, ey + 2, 2, 1); }
    else { const ex = dir === 3 ? px + 16 : px + 6; x.fillRect(ex, ey, 2, 2); x.fillStyle = INK; x.fillRect(ex, ey + 2, 2, 1); }
  }
}
