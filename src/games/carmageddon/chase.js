// CARMAGEDDON Fəsil 1 — QAÇIŞ: Jackal-ın maşını ilə Sindikatdan qaçış (yuxarıdan baxış, yol aşağı axır).
// Beş hissə, hər birinin öz mexanikası; hər hissənin əvvəli yaddaş nöqtəsidir (qəzadan sonra oradan).
//   1 Yanan düşərgə — maneələr və yıxılan dirəklər        2 Kanyon — təqibçilər (qayaya sıx / əyləclə ötür)
//   3 Doctor Rust-ın dumanı — görünüş azdır, qaz buludları   4 Butcher-in yük maşını — çəllək, zəncir, nitro ilə ötmə
//   5 Sınıq körpü — The Twins-in qarmaqları, sonda nitro ilə tullanış
// İdarə: ← → sükan, ↓ əyləc, boşluq / E / ↑ nitro. Telefonda ekrandakı düymələr.
// Maşın: can (zədə), yanacaq (bak sızır — kanistr yığ), nitro yükləri. Can azalanda tüstüləyir və sağa çəkir.
import { t } from '../../core/i18n.js';
import { audio } from '../../core/AudioManager.js';

const W = 480, H = 270, PY = 206;
const rnd = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

const SECTIONS = [
  { id: 'camp', len: 2500, speed: 150, amp: 34, wl: 420, hw: (d) => 78 - Math.min(22, d / 110), ground: '#3a2418', road: '#2a2226', edge: '#e2571c' },
  { id: 'canyon', len: 3300, speed: 172, amp: 46, wl: 520, hw: () => 70, ground: '#4a1f1a', road: '#30262a', edge: '#c9a98a', walls: true },
  { id: 'fog', len: 2700, speed: 148, amp: 64, wl: 380, hw: () => 66, ground: '#1c2a1e', road: '#22282a', edge: '#9ad18a', fog: true },
  { id: 'truck', len: 3000, speed: 168, amp: 30, wl: 600, hw: () => 82, ground: '#2a2030', road: '#2a2428', edge: '#c9a98a' },
  { id: 'bridge', len: 2400, speed: 182, amp: 18, wl: 700, hw: () => 58, ground: '#0c1024', road: '#4a3626', edge: '#8a6a44', bridge: true },
];

