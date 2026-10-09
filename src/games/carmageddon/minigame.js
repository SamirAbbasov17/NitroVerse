// CARMAGEDDON — düşərgə tapşırıqlarının kiçik oyunları (tapşırıq yalnız "get-gətir" olmasın).
//   timing — göstərici zolaq boyu gedib-gəlir; yaşıl zonada olanda bas (E / boşluq / toxun). Hər uğurda zona
//            daralır və göstərici sürətlənir. Uduzmaq yoxdur — səhv basış sadəcə sayılmır.
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
