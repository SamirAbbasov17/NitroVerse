// CARMAGEDDON Fəsil 1 — QAÇIŞ: Jackal-ın maşını ilə Sindikatdan qaçış (yuxarıdan baxış, yol aşağı axır).
// Beş hissə (hər biri ~30–36 s), hər birinin öz mexanikası və üç mərhələsi; hissənin əvvəli və ORTASI yaddaş nöqtəsidir.
// Ümumi: maneənin lap yanından keçmək nitro yığır (3 yaxın keçid = +1); nitro ilə sipər/təkər/taxta və təqibçi dağıdılır.
//   1 Yanan düşərgə — maneələr və yıxılan dirəklər        2 Kanyon — təqibçilər (qayaya sıx / əyləclə ötür)
//   3 Doctor Rust-ın dumanı — görünüş azdır, qaz buludları   4 Butcher-in yük maşını — çəllək, zəncir, nitro ilə ötmə
//   5 Sınıq körpü — The Twins-in qarmaqları, sonda nitro ilə tullanış
// İdarə: ← → sükan, ↑ ↓ irəli-geri (maneədən rahat yayınmaq üçün), boşluq / E / Shift nitro. Telefonda ekrandakı düymələr.
// Maşın: can (zədə), yanacaq (bak sızır — kanistr yığ), nitro yükləri. Can azalanda tüstüləyir.
// Hissələr arasında ara səhnə oynanır (onCut — bax chapter1.js, script.js: CHASE_CUTS).
import { t } from '../../core/i18n.js';
import { audio } from '../../core/AudioManager.js';

const W = 480, H = 270, PY = 200;       // PY — yolun ekrandakı istinad xətti; oyunçu onun ətrafında irəli-geri gedir (G.y)
const Y_MIN = 112, Y_MAX = 236;
const CW = 11;                             // oyunçu maşınının toqquşma yarım-eni (sprayt 35 px enindədir, təkərlər daxil)
const rnd = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

// Darboğaz: verilən məsafə pəncərələrində 0→1→0 (kənarları 150 px-də hamar keçir)
const choke = (d, ...ws) => Math.max(0, ...ws.map(([a, b]) => Math.max(0, Math.min(1, (d - a) / 150, (b - d) / 150))));
// Hər hissə üç mərhələdən ibarətdir (yeni təhlükə əlavə olunur) və ortasında yaddaş nöqtəsi var.
const SECTIONS = [
  { id: 'camp', len: 5200, speed: 150, amp: 22, wl: 420, hw: (d) => 78 - Math.min(20, d / 240), ground: '#3a2418', road: '#2a2226', edge: '#e2571c' },
  { id: 'canyon', len: 6200, speed: 172, amp: 28, wl: 520, hw: (d) => 70 - 15 * choke(d, [2500, 3400], [4700, 5500]), ground: '#4a1f1a', road: '#30262a', edge: '#c9a98a', walls: true },
  { id: 'fog', len: 5400, speed: 148, amp: 40, wl: 380, hw: () => 66, ground: '#1c2a1e', road: '#22282a', edge: '#9ad18a', fog: true },
  { id: 'truck', len: 6000, speed: 168, amp: 20, wl: 600, hw: () => 82, ground: '#2a2030', road: '#2a2428', edge: '#c9a98a' },
  { id: 'bridge', len: 5200, speed: 182, amp: 12, wl: 700, hw: (d) => 58 - 7 * choke(d, [2300, 3100]), ground: '#0c1024', road: '#4a3626', edge: '#8a6a44', bridge: true },
];