export function runChase(ch, startSec = 0, onSection = null) {
  return new Promise((resolve) => {
    const cv = ch.cv, x = cv.getContext('2d');
    x.imageSmoothingEnabled = false;
    const fogCv = document.createElement('canvas'); fogCv.width = W; fogCv.height = H; const fx = fogCv.getContext('2d');
    const ui = document.createElement('div');
    ui.className = 'cgc';
    ui.innerHTML = `
      <div class="cgc__hud"><div class="cgc__bar cgc__bar--hp" data-l="${t('cg.c.hp')}"><i></i></div><div class="cgc__bar cgc__bar--fuel" data-l="${t('cg.c.fuel')}"><i></i></div><div class="cgc__nitro"></div></div>
      <div class="cgc__prog"><i></i></div>
      <div class="cgc__banner"><b></b><span></span></div>
      <div class="cgc__alert"></div>
      <div class="cgc__pad cgc__pad--l"><button data-k="left" type="button">◀</button><button data-k="right" type="button">▶</button></div>
      <div class="cgc__pad cgc__pad--r"><button data-k="brake" type="button">▼</button><button data-k="nitro" type="button">⚡</button></div>`;
    ch.el.appendChild(ui);
    const $ = (s) => ui.querySelector(s);
    const hpBar = $('.cgc__bar--hp i'), fuelBar = $('.cgc__bar--fuel i'), nitroEl = $('.cgc__nitro'), prog = $('.cgc__prog i'), banner = $('.cgc__banner'), alertEl = $('.cgc__alert');

    const keys = new Set();
    const MAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'brake', KeyS: 'brake', Space: 'nitro', KeyE: 'nitro', ArrowUp: 'nitro', KeyW: 'nitro' };
    const kd = (e) => { const k = MAP[e.code]; if (!k) return; e.preventDefault(); if (k === 'nitro') { if (!e.repeat) nitro(); } else keys.add(k); };
    const ku = (e) => { const k = MAP[e.code]; if (k) keys.delete(k); };
    addEventListener('keydown', kd); addEventListener('keyup', ku);
    ui.querySelectorAll('[data-k]').forEach((b) => {
      const k = b.dataset.k;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* boş */ } if (k === 'nitro') nitro(); else keys.add(k); b.classList.add('is-on'); });
      const up = () => { keys.delete(k); b.classList.remove('is-on'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    });

    let si = startSec, S, G, raf = 0, last = performance.now(), over = false;
    const cxAt = (d) => 240 + Math.sin(d / S.wl) * S.amp + Math.sin(d / (S.wl * 0.37) + 1.3) * S.amp * 0.35;

    function start(i) {
      si = i; S = SECTIONS[i];
      onSection?.(i);
      const r = rnd(1000 + i * 77);
      G = { d: 0, x: cxAt(0), vx: 0, v: S.speed, hp: 100, fuel: 100, nitro: 2, boost: 0, ents: [], parts: [], shake: 0, dead: 0, won: 0, flash: 0, steerSign: 0, flips: [], hook: null, jump: 0, truck: null, t: 0, r };
      const add = (e) => { G.ents.push(e); return e; };
      const lane = (d, k) => cxAt(d) + k * (S.hw(d) - 16);
      // yanacaq və nitro: hər hissədə yol boyu
      for (let d = 500; d < S.len - 300; d += 620 + r() * 260) add({ k: 'fuel', d, x: lane(d, r() * 1.6 - 0.8) });
      for (let d = 900; d < S.len - 500; d += 1100 + r() * 400) add({ k: r() < 0.5 ? 'nitro' : 'fix', d, x: lane(d, r() * 1.6 - 0.8) });
      if (S.id === 'camp') {
        for (let d = 320; d < S.len - 200; d += 150 + r() * 110) add({ k: 'rock', d, x: lane(d, r() * 1.8 - 0.9), r: 9, fire: r() < 0.6 });
        for (let d = 700; d < S.len - 300; d += 420 + r() * 160) add({ k: 'pole', d, side: r() < 0.5 ? -1 : 1, warn: 1 });
      } else if (S.id === 'canyon') {
        for (let d = 420; d < S.len - 500; d += 520 + r() * 200) add({ k: 'chaser', d: d - 60, wake: d, x: cxAt(d), side: r() < 0.5 ? -1 : 1, st: 'sleep', tt: 0, vx: 0, v: Math.floor(r() * 3) });
        for (let d = 600; d < S.len - 200; d += 380 + r() * 200) add({ k: 'rock', d, x: lane(d, r() < 0.5 ? -0.9 : 0.9), r: 9 });
      } else if (S.id === 'fog') {
        for (let d = 300; d < S.len - 200; d += 190 + r() * 140) add(r() < 0.45 ? { k: 'cloud', d, x: lane(d, r() * 1.4 - 0.7), r: 30 } : { k: 'rock', d, x: lane(d, r() * 1.7 - 0.85), r: 9, wreck: true });
      } else if (S.id === 'truck') {
        G.truck = { x: cxAt(160), next: 1.6, n: 0, pass: 0 };
        add({ k: 'nitro', d: S.len - 640, x: cxAt(S.len - 640) });
      } else if (S.id === 'bridge') {
        G.bikes = [{ side: -1, x: 0, off: 0 }, { side: 1, x: 0, off: 0 }];
        G.hooks = [420, 1000, 1540];
        for (let d = 300; d < S.len - 400; d += 300 + r() * 160) add({ k: 'rock', d, x: lane(d, r() * 1.6 - 0.8), r: 8, plank: true });
        add({ k: 'nitro', d: S.len - 560, x: cxAt(S.len - 560) });
      }
      banner.querySelector('b').textContent = `${i + 1} / ${SECTIONS.length} · ${t('cg.c.' + S.id)}`;
      banner.querySelector('span').textContent = t('cg.c.' + S.id + '.h');
      banner.classList.remove('is-on'); void banner.offsetWidth; banner.classList.add('is-on');
      alertEl.textContent = '';
      ui.dataset.sec = S.id;
    }

    function nitro() {
      if (!G || G.dead || G.won || G.nitro <= 0 || G.boost > 0.2) return;
      G.nitro--; G.boost = 1.5; audio.sfx('boost');
    }
    const say = (key, ms = 1300) => { alertEl.textContent = t(key); alertEl.classList.remove('is-on'); void alertEl.offsetWidth; alertEl.classList.add('is-on'); clearTimeout(say.tm); say.tm = setTimeout(() => alertEl.classList.remove('is-on'), ms); };
    const boom = (bx, by, n = 14, col = null) => { for (let i = 0; i < n; i++) G.parts.push({ x: bx, y: by, vx: (Math.random() - 0.5) * 150, vy: (Math.random() - 0.5) * 150, a: 1, c: col || ['#fff0b0', '#ffd166', '#ff7a1c', '#b3261e'][i % 4], s: 2 + (i % 3) }); };
    function hurt(n, kick = 0) {
      if (G.dead || G.won || G.jump > 0) return;
      G.hp -= n; G.shake = Math.max(G.shake, 5); G.flash = 0.18; G.vx += kick; audio.sfx('hit');
      boom(G.x, PY - 6, 6);
      if (G.hp <= 0) fail('cg.c.wreck');
    }
    function fail(key) {
      if (G.dead) return;
      G.dead = 1.5; G.hp = 0; say(key, 1500); boom(G.x, PY - 8, 30); G.shake = 9; audio.sfx('explosion');
    }

    function step(dt) {
      G.t += dt;
      if (G.dead) { G.dead -= dt; G.v *= 1 - dt * 3; if (G.dead <= 0) start(si); return; }
      if (G.won) { G.won -= dt; G.d += G.v * dt; if (G.won <= 0) { if (si + 1 < SECTIONS.length) start(si + 1); else finish(); } return; }
      const hw = S.hw(G.d), rc = cxAt(G.d);
      // sükan
      const st = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      if (st && st !== G.steerSign) { G.flips.push(G.t); G.steerSign = st; }
      G.vx += st * 760 * dt;
      G.vx -= G.vx * Math.min(1, dt * 5.5);
      if (G.hp < 30) G.vx += 26 * dt * 6;                                    // zədəli maşın sağa çəkir
      G.vx = Math.max(-175, Math.min(175, G.vx));
      G.x += G.vx * dt;
      // sürət: əyləc / nitro / qarmaq
      G.boost = Math.max(0, G.boost - dt);
      let target = S.speed * (keys.has('brake') ? 0.55 : 1) * (G.boost > 0 ? 1.65 : 1) * (G.hook ? 0.68 : 1);
      if (G.jump > 0) target = S.speed * 1.7;
      G.v += (target - G.v) * Math.min(1, dt * 3.2);
      G.d += G.v * dt;
      G.fuel -= dt * 2.3;
      if (G.fuel <= 0) { fail('cg.c.nofuel'); return; }
      // yol kənarı
      if (G.jump <= 0) {
        const off = Math.abs(G.x - rc) - (hw - 7);
        if (off > 0) {
          if (S.walls || S.bridge) { G.x = rc + Math.sign(G.x - rc) * (hw - 7); if (Math.abs(G.vx) > 40) hurt(S.bridge ? 9 : 6, -Math.sign(G.x - rc) * 120); else G.vx = -Math.sign(G.x - rc) * 40; }
          else { G.v *= 1 - dt * 1.6; if (off > 26) { G.x = rc + Math.sign(G.x - rc) * (hw + 19); hurt(4 * dt * 10); } if (Math.random() < dt * 20) G.parts.push({ x: G.x, y: PY + 10, vx: (Math.random() - 0.5) * 30, vy: 40, a: 0.8, c: '#8a6a4a', s: 2 }); }
        }
      }
      // sərt dönüşdə təkər izi; kənara sürtünəndə qığılcım
      if (Math.abs(G.vx) > 120 && G.jump <= 0) for (const ox of [-6, 6]) G.parts.push({ x: G.x + ox, y: PY + 10, vx: 0, vy: G.v, a: 0.9, c: '#1a1416', s: 2 });
      if ((S.walls || S.bridge) && Math.abs(G.x - rc) > hw - 11 && Math.random() < dt * 40) G.parts.push({ x: G.x + Math.sign(G.x - rc) * 8, y: PY - 4 + Math.random() * 16, vx: -Math.sign(G.x - rc) * 60, vy: 90, a: 1, c: '#ffd166', s: 1 });
      // toz / tüstü
      if (Math.random() < dt * 26) G.parts.push({ x: G.x + (Math.random() < 0.5 ? -5 : 5), y: PY + 12, vx: (Math.random() - 0.5) * 16, vy: 70, a: 0.5, c: G.boost > 0 ? '#ffb53a' : '#6a5a52', s: G.boost > 0 ? 3 : 2 });
      if (G.hp < 45 && Math.random() < dt * 14) G.parts.push({ x: G.x + (Math.random() - 0.5) * 6, y: PY - 10, vx: 6, vy: 30, a: 0.8, c: '#3a3438', s: 3 });

      // ——— varlıqlar ———
      for (const e of G.ents) {
        if (e.gone) continue;
        const sy = PY - (e.d - G.d);
        if (e.k === 'rock') {
          if (Math.abs(sy - PY) < 12 + e.r && Math.abs(e.x - G.x) < 8 + e.r && G.jump <= 0) { e.gone = true; boom(e.x, sy, 10, e.fire ? null : '#8a7a6a'); hurt(e.plank ? 12 : 18); G.v *= 0.6; }
        } else if (e.k === 'fuel' || e.k === 'nitro' || e.k === 'fix') {
          if (Math.abs(sy - PY) < 18 && Math.abs(e.x - G.x) < 16) { e.gone = true; audio.sfx('pickup'); if (e.k === 'fuel') G.fuel = Math.min(100, G.fuel + 38); else if (e.k === 'nitro') G.nitro = Math.min(3, G.nitro + 1); else G.hp = Math.min(100, G.hp + 25); boom(e.x, sy, 8, e.k === 'fuel' ? '#ffd166' : e.k === 'nitro' ? '#5ab4ff' : '#7fbf7a'); }
        } else if (e.k === 'pole') {
          // yıxılan dirək: əvvəl kölgə (xəbərdarlıq), sonra yolun yarısını bağlayır
          if (sy > -40 && e.warn > 0) e.warn -= dt;
          const c = cxAt(e.d), w2 = S.hw(e.d);
          e.x0 = e.side < 0 ? c - w2 : c - 8; e.x1 = e.side < 0 ? c + 8 : c + w2;
          if (e.warn <= 0 && !e.hit && Math.abs(sy - PY) < 12 && G.x > e.x0 - 6 && G.x < e.x1 + 6) { e.hit = true; hurt(24); G.v *= 0.45; boom(G.x, PY - 10, 12, '#8a6a4a'); }
        } else if (e.k === 'chaser') {
          if (e.st === 'sleep') { if (G.d > e.wake) { e.st = 'come'; e.d = G.d - 150; e.x = cxAt(G.d) + e.side * 30; say('cg.c.chaser', 900); } continue; }
          if (e.st === 'dead') continue;
          const want = G.d + 4, c = cxAt(e.d), w2 = S.hw(e.d);
          // öz sürəti: oyunçuya çatmağa çalışır (gecikmə ilə — əyləcə basanda qabağa keçir)
          e.v = (e.v ?? S.speed) + ((want - e.d) * 2.2 + (G.v - (e.v ?? S.speed)) * 1.2) * dt;
          e.v = Math.max(S.speed * 0.7, Math.min(S.speed * 1.5, e.v));
          e.d += e.v * dt; e.tt += dt;
          const beside = Math.abs(e.d - G.d) < 26;
          if (e.st === 'come') { const tx = G.x + e.side * 30; e.vx += (tx - e.x) * 9 * dt; e.vx -= e.vx * dt * 4; if (beside && e.tt > 1.6) { e.st = 'aim'; e.tt = 0; } }
          else if (e.st === 'aim') { e.vx -= e.vx * dt * 6; if (e.tt > 0.55) { e.st = 'ram'; e.tt = 0; e.vx = -e.side * 230; } }
          else if (e.st === 'ram') { if (e.tt > 0.5) { e.st = 'come'; e.tt = 0; if (Math.random() < 0.5) e.side *= -1; } }
          e.x += e.vx * dt;
          // maşın–maşın toqquşması
          if (beside && Math.abs(e.x - G.x) < 15) {
            const dir = Math.sign(e.x - G.x) || 1;
            if (e.st === 'ram') { hurt(13, -dir * 150); e.vx = dir * 120; e.st = 'come'; e.tt = 0; }
            else { e.vx = dir * (150 + Math.abs(G.vx)); G.vx = -dir * 60; G.shake = 3; boom((e.x + G.x) / 2, PY - 4, 5); if (Math.abs(G.vx) < 30) hurt(2); }
          }
          // divara sıxılan təqibçi partlayır
          if (Math.abs(e.x - c) > w2 - 6) { e.st = 'dead'; e.gone = true; boom(e.x, PY - (e.d - G.d), 34); G.shake = 7; audio.sfx('explosion'); say('cg.c.down', 800); }
        } else if (e.k === 'cloud') {
          if (Math.hypot(e.x - G.x, (sy - PY) * 0.8) < e.r - 4) { G.hp -= 15 * dt; G.flash = 0.05; if (G.hp <= 0) fail('cg.c.wreck'); }
        } else if (e.k === 'barrel') {
          e.d -= 70 * dt; e.x += e.vx * dt; e.rot = (e.rot || 0) + dt * 9;
          const c = cxAt(e.d), w2 = S.hw(e.d); if (Math.abs(e.x - c) > w2 - 8) e.vx *= -1;
          if (Math.abs(sy - PY) < 14 && Math.abs(e.x - G.x) < 14) { e.gone = true; boom(e.x, sy, 22); hurt(16); audio.sfx('explosion'); }
        } else if (e.k === 'chain') {
          e.tt += dt;
          if (e.tt > 0.9) e.d -= 120 * dt;                                   // xəbərdarlıqdan sonra oyunçuya doğru sürüşür
          if (!e.hit && e.tt > 0.9 && Math.abs(sy - PY) < 8) { e.hit = true; if (Math.abs(G.x - e.gap) > 22) { hurt(22); G.v *= 0.6; } }
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
          else G.ents.push({ k: 'barrel', d: G.d + 150, x: T.x + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 90 });
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
        G.bikes.forEach((b) => { const tx = G.x + b.side * (G.hook === b ? 20 : Math.min(34, hwb - 8)); b.x += (tx - b.x) * Math.min(1, dt * 5); b.off += ((G.hook === b ? 0 : 14) - b.off) * dt * 3; });
        if (!G.hook && G.hooks.length && G.d > G.hooks[0]) { G.hooks.shift(); G.hook = G.bikes[Math.random() < 0.5 ? 0 : 1]; G.hookT = 0; G.flips = []; say('cg.c.hooked', 1400); audio.sfx('hit'); }
        if (G.hook) {
          G.hookT += dt; G.vx += G.hook.side * 150 * dt;
          const recent = G.flips.filter((ft) => G.t - ft < 1.6).length;
          G.shakeOff = recent;
          if (recent >= 4) { boom(G.hook.x, PY, 16, '#b44bff'); G.hook.off = 60; G.hook = null; say('cg.c.free', 900); G.shake = 5; }
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
    // Maşınlar (yuxarıdan, burnu yuxarı). tilt — sükana görə əyilmə; v — variant; fl — yanıb-sönmə (nişan alır)
    function car(cx0, cy0, kind, tilt = 0, scale = 1, v = 0, fl = false) {
      const R = (dx, dy, w, h, c) => { x.fillStyle = c; x.fillRect(Math.round(cx0 + dx * scale + tilt * dy * 0.12), Math.round(cy0 + dy * scale), Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))); };
      const ink = '#12080c', spin = Math.floor(G.t * 22) % 2;
      const wheel = (dx, dy, w = 3, h = 7) => { R(dx - 1, dy - 1, w + 2, h + 2, ink); R(dx, dy, w, h, '#2a2428'); R(dx, dy + (spin ? 1 : 3), w, 1, '#5a5258'); R(dx, dy + (spin ? 5 : 0), w, 1, '#5a5258'); };
      if (kind === 'bike') {
        wheel(-1, -11, 2, 5); wheel(-1, 6, 2, 5);
        R(-3, -7, 6, 14, ink); R(-2, -6, 4, 12, '#2a1c34'); R(-2, -2, 4, 5, '#3a2a4a');
        R(-5, -7, 10, 2, ink); R(-4, -7, 8, 1, '#8a8a96');                                  // sükan
        R(-3, -3, 6, 6, ink); R(-2, -2, 4, 4, '#1c1418'); R(-1, -5, 2, 3, '#b44bff'); R(-1, -6, 2, 1, '#d98aff');   // sürücü: gödəkçə və bənövşəyi mohawk
        R(-1, 4, 2, 2, '#ff3b2e'); R(-4, 1, 1, 4, '#c9a98a'); return;
      }
      if (kind === 'truck') {
        for (const sy of [-30, -14, 4, 20]) { wheel(-23, sy, 4, 10); wheel(19, sy, 4, 10); }
        R(-20, -38, 40, 76, ink);
        R(-18, -36, 36, 46, '#3a3034'); R(-18, -36, 36, 2, '#5a4a4a'); R(-18, -14, 36, 2, '#2a2024');   // yük yeri
        for (let i = -14; i <= 8; i += 11) { R(i, -32, 9, 9, ink); R(i + 1, -31, 7, 7, '#8a3a1c'); R(i + 1, -28, 7, 1, '#c9a98a'); R(i, -22, 9, 7, ink); R(i + 1, -21, 7, 5, '#6a2a16'); }   // çəlləklər
        R(-18, -10, 36, 4, '#2a2024'); for (let i = -17; i < 17; i += 6) R(i, -10, 3, 4, '#ffb53a');                              // təhlükə zolağı
        R(-18, -4, 36, 40, '#6a1a16'); R(-18, -4, 4, 40, '#8a2a20'); R(14, -4, 4, 40, '#4a120e');                                 // kabin
        R(-13, 4, 26, 12, ink); R(-12, 5, 24, 10, '#1c1418'); R(-12, 5, 24, 2, '#5a7a8a'); R(-3, 9, 6, 5, '#b9906a');              // şüşə və Butcher-in keçəl başı
        R(-20, 22, 40, 4, ink); R(-18, 23, 36, 2, '#8a8a8a');
        for (let i = -17; i <= 14; i += 6) R(i, -41, 3, 5, '#d8d8e0');                                                             // arxa dişlər
        R(-17, 32, 6, 3, '#ff3b2e'); R(11, 32, 6, 3, '#ff3b2e'); R(-5, 30, 10, 4, '#c9a98a');
        R(-24, -2, 3, 16, '#4a4a52'); R(21, -2, 3, 16, '#4a4a52'); if (spin) { R(-24, -8, 3, 5, '#ff7a1c'); R(21, -8, 3, 5, '#ff7a1c'); } else { R(-24, -6, 3, 3, '#ffd166'); R(21, -6, 3, 3, '#ffd166'); }   // egzoz boruları — alov püskürür
        R(-1, -36, 2, 22, '#5a4a4a'); R(-9, -16, 3, 8, '#8a8a8a'); R(6, -16, 3, 8, '#8a8a8a');                                    // zəncir bucurğadı
        return;
      }
      if (kind === 'me') {
        // Jackal-ın maşını: uzun kapot, üstündə kəllə, sümük dişli bamper, yan egzozlar, açıq salon
        wheel(-11, -11, 3, 8); wheel(8, -11, 3, 8); wheel(-12, 5, 4, 9); wheel(8, 5, 4, 9);
        R(-8, -17, 16, 34, ink);
        R(-7, -16, 14, 32, '#e8dcc0'); R(-7, -16, 3, 32, '#f6eedc'); R(4, -16, 3, 32, '#b9a98a');
        R(-5, -15, 10, 11, '#d8caa8'); R(-1, -15, 2, 11, '#b9a98a');                                                               // kapot
        R(-2, -12, 4, 4, ink); R(-1, -11, 2, 2, '#f6e7c8'); R(-1, -10, 1, 1, ink);                                                 // kapotdakı kəllə
        R(-6, -4, 12, 9, ink); R(-5, -3, 10, 2, '#7ab8c8'); R(-5, -1, 10, 6, '#2a1c1c');                                           // şüşə və salon
        R(-3, 0, 5, 4, '#e8301a'); R(-3, 0, 5, 1, '#ff5a3a'); R(-2, -1, 3, 1, '#4a3a30');                                          // Ember: qırmızı saç, eynək
        R(2, 1, 2, 2, '#d9b06a');                                                                                                  // yan oturacaqda maska
        R(-6, 6, 12, 8, '#d8caa8'); R(-5, 8, 10, 1, '#b9a98a'); R(-5, 11, 10, 1, '#b9a98a');                                       // baqaj
        for (const sx of [-7, -3, 1, 5]) R(sx, -19, 2, 3, '#f6e7c8');                                                              // sümük dişlər
        R(-9, -19, 2, 4, '#f6e7c8'); R(7, -19, 2, 4, '#f6e7c8'); R(-6, -17, 3, 2, '#fff6c0'); R(3, -17, 3, 2, '#fff6c0');          // buynuzlar və faralar
        R(-10, -2, 2, 12, '#5a5258'); R(8, -2, 2, 12, '#5a5258'); R(-10, 10, 2, 2, spin ? '#ff7a1c' : '#3a3438'); R(8, 10, 2, 2, spin ? '#3a3438' : '#ff7a1c');   // yan egzozlar
        R(-6, 15, 4, 2, '#ff3b2e'); R(2, 15, 4, 2, '#ff3b2e');
        if (G.hp < 60) { R(-4, -13, 3, 2, '#5a4a40'); R(2, -8, 2, 3, '#5a4a40'); R(-6, 8, 2, 2, '#5a4a40'); }                      // əziklər
        if (G.hp < 30) { const f = Math.floor(G.t * 14); R(-3 + (f % 3), -16 - (f % 4), 3, 5, '#ff7a1c'); R(1 - (f % 2), -14 - (f % 3), 2, 4, '#ffd166'); }   // kapot alışıb
        return;
      }
      // təqibçilər — üç növ
      const hot = fl ? '#fff0b0' : null;
      if (v === 0) {         // tikanlı sedan: zireh lövhələri, qırmızı zolaq
        wheel(-10, -10); wheel(7, -10); wheel(-10, 5); wheel(7, 5);
        R(-8, -15, 16, 30, ink); R(-7, -14, 14, 28, hot || '#3a3438'); R(-7, -14, 3, 28, hot || '#4a444a'); R(-1, -14, 2, 28, '#b3261e');
        R(-5, -6, 10, 6, ink); R(-4, -5, 8, 2, '#5a7a8a'); R(-4, 4, 8, 4, '#1c1418');
        R(-7, -10, 14, 1, '#6a6a72'); R(-7, 9, 14, 1, '#6a6a72');
        for (const sx of [-8, -4, 0, 4]) R(sx + 1, -18, 2, 4, '#b9b9c4');
        R(-10, -6, 2, 3, '#b9b9c4'); R(8, -6, 2, 3, '#b9b9c4'); R(-10, 2, 2, 3, '#b9b9c4'); R(8, 2, 2, 3, '#b9b9c4');             // yan tikanlar
      } else if (v === 1) {  // baqqi: boru karkas, iri təkərlər
        wheel(-12, -12, 4, 9); wheel(8, -12, 4, 9); wheel(-12, 4, 4, 9); wheel(8, 4, 4, 9);
        R(-6, -14, 12, 28, ink); R(-5, -13, 10, 26, hot || '#5a4a2a'); R(-5, -13, 10, 3, hot || '#7a6a3a');
        R(-7, -6, 14, 2, '#8a8a8a'); R(-7, 6, 14, 2, '#8a8a8a'); R(-7, -6, 2, 14, '#8a8a8a'); R(5, -6, 2, 14, '#8a8a8a');         // karkas
        R(-3, -3, 6, 6, '#1c1418'); R(-2, -1, 4, 3, '#b88a6a'); R(-2, -2, 4, 1, '#2a2628');                                       // sürücü
        R(-4, -17, 3, 3, '#fff0b0'); R(1, -17, 3, 3, '#fff0b0'); R(-2, 10, 4, 5, '#3a3438'); R(-1, 14, 2, 2, spin ? '#ff7a1c' : '#ffd166');
      } else {               // pikap: arxada alovlu məşəl
        wheel(-10, -10); wheel(7, -10); wheel(-10, 6); wheel(7, 6);
        R(-8, -15, 16, 31, ink); R(-7, -14, 14, 12, hot || '#6a2a20'); R(-7, -14, 3, 12, hot || '#8a3a2c');
        R(-5, -5, 10, 6, ink); R(-4, -4, 8, 2, '#5a7a8a');
        R(-7, 2, 14, 13, hot || '#4a3a34'); R(-6, 3, 12, 11, '#2a2024'); R(-5, 4, 4, 4, '#8a3a1c'); R(1, 8, 4, 4, '#8a3a1c');     // yük yeri, çəlləklər
        { const f = Math.floor(G.t * 12 + cx0); R(-1 + (f % 2), -1 - (f % 3) + 4, 3, 5, '#ff7a1c'); R(0, 4, 1, 3, '#ffd166'); }
        for (const sx of [-7, -2, 3]) R(sx + 1, -18, 3, 4, '#8a8a8a');
      }
      R(-6, -16, 3, 2, '#ffe9a0'); R(3, -16, 3, 2, '#ffe9a0'); R(-6, 14, 3, 1, '#ff3b2e'); R(3, 14, 3, 1, '#ff3b2e');
    }

    // ——— MƏNZƏRƏ: yol kənarı əşyaları məsafə xanasının hash-indən yaranır (hər keçidə eyni yerdə) ———
    const hsh = (a, b) => { let n = (a * 374761393 + b * 668265263) >>> 0; n = ((n ^ (n >> 13)) * 1274126177) >>> 0; return (n ^ (n >> 16)) >>> 0; };
    const P = (px, py, w, h, c) => { x.fillStyle = c; x.fillRect(Math.round(px), Math.round(py), w, h); };
    function prop(kind, px, py, hh) {
      const f = Math.floor(G.t * 9 + hh);
      if (kind === 'tent') { P(px - 12, py - 8, 24, 16, '#12080c'); P(px - 11, py - 7, 22, 14, '#6a5238'); P(px - 11, py - 7, 11, 14, '#7a6244'); P(px - 1, py - 7, 2, 14, '#3a2a1e'); for (let i = 0; i < 5; i++) P(px - 9 + i * 4 + (f + i) % 3, py - 12 - ((f + i * 2) % 6), 3, 6 + ((f + i) % 4), ['#ffd166', '#ff7a1c', '#b3261e'][(f + i) % 3]); }
      else if (kind === 'debris') { P(px - 6, py - 3, 12, 6, '#12080c'); P(px - 5, py - 2, 10, 4, '#4a3a30'); P(px - 2 + f % 3, py - 7 - f % 3, 3, 5, '#ff7a1c'); }
      else if (kind === 'boulder') { const r2 = 5 + hh % 6; P(px - r2 - 1, py - r2, r2 * 2 + 2, r2 * 2, '#1e0c0a'); P(px - r2, py - r2 + 1, r2 * 2, r2 * 2 - 2, '#7a3a2c'); P(px - r2, py - r2 + 1, r2 * 2, 2, '#9a5240'); P(px + r2 - 3, py - r2 + 3, 3, r2 * 2 - 5, '#5a2620'); }
      else if (kind === 'cactus') { P(px - 2, py - 10, 4, 12, '#12080c'); P(px - 1, py - 9, 2, 10, '#3f7a3a'); P(px - 5, py - 6, 3, 2, '#3f7a3a'); P(px - 5, py - 8, 2, 3, '#3f7a3a'); P(px + 2, py - 4, 3, 2, '#3f7a3a'); P(px + 3, py - 7, 2, 4, '#3f7a3a'); }
      else if (kind === 'deadtree') { P(px - 1, py - 14, 2, 16, '#0c140e'); P(px - 6, py - 12, 5, 1, '#0c140e'); P(px - 6, py - 15, 1, 4, '#0c140e'); P(px + 1, py - 9, 6, 1, '#0c140e'); P(px + 6, py - 13, 1, 5, '#0c140e'); P(px + 2, py - 16, 1, 4, '#0c140e'); }
      else if (kind === 'pipe') { P(px - 10, py - 3, 20, 6, '#0c140e'); P(px - 9, py - 2, 18, 4, '#3a4a3e'); P(px - 9, py - 2, 18, 1, '#5a6a5a'); P(px + 6, py - 6, 3, 3, `rgba(120,220,90,${0.3 + (f % 3) * 0.15})`); }
      else if (kind === 'sign') { P(px, py - 12, 1, 14, '#8a8a8a'); P(px - 5, py - 16, 11, 7, '#12080c'); P(px - 4, py - 15, 9, 5, hh % 2 ? '#ffb53a' : '#c9a98a'); P(px - 2, py - 13, 5, 1, '#12080c'); }
      else if (kind === 'wreck') { P(px - 8, py - 12, 16, 24, '#12080c'); P(px - 7, py - 11, 14, 22, '#4a3a34'); P(px - 5, py - 5, 10, 6, '#1c1418'); P(px - 7, py - 11, 14, 3, '#6a4a3a'); P(px - 3, py + 4, 6, 3, '#2a1a18'); }
      else if (kind === 'pole') { P(px, py - 18, 2, 20, '#12080c'); P(px - 5, py - 17, 12, 2, '#12080c'); P(px - 4, py + 1, 10, 2, 'rgba(0,0,0,0.3)'); }
      else if (kind === 'dune') { P(px - 14, py, 28, 2, 'rgba(255,220,170,0.07)'); P(px - 9, py + 3, 18, 1, 'rgba(0,0,0,0.18)'); }
      else if (kind === 'truss') { P(px - 1, py - 2, 3, 4, '#2a1c12'); P(px - 9, py - 1, 18, 2, '#6a4a2c'); }
    }
    function scenery() {
      const c0 = Math.floor((G.d - 80) / 34), c1 = Math.floor((G.d + PY + 40) / 34);
      for (let c = c1; c >= c0; c--) {
        const dd = c * 34, y = PY - (dd - G.d), rc = cxAt(dd), w2 = S.hw(dd);
        for (const side of [-1, 1]) {
          const h1 = hsh(c, side + 7 + si * 13), off = 14 + (h1 % 150), px = rc + side * (w2 + off), kind = h1 % 100;
          if (px < -20 || px > W + 20) continue;
          // torpağın toxuması: xırda ləkələr
          for (let k = 0; k < 3; k++) { const h2 = hsh(c * 5 + k, side + si * 31); P(rc + side * (w2 + 6 + (h2 % 190)), y + (h2 >> 8) % 30, 2, 1, (h2 >> 4) % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.2)'); }
          if (S.id === 'camp') { if (kind < 22) prop('tent', px, y, h1); else if (kind < 50) prop('debris', px, y, h1); else if (kind < 60) prop('pole', px, y, h1); }
          else if (S.id === 'canyon') { if (kind < 46) prop('boulder', px, y, h1); else if (kind < 58) prop('cactus', px, y, h1); }
          else if (S.id === 'fog') { if (kind < 30) prop('deadtree', px, y, h1); else if (kind < 44) prop('pipe', px, y, h1); else if (kind < 52) prop('wreck', px, y, h1); }
          else if (S.id === 'truck') { if (kind < 14) prop('cactus', px, y, h1); else if (kind < 22) prop('sign', rc + side * (w2 + 8), y, h1); else if (kind < 30) prop('wreck', px, y, h1); else if (kind < 42) prop('pole', rc + side * (w2 + 14), y, h1); else if (kind < 80) prop('dune', px, y, h1); }
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
      for (let y = 0; y < H; y += 2) {
        const dd = G.d + (PY - y), c = cxAt(dd), w2 = S.hw(dd), cell = Math.floor(dd / 16);
        if (S.walls) {
          // qaya divarı: yolun dibində kölgə, sonra pilləli qatlar (yuxarı getdikcə açılır), kənarı dişlidir
          const jag = hsh(Math.floor(dd / 6), 3) % 5;
          for (const sd of [-1, 1]) { const e0 = c + sd * w2; for (const [o0, o1, col] of [[0, 7 + jag, '#1e0c0a'], [7 + jag, 22 + jag, '#4a1c16'], [22 + jag, 46, (cell % 3) ? '#6a2e24' : '#5e2820'], [46, 90, (cell % 4) ? '#84402e' : '#7a3a2a'], [90, 400, (cell % 5) ? '#9a5238' : '#8e4a32']]) { x.fillStyle = col; if (sd < 0) x.fillRect(e0 - o1, y, o1 - o0, 2); else x.fillRect(e0 + o0, y, o1 - o0, 2); } }
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
        if (S.id === 'camp' && cell % 5 === 0) { const hq = (cell * 7919) % 97; x.fillStyle = ['#ffd166', '#ff7a1c', '#b3261e'][(cell + Math.floor(G.t * 9)) % 3]; x.fillRect(c - w2 - 14 - hq % 40, y, 4, 4); x.fillRect(c + w2 + 10 + (hq * 3) % 44, y, 4, 4); }
        if (S.fog && cell % 3 === 0) { x.fillStyle = '#e8ffd0'; x.fillRect(c - w2 - 1, y, 2, 2); x.fillRect(c + w2 - 1, y, 2, 2); }
      }
      scenery();
      // faraların işığı (gecə): maşının qabağında iki açıq zolaq
      if (!S.fog && !G.dead) {
        x.globalCompositeOperation = 'lighter';
        for (const [len, wide, al] of [[120, 46, 0.05], [84, 30, 0.06], [46, 18, 0.08]]) { x.fillStyle = `rgba(255,225,160,${al})`; x.beginPath(); x.moveTo(G.x - 6, PY - 14); x.lineTo(G.x + 6, PY - 14); x.lineTo(G.x + wide, PY - 14 - len); x.lineTo(G.x - wide, PY - 14 - len); x.closePath(); x.fill(); }
        x.globalCompositeOperation = 'source-over';
      }
      // varlıqlar
      for (const e of G.ents) {
        const sy = Math.round(PY - (e.d - G.d)); if (sy < -50 || sy > H + 50) continue;
        if (e.k === 'rock') {
          const f = Math.floor(G.t * 10 + e.d), kind = e.wreck ? 3 : e.plank ? 2 : (Math.floor(e.d) % 3);
          P(e.x - 10, sy + 6, 20, 3, 'rgba(0,0,0,0.3)');
          if (kind === 3) {            // qəzalı maşın karkası
            P(e.x - 8, sy - 12, 16, 24, '#12080c'); P(e.x - 7, sy - 11, 14, 22, '#4a4a52'); P(e.x - 7, sy - 11, 3, 22, '#5a5a62'); P(e.x - 5, sy - 4, 10, 6, '#1c1418'); P(e.x - 7, sy - 11, 14, 3, '#3a3a40'); P(e.x - 9, sy - 8, 2, 5, '#1c1418'); P(e.x + 7, sy + 3, 2, 5, '#1c1418'); P(e.x - 2, sy + 5, 5, 3, '#6a3a2a');
          } else if (kind === 2) {     // körpüdə qopmuş taxtalar
            P(e.x - 9, sy - 4, 18, 9, '#12080c'); P(e.x - 8, sy - 3, 16, 3, '#7a5a34'); P(e.x - 6, sy + 1, 14, 3, '#6a4a2c'); P(e.x - 8, sy - 3, 16, 1, '#9a7a4a'); P(e.x - 2, sy - 6, 2, 12, '#3a2a1e'); P(e.x + 5, sy - 5, 1, 9, '#b9b9c4');
          } else if (kind === 1) {     // təkər yığını
            for (const [ox, oy] of [[-5, 2], [5, 3], [0, -5]]) { P(e.x + ox - 6, sy + oy - 5, 12, 10, '#12080c'); P(e.x + ox - 5, sy + oy - 4, 10, 8, '#2a2428'); P(e.x + ox - 2, sy + oy - 2, 4, 4, '#12080c'); P(e.x + ox - 5, sy + oy - 4, 10, 1, '#4a4448'); }
          } else if (kind === 0) {     // sipər: çarpaz tirlər və tikanlar
            P(e.x - 10, sy - 5, 20, 10, '#12080c'); P(e.x - 9, sy - 4, 18, 3, '#6a4a2c'); P(e.x - 9, sy + 1, 18, 3, '#5a3e24'); P(e.x - 9, sy - 4, 18, 1, '#8a6a44'); for (let i = -8; i <= 6; i += 5) { P(e.x + i, sy - 8, 2, 4, '#b9b9c4'); P(e.x + i, sy + 4, 2, 4, '#8a8a8a'); }
          } else {                     // qaya
            P(e.x - e.r - 1, sy - e.r, e.r * 2 + 2, e.r * 2, '#12080c'); P(e.x - e.r, sy - e.r + 1, e.r * 2, e.r * 2 - 2, '#6a5a52'); P(e.x - e.r, sy - e.r + 1, e.r * 2, 3, '#8a7a70'); P(e.x + e.r - 4, sy - e.r + 4, 4, e.r * 2 - 6, '#4a3e3a'); P(e.x - 3, sy - 1, 5, 1, '#3a302c');
          }
          if (e.fire) { for (let i = 0; i < 4; i++) P(e.x - 6 + i * 4 + (f + i) % 2, sy - 10 - ((f + i * 2) % 5), 3, 6 + ((f + i) % 3), ['#ffd166', '#ff7a1c', '#fff0b0', '#b3261e'][(f + i) % 4]); }
        }
        else if (e.k === 'fuel' || e.k === 'nitro' || e.k === 'fix') {
          const bb = Math.round(Math.sin(G.t * 6 + e.d) * 1.5), py = sy + bb;
          x.fillStyle = e.k === 'fuel' ? 'rgba(255,180,60,0.22)' : e.k === 'nitro' ? 'rgba(90,180,255,0.22)' : 'rgba(120,220,130,0.22)'; x.beginPath(); x.arc(e.x, sy, 12 + Math.sin(G.t * 5 + e.d) * 2, 0, 7); x.fill();
          if (e.k === 'fuel') { P(e.x - 6, py - 8, 12, 15, '#12080c'); P(e.x - 5, py - 7, 10, 13, '#c9281a'); P(e.x - 5, py - 7, 3, 13, '#e8442c'); P(e.x - 2, py - 10, 5, 3, '#12080c'); P(e.x - 1, py - 9, 3, 1, '#8a8a8a'); P(e.x - 3, py - 3, 6, 1, '#12080c'); P(e.x - 3, py - 1, 6, 5, '#ffd166'); P(e.x - 1, py, 2, 3, '#c9281a'); }
          else if (e.k === 'nitro') { P(e.x - 4, py - 9, 8, 17, '#12080c'); P(e.x - 3, py - 6, 6, 13, '#2a7ad8'); P(e.x - 3, py - 6, 2, 13, '#5aa8ff'); P(e.x - 2, py - 9, 4, 3, '#b9b9c4'); P(e.x - 3, py - 1, 6, 4, '#fff'); P(e.x - 1, py - 1, 2, 1, '#2a7ad8'); P(e.x - 2, py + 1, 2, 1, '#2a7ad8'); P(e.x, py + 2, 2, 1, '#2a7ad8'); }
          else { P(e.x - 7, py - 6, 14, 12, '#12080c'); P(e.x - 6, py - 5, 12, 10, '#e8dcc0'); P(e.x - 6, py - 5, 12, 2, '#fff'); P(e.x - 1, py - 4, 2, 8, '#c9281a'); P(e.x - 4, py - 1, 8, 2, '#c9281a'); }
        }
        else if (e.k === 'pole') { if (e.x0 === undefined) continue; if (e.warn > 0) { if (Math.floor(G.t * 12) % 2) { x.fillStyle = 'rgba(255,60,40,0.4)'; x.fillRect(e.x0, sy - 4, e.x1 - e.x0, 8); } } else { P(e.x0, sy + 5, e.x1 - e.x0, 3, 'rgba(0,0,0,0.3)'); P(e.x0, sy - 5, e.x1 - e.x0, 10, '#12080c'); P(e.x0, sy - 4, e.x1 - e.x0, 7, '#6a4a2c'); P(e.x0, sy - 4, e.x1 - e.x0, 2, '#8a6a44'); for (let px = e.x0 + 10; px < e.x1 - 6; px += 22) { P(px, sy - 4, 2, 7, '#3a2a1e'); } const end = e.side < 0 ? e.x1 - 8 : e.x0; P(end, sy - 9, 8, 18, '#12080c'); P(end + 1, sy - 8, 6, 16, '#5a3e24'); P(end + 2, sy - 11, 1, 5, '#1c1418'); P(end + 5, sy + 6, 1, 6, '#1c1418'); for (let px = e.x0 + 6; px < e.x1 - 4; px += 12) { const f = Math.floor(G.t * 9 + px); P(px + (f % 3), sy - 9 - (f % 3), 4, 6, ['#ff7a1c', '#ffd166', '#b3261e'][f % 3]); } } }
        else if (e.k === 'chaser') { if (e.st === 'sleep') continue; if (e.st === 'aim' && Math.floor(G.t * 16) % 2) { x.fillStyle = 'rgba(255,60,40,0.5)'; x.fillRect(Math.min(e.x, G.x), sy - 2, Math.abs(e.x - G.x), 4); } car(e.x, sy, 'foe', e.vx * 0.02, 1, e.v || 0, e.st === 'aim' && Math.floor(G.t * 16) % 2 === 0); }
        else if (e.k === 'cloud') { for (let i = 0; i < 6; i++) { const a = i * 1.05 + G.t * 0.4, rr = e.r * 0.5; x.fillStyle = `rgba(120,220,90,${0.2 + (i % 3) * 0.06})`; x.beginPath(); x.arc(e.x + Math.cos(a) * rr, sy + Math.sin(a) * rr * 0.7, e.r * 0.62, 0, 7); x.fill(); } }
        else if (e.k === 'barrel') { const ro = Math.floor(e.rot || 0) % 4; P(e.x - 8, sy + 6, 16, 2, 'rgba(0,0,0,0.3)'); P(e.x - 8, sy - 7, 16, 14, '#12080c'); P(e.x - 7, sy - 6, 14, 12, '#8a3a1c'); P(e.x - 7, sy - 6, 14, 2, '#b0502a'); P(e.x - 7, sy - 6 + ro * 3, 14, 2, '#c9a98a'); P(e.x - 7, sy - 6 + ((ro + 2) % 4) * 3, 14, 1, '#5a2410'); P(e.x - 2, sy - 2, 4, 4, '#ffb53a'); P(e.x - 1, sy - 1, 2, 2, '#12080c'); if (Math.floor(G.t * 10) % 2) P(e.x - 1, sy - 10, 2, 3, '#ff7a1c'); }
        else if (e.k === 'chain') { const c = cxAt(e.d), w2 = S.hw(e.d), on = e.tt > 0.9; if (!on && Math.floor(G.t * 12) % 2 === 0) continue; if (!on) { P(c - w2, sy - 2, Math.max(0, e.gap - 22 - (c - w2)), 5, 'rgba(255,60,40,0.5)'); P(e.gap + 22, sy - 2, Math.max(0, c + w2 - e.gap - 22), 5, 'rgba(255,60,40,0.5)'); P(e.gap - 4, sy - 7, 8, 14, '#7fbf7a'); P(e.gap - 1, sy - 4, 2, 6, '#12080c'); P(e.gap - 3, sy - 1, 6, 2, '#12080c'); }
          else { for (const [a0, a1] of [[c - w2, e.gap - 22], [e.gap + 22, c + w2]]) { for (let lx = a0; lx < a1 - 4; lx += 6) { P(lx, sy - 3, 6, 6, '#12080c'); P(lx + 1, sy - 2, 4, 4, (Math.floor(lx / 6) % 2) ? '#b9b9c4' : '#8a8a96'); P(lx + 2, sy - 1, 2, 2, '#12080c'); } } P(e.gap - 26, sy - 5, 5, 10, '#d8d8e0'); P(e.gap + 21, sy - 5, 5, 10, '#d8d8e0'); } }
      }
      if (S.id === 'truck') { const T = G.truck, ty = T.pass ? 46 + T.pass * 260 : 46; if (ty < H + 60) car(T.x, ty, 'truck'); }
      if (S.id === 'bridge') for (const b of G.bikes) { if (G.hook === b) { x.strokeStyle = '#c9a98a'; x.lineWidth = 1; x.beginPath(); x.moveTo(b.x, PY - 2); x.lineTo(G.x, PY); x.stroke(); } car(b.x, PY + b.off, 'bike'); }
      // nitro: ekran boyu sürət xətləri
      if (G.boost > 0 || G.jump > 0) { x.fillStyle = 'rgba(255,255,255,0.22)'; for (let k = 0; k < 14; k++) { const hx = hsh(k, Math.floor(G.t * 30)) % W, hy = (hsh(k + 40, Math.floor(G.t * 30)) % H); x.fillRect(hx, hy, 1, 14 + (k % 3) * 8); } }
      // hissəciklər
      for (const p of G.parts) { x.fillStyle = p.c; x.globalAlpha = Math.max(0, p.a); x.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
      x.globalAlpha = 1;
      // oyunçu (tullanışda böyüyür və kölgəsi ayrılır)
      if (!(G.dead && G.dead < 1.2)) {
        const j = G.jump > 0 ? Math.sin((1 - G.jump / 1.25) * Math.PI) : 0;
        if (j > 0) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(G.x - 7, PY - 6 + j * 18, 14, 22); }
        if (G.boost > 0) { const f = Math.floor(G.t * 20) % 2; x.fillStyle = '#5ab4ff'; x.fillRect(G.x - 6, PY + 13, 3, 6 + f * 4); x.fillRect(G.x + 3, PY + 13, 3, 6 + (1 - f) * 4); x.fillStyle = '#fff'; x.fillRect(G.x - 5, PY + 13, 1, 4); x.fillRect(G.x + 4, PY + 13, 1, 4); }
        car(G.x, PY - j * 16, 'me', G.vx * 0.03, 1 + j * 0.35);
      }
      // duman: maşının ətrafında görünən dairə
      if (S.fog) { fx.globalCompositeOperation = 'source-over'; fx.clearRect(0, 0, W, H); fx.fillStyle = 'rgba(14,34,20,0.93)'; fx.fillRect(0, 0, W, H); fx.globalCompositeOperation = 'destination-out'; const g = fx.createRadialGradient(G.x, PY - 26, 16, G.x, PY - 26, 92); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)'); fx.fillStyle = g; fx.fillRect(0, 0, W, H); x.drawImage(fogCv, 0, 0);
        for (let y = 0; y < H; y += 2) { const dd = G.d + (PY - y); if (Math.floor(dd / 16) % 3 === 0) { const c = cxAt(dd), w2 = S.hw(dd); x.fillStyle = 'rgba(220,255,190,0.55)'; x.fillRect(c - w2 - 1, y, 2, 2); x.fillRect(c + w2 - 1, y, 2, 2); } } }
      if (G.flash > 0) { x.fillStyle = `rgba(200,30,20,${Math.min(0.4, G.flash * 2)})`; x.fillRect(-10, -10, W + 20, H + 20); }
      x.setTransform(1, 0, 0, 1, 0, 0);
    }

    function loop(now) {
      if (over) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      step(dt);
      for (const p of G.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.a -= dt * 1.8; }
      if (G.parts.length > 260) G.parts.splice(0, G.parts.length - 260);
      G.parts = G.parts.filter((p) => p.a > 0);
      G.shake *= 1 - Math.min(1, dt * 7); G.flash = Math.max(0, G.flash - dt);
      draw();
      hpBar.style.width = Math.max(0, G.hp) + '%'; fuelBar.style.width = Math.max(0, G.fuel) + '%';
      fuelBar.parentNode.classList.toggle('is-low', G.fuel < 25); hpBar.parentNode.classList.toggle('is-low', G.hp < 30);
      const nt = '⚡'.repeat(Math.max(0, G.nitro)); if (nitroEl.textContent !== nt) nitroEl.textContent = nt;
      prog.style.width = Math.min(100, (G.d / S.len) * 100) + '%';
    }

    function finish() { stop(); resolve(); }
    function stop() { over = true; cancelAnimationFrame(raf); removeEventListener('keydown', kd); removeEventListener('keyup', ku); clearTimeout(say.tm); ui.remove(); ch._chase = null; x.setTransform(1, 0, 0, 1, 0, 0); }
    ch._chase = { stop, keys, get G() { return G; }, get S() { return S; }, get si() { return si; }, SECTIONS, nitro, start, skip: () => { G.won = 0.05; } };
    start(startSec);
    raf = requestAnimationFrame(loop);
  });
}
