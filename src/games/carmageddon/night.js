// CARMAGEDDON Fəsil 1 — GECƏ: yanan Hearth-də Milonu axtarış (gizlənməli qaçış).
// Eyni xəritə, gecə örtüyü ilə. Təhlükələr: alov (toxunma), gözətçinin fənər işığı (gəzən işıq
// dairəsi) və maşın faralarının zolağı (yanıb-sönür). İşığa və ya alova düşən son yaddaş
// nöqtəsindən başlayır. Məqsəd: emalatxananın qapısı.
import { t } from '../../core/i18n.js';
import { World } from './world.js';
import { SOLIDS, LOOK } from './camp.js';

const RAIDER = { art: 'raider', hair: '#1a1a1e', skin: '#b88a6a', top: '#3a3438', legs: '#1e1c20', hat: '#2a2628', scarf: '#7a1c14', feat: ['cap', 'scarf'], blink: 0.4 };
const FIRES = [
  [350, 238, 17], [368, 264, 17], [386, 290, 17], [404, 316, 17], [420, 342, 16],         // ocaqdan emalatxanaya birbaşa yolu kəsən alov divarı
  [250, 250, 18], [282, 232, 16], [316, 222, 16],                                         // şimal
  [120, 300, 26], [90, 250, 22], [150, 470, 26], [200, 430, 18],                          // bostan və məktəb çadırı
  [330, 470, 16], [372, 470, 14],
  [540, 330, 22], [520, 420, 16],                                                         // radio köşkü
];
const GOAL = { x: 440, y: 234 };
const BEAM = { x0: 428, x1: 512, y0: 286, y1: 314, on: 1.7, off: 1.9 };                   // fara zolağı (dəhlizin ortası)

