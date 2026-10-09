// CARMAGEDDON — düşərgə tapşırıqlarının kiçik oyunları (tapşırıq yalnız "get-gətir" olmasın).
//   timing — göstərici zolaq boyu gedib-gəlir; yaşıl zonada olanda bas (E / boşluq / toxun). Hər uğurda zona
//            daralır və göstərici sürətlənir. Uduzmaq yoxdur — səhv basış sadəcə sayılmır.
//   pattern — yaddaş: ləklər sıra ilə yanır, eyni sıranı təkrarla (toxum əkmək).
//   shuffle — üç çəllək qarışır, Pip-in arxasında gizləndiyini tap.
//   tuning — əqrəbi ◀ ▶ ilə çevirib gizli dalğanı tap; siqnal zolağı yaxınlığı göstərir, dalğada bir müddət
//            qalanda tutulur. Dalğa arada yerini dəyişir.
// Hər ikisi fasiləni (ch.paused) nəzərə alır və bitəndə həll olunan söz (promise) qaytarır.
import { audio } from '../../core/AudioManager.js';

function shell(ch, cls, title, hint, body) {
  const el = document.createElement('div');
  el.className = 'cgm ' + cls;
  el.innerHTML = `<div class="cgm__box"><b class="cgm__title">${title}</b>${body}<span class="cgm__hint">${hint}</span></div>`;
  ch.el.appendChild(el);
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  return el;
}

export function timing(ch, { title, hint, rounds = 3 }) {
  return new Promise((resolve) => {
    const el = shell(ch, 'cgm--timing', title, hint, `<div class="cgm__bar"><i class="cgm__zone"></i><i class="cgm__mark"></i></div><div class="cgm__pips">${'<i></i>'.repeat(rounds)}</div><button type="button" class="cgm__btn">●</button>`);
    const zone = el.querySelector('.cgm__zone'), mark = el.querySelector('.cgm__mark'), pips = [...el.querySelectorAll('.cgm__pips i')], box = el.querySelector('.cgm__box');
    let n = 0, pos = 0.1, dir = 1, z0 = 0.5, zw = 0.24, speed = 0.75, raf = 0, last = performance.now(), lock = 0, over = false;
    const place = () => { z0 = 0.12 + Math.random() * (0.76 - zw); zone.style.left = z0 * 100 + '%'; zone.style.width = zw * 100 + '%'; };
    const loop = (now) => {
      if (over) return; raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (ch.paused || ch.dead) return;
      lock = Math.max(0, lock - dt);
      pos += dir * speed * dt; if (pos > 1) { pos = 1; dir = -1; } if (pos < 0) { pos = 0; dir = 1; }
      mark.style.left = pos * 100 + '%';
    };
    const hit = () => {
      if (over || lock > 0 || ch.paused) return;
      const ok = pos >= z0 && pos <= z0 + zw;
      box.classList.remove('is-ok', 'is-bad'); void box.offsetWidth; box.classList.add(ok ? 'is-ok' : 'is-bad');
      audio.sfx(ok ? 'click' : 'discard');
      lock = 0.28;
      if (!ok) return;
      pips[n].classList.add('is-on'); n++;
      if (n >= rounds) { over = true; setTimeout(done, 520); return; }
      zw = Math.max(0.12, zw - 0.045); speed += 0.22; place();
    };
    const onKey = (e) => { if (['KeyE', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) hit(); } };
    addEventListener('keydown', onKey, true);
    el.querySelector('.cgm__btn').addEventListener('pointerdown', (e) => { e.preventDefault(); hit(); });
    el.querySelector('.cgm__bar').addEventListener('pointerdown', (e) => { e.preventDefault(); hit(); });
    const stop = () => { over = true; cancelAnimationFrame(raf); removeEventListener('keydown', onKey, true); el.remove(); ch._mini = null; };
    function done() { stop(); resolve(); }
    ch._mini = { stop, hit, get state() { return { kind: 'timing', n, rounds, pos, z0, zw }; } };
    place();
    raf = requestAnimationFrame(loop);
  });
}