export function runChase(ch, startSec = 0, onSection = null, onCut = null) {
  return new Promise((resolve) => {
    const cv = ch.cv, x = cv.getContext('2d');
    x.imageSmoothingEnabled = false;
    const fogCv = document.createElement('canvas'); fogCv.width = W; fogCv.height = H; const fx = fogCv.getContext('2d');
    const ui = document.createElement('div');
    ui.className = 'cgc';
    ui.innerHTML = `
      <div class="cgc__hud"><div class="cgc__bar cgc__bar--hp" data-l="${t('cg.c.hp')}"><i></i></div><div class="cgc__bar cgc__bar--fuel" data-l="${t('cg.c.fuel')}"><i></i></div><div class="cgc__nitro"></div><div class="cgc__nm" title="nitro"><i></i></div></div>
      <div class="cgc__prog"><i></i></div>
      <div class="cgc__banner"><b></b><span></span><em>${t('cg.c.keys')}</em><small>${t('cg.c.tip')}</small></div>
      <div class="cgc__alert"></div>
      <div class="cgc__pad cgc__pad--l"><button data-k="left" type="button">◀</button><button data-k="right" type="button">▶</button></div>
      <div class="cgc__pad cgc__pad--r"><button data-k="up" type="button">▲</button><button data-k="down" type="button">▼</button><button data-k="nitro" class="cgc__nitrobtn" type="button">⚡</button></div>`;
    ch.el.appendChild(ui);
    const $ = (s) => ui.querySelector(s);
    const hpBar = $('.cgc__bar--hp i'), fuelBar = $('.cgc__bar--fuel i'), nitroEl = $('.cgc__nitro'), nmBar = $('.cgc__nm i'), prog = $('.cgc__prog i'), banner = $('.cgc__banner'), alertEl = $('.cgc__alert');

    const keys = new Set();
    const MAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down', ArrowUp: 'up', KeyW: 'up', Space: 'nitro', KeyE: 'nitro', ShiftLeft: 'nitro', ShiftRight: 'nitro', Enter: 'nitro' };
    const kd = (e) => { const k = MAP[e.code]; if (!k) return; e.preventDefault(); if (k === 'nitro') { if (!e.repeat) nitro(); } else keys.add(k); };
    const ku = (e) => { const k = MAP[e.code]; if (k) keys.delete(k); };
    const blur = () => { keys.clear(); ui.querySelectorAll('.is-on').forEach((b) => b.classList.remove('is-on')); };   // fokus itəndə sükan ilişib qalmasın
    addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('blur', blur);
    ui.querySelectorAll('[data-k]').forEach((b) => {
      const k = b.dataset.k;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* boş */ } if (k === 'nitro') nitro(); else keys.add(k); b.classList.add('is-on'); });
      const up = () => { keys.delete(k); b.classList.remove('is-on'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    });

    let si = startSec, S, G, raf = 0, last = performance.now(), over = false;
    // Hissədən hissəyə can, yanacaq və nitro DAŞINIR (yaddaş nöqtəsində yadda qalır) — yığdığın şeyin dəyəri olsun.
    // Alt hədd var ki, yaddaş nöqtəsi çıxılmaz vəziyyətdə qalmasın; hissə arası maşın bir az təmir olunur.
    let carry = null, mid = null, cut = false;      // mid — hissənin ortasındakı yaddaş nöqtəsində saxlanan vəziyyət
    // Hissə bitdi: qaçış dayanır, ara səhnə oynanır (kətan dialoq oynadıcısına verilir), sonra növbəti hissə başlayır
    async function cutTo(n) {
      cut = true; keys.clear();
      if (onCut) { ui.style.display = 'none'; await onCut(n); ui.style.display = ''; }
      if (over || ch.dead) return;
      x.imageSmoothingEnabled = false; last = performance.now(); cut = false; start(n);
    }
    const pd = () => G.d + (PY - G.y);                  // oyunçunun yoldakı məsafəsi (ekranda irəli çıxanda artır)
    const cxAt = (d) => 240 + Math.sin(d / S.wl) * S.amp + Math.sin(d / (S.wl * 0.37) + 1.3) * S.amp * 0.35;

    function start(i, from = 0) {
      si = i; S = SECTIONS[i];
      if (!from) { onSection?.(i); mid = null; }
      const res = from ? mid : carry;
      const r = rnd(1000 + i * 77);
      G = { d: from, x: cxAt(from), y: PY, vy: 0, vx: 0, v: S.speed, hp: res?.hp ?? 100, fuel: res?.fuel ?? 100, nitro: res?.nitro ?? 2, nm: 0, cp: from > 0, rings: [], boost: 0, ents: [], parts: [], shake: 0, dead: 0, won: 0, flash: 0, steerSign: 0, flips: [], hook: null, jump: 0, truck: null, t: 0, r };
      const add = (e) => { G.ents.push(e); return e; };
      const lane = (d, k) => cxAt(d) + k * (S.hw(d) - 16);
      // yanacaq və nitro: hər hissədə yol boyu
      for (let d = 500; d < S.len - 300; d += 620 + r() * 260) add({ k: 'fuel', d, x: lane(d, r() * 1.6 - 0.8) });
      for (let d = 900; d < S.len - 500; d += 1100 + r() * 400) add({ k: r() < 0.5 ? 'nitro' : 'fix', d, x: lane(d, r() * 1.6 - 0.8) });
      const fall = (d, k, into) => add({ k: 'fall', d, x: lane(d, k), r: 11, into });
      const patch = (d, k, rr) => add({ k: 'patch', d, x: lane(d, k), r: rr });
      if (S.id === 'camp') {
        // A: dağıntılar və kənarda yanan yanacaq · B: yıxılan dirəklər · C: alov "ilanı" — sağ-sol növbə ilə yanan ləkələr
        for (let d = 320; d < 1900; d += 150 + r() * 110) add({ k: 'rock', d, x: lane(d, r() * 1.8 - 0.9), r: 9, fire: r() < 0.6 });
        for (let d = 620; d < 1850; d += 520 + r() * 200) patch(d, r() < 0.5 ? -0.8 : 0.8, 15);
        for (let d = 1950; d < 3600; d += 360 + r() * 140) add({ k: 'pole', d, side: r() < 0.5 ? -1 : 1, warn: 1 });
        for (let d = 2050; d < 3600; d += 250 + r() * 150) add({ k: 'rock', d, x: lane(d, r() * 1.8 - 0.9), r: 9, fire: r() < 0.4 });
        for (let d = 3750, k = 0; d < 4950; d += 175, k++) patch(d, (k % 2 ? 1 : -1) * 0.55, 21);
        for (let d = 3980; d < 4900; d += 540) add({ k: 'pole', d, side: r() < 0.5 ? -1 : 1, warn: 1 });
      } else if (S.id === 'canyon') {
        // A: ilk təqibçilər · B: daş uçqunu və darboğaz · C: təqibçilər + uçqun, ikinci darboğaz
        const chaser = (d) => add({ k: 'chaser', d: d - 60, wake: d, x: cxAt(d), side: r() < 0.5 ? -1 : 1, st: 'sleep', tt: 0, vx: 0, skin: Math.floor(r() * 3) });
        [420, 1050, 1600].forEach(chaser);
        for (let d = 600; d < 1950; d += 380 + r() * 200) add({ k: 'rock', d, x: lane(d, r() < 0.5 ? -0.9 : 0.9), r: 9 });
        for (let d = 2100; d < 3800; d += 230 + r() * 110) fall(d, r() * 1.6 - 0.8, 'rock');
        [3950, 4500, 5050, 5500].forEach(chaser);
        for (let d = 4150; d < 5900; d += 520 + r() * 220) fall(d, r() * 1.6 - 0.8, 'rock');
      } else if (S.id === 'fog') {
        // A: duran buludlar və qəzalı maşınlar · B: qaz balonları göydən düşür · C: hamısı birlikdə, daha sıx
        for (let d = 300; d < 1900; d += 190 + r() * 140) add(r() < 0.45 ? { k: 'cloud', d, x: lane(d, r() * 1.4 - 0.7), r: 30 } : { k: 'rock', d, x: lane(d, r() * 1.7 - 0.85), r: 9, wreck: true });
        for (let d = 2000; d < 3700; d += 210 + r() * 110) fall(d, r() * 1.5 - 0.75, 'cloud');
        for (let d = 2200; d < 3700; d += 470 + r() * 160) add({ k: 'rock', d, x: lane(d, r() * 1.7 - 0.85), r: 9, wreck: true });
        for (let d = 3800; d < 5200; d += 170 + r() * 120) { const q = r(); if (q < 0.34) add({ k: 'cloud', d, x: lane(d, r() * 1.4 - 0.7), r: 30 }); else if (q < 0.62) fall(d, r() * 1.5 - 0.75, 'cloud'); else add({ k: 'rock', d, x: lane(d, r() * 1.7 - 0.85), r: 9, wreck: true }); }
      } else if (S.id === 'truck') {
        // A: çəlləklər və zəncir · B: yola tökülən yanan yanacaq izi · C: Butcher qəfil əyləcə basır · sonda nitro ilə ötmə
        G.truck = { x: cxAt(from + 160), next: 1.6, n: 0, pass: 0, slamIn: 5, slam: 0 };
        add({ k: 'nitro', d: S.len - 640, x: cxAt(S.len - 640) });
      } else if (S.id === 'bridge') {
        // qarmaqlar (5), qopmuş taxtalar, sonra deşiklər və darboğaz; sonda tullanış
        G.bikes = [{ side: -1, x: 0, off: 0 }, { side: 1, x: 0, off: 0 }];
        G.hooks = [600, 1500, 2500, 3400, 4300].filter((h) => h > from + 100);
        for (let d = 300; d < S.len - 400; d += 300 + r() * 160) add({ k: 'rock', d, x: lane(d, r() * 1.6 - 0.8), r: 8, plank: true });
        for (let d = 1250; d < S.len - 500; d += 400 + r() * 200) add({ k: 'rock', d, x: lane(d, r() * 1.5 - 0.75), r: 10, hole: true });
        add({ k: 'nitro', d: S.len - 560, x: cxAt(S.len - 560) });
      }
      if (from) { G.ents = G.ents.filter((e) => (e.wake ?? e.d) > from + 150); return; }      // yaddaş nöqtəsindən: arxada qalanlar yoxdur, başlıq bir də çıxmır
      banner.querySelector('b').textContent = `${i + 1} / ${SECTIONS.length} · ${t('cg.c.' + S.id)}`;
      banner.querySelector('span').textContent = t('cg.c.' + S.id + '.h');
      banner.classList.toggle('is-first', i === 0);            // idarə və ipucu sətirləri yalnız ilk hissədə
      banner.classList.remove('is-on'); void banner.offsetWidth; banner.classList.add('is-on');
      alertEl.textContent = '';
      ui.dataset.sec = S.id;
    }

    function nitro() {
      if (!G || G.dead || G.won || G.nitro <= 0 || G.boost > 0.2) return;
      G.nitro--; G.boost = 1.5; audio.sfx('boost');
    }
    const say = (key, ms = 1300) => { alertEl.textContent = t(key); alertEl.classList.remove('is-on'); void alertEl.offsetWidth; alertEl.classList.add('is-on'); clearTimeout(say.tm); say.tm = setTimeout(() => alertEl.classList.remove('is-on'), ms); };
    // partlayış: qığılcımlar; böyük partlayışda (n ≥ 20) üstəlik genişlənən alov halqası və parıltı
    const boom = (bx, by, n = 14, col = null) => { if (n >= 20) G.rings.push({ x: bx, y: by, t: 0 }); for (let i = 0; i < n; i++) G.parts.push({ x: bx, y: by, vx: (Math.random() - 0.5) * 150, vy: (Math.random() - 0.5) * 150, a: 1, c: col || ['#fff0b0', '#ffd166', '#ff7a1c', '#b3261e'][i % 4], s: 2 + (i % 3) }); };
    function hurt(n, kick = 0) {
      if (G.dead || G.won || G.jump > 0) return;
      G.hp -= n; G.shake = Math.max(G.shake, 5); G.flash = 0.18; G.vx += kick; audio.sfx('hit');
      boom(G.x, G.y - 10, 6);
      if (G.hp <= 0) fail('cg.c.wreck');
    }
    // Yaxın keçid: maneənin lap yanından toxunmadan keçmək nitro zolağını doldurur (3 dəfə = +1 nitro)
    function nearCheck(e, sy, rr) {
      if (e.passed || sy < G.y + 4) return;
      e.passed = true;
      if (G.jump > 0 || G.dead || e.hole || Math.abs(e.x - G.x) > CW + rr + 13) return;
      G.nm++; audio.sfx('click');
      for (let i = 0; i < 6; i++) G.parts.push({ x: (e.x + G.x) / 2, y: G.y - 4 + i * 3, vx: (Math.random() - 0.5) * 40, vy: 60, a: 1, c: '#5ab4ff', s: 2 });
      if (G.nm >= 3) { G.nm = 0; if (G.nitro < 3) { G.nitro++; say('cg.c.nitroUp', 800); } }
    }
    function fail(key) {
      if (G.dead) return;
      G.dead = 1.5; G.hp = 0; say(key, 1500); boom(G.x, G.y - 8, 30); G.shake = 9; audio.sfx('explosion');
    }

    function step(dt) {
      G.t += dt;
      if (G.dead) { G.dead -= dt; G.v *= 1 - dt * 3; if (G.dead <= 0) start(si, G.cp ? S.len * 0.5 : 0); return; }
      if (G.won) { G.won -= dt; G.d += G.v * dt; if (G.won <= 0) { if (si + 1 < SECTIONS.length) { carry = { hp: Math.min(100, Math.max(60, G.hp + 20)), fuel: Math.max(58, G.fuel), nitro: Math.max(1, G.nitro) }; G.won = 0; cutTo(si + 1); } else finish(); } return; }
      const hw = S.hw(pd()), rc = cxAt(pd());
      // sükan və irəli-geri: düymə hədəf sürəti verir, maşın ona tez çatır (sürüşmə yoxdur — dəqiq yayınmaq olsun)
      const st = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0), fb = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
      if (st && st !== G.steerSign) { G.flips.push(G.t); G.steerSign = st; }
      G.vx += (st * 170 + (G.hook ? G.hook.side * 80 : 0) - G.vx) * Math.min(1, dt * 12);
      G.vy += (fb * (fb > 0 ? 150 : 120) - G.vy) * Math.min(1, dt * 10);
      G.x += G.vx * dt;
      G.y = Math.max(S.id === 'truck' ? 150 : Y_MIN, Math.min(Y_MAX, G.y + G.vy * dt));
      // sürət: əyləc / nitro / qarmaq
      G.boost = Math.max(0, G.boost - dt);
      let target = S.speed * (G.boost > 0 ? 1.65 : 1) * (G.hook ? 0.68 : 1);
      if (G.jump > 0) target = S.speed * 1.7;
      G.v += (target - G.v) * Math.min(1, dt * 3.2);
      G.d += G.v * dt;
      G.fuel -= dt * 2.2;
      // hissənin ortası: yaddaş nöqtəsi (qəzadan sonra buradan, bu andakı ehtiyatla — alt hədlə)
      if (!G.cp && G.d > S.len * 0.5 && !G.hook && !G.jump) { G.cp = true; mid = { hp: Math.max(55, G.hp), fuel: Math.max(55, G.fuel), nitro: Math.max(1, G.nitro) }; say('cg.c.cp', 1100); }
      if (G.fuel <= 0) { fail('cg.c.nofuel'); return; }
      // yol kənarı
      if (G.jump <= 0) {
        const off = Math.abs(G.x - rc) - (hw - CW);
        if (off > 0) {
          if (S.walls || S.bridge) { G.x = rc + Math.sign(G.x - rc) * (hw - CW); if (Math.abs(G.vx) > 40 && G.t - (G.wallT ?? -9) > 0.6) { G.wallT = G.t; hurt(S.bridge ? 9 : 6, -Math.sign(G.x - rc) * 120); } else G.vx = -Math.sign(G.x - rc) * 40; }   // divara sürtünmə 0.6 s-də bir dəfə zədələyir
          else { G.v *= 1 - dt * 1.6; if (off > 26) { G.x = rc + Math.sign(G.x - rc) * (hw + 19); hurt(4 * dt * 10); } if (Math.random() < dt * 20) G.parts.push({ x: G.x, y: G.y + 10, vx: (Math.random() - 0.5) * 30, vy: 40, a: 0.8, c: '#8a6a4a', s: 2 }); }
        }
      }
      // sərt dönüşdə təkər izi; kənara sürtünəndə qığılcım
      if (Math.abs(G.vx) > 120 && G.jump <= 0) for (const ox of [-12, 10]) G.parts.push({ x: G.x + ox, y: G.y + 20, vx: 0, vy: G.v, a: 0.9, c: '#1a1416', s: 2 });
      if ((S.walls || S.bridge) && Math.abs(G.x - rc) > hw - CW - 4 && Math.random() < dt * 40) G.parts.push({ x: G.x + Math.sign(G.x - rc) * 13, y: G.y - 4 + Math.random() * 16, vx: -Math.sign(G.x - rc) * 60, vy: 90, a: 1, c: '#ffd166', s: 1 });
      // toz / tüstü
      if (Math.random() < dt * 26) G.parts.push({ x: G.x + (Math.random() < 0.5 ? -10 : 9), y: G.y + 24, vx: (Math.random() - 0.5) * 16, vy: 70, a: 0.5, c: G.boost > 0 ? '#ffb53a' : '#6a5a52', s: G.boost > 0 ? 3 : 2 });
      if (G.hp < 45 && Math.random() < dt * 14) G.parts.push({ x: G.x + (Math.random() - 0.5) * 8, y: G.y - 20, vx: 6, vy: 30, a: 0.8, c: '#3a3438', s: 3 });

      // ——— varlıqlar ———
      for (const e of G.ents) {
        if (e.gone) continue;
        const sy = PY - (e.d - G.d);
        if (e.k === 'rock') {
          if (Math.abs(sy - G.y) < 18 + e.r && Math.abs(e.x - G.x) < CW + e.r && G.jump <= 0) {
            const soft = !e.wreck && !e.hole && !e.hard && Math.floor(e.d) % 3 !== 2;          // sipər, təkər, taxta — nitro ilə dağıdılır; qaya, karkas, deşik — yox
            if (e.hole) { if (G.t - (e.hitT ?? -9) > 0.8) { e.hitT = G.t; hurt(12); G.v *= 0.6; } }
            else if (G.boost > 0 && soft) { e.gone = true; boom(e.x, sy, 18, '#c9a98a'); G.shake = Math.max(G.shake, 4); audio.sfx('hit'); say('cg.c.smash', 700); }
            else { e.gone = true; boom(e.x, sy, 10, e.fire ? null : '#8a7a6a'); hurt(e.plank ? 12 : 18); G.v *= 0.6; }
          } else nearCheck(e, sy, e.r);
        } else if (e.k === 'fuel' || e.k === 'nitro' || e.k === 'fix') {
          if (Math.abs(sy - G.y) < 26 && Math.abs(e.x - G.x) < 20) { e.gone = true; audio.sfx('pickup'); if (e.k === 'fuel') G.fuel = Math.min(100, G.fuel + 38); else if (e.k === 'nitro') G.nitro = Math.min(3, G.nitro + 1); else G.hp = Math.min(100, G.hp + 25); boom(e.x, sy, 8, e.k === 'fuel' ? '#ffd166' : e.k === 'nitro' ? '#5ab4ff' : '#7fbf7a'); }
        } else if (e.k === 'pole') {
          // yıxılan dirək: əvvəl kölgə (xəbərdarlıq), sonra yolun yarısını bağlayır
          if (sy > -40 && e.warn > 0) e.warn -= dt;
          const c = cxAt(e.d), w2 = S.hw(e.d);
          e.x0 = e.side < 0 ? c - w2 : c - 8; e.x1 = e.side < 0 ? c + 8 : c + w2;
          if (e.warn <= 0 && !e.hit && Math.abs(sy - G.y) < 20 && G.x > e.x0 - CW && G.x < e.x1 + CW) { e.hit = true; hurt(24); G.v *= 0.45; boom(G.x, G.y - 10, 12, '#8a6a4a'); }
        } else if (e.k === 'chaser') {
          if (e.st === 'sleep') { if (pd() > e.wake) { e.st = 'come'; e.d = pd() - 150; e.x = cxAt(pd()) + e.side * 30; say('cg.c.chaser', 900); } continue; }
          if (e.st === 'dead') continue;
          const want = pd() + 4, c = cxAt(e.d), w2 = S.hw(e.d);
          // öz sürəti: oyunçuya çatmağa çalışır (gecikmə ilə — əyləcə basanda qabağa keçir)
          // nişan alanda və zərbədə sürətini kilidləyir — əyləcə basan oyunçu zərbənin altından çıxır
          if (e.st === 'come') { e.v = (e.v ?? S.speed) + ((want - e.d) * 2.2 + (G.v - (e.v ?? S.speed)) * 1.2) * dt; e.v = Math.max(S.speed * 0.7, Math.min(S.speed * 1.5, e.v)); }
          else e.v += (S.speed - e.v) * Math.min(1, dt * 4);
          e.d += e.v * dt; e.tt += dt;
          const beside = Math.abs(e.d - pd()) < 42;
          if (e.st === 'come') { const tx = G.x + e.side * 40; e.vx += (tx - e.x) * 9 * dt; e.vx -= e.vx * dt * 4; if (beside && e.tt > 1.6) { e.st = 'aim'; e.tt = 0; } }
          else if (e.st === 'aim') { e.vx -= e.vx * dt * 6; if (e.tt > 0.55) { e.st = 'ram'; e.tt = 0; e.vx = -e.side * 230; } }
          else if (e.st === 'ram') { if (e.tt > 0.5) { e.st = 'come'; e.tt = 0; if (Math.random() < 0.5) e.side *= -1; } }
          e.x += e.vx * dt;
          // maşın–maşın toqquşması
          if (beside && Math.abs(e.x - G.x) < 26) {
            const dir = Math.sign(e.x - G.x) || 1;
            if (G.boost > 0) { e.st = 'dead'; e.gone = true; boom(e.x, sy, 34); G.shake = 7; audio.sfx('explosion'); say('cg.c.smash', 800); }
            else if (e.st === 'ram') { if (Math.abs(e.d - pd()) < 32) { hurt(13, -dir * 150); e.vx = dir * 120; e.st = 'come'; e.tt = 0; } }
            else { e.vx = dir * (150 + Math.abs(G.vx)); G.vx = -dir * 60; G.shake = 3; boom((e.x + G.x) / 2, G.y - 4, 5); if (Math.abs(G.vx) < 30) hurt(2); }
          }
          // divara sıxılan təqibçi partlayır
          if (Math.abs(e.x - c) > w2 - 13) { e.st = 'dead'; e.gone = true; boom(e.x, PY - (e.d - G.d), 34); G.shake = 7; audio.sfx('explosion'); say('cg.c.down', 800); }
        } else if (e.k === 'fall') {
          // göydən düşən (qaya / qaz balonu): yaxınlaşanda kölgə görünür, ~1 s sonra düşür və yolda qalır
          if (!e.on) { if (e.d - pd() < 250) { e.on = true; e.tt = 0; if (!G.fallSaid) { G.fallSaid = true; say(e.into === 'cloud' ? 'cg.c.canister' : 'cg.c.rockfall', 1300); } } }
          else {
            e.tt += dt;
            if (e.tt >= 0.95) {
              e.gone = true; boom(e.x, sy, 14, e.into === 'cloud' ? '#7fdc5a' : '#8a7a6a'); G.shake = Math.max(G.shake, 3); audio.sfx('hit');
              if (Math.hypot(e.x - G.x, sy - G.y) < e.r + CW + 4 && G.jump <= 0) hurt(18);
              G.ents.push(e.into === 'cloud' ? { k: 'cloud', d: e.d, x: e.x, r: 28 } : { k: 'rock', d: e.d, x: e.x, r: 10, hard: true });
            }
          }
        } else if (e.k === 'patch') {
          // yanan ləkə: içində qaldıqca yandırır
          if (Math.hypot(e.x - G.x, (sy - G.y) * 0.8) < e.r + 1 && G.jump <= 0) { G.hp -= 26 * dt; G.flash = 0.06; if (Math.random() < dt * 30) G.parts.push({ x: G.x + (Math.random() - 0.5) * 14, y: G.y + 6, vx: 0, vy: 40, a: 0.9, c: '#ff7a1c', s: 2 }); if (G.hp <= 0) { fail('cg.c.wreck'); return; } }
        } else if (e.k === 'cloud') {
          if (Math.hypot(e.x - G.x, (sy - G.y) * 0.8) < e.r - 4) { G.hp -= 15 * dt; G.flash = 0.05; if (G.hp <= 0) fail('cg.c.wreck'); }
        } else if (e.k === 'barrel') {
          e.d -= 70 * dt; e.x += e.vx * dt; e.rot = (e.rot || 0) + dt * 9;
          const c = cxAt(e.d), w2 = S.hw(e.d); if (Math.abs(e.x - c) > w2 - 8) e.vx *= -1;
          if (Math.abs(sy - G.y) < 22 && Math.abs(e.x - G.x) < CW + 8) { e.gone = true; boom(e.x, sy, 22); hurt(16); audio.sfx('explosion'); } else nearCheck(e, sy, 8);
        } else if (e.k === 'chain') {
          e.tt += dt;
          if (e.tt > 0.9) e.d -= 120 * dt;                                   // xəbərdarlıqdan sonra oyunçuya doğru sürüşür
          if (!e.hit && e.tt > 0.9 && Math.abs(sy - G.y) < 14) { e.hit = true; if (Math.abs(G.x - e.gap) > 22 - CW + 8) { hurt(22); G.v *= 0.6; } }
        }
        if (sy > H + 60 && e.k !== 'chaser') e.gone = true;
      }
      G.ents = G.ents.filter((e) => !e.gone);

      // ——— hissəyə xas ———
      if (S.id === 'truck') {
        const T = G.truck, final = G.d > S.len - 520;
        T.x += ((cxAt(G.d + 160) + Math.sin(G.t * 0.9) * (S.hw(G.d) - 30)) - T.x) * Math.min(1, dt * 1.6);
        T.next -= dt;
        if (!final && T.next <= 0) {
          T.n++; T.next = 1.9 - Math.min(0.7, T.n * 0.05);
          if (T.n % 3 === 0) { const c = cxAt(G.d + 170), w2 = S.hw(G.d + 170); G.ents.push({ k: 'chain', d: G.d + 172, gap: c + (Math.random() < 0.5 ? -1 : 1) * (w2 - 26), tt: 0 }); }
          else if (G.d > 2000 && T.n % 4 === 1) { if (!T.fireSaid) { T.fireSaid = true; say('cg.c.fire', 1300); } for (let j = 0; j < 4; j++) G.ents.push({ k: 'patch', d: G.d + 150 + j * 44, x: T.x + j * (Math.random() - 0.5) * 6, r: 15 }); }   // yanan yanacaq izi
          else G.ents.push({ k: 'barrel', d: G.d + 150, x: T.x + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 90 });
        }
        // C: qəfil əyləc — maşın yanıb-sönür (xəbərdarlıq), sonra geri "düşür"; arxasında qalan əzilir
        if (!final && G.d > 3800 && !T.slam) { T.slamIn -= dt; if (T.slamIn <= 0) { T.slam = 0.001; T.hitOnce = false; say('cg.c.slam', 1200); } }
        if (T.slam) {
          T.slam += dt;
          const k = T.slam < 0.8 ? 0 : T.slam < 1.25 ? (T.slam - 0.8) / 0.45 : T.slam < 1.6 ? 1 : Math.max(0, 1 - (T.slam - 1.6) / 0.7);
          T.dy = k * 96;
          if (!T.hitOnce && k > 0.35 && Math.abs(G.x - T.x) < 25 + CW - 3 && G.y - 24 < 46 + T.dy + 58) { T.hitOnce = true; hurt(20, Math.sign(G.x - T.x || 1) * 160); G.vy = 120; }
          if (T.slam > 2.3) { T.slam = 0; T.dy = 0; T.slamIn = 5.5 + Math.random() * 2; }
        }
        if (final && !T.said) { T.said = true; say('cg.c.pass', 2200); }
        if (G.d > S.len - 150 && !T.pass) {
          if (G.boost > 0) { T.pass = 1; say('cg.c.passed', 1200); G.shake = 6; }
          else { hurt(28); G.d -= 430; T.said = false; G.nitro = Math.max(G.nitro, 1); say('cg.c.blocked', 1500); }
        }
        if (T.pass) T.pass += dt;
      }
      if (S.id === 'bridge') {
        const hwb = S.hw(G.d);
        G.bikes.forEach((b) => { const tx = G.x + b.side * (G.hook === b ? 30 : Math.min(42, hwb - 6)); b.x += (tx - b.x) * Math.min(1, dt * 5); b.off += ((G.hook === b ? 0 : 14) - b.off) * dt * 3; });
        if (!G.hook && G.hooks.length && G.d > G.hooks[0]) { G.hooks.shift(); G.hook = G.bikes[Math.random() < 0.5 ? 0 : 1]; G.hookT = 0; G.flips = []; say('cg.c.hooked', 1400); audio.sfx('hit'); }
        if (G.hook) {
          G.hookT += dt;
          const recent = G.flips.filter((ft) => G.t - ft < 1.6).length;
          G.shakeOff = recent;
          if (recent >= 4) { boom(G.hook.x, G.y, 16, '#b44bff'); G.hook.off = 60; G.hook = null; say('cg.c.free', 900); G.shake = 5; }
          else if (G.hookT > 3.2) { hurt(16, G.hook.side * 140); G.hookT = 1.4; }
        }
        // sonda tullanış: sürət çatmalıdır (nitro)
        if (!G.jump && G.d > S.len - 380 && !G.rampSaid) { G.rampSaid = true; say('cg.c.jump', 2200); }
        if (!G.jump && G.d > S.len - 70) { if (G.boost > 0) { G.jump = 1.25; G.hook = null; audio.sfx('boost'); } else { fail('cg.c.fell'); return; } }
        if (G.jump > 0) { G.jump -= dt; if (G.jump <= 0) { G.won = 0.9; G.shake = 6; } return; }
      }
      if (G.d >= S.len && S.id !== 'bridge') { G.won = 0.6; }
    }

    // ——— çəkmə ———
    // Maşınlar: piksel art vərəqindən (cars.png — burnu yuxarı). lat — yan sürət: sprayt sükan tərəfə əyilir
    // (üfüqi sürüşdürmə, piksellər kəskin qalır); fl — "nişan alır" parıltısı; lift — tullanışda kölgə ayrılır.
    const SPR = { me: [0, 0, 35, 52], foe0: [36, 0, 31, 50], foe1: [68, 0, 37, 48], foe2: [106, 0, 32, 50], truck: [139, 0, 50, 120], bike: [190, 0, 22, 40] };
    const sheet = ch.art.cars || null;
    const tinted = (col, img = sheet) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height); return c; };
    const shadowSheet = sheet && tinted('#000'), hotSheet = sheet && tinted('#fff0b0');
    function car(cx0, cy0, kind, lat = 0, scale = 1, v = 0, fl = false, lift = 0) {
      const [sx, sy, sw, sh] = SPR[kind === 'foe' ? 'foe' + (v % 3) : kind];
      const w = Math.round(sw * scale), h = Math.round(sh * scale), cx1 = Math.round(cx0), cy1 = Math.round(cy0);
      if (!sheet) { x.fillStyle = '#12080c'; x.fillRect(cx1 - w / 2, cy1 - h / 2, w, h); x.fillStyle = kind === 'me' ? '#e8dcc0' : '#6a2a20'; x.fillRect(cx1 - w / 2 + 2, cy1 - h / 2 + 2, w - 4, h - 4); return; }
      const k = Math.max(-0.1, Math.min(0.1, lat / 1500));    // ən çoxu ~6°
      x.save(); x.translate(cx1, cy1); if (k) x.rotate(k);
      x.globalAlpha = 0.34; x.drawImage(shadowSheet, sx, sy, sw, sh, -Math.floor(w / 2) + 3 + lift, -Math.floor(h / 2) + 4 + lift, w, h); x.globalAlpha = 1;
      x.drawImage(sheet, sx, sy, sw, sh, -Math.floor(w / 2), -Math.floor(h / 2), w, h);
      if (fl) { x.globalAlpha = 0.6; x.drawImage(hotSheet, sx, sy, sw, sh, -Math.floor(w / 2), -Math.floor(h / 2), w, h); x.globalAlpha = 1; }
      const R = (dx, dy, rw, rh, c) => { x.fillStyle = c; x.fillRect(Math.round(dx * scale), Math.round(dy * scale), Math.max(1, Math.round(rw * scale)), Math.max(1, Math.round(rh * scale))); };
      const f = Math.floor(G.t * 16);
      if (kind === 'me') {
        R(-3, 11, 5, 4, '#e8301a'); R(-3, 11, 5, 1, '#ff5a3a'); R(3, 12, 2, 2, '#d9b06a');                                           // Ember-in qırmızı saçı; yan oturacaqda maska
        if (keys.has('down')) { R(-13, 23, 5, 2, '#ff3b2e'); R(8, 23, 5, 2, '#ff3b2e'); R(-12, 25, 3, 1, '#ffb0a0'); R(9, 25, 3, 1, '#ffb0a0'); }   // əyləc işıqları
        if (G.hp < 60) { R(-8, -17, 4, 3, '#4a3a34'); R(4, -8, 3, 4, '#4a3a34'); R(-9, 15, 3, 3, '#4a3a34'); }                        // əziklər
        if (G.hp < 30) { R(-4 + (f % 3), -19 - (f % 4), 4, 6, '#ff7a1c'); R(1 - (f % 2), -17 - (f % 3), 3, 5, '#ffd166'); R(-1, -14, 2, 3, '#fff0b0'); }   // kapot alışıb
      } else if (kind === 'truck') {
        for (const ex of [-22, 19]) { R(ex, -34 - (f % 3) * 2, 3, 4 + (f % 3) * 2, f % 2 ? '#ff7a1c' : '#ffd166'); R(ex, -30, 3, 2, '#fff0b0'); }   // egzoz boruları alov püskürür
      } else if (kind === 'foe') {
        R(-9, -24, 4, 2, '#ffe9a0'); R(5, -24, 4, 2, '#ffe9a0');                                                                    // faralar
        if (v % 3 === 2) { R(-2 + (f % 2), 6 - (f % 3), 3, 6, '#ff7a1c'); R(-1, 8, 1, 3, '#ffd166'); }                              // pikapın yük yerində məşəl
      } else if (kind === 'bike') { R(-1, 17, 2, 2, '#ff3b2e'); }
      x.restore();
    }

    // ——— MƏNZƏRƏ: yol kənarı əşyaları məsafə xanasının hash-indən yaranır (hər keçidə eyni yerdə) ———
    const hsh = (a, b) => { let n = (a * 374761393 + b * 668265263) >>> 0; n = ((n ^ (n >> 13)) * 1274126177) >>> 0; return (n ^ (n >> 16)) >>> 0; };
    const P = (px, py, w, h, c) => { x.fillStyle = c; x.fillRect(Math.round(px), Math.round(py), w, h); };
    // Obyekt vərəqi (props.png) və yer toxumaları (ground-*.webp; şaquli güzgü ilə tikişsiz təkrarlanır)
    const PR = { boulder: [0, 0, 35, 34], boulder2: [36, 0, 25, 18], cactus: [62, 0, 26, 30], deadtree: [89, 0, 35, 38], wreck: [125, 0, 52, 28], tent: [178, 0, 38, 36], debris: [217, 0, 32, 30], pipe: [250, 0, 20, 30], sign: [271, 0, 27, 30], barricade: [299, 0, 41, 17], tires: [341, 0, 28, 28], rock: [370, 0, 25, 24], planks: [396, 0, 29, 26], barrel: [426, 0, 23, 22] };
    const propSheet = ch.art.props || null, propShadow = propSheet && tinted('#000', propSheet);
    function spr(name, px, py, sc = 1, flip = false) {
      const [sx, sy, sw, sh] = PR[name], w = Math.round(sw * sc), h = Math.round(sh * sc), dx = Math.round(px - w / 2), dy = Math.round(py - h / 2);
      if (!propSheet) { x.fillStyle = '#12080c'; x.fillRect(dx, dy, w, h); x.fillStyle = '#6a5a52'; x.fillRect(dx + 1, dy + 1, w - 2, h - 2); return; }
      x.globalAlpha = 0.3; x.drawImage(propShadow, sx, sy, sw, sh, dx + 2, dy + 3, w, h); x.globalAlpha = 1;
      if (flip) { x.save(); x.translate(dx + w, dy); x.scale(-1, 1); x.drawImage(propSheet, sx, sy, sw, sh, 0, 0, w, h); x.restore(); }
      else x.drawImage(propSheet, sx, sy, sw, sh, dx, dy, w, h);
    }
    const flames = (px, py, n, seed) => { const f = Math.floor(G.t * 10 + seed); for (let i = 0; i < n; i++) P(px - n * 2 + i * 4 + (f + i) % 2, py - ((f + i * 2) % 5), 3, 5 + ((f + i) % 3), ['#ffd166', '#ff7a1c', '#fff0b0', '#b3261e'][(f + i) % 4]); };
    const bgCol = () => { const dawn = S.bridge ? Math.min(1, G.d / S.len) : 0; return `rgb(${12 + dawn * 60 | 0},${16 + dawn * 40 | 0},${36 + dawn * 50 | 0})`; };
    const tiles = {};
    for (const id of ['camp', 'canyon', 'fog', 'truck']) {
      const im = ch.art['ground-' + id]; if (!im) continue;
      const c = document.createElement('canvas'); c.width = W; c.height = H * 2; const g = c.getContext('2d');
      g.drawImage(im, 0, 0, W, H); g.translate(0, H * 2); g.scale(1, -1); g.drawImage(im, 0, 0, W, H);
      tiles[id] = c;
    }
    function prop(kind, px, py, hh) {
      const flip = (hh >> 3) % 2 === 1;
      if (kind === 'tent') { spr('tent', px, py, 1, flip); flames(px, py - 14, 3, hh); }
      else if (kind === 'debris') { spr('debris', px, py, 1, flip); flames(px + 1, py - 8, 2, hh); }
      else if (kind === 'boulder') spr((hh >> 5) % 3 ? 'boulder' : 'boulder2', px, py, 0.8 + ((hh >> 7) % 5) * 0.1, flip);
      else if (kind === 'cactus') spr('cactus', px, py, 0.8 + ((hh >> 7) % 3) * 0.1, flip);
      else if (kind === 'deadtree') spr('deadtree', px, py, 1, flip);
      else if (kind === 'pipe') { spr('pipe', px, py, 1, flip); const f = Math.floor(G.t * 6 + hh) % 3; P(px - 3 + f * 2, py + 12, 2, 2, 'rgba(140,255,110,0.7)'); }
      else if (kind === 'sign') spr('sign', px, py, 1, flip);
      else if (kind === 'wreck') spr('wreck', px, py, 1, flip);
      else if (kind === 'pole') { P(px, py - 18, 2, 20, '#12080c'); P(px - 5, py - 17, 12, 2, '#12080c'); P(px - 4, py + 1, 10, 2, 'rgba(0,0,0,0.3)'); }
      else if (kind === 'truss') { P(px - 1, py - 2, 3, 4, '#2a1c12'); P(px - 9, py - 1, 18, 2, '#6a4a2c'); }
    }
    function scenery() {
      const c0 = Math.floor((G.d - 80) / 34), c1 = Math.floor((G.d + PY + 40) / 34);
      for (let c = c1; c >= c0; c--) {
        const dd = c * 34, y = PY - (dd - G.d), rc = cxAt(dd), w2 = S.hw(dd);
        for (const side of [-1, 1]) {
          const h1 = hsh(c, side + 7 + si * 13), off = 26 + (h1 % 150), px = rc + side * (w2 + off), kind = h1 % 100;
          if (px < -20 || px > W + 20) continue;
          // torpağın toxuması: xırda ləkələr
          if (!tiles[S.id]) for (let k = 0; k < 3; k++) { const h2 = hsh(c * 5 + k, side + si * 31); P(rc + side * (w2 + 6 + (h2 % 190)), y + (h2 >> 8) % 30, 2, 1, (h2 >> 4) % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.2)'); }
          if (S.id === 'camp') { if (kind < 12) prop('tent', px, y, h1); else if (kind < 26) prop('debris', px, y, h1); else if (kind < 34) prop('pole', px, y, h1); }
          else if (S.id === 'canyon') { if (kind < 22) prop('boulder', rc + side * (w2 + 70 + (h1 % 110)), y, h1); else if (kind < 30) prop('cactus', rc + side * (w2 + 70 + (h1 % 110)), y, h1); }
          else if (S.id === 'fog') { if (kind < 16) prop('deadtree', px, y, h1); else if (kind < 24) prop('pipe', px, y, h1); else if (kind < 29) prop('wreck', px, y, h1); }
          else if (S.id === 'truck') { if (kind < 9) prop('cactus', px, y, h1); else if (kind < 14) prop('sign', rc + side * (w2 + 16), y, h1); else if (kind < 19) prop('wreck', px, y, h1); else if (kind < 27) prop('pole', rc + side * (w2 + 14), y, h1); else if (kind < 33) prop('boulder', px, y, h1); }
          else if (S.id === 'bridge') { if (c % 2 === 0) prop('truss', rc + side * (w2 + 8), y, h1); }
        }
      }
    }

    function draw() {
      const sh = G.shake > 0.3 ? G.shake : 0;
      x.setTransform(1, 0, 0, 1, sh ? Math.round((Math.random() - 0.5) * sh) : 0, sh ? Math.round((Math.random() - 0.5) * sh) : 0);
      // yer və yol (iki piksellik zolaqlarla)
      const dawn = S.bridge ? Math.min(1, G.d / S.len) : 0;
      x.fillStyle = S.bridge ? `rgb(${12 + dawn * 60 | 0},${16 + dawn * 40 | 0},${36 + dawn * 50 | 0})` : S.ground; x.fillRect(-10, -10, W + 20, H + 20);
      if (tiles[S.id]) { const oy = Math.floor(G.d) % (H * 2); x.drawImage(tiles[S.id], 0, oy - H * 2); x.drawImage(tiles[S.id], 0, oy); }
      for (let y = 0; y < H; y += 2) {
        const dd = G.d + (PY - y), c = cxAt(dd), w2 = S.hw(dd), cell = Math.floor(dd / 16);
        if (S.walls) {
          // qaya divarı: yolun dibində kölgə, sonra pilləli qatlar (yuxarı getdikcə açılır), kənarı dişlidir
          const jag = hsh(Math.floor(dd / 6), 3) % 5;
          for (const sd of [-1, 1]) { const e0 = c + sd * w2; for (const [o0, o1, col] of [[0, 7 + jag, '#1e0c0a'], [7 + jag, 22 + jag, '#4a1c16'], [22 + jag, 46, (cell % 3) ? '#6a2e24' : '#5e2820'], [46, 62, (cell % 4) ? '#84402e' : '#7a3a2a'], [62, 66, '#a05a40']]) { x.fillStyle = col; if (sd < 0) x.fillRect(e0 - o1, y, o1 - o0, 2); else x.fillRect(e0 + o0, y, o1 - o0, 2); } }
        }
        if (S.bridge) {
          // uçurumun dibində çay: dalğalı açıq zolaqlar
          const rv = 240 + Math.sin(dd / 180) * 120; x.fillStyle = `rgba(${40 + dawn * 60 | 0},${70 + dawn * 60 | 0},${120 + dawn * 50 | 0},0.5)`; x.fillRect(rv - 26, y, 52, 2); if ((cell + Math.floor(G.t * 3)) % 4 === 0) { x.fillStyle = 'rgba(200,225,255,0.25)'; x.fillRect(rv - 14 + (cell % 3) * 8, y, 9, 1); }
          x.fillStyle = (cell % 2) ? '#4a3626' : '#523c2a'; x.fillRect(c - w2, y, w2 * 2, 2); if (Math.floor(dd / 8) % 2 === 0) { x.fillStyle = '#3a2a1e'; x.fillRect(c - w2, y, w2 * 2, 1); } x.fillStyle = '#8a6a44'; x.fillRect(c - w2 - 3, y, 3, 2); x.fillRect(c + w2, y, 3, 2); if (cell % 4 === 0) { x.fillStyle = '#b9905a'; x.fillRect(c - w2 - 5, y, 2, 2); x.fillRect(c + w2 + 3, y, 2, 2); } if (dd > S.len - 60 && dd < S.len + 150) { x.fillStyle = `rgb(${12 + dawn * 60 | 0},${16 + dawn * 40 | 0},${36 + dawn * 50 | 0})`; x.fillRect(0, y, W, 2); } continue; }
        x.fillStyle = S.road; x.fillRect(c - w2, y, w2 * 2, 2);
        x.fillStyle = S.edge; x.fillRect(c - w2, y, 2, 2); x.fillRect(c + w2 - 2, y, 2, 2);
        if (Math.floor(dd / 22) % 2 === 0) { x.fillStyle = '#6a5a52'; x.fillRect(c - 1, y, 2, 2); }
        // asfalt: çatlar, yamaqlar, çiyin zolağı
        { const ha = hsh(Math.floor(dd / 4), 11 + si); if (ha % 9 === 0) { x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(c - w2 + 6 + (ha >> 4) % Math.max(4, w2 * 2 - 14), y, 2 + (ha >> 9) % 5, 1); } if (ha % 23 === 0) { x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(c - w2 + 6 + (ha >> 6) % Math.max(4, w2 * 2 - 24), y, 10, 2); } x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(c - w2 + 2, y, 3, 2); x.fillRect(c + w2 - 5, y, 3, 2); }
        if (S.fog && cell % 3 === 0) { x.fillStyle = '#e8ffd0'; x.fillRect(c - w2 - 1, y, 2, 2); x.fillRect(c + w2 - 1, y, 2, 2); }
      }
      scenery();
      // faraların işığı (gecə): maşının qabağında iki açıq zolaq
      if (!S.fog && !G.dead) {
        x.globalCompositeOperation = 'lighter';
        for (const [len, wide, al] of [[120, 46, 0.05], [84, 30, 0.06], [46, 18, 0.08]]) { x.fillStyle = `rgba(255,225,160,${al})`; x.beginPath(); x.moveTo(G.x - 10, G.y - 24); x.lineTo(G.x + 10, G.y - 24); x.lineTo(G.x + wide, G.y - 24 - len); x.lineTo(G.x - wide, G.y - 24 - len); x.closePath(); x.fill(); }
        x.globalCompositeOperation = 'source-over';
      }
      // varlıqlar
      for (const e of G.ents) {
        const sy = Math.round(PY - (e.d - G.d)); if (sy < -50 || sy > H + 50) continue;
        if (e.k === 'rock') {
          if (e.hole) {            // körpüdə deşik: aşağıda uçurum görünür, kənarları qırıq taxta
            P(e.x - 12, sy - 8, 24, 16, '#2a1c12'); P(e.x - 10, sy - 6, 20, 12, bgCol()); P(e.x - 12, sy - 8, 5, 3, '#6a4a2c'); P(e.x + 6, sy + 5, 6, 3, '#6a4a2c'); P(e.x + 8, sy - 8, 3, 5, '#7a5a34'); P(e.x - 11, sy + 3, 3, 5, '#7a5a34');
            continue;
          }
          const kind = e.wreck ? 'wreck' : e.plank ? 'planks' : e.hard ? 'boulder' : ['barricade', 'tires', 'rock'][Math.floor(e.d) % 3];
          spr(kind, e.x, sy, kind === 'wreck' ? 0.8 : kind === 'boulder' ? 0.72 : 1, Math.floor(e.d) % 2 === 1);
          if (e.fire) flames(e.x, sy - 8, 4, e.d);
        }
        else if (e.k === 'fuel' || e.k === 'nitro' || e.k === 'fix') {
          const bb = Math.round(Math.sin(G.t * 6 + e.d) * 1.5), py = sy + bb;
          x.fillStyle = e.k === 'fuel' ? 'rgba(255,180,60,0.22)' : e.k === 'nitro' ? 'rgba(90,180,255,0.22)' : 'rgba(120,220,130,0.22)'; x.beginPath(); x.arc(e.x, sy, 12 + Math.sin(G.t * 5 + e.d) * 2, 0, 7); x.fill();
          if (e.k === 'fuel') { P(e.x - 6, py - 8, 12, 15, '#12080c'); P(e.x - 5, py - 7, 10, 13, '#c9281a'); P(e.x - 5, py - 7, 3, 13, '#e8442c'); P(e.x - 2, py - 10, 5, 3, '#12080c'); P(e.x - 1, py - 9, 3, 1, '#8a8a8a'); P(e.x - 3, py - 3, 6, 1, '#12080c'); P(e.x - 3, py - 1, 6, 5, '#ffd166'); P(e.x - 1, py, 2, 3, '#c9281a'); }
          else if (e.k === 'nitro') { P(e.x - 4, py - 9, 8, 17, '#12080c'); P(e.x - 3, py - 6, 6, 13, '#2a7ad8'); P(e.x - 3, py - 6, 2, 13, '#5aa8ff'); P(e.x - 2, py - 9, 4, 3, '#b9b9c4'); P(e.x - 3, py - 1, 6, 4, '#fff'); P(e.x - 1, py - 1, 2, 1, '#2a7ad8'); P(e.x - 2, py + 1, 2, 1, '#2a7ad8'); P(e.x, py + 2, 2, 1, '#2a7ad8'); }
          else { P(e.x - 7, py - 6, 14, 12, '#12080c'); P(e.x - 6, py - 5, 12, 10, '#e8dcc0'); P(e.x - 6, py - 5, 12, 2, '#fff'); P(e.x - 1, py - 4, 2, 8, '#c9281a'); P(e.x - 4, py - 1, 8, 2, '#c9281a'); }
        }
        else if (e.k === 'pole') { if (e.x0 === undefined) continue; if (e.warn > 0) { if (Math.floor(G.t * 12) % 2) { x.fillStyle = 'rgba(255,60,40,0.4)'; x.fillRect(e.x0, sy - 4, e.x1 - e.x0, 8); } } else { P(e.x0, sy + 5, e.x1 - e.x0, 3, 'rgba(0,0,0,0.3)'); P(e.x0, sy - 5, e.x1 - e.x0, 10, '#12080c'); P(e.x0, sy - 4, e.x1 - e.x0, 7, '#6a4a2c'); P(e.x0, sy - 4, e.x1 - e.x0, 2, '#8a6a44'); for (let px = e.x0 + 10; px < e.x1 - 6; px += 22) { P(px, sy - 4, 2, 7, '#3a2a1e'); } const end = e.side < 0 ? e.x1 - 8 : e.x0; P(end, sy - 9, 8, 18, '#12080c'); P(end + 1, sy - 8, 6, 16, '#5a3e24'); P(end + 2, sy - 11, 1, 5, '#1c1418'); P(end + 5, sy + 6, 1, 6, '#1c1418'); for (let px = e.x0 + 6; px < e.x1 - 4; px += 12) { const f = Math.floor(G.t * 9 + px); P(px + (f % 3), sy - 9 - (f % 3), 4, 6, ['#ff7a1c', '#ffd166', '#b3261e'][f % 3]); } } }
        else if (e.k === 'chaser') { if (e.st === 'sleep') continue; if (e.st === 'aim' && Math.floor(G.t * 16) % 2) { x.fillStyle = 'rgba(255,60,40,0.5)'; x.fillRect(Math.min(e.x, G.x), sy - 2, Math.abs(e.x - G.x), 4); } car(e.x, sy, 'foe', e.vx, 1, e.skin || 0, e.st === 'aim' && Math.floor(G.t * 16) % 2 === 0); }
        else if (e.k === 'fall') {
          if (!e.on) continue;
          const k = Math.min(1, e.tt / 0.95), rr = e.r * (0.5 + 0.7 * k);
          x.fillStyle = `rgba(0,0,0,${(0.15 + 0.35 * k).toFixed(2)})`; x.beginPath(); x.ellipse(e.x, sy, rr + 3, (rr + 3) * 0.6, 0, 0, 7); x.fill();
          if (Math.floor(G.t * 12) % 2) { x.strokeStyle = 'rgba(255,70,40,0.85)'; x.lineWidth = 1; x.beginPath(); x.ellipse(Math.round(e.x) + 0.5, sy + 0.5, e.r + 6, (e.r + 6) * 0.6, 0, 0, 7); x.stroke(); }
          const fy = sy - (1 - k * k) * 170;
          if (e.into === 'cloud') { P(e.x - 4, fy - 7, 8, 14, '#12080c'); P(e.x - 3, fy - 6, 6, 12, '#8a8a8a'); P(e.x - 3, fy - 2, 6, 3, '#7fdc5a'); P(e.x - 1, fy - 9, 2, 3, '#5a5258'); for (let i = 1; i < 4; i++) P(e.x - 1, fy - 9 - i * 6, 2, 3, `rgba(127,220,90,${0.5 - i * 0.12})`); }
          else spr('boulder', e.x, fy, 0.55 + 0.17 * k);
        }
        else if (e.k === 'patch') {
          x.fillStyle = 'rgba(12,6,8,0.5)'; x.beginPath(); x.ellipse(e.x, sy, e.r, e.r * 0.7, 0, 0, 7); x.fill();
          x.fillStyle = 'rgba(255,120,30,0.14)'; x.beginPath(); x.ellipse(e.x, sy - 3, e.r * 1.5, e.r * 1.1, 0, 0, 7); x.fill();
          const n = Math.max(3, Math.round(e.r / 3.2)); flames(e.x, sy + 2, n, e.d); flames(e.x + 2, sy - 5, Math.max(2, n - 2), e.d + 3);
        }
        else if (e.k === 'cloud') { for (let i = 0; i < 6; i++) { const a = i * 1.05 + G.t * 0.4, rr = e.r * 0.5; x.fillStyle = `rgba(120,220,90,${0.2 + (i % 3) * 0.06})`; x.beginPath(); x.arc(e.x + Math.cos(a) * rr, sy + Math.sin(a) * rr * 0.7, e.r * 0.62, 0, 7); x.fill(); } }
        else if (e.k === 'barrel') { spr('barrel', e.x, sy, 1, Math.floor((e.rot || 0) / 2) % 2 === 1); if (Math.floor(G.t * 10) % 2) P(e.x - 1, sy - 13, 2, 3, '#ff7a1c'); }
        else if (e.k === 'chain') { const c = cxAt(e.d), w2 = S.hw(e.d), on = e.tt > 0.9; if (!on && Math.floor(G.t * 12) % 2 === 0) continue; if (!on) { P(c - w2, sy - 2, Math.max(0, e.gap - 22 - (c - w2)), 5, 'rgba(255,60,40,0.5)'); P(e.gap + 22, sy - 2, Math.max(0, c + w2 - e.gap - 22), 5, 'rgba(255,60,40,0.5)'); P(e.gap - 4, sy - 7, 8, 14, '#7fbf7a'); P(e.gap - 1, sy - 4, 2, 6, '#12080c'); P(e.gap - 3, sy - 1, 6, 2, '#12080c'); }
          else { for (const [a0, a1] of [[c - w2, e.gap - 22], [e.gap + 22, c + w2]]) { for (let lx = a0; lx < a1 - 4; lx += 6) { P(lx, sy - 3, 6, 6, '#12080c'); P(lx + 1, sy - 2, 4, 4, (Math.floor(lx / 6) % 2) ? '#b9b9c4' : '#8a8a96'); P(lx + 2, sy - 1, 2, 2, '#12080c'); } } P(e.gap - 26, sy - 5, 5, 10, '#d8d8e0'); P(e.gap + 21, sy - 5, 5, 10, '#d8d8e0'); } }
      }
      if (S.id === 'truck') { const T = G.truck, ty = T.pass ? 46 + T.pass * 260 : 46 + (T.dy || 0); if (ty < H + 60) car(T.x, ty, 'truck', 0, 1, 0, T.slam > 0 && T.slam < 0.8 && Math.floor(G.t * 14) % 2 === 0); }
      if (S.id === 'bridge') for (const b of G.bikes) { if (G.hook === b) { x.strokeStyle = '#c9a98a'; x.lineWidth = 1; x.beginPath(); x.moveTo(b.x, G.y - 2); x.lineTo(G.x, G.y); x.stroke(); } car(b.x, G.y + b.off, 'bike'); }
      // nitro: ekran boyu sürət xətləri
      if (G.boost > 0 || G.jump > 0) { x.fillStyle = 'rgba(255,255,255,0.22)'; for (let k = 0; k < 14; k++) { const hx = hsh(k, Math.floor(G.t * 30)) % W, hy = (hsh(k + 40, Math.floor(G.t * 30)) % H); x.fillRect(hx, hy, 1, 14 + (k % 3) * 8); } }
      // partlayış halqaları
      for (const rg of G.rings) {
        const k = rg.t / 0.34, rr = 5 + k * 26;
        if (k < 0.35) { x.fillStyle = `rgba(255,240,176,${(0.85 - k * 2).toFixed(2)})`; x.beginPath(); x.arc(rg.x, rg.y, rr * 0.9, 0, 7); x.fill(); }
        x.strokeStyle = k < 0.5 ? '#ffd166' : '#ff7a1c'; x.globalAlpha = Math.max(0, 1 - k); x.lineWidth = k < 0.5 ? 3 : 2; x.beginPath(); x.arc(Math.round(rg.x) + 0.5, Math.round(rg.y) + 0.5, rr, 0, 7); x.stroke(); x.globalAlpha = 1;
      }
      // hissəciklər
      for (const p of G.parts) { x.fillStyle = p.c; x.globalAlpha = Math.max(0, p.a); x.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
      x.globalAlpha = 1;
      // oyunçu (tullanışda böyüyür və kölgəsi ayrılır)
      if (!(G.dead && G.dead < 1.2)) {
        const j = G.jump > 0 ? Math.sin((1 - G.jump / 1.25) * Math.PI) : 0;
        if (G.boost > 0) { const f = Math.floor(G.t * 20) % 2; x.fillStyle = '#5ab4ff'; x.fillRect(G.x - 10, G.y + 24, 4, 8 + f * 5); x.fillRect(G.x + 6, G.y + 24, 4, 8 + (1 - f) * 5); x.fillStyle = '#fff'; x.fillRect(G.x - 9, G.y + 24, 2, 5); x.fillRect(G.x + 7, G.y + 24, 2, 5); }
        car(G.x, G.y - j * 16, 'me', G.vx, 1 + j * 0.35, 0, false, Math.round(j * 16));
      }
      // duman: maşının ətrafında görünən dairə
      if (S.fog) { fx.globalCompositeOperation = 'source-over'; fx.clearRect(0, 0, W, H); fx.fillStyle = 'rgba(14,34,20,0.93)'; fx.fillRect(0, 0, W, H); fx.globalCompositeOperation = 'destination-out'; const g = fx.createRadialGradient(G.x, G.y - 26, 16, G.x, G.y - 26, 92); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)'); fx.fillStyle = g; fx.fillRect(0, 0, W, H); x.drawImage(fogCv, 0, 0);
        for (let y = 0; y < H; y += 2) { const dd = G.d + (PY - y); if (Math.floor(dd / 16) % 3 === 0) { const c = cxAt(dd), w2 = S.hw(dd); x.fillStyle = 'rgba(220,255,190,0.55)'; x.fillRect(c - w2 - 1, y, 2, 2); x.fillRect(c + w2 - 1, y, 2, 2); } } }
      if (G.flash > 0) { x.fillStyle = `rgba(200,30,20,${Math.min(0.4, G.flash * 2)})`; x.fillRect(-10, -10, W + 20, H + 20); }
      x.setTransform(1, 0, 0, 1, 0, 0);
    }

    function loop(now) {
      if (over) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (ch.paused || cut) return;
      step(dt);
      for (const p of G.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.a -= dt * 1.8; }
      if (G.parts.length > 260) G.parts.splice(0, G.parts.length - 260);
      G.parts = G.parts.filter((p) => p.a > 0);
      for (const rg of G.rings) { rg.t += dt; rg.y += G.v * dt * 0.5; } G.rings = G.rings.filter((rg) => rg.t < 0.34);
      G.shake *= 1 - Math.min(1, dt * 7); G.flash = Math.max(0, G.flash - dt);
      draw();
      hpBar.style.width = Math.max(0, G.hp) + '%'; fuelBar.style.width = Math.max(0, G.fuel) + '%';
      fuelBar.parentNode.classList.toggle('is-low', G.fuel < 25); hpBar.parentNode.classList.toggle('is-low', G.hp < 30);
      const nt = '⚡'.repeat(Math.max(0, G.nitro)); if (nitroEl.textContent !== nt) nitroEl.textContent = nt;
      nmBar.style.width = (G.nm / 3) * 100 + '%';
      prog.style.width = Math.min(100, (G.d / S.len) * 100) + '%';
    }

    function finish() { stop(); resolve(); }
    function stop() { over = true; cancelAnimationFrame(raf); removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('blur', blur); clearTimeout(say.tm); ui.remove(); ch._chase = null; x.setTransform(1, 0, 0, 1, 0, 0); }
    ch._chase = { stop, keys, pause: blur, get G() { return G; }, get S() { return S; }, get si() { return si; }, SECTIONS, nitro, start, skip: () => { G.won = 0.05; } };
    start(startSec);
    raf = requestAnimationFrame(loop);
  });
}