export function runSearch(ch) {
  return new Promise((resolve) => {
    let cp = { x: 300, y: 404 };                                  // yaddaş nöqtəsi
    const hint = document.createElement('div'); hint.className = 'cgs__journal'; hint.innerHTML = `<h4>${t('cg.nightGoal')}</h4>`; ch.el.appendChild(hint);
    const flash = document.createElement('div'); flash.className = 'cgs__caught'; ch.el.appendChild(flash);
    const patrols = [
      { a: [374, 398], b: [500, 398], x: 374, y: 398, sp: 34, dir: 3, k: 0, way: 1, wait: 0 },   // dəhlizin girişi
      { a: [238, 372], b: [238, 468], x: 238, y: 420, sp: 26, dir: 0, k: 0.5, way: 1, wait: 0 }, // başlanğıcın qərbi
    ];
    let dead = false, tm = 0, done = false;

    const world = new World(ch.el, ch.cv, { map: ch.art.camp, size: 640, solids: SOLIDS, spawn: { ...cp }, hero: LOOK.ember }, {
      onInteract: () => {},
      onTick: (dt, w) => {
        tm += dt;
        if (done) return;
        // gözətçilər iki nöqtə arasında gedib-gəlir, dönəndə bir an dayanır
        for (const p of patrols) {
          if (p.wait > 0) { p.wait -= dt; p.walk = 0; continue; }
          p.k += (p.way * p.sp * dt) / Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
          if (p.k >= 1 || p.k <= 0) { p.k = Math.max(0, Math.min(1, p.k)); p.way *= -1; p.wait = 0.9; }
          const nx = p.a[0] + (p.b[0] - p.a[0]) * p.k, ny = p.a[1] + (p.b[1] - p.a[1]) * p.k;
          const dx = (p.b[0] - p.a[0]) * p.way, dy = (p.b[1] - p.a[1]) * p.way;
          p.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0);
          p.x = nx; p.y = ny; p.walk = (p.walk || 0) + dt;
          p.en.x = nx; p.en.y = ny; p.en.dir = p.dir; p.en.walk = p.wait > 0 ? 0 : p.walk;
        }
        if (dead || w.busy) return;
        const P = w.p;
        // yaddaş nöqtəsi: dəhlizə girəndə
        if (P.x > 436 && P.y < 384 && cp.y > 380) cp = { x: 462, y: 372 };
        let why = null;
        for (const [fx, fy, fr] of FIRES) if (Math.hypot(P.x - fx, P.y - fy) < fr - 3) why = 'fire';
        for (const p of patrols) { const L = light(p); if (Math.hypot(P.x - L.x, (P.y - L.y) * 1.25) < L.r - 4 || Math.hypot(P.x - p.x, P.y - p.y) < 13) why = 'seen'; }
        if (beamOn() && P.x > BEAM.x0 && P.x < BEAM.x1 && P.y > BEAM.y0 + 2 && P.y < BEAM.y1 + 6) why = 'seen';
        if (why) { fail(why); return; }
        if (Math.hypot(P.x - GOAL.x, P.y - GOAL.y) < 20) { done = true; w.busy = true; finish(); }
      },
      onDrawUnder: (x) => {
        // alovun yerdəki işığı
        for (const [fx, fy, fr] of FIRES) { x.fillStyle = 'rgba(255,140,40,0.16)'; x.beginPath(); x.ellipse(fx, fy, fr * 2.1, fr * 1.5, 0, 0, 7); x.fill(); }
      },
      onDrawOver: (x, w) => {
        // gecə: tünd örtük, alov və işıqlar onun üstündən parlayır
        x.fillStyle = 'rgba(14,6,26,0.56)'; x.fillRect(w.camX, w.camY, 480, 270);
        const f = Math.floor(tm * 10);
        for (const [fx, fy, fr] of FIRES) {
          // alov dilləri: dibdə enli və qırmızı, yuxarıda nazik və sarı; hər dil öz ritmində titrəyir
          for (let i = 0; i < 16; i++) {
            const a = (i * 2.4) % 6.283, rr = (fr - 5) * (((i * 37) % 10) / 10);
            const bx = Math.round(fx + Math.cos(a) * rr), by = Math.round(fy + Math.sin(a) * rr * 0.45);
            const h = 6 + ((i * 5 + f * (1 + (i % 3))) % 9), wv = Math.round(Math.sin(tm * 9 + i) * 1.5);
            x.fillStyle = '#b3261e'; x.fillRect(bx - 3, by - h + 4, 6, h - 2);
            x.fillStyle = '#ff7a1c'; x.fillRect(bx - 2 + wv, by - h + 1, 4, h - 2);
            x.fillStyle = '#ffd166'; x.fillRect(bx - 1 + wv, by - h, 2, Math.max(2, h - 6));
            if ((i + f) % 7 === 0) { x.fillStyle = '#fff0b0'; x.fillRect(bx + wv * 2, by - h - 4 - ((f + i) % 6), 1, 1); }     // qığılcım
          }
          x.fillStyle = 'rgba(255,120,30,0.20)'; x.beginPath(); x.ellipse(fx, fy - 4, fr * 1.5, fr * 1.2, 0, 0, 7); x.fill();
        }
        for (const p of patrols) { const L = light(p); x.fillStyle = 'rgba(255,240,170,0.10)'; x.beginPath(); x.moveTo(p.x, p.y - 14); x.lineTo(L.x - (L.y === p.y - 4 ? 0 : L.r * 0.8), L.y - (L.y === p.y - 4 ? L.r * 0.7 : 0)); x.lineTo(L.x + (L.y === p.y - 4 ? 0 : L.r * 0.8), L.y + (L.y === p.y - 4 ? L.r * 0.7 : 0)); x.closePath(); x.fill(); x.fillStyle = 'rgba(255,240,170,0.30)'; x.beginPath(); x.ellipse(L.x, L.y, L.r, L.r * 0.8, 0, 0, 7); x.fill(); x.fillStyle = 'rgba(255,250,210,0.26)'; x.beginPath(); x.ellipse(L.x, L.y, L.r * 0.6, L.r * 0.48, 0, 0, 7); x.fill(); }
        // fara zolağı: yanmazdan əvvəl solğun titrəyir (xəbərdarlıq)
        const ph = tm % (BEAM.on + BEAM.off), warn = ph > BEAM.on + BEAM.off - 0.5;
        // projektor: mənbədən (dirəyin dibindəki gözətçi) sola açılan şüa — uzaqlaşdıqca solur; yanmazdan əvvəl titrəyir
        { const on = beamOn(), yc = (BEAM.y0 + BEAM.y1) / 2, hh = (BEAM.y1 - BEAM.y0) / 2, k = on ? 1 : (warn && Math.floor(tm * 14) % 2 ? 0.32 : 0);
          if (k) {
            const n = 7, seg = (BEAM.x1 - BEAM.x0) / n;
            for (let i = 0; i < n; i++) {
              const x1 = BEAM.x1 - i * seg, open = Math.min(1, 0.45 + i * 0.55), h2 = Math.round(hh * open);
              x.fillStyle = `rgba(255,244,196,${((0.42 - i * 0.04) * k).toFixed(3)})`; x.fillRect(Math.round(x1 - seg), Math.round(yc - h2), Math.ceil(seg), h2 * 2);
              x.fillStyle = `rgba(255,244,196,${((0.16 - i * 0.015) * k).toFixed(3)})`; x.fillRect(Math.round(x1 - seg), Math.round(yc - h2) - 2, Math.ceil(seg), 2); x.fillRect(Math.round(x1 - seg), Math.round(yc + h2), Math.ceil(seg), 2);
            }
            x.fillStyle = `rgba(255,255,236,${(0.5 * k).toFixed(3)})`; x.fillRect(BEAM.x0, Math.round(yc) - 1, BEAM.x1 - BEAM.x0, 2);
          }
          // projektorun gövdəsi (həmişə görünür — şüanın haradan gələcəyi bilinsin)
          x.fillStyle = '#12080c'; x.fillRect(BEAM.x1, yc - 6, 8, 12); x.fillStyle = '#3a3438'; x.fillRect(BEAM.x1 + 1, yc - 5, 6, 10); x.fillStyle = '#12080c'; x.fillRect(BEAM.x1 + 3, yc + 6, 2, 7);
          x.fillStyle = on ? '#fff6c0' : (k ? '#c9b98a' : '#5a5258'); x.fillRect(BEAM.x1, yc - 4, 2, 8);
        }
        // məqsəd: emalatxananın qapısında solğun işarə
        const b = Math.round(Math.sin(tm * 5) * 2);
        x.fillStyle = '#12080c'; x.fillRect(GOAL.x - 4, GOAL.y - 30 + b, 9, 9); x.fillStyle = '#ffb53a'; x.fillRect(GOAL.x - 3, GOAL.y - 29 + b, 7, 7); x.fillStyle = '#12080c'; x.fillRect(GOAL.x - 1, GOAL.y - 27 + b, 3, 2); x.fillRect(GOAL.x, GOAL.y - 25 + b, 1, 2);
      },
    });
    ch.world = world;
    const light = (p) => { const d = [[0, 1], [0, -1], [-1, 0], [1, 0]][p.dir]; return { x: p.x + d[0] * 30, y: p.y + d[1] * 26 - 4, r: 25 }; };
    const beamOn = () => tm % (BEAM.on + BEAM.off) < BEAM.on;
    for (const p of patrols) p.en = world.add({ id: 'raider', x: p.x, y: p.y, kind: 'npc', look: RAIDER, dir: p.dir, mute: true });
    world.add({ id: 'lampman', x: BEAM.x1 + 14, y: (BEAM.y0 + BEAM.y1) / 2 + 10, kind: 'npc', look: RAIDER, dir: 2, mute: true });   // projektorun yanındakı gözətçi

    function fail(why) {
      dead = true; world.busy = true;
      flash.textContent = t(why === 'fire' ? 'cg.burned' : 'cg.caught');
      flash.classList.add('is-on');
      setTimeout(() => { if (ch.dead) return; world.p.x = cp.x; world.p.y = cp.y; world.p.dir = 1; world.goal = null; world.keys.clear(); }, 520);
      setTimeout(() => { flash.classList.remove('is-on'); dead = false; world.busy = false; }, 1050);
    }
    function finish() {
      setTimeout(() => { world.dispose(); hint.remove(); flash.remove(); ch.world = null; resolve(); }, 300);
    }
    if (import.meta.env.DEV) ch._night = { patrols, FIRES, BEAM, GOAL, light, beamOn, get cp() { return cp; } };
  });
}