export function tuning(ch, { title, hint }) {
  return new Promise((resolve) => {
    const el = shell(ch, 'cgm--tuning', title, hint, `<div class="cgm__dial"><i class="cgm__needle"></i></div><div class="cgm__sig"><i></i></div><div class="cgm__lock"><i></i></div><div class="cgm__lr"><button type="button" data-d="-1">◀</button><button type="button" data-d="1">▶</button></div>`);
    const needle = el.querySelector('.cgm__needle'), sig = el.querySelector('.cgm__sig i'), lockBar = el.querySelector('.cgm__lock i'), box = el.querySelector('.cgm__box');
    let pos = 0.5, target = Math.random() < 0.5 ? 0.16 + Math.random() * 0.16 : 0.68 + Math.random() * 0.16, held = 0, moves = 0, raf = 0, last = performance.now(), over = false, tick = 0;
    const keys = new Set();
    const loop = (now) => {
      if (over) return; raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (ch.paused || ch.dead) return;
      const d = (keys.has(1) ? 1 : 0) - (keys.has(-1) ? 1 : 0);
      pos = Math.max(0, Math.min(1, pos + d * 0.34 * dt));
      const off = Math.abs(pos - target), s = Math.max(0, 1 - off / 0.3);
      needle.style.left = pos * 100 + '%';
      sig.style.width = Math.round((s * s) * 100) + '%';
      box.classList.toggle('is-near', off < 0.045);
      if (off < 0.045) { held += dt; tick += dt; if (tick > 0.22) { tick = 0; audio.sfx('click'); } } else held = Math.max(0, held - dt * 0.6);
      lockBar.style.width = Math.min(100, (held / 1.3) * 100) + '%';
      if (held >= 1.3) {
        if (moves < 1) { moves++; held = 0; target = target < 0.5 ? 0.62 + Math.random() * 0.24 : 0.14 + Math.random() * 0.24; box.classList.remove('is-ok'); void box.offsetWidth; box.classList.add('is-ok'); }   // dalğa qaçır — bir də tut
        else { over = true; audio.sfx('pickup'); setTimeout(done, 480); }
      }
    };
    const KEY = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
    const kd = (e) => { const k = KEY[e.code]; if (k) { e.preventDefault(); e.stopPropagation(); keys.add(k); } else if (['KeyE', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); } };
    const ku = (e) => { const k = KEY[e.code]; if (k) keys.delete(k); };
    const blur = () => keys.clear();
    addEventListener('keydown', kd, true); addEventListener('keyup', ku, true); addEventListener('blur', blur);
    el.querySelectorAll('[data-d]').forEach((b) => {
      const k = +b.dataset.d;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* boş */ } keys.add(k); b.classList.add('is-on'); });
      const up = () => { keys.delete(k); b.classList.remove('is-on'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    });
    const stop = () => { over = true; cancelAnimationFrame(raf); removeEventListener('keydown', kd, true); removeEventListener('keyup', ku, true); removeEventListener('blur', blur); el.remove(); ch._mini = null; };
    function done() { stop(); resolve(); }
    ch._mini = { stop, keys, get state() { return { kind: 'tuning', pos, target, held, moves }; } };
    raf = requestAnimationFrame(loop);
  });
}

// pattern — yaddaş: dörd ləkdən bir neçəsi sıra ilə yanır; eyni sıranı təkrarla (oxlar / WASD və ya toxun).
//           Səhv olanda sıra yenidən göstərilir. rounds — hər turun uzunluğu, məs. [3, 4].
export function pattern(ch, { title, hint, rounds = [3, 4] }) {
  return new Promise((resolve) => {
    const el = shell(ch, 'cgm--pattern', title, hint, `<div class="cgm__plots">${['up', 'left', 'right', 'down'].map((k) => `<button type="button" data-p="${k}"><i></i></button>`).join('')}</div><div class="cgm__pips">${'<i></i>'.repeat(rounds.length)}</div>`);
    const box = el.querySelector('.cgm__box'), plots = Object.fromEntries([...el.querySelectorAll('[data-p]')].map((b) => [b.dataset.p, b])), pips = [...el.querySelectorAll('.cgm__pips i')];
    const NAMES = ['up', 'left', 'right', 'down'];
    let round = 0, seq = [], step = 0, showing = true, over = false; const timers = [];
    const later = (fn, ms) => { const id = setTimeout(() => { if (over) return; if (ch.paused) later(fn, 200); else fn(); }, ms); timers.push(id); };
    const flash = (k, cls = 'is-lit', ms = 330) => { const b = plots[k]; b.classList.add(cls); later(() => b.classList.remove(cls), ms); };
    function show() {
      showing = true; step = 0; box.classList.add('is-show');
      seq.forEach((k, i) => later(() => { flash(k); audio.sfx('click'); }, 500 + i * 560));
      later(() => { showing = false; box.classList.remove('is-show'); }, 500 + seq.length * 560);
    }
    function next() {
      seq = []; for (let i = 0; i < rounds[round]; i++) { let k; do { k = NAMES[Math.floor(Math.random() * 4)]; } while (k === seq[i - 1]); seq.push(k); }
      show();
    }
    function press(k) {
      if (over || showing || ch.paused) return;
      if (k === seq[step]) {
        flash(k, 'is-good', 260); audio.sfx('click'); plots[k].classList.add('is-sown'); step++;
        if (step >= seq.length) {
          pips[round].classList.add('is-on'); round++; showing = true;
          if (round >= rounds.length) { over = true; audio.sfx('pickup'); setTimeout(done, 600); return; }
          later(() => { Object.values(plots).forEach((b) => b.classList.remove('is-sown')); next(); }, 700);
        }
      } else {
        flash(k, 'is-wrong', 300); audio.sfx('discard'); box.classList.remove('is-bad'); void box.offsetWidth; box.classList.add('is-bad');
        showing = true; later(() => { Object.values(plots).forEach((b) => b.classList.remove('is-sown')); show(); }, 650);      // eyni sıra bir də göstərilir
      }
    }
    const KEY = { ArrowUp: 'up', KeyW: 'up', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down' };
    const onKey = (e) => { const k = KEY[e.code]; if (k) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) press(k); } else if (['KeyE', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); } };
    addEventListener('keydown', onKey, true);
    Object.entries(plots).forEach(([k, b]) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); press(k); }));
    const stop = () => { over = true; timers.forEach(clearTimeout); removeEventListener('keydown', onKey, true); el.remove(); ch._mini = null; };
    function done() { stop(); resolve(); }
    ch._mini = { stop, press, get state() { return { kind: 'pattern', round, seq: [...seq], step, showing }; } };
    next();
  });
}

