// CARMAGEDDON — Jackal ilə döyüş: vaxtında basılan düymələr.
// Hər vuruşda ekranda bir düymə və daralan halqa çıxır: halqa bitənə qədər düzgün düyməni bas.
// Səhv və ya gecikmə — bir can gedir, vuruş təkrarlanır; üç can bitsə döyüş əvvəldən başlayır.
// Klaviatura: ← → ↑ (və ya A D W) və E / boşluq (zərbə). Telefonda aşağıdakı dörd düymə.
import { t } from '../../core/i18n.js';
import { audio } from '../../core/AudioManager.js';
import { T } from './tx.js';

const GLYPH = { left: '◀', right: '▶', up: '▲', hit: '✊' };
const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', KeyE: 'hit', Space: 'hit', Enter: 'hit' };

export function runDuel(ch, beats) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'cgq';
    el.innerHTML = `
      <div class="cgq__hp"></div>
      <div class="cgq__mid"><div class="cgq__ring"><i></i><b></b></div><p class="cgq__text"></p></div>
      <div class="cgq__pad">${['left', 'up', 'hit', 'right'].map((k) => `<button type="button" data-k="${k}">${GLYPH[k]}</button>`).join('')}</div>`;
    ch.el.appendChild(el);
    const hpEl = el.querySelector('.cgq__hp'), ring = el.querySelector('.cgq__ring'), glyph = ring.querySelector('b'), bar = ring.querySelector('i'), text = el.querySelector('.cgq__text');
    let i = 0, hp = 3, tm = null, open = false, over = false;
    const drawHp = () => { hpEl.innerHTML = [0, 1, 2].map((k) => `<i class="${k < hp ? '' : 'is-gone'}"></i>`).join(''); };
    const time = () => Math.max(1.05, 1.9 - i * 0.12);                    // vuruşlar getdikcə sürətlənir
    function ask() {
      if (over || ch.paused) return;
      const b = beats[i];
      glyph.textContent = GLYPH[b.key];
      text.textContent = T(b.az);
      ring.className = 'cgq__ring'; void ring.offsetWidth;
      bar.style.animationDuration = time() + 's';
      ring.classList.add('is-run');
      open = true;
      clearTimeout(tm);
      tm = setTimeout(() => answer(null), time() * 1000);
    }
    function answer(k) {
      if (!open || over) return;
      open = false; clearTimeout(tm);
      const ok = k === beats[i].key;
      ring.classList.remove('is-run');
      ring.classList.add(ok ? 'is-ok' : 'is-bad');
      el.classList.remove('is-hit', 'is-hurt'); void el.offsetWidth; el.classList.add(ok ? 'is-hit' : 'is-hurt');
      audio.sfx(ok ? 'click' : 'discard');
      if (ok) i++; else { hp--; drawHp(); }
      if (i >= beats.length) { over = true; setTimeout(done, 520); return; }
      if (hp <= 0) {
        // uduzdun — döyüş əvvəldən (yaddaş nöqtəsi döyüşün başlanğıcıdır)
        text.textContent = t('cg.duelRetry');
        setTimeout(() => { i = 0; hp = 3; drawHp(); ask(); }, 1300);
        return;
      }
      setTimeout(ask, ok ? 420 : 700);
    }
    const onKey = (e) => { const k = KEYS[e.code]; if (!k) return; e.preventDefault(); e.stopPropagation(); answer(k); };
    addEventListener('keydown', onKey, true);
    el.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); answer(b.dataset.k); }));
    function done() { removeEventListener('keydown', onKey, true); el.remove(); ch._duel = null; resolve(); }
    const pause = () => { if (over) return; clearTimeout(tm); open = false; ring.classList.remove('is-run'); };
    const resume = () => { if (!over && i < beats.length && hp > 0) ask(); };
    ch._duel = { pause, resume, stop: () => { over = true; clearTimeout(tm); removeEventListener('keydown', onKey, true); el.remove(); }, get state() { return { i, hp, open, want: beats[i]?.key }; }, answer };
    drawHp();
    setTimeout(ask, 700);
  });
}
