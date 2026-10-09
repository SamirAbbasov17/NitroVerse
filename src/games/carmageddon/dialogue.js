// CARMAGEDDON — dialoq qutusu (visual novel üslubu).
// Mətn hərf-hərf yazılır; klik / toxunuş / Enter / boşluq: yazı gedirsə DƏRHAL tamamlanır, tamamdırsa
// növbəti sətrə keçir. Hər personajın öz tonunda qısa "mırıltı" səsi var (sözsüz danışıq — Undertale
// tipli). Portret danışanın hissinə görə dəyişir. Ssenari: script.js.
import { audio } from '../../core/AudioManager.js';

const CPS = 38;                         // saniyədə hərf
const PAUSE = { '.': 0.28, '!': 0.28, '?': 0.3, ',': 0.12, '…': 0.4, '—': 0.18, ':': 0.14 };

// Sözsüz danışıq: hər 2-ci hərfdə qısa ton. Ton personajdan (pitch) və hərfdən asılıdır — eyni cümlə
// həmişə eyni "melodiya" ilə səslənir, təsadüfi cızıltı olmur. Oyunun səs söndürmə düyməsinə tabedir.
function blip(pitch, ch, wave = 'triangle') {
  const ctx = audio.ctx;
  if (!ctx || audio.muted || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  const step = (ch.toLowerCase().charCodeAt(0) % 5) - 2;            // −2…+2 yarımton
  o.type = wave;
  o.frequency.setValueAtTime(pitch * Math.pow(2, step / 12), t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.085, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(g); g.connect(audio.master || ctx.destination);
  o.start(t); o.stop(t + 0.08);
}

export class Dialogue {
  // root: içinə qoşulacaq element; faces: (who, emo) → portret (canvas/şəkil) və ya null
  constructor(root, { cast, faces }) {
    this.cast = cast; this.faces = faces;
    const el = (this.el = document.createElement('div'));
    el.className = 'cgd';
    el.innerHTML = `
      <div class="cgd__box">
        <div class="cgd__face"><canvas width="80" height="80"></canvas></div>
        <div class="cgd__body">
          <div class="cgd__name"></div>
          <p class="cgd__text"><span class="cgd__shown"></span><span class="cgd__rest"></span></p>
        </div>
        <i class="cgd__next"></i>
      </div>`;
    root.appendChild(el);
    this.faceBox = el.querySelector('.cgd__face');
    this.faceCx = el.querySelector('canvas').getContext('2d');
    this.faceCx.imageSmoothingEnabled = false;
    this.nameEl = el.querySelector('.cgd__name');
    this.shown = el.querySelector('.cgd__shown');
    this.rest = el.querySelector('.cgd__rest');
    this.box = el.querySelector('.cgd__box');
    this._tick = this._tick.bind(this);
    this._onAct = (e) => {
      if (e.type === 'keydown' && !['Enter', 'Space', 'KeyE', 'KeyZ'].includes(e.code)) return;
      if (e.type === 'keydown') e.preventDefault();
      this.advance();
    };
    el.addEventListener('click', this._onAct);
    addEventListener('keydown', this._onAct);
    this.hide();
  }

  hide() { this.el.hidden = true; }

  // Bir sətri göstərir; oyunçu keçəndə həll olunan söz (promise) qaytarır
  say({ who = null, emo = 'neutral', text }) {
    const c = who ? this.cast[who] : null;
    this.el.hidden = false;
    this.box.classList.toggle('is-narration', !c);
    this.box.style.setProperty('--cgd-accent', c?.color || '#c9a98a');
    this.nameEl.textContent = c?.name || '';
    const face = c ? this.faces(who, emo) : null;
    this.faceBox.hidden = !face;
    if (face) { this.faceCx.clearRect(0, 0, 80, 80); this.faceCx.drawImage(face, 0, 0, 80, 80); }
    // bütün mətn əvvəlcədən yerləşir (görünməyən hissə şəffafdır) — yazıldıqca sətirlər sürüşmür
    this.full = text; this.n = 0; this.acc = 0; this.hold = 0;
    this.pitch = c?.pitch || 0; this.wave = c?.wave || 'triangle';
    this._paint();
    this.box.classList.remove('is-done');
    this.typing = true;
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._tick);
    return new Promise((res) => { this._res = res; });
  }

  _paint() {
    this.shown.textContent = this.full.slice(0, this.n);
    this.rest.textContent = this.full.slice(this.n);
  }

  _tick(now) {
    if (!this.typing) return;
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (this.hold > 0) this.hold -= dt;
    else {
      this.acc += dt * CPS;
      while (this.acc >= 1 && this.n < this.full.length && this.hold <= 0) {
        this.acc -= 1;
        const ch = this.full[this.n++];
        if (this.pitch && /\S/.test(ch) && !PAUSE[ch] && this.n % 2 === 0) blip(this.pitch, ch, this.wave);
        if (PAUSE[ch] && this.n < this.full.length) this.hold = PAUSE[ch];
      }
      this._paint();
    }
    if (this.n >= this.full.length) { this._finish(); return; }
    this.raf = requestAnimationFrame(this._tick);
  }

  _finish() {
    this.typing = false; this.n = this.full.length;
    this._paint();
    this.box.classList.add('is-done');
  }

  // klik: yazı gedirsə tamamla; tamamdırsa keç
  advance() {
    if (this.el.hidden) return;
    if (this.typing) { cancelAnimationFrame(this.raf); this._finish(); return; }
    const r = this._res; this._res = null;
    r?.();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this._onAct);
    this.el.remove();
  }
}