// shuffle — "hansının arxasındadır?": Pip üç çəlləkdən birinin arxasına girir, çəlləklər bir neçə dəfə yer dəyişir;
//           sonda düz çəlləyi seç (◀ ▶ + E və ya toxun). Səhv seçəndə Pip gülür və çəlləklər yenidən qarışır.
export function shuffle(ch, { title, hint, swaps = 5 }) {
  return new Promise((resolve) => {
    const el = shell(ch, 'cgm--shuffle', title, hint, `<div class="cgm__row">${[0, 1, 2].map((i) => `<button type="button" class="cgm__barrel" data-b="${i}"><i class="cgm__pip"></i><span></span></button>`).join('')}</div>`);
    const box = el.querySelector('.cgm__box'), barrels = [...el.querySelectorAll('.cgm__barrel')];
    const slot = [0, 1, 2];                                    // çəllək i hansı yerdədir
    let where = Math.floor(Math.random() * 3), phase = 'peek', sel = 1, over = false, tries = 0; const timers = [];
    const later = (fn, ms) => { const id = setTimeout(() => { if (over) return; if (ch.paused) later(fn, 200); else fn(); }, ms); timers.push(id); };
    const place = () => barrels.forEach((b, i) => { b.style.setProperty('--slot', slot[i]); b.classList.toggle('is-sel', phase === 'pick' && slot[i] === sel); });
    function start() {
      phase = 'peek'; place();
      barrels.forEach((b, i) => b.classList.toggle('is-peek', i === where));
      later(() => { barrels.forEach((b) => b.classList.remove('is-peek', 'is-miss', 'is-found')); phase = 'mix'; mix(swaps + Math.min(2, tries)); }, 1100);
    }
    function mix(n) {
      if (!n) { phase = 'pick'; sel = 1; place(); return; }
      const a = Math.floor(Math.random() * 3); let b = (a + 1 + Math.floor(Math.random() * 2)) % 3;
      const ia = slot.indexOf(a), ib = slot.indexOf(b); slot[ia] = b; slot[ib] = a; place(); audio.sfx('click');
      later(() => mix(n - 1), Math.max(240, 430 - tries * 40));
    }
    function pick(s) {
      if (over || phase !== 'pick' || ch.paused) return;
      const i = slot.indexOf(s); phase = 'show';
      barrels.forEach((b) => b.classList.remove('is-sel'));
      if (i === where) { barrels[i].classList.add('is-found', 'is-peek'); audio.sfx('pickup'); over = true; setTimeout(done, 900); return; }
      tries++; barrels[i].classList.add('is-miss'); barrels[where].classList.add('is-peek'); audio.sfx('discard');
      box.classList.remove('is-bad'); void box.offsetWidth; box.classList.add('is-bad');
      later(() => { where = Math.floor(Math.random() * 3); start(); }, 1300);
    }
    const onKey = (e) => {
      if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD', 'KeyE', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); } else return;
      if (phase !== 'pick' || e.repeat) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { sel = Math.max(0, sel - 1); place(); } else if (e.code === 'ArrowRight' || e.code === 'KeyD') { sel = Math.min(2, sel + 1); place(); } else pick(sel);
    };
    addEventListener('keydown', onKey, true);
    barrels.forEach((b, i) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); pick(slot[i]); }));
    const stop = () => { over = true; timers.forEach(clearTimeout); removeEventListener('keydown', onKey, true); el.remove(); ch._mini = null; };
    function done() { stop(); resolve(); }
    ch._mini = { stop, pick, get state() { return { kind: 'shuffle', phase, at: slot[where], sel, tries }; } };
    start();
  });
}
