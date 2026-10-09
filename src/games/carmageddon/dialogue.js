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

// HİSSLƏR: hər hissin portret hərəkəti (anim), üstündə çıxan işarəsi (icon) və çaları (tint) var.
// Üzün özü (göz/ağız kadrı) personajdan asılıdır — onu `faces(who, emo)` verir; buradakı qat bütün
// personajlarda eyni işləyir, ona görə hər kəsin bütün hissləri var.
export const EMO = {
  neutral: {}, side: {}, smile: { anim: 'nod' },
  happy: { anim: 'hop', icon: 'spark' }, laugh: { anim: 'hop2', icon: 'note' }, proud: { anim: 'nod', icon: 'spark' },
  love: { anim: 'hop', icon: 'heart' }, angry: { anim: 'shake', icon: 'anger', tint: 'rgba(255, 60, 40, 0.16)' },
  pout: { anim: 'shake', icon: 'anger' }, sad: { anim: 'droop', icon: 'tear', tint: 'rgba(60, 90, 170, 0.22)' },
  shock: { anim: 'flash', icon: 'bang' }, think: { icon: 'dots' }, confused: { icon: 'q' },
  sweat: { anim: 'nod', icon: 'sweat' }, sleepy: { anim: 'droop', icon: 'zzz' }, fear: { anim: 'shake', icon: 'sweat', tint: 'rgba(60, 90, 170, 0.18)' },
};
// 9×9 piksel işarələr: hərf → rəng
const INK = { k: '#12080c', w: '#ffffff', y: '#ffd166', o: '#ff9a2e', r: '#ff3b2e', b: '#5ab4ff', p: '#ff7ab8' };
const ICONS = {
  spark: ['....y....', '....y....', '...ywy...', 'yyywwwyyy', '...ywy...', '....y....', '....y....', '.........', '.........'],
  heart: ['.........', '.rr...rr.', 'rrrr.rrrr', 'rrrrrrrrr', 'rrrrrrrrr', '.rrrrrrr.', '..rrrrr..', '...rrr...', '....r....'],
  anger: ['.rr...rr.', '.rr...rr.', 'rrr...rrr', '.........', '.........', '.........', 'rrr...rrr', '.rr...rr.', '.rr...rr.'],
  tear: ['....b....', '....b....', '...bbb...', '...bwb...', '..bbwbb..', '..bbbbb..', '..bbbbb..', '...bbb...', '.........'],
  sweat: ['......b..', '.....bb..', '.....bwb.', '....bbwb.', '....bbbb.', '.....bb..', '.........', '.........', '.........'],
  bang: ['...yyy...', '...yyy...', '...yyy...', '...yyy...', '...yyy...', '....y....', '.........', '...yyy...', '...yyy...'],
  q: ['..yyyyy..', '.yy...yy.', '......yy.', '.....yy..', '....yy...', '....yy...', '.........', '....yy...', '....yy...'],
  dots: ['.........', '.........', '.........', '.........', 'ww.ww.ww.', 'ww.ww.ww.', '.........', '.........', '.........'],
  note: ['....ooooo', '....o...o', '....o...o', '....o...o', '....o...o', '..ooo.ooo', '.oooo.ooo', '.ooo..oo.', '.........'],
  zzz: ['wwww.....', '..w......', '.w.......', 'wwww.www.', '.......w.', '......w..', '.....www.', '.........', '.........'],
};

export class Dialogue {
  // root: içinə qoşulacaq element; faces: (who, emo) → portret (canvas/şəkil) və ya null
  constructor(root, { cast, faces }) {
    this.cast = cast; this.faces = faces;
    const el = (this.el = document.createElement('div'));
    el.className = 'cgd';
    el.innerHTML = `
      <div class="cgd__box">
        <div class="cgd__face"><canvas width="80" height="80"></canvas><i class="cgd__tint"></i><canvas class="cgd__emote" width="11" height="11"></canvas></div>
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
    this.tint = el.querySelector('.cgd__tint');
    this.emote = el.querySelector('.cgd__emote'); this.emoteCx = this.emote.getContext('2d');
    this.nameEl = el.querySelector('.cgd__name'); this.nameEl.lang = 'en';      // xüsusi isimlər ingiliscədir: böyük hərfdə "MILO" qalsın, "MİLO" olmasın
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
    if (face) { this.faceCx.clearRect(0, 0, 80, 80); this.faceCx.drawImage(face, 0, 0, 80, 80); this._emo(emo); }
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

  // hissin görünüşü: portret hərəkəti (CSS), çalar və işarə
  _emo(emo) {
    const e = EMO[emo] || EMO.neutral;
    this.faceBox.className = 'cgd__face';
    void this.faceBox.offsetWidth;                       // eyni hərəkət dalbadal gəlsə yenidən oynasın
    if (e.anim) this.faceBox.classList.add('cgd-a-' + e.anim);
    this.tint.style.background = e.tint || 'transparent';
    const x = this.emoteCx; x.clearRect(0, 0, 11, 11);
    const ic = e.icon && ICONS[e.icon];
    this.emote.hidden = !ic;
    if (!ic) return;
    // tünd kontur + rəngli piksellər
    for (let pass = 0; pass < 2; pass++) for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) {
      const ch = ic[j][i]; if (ch === '.') continue;
      if (pass === 0) { x.fillStyle = INK.k; x.fillRect(i, j, 3, 3); } else { x.fillStyle = INK[ch]; x.fillRect(i + 1, j + 1, 1, 1); }
    }
    this.emote.className = 'cgd__emote cgd-e-' + e.icon;
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
        if (this.pitch && !this.silent && /\S/.test(ch) && !PAUSE[ch] && this.n % 2 === 0) blip(this.pitch, ch, this.wave);
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
    // avtomatik keçid (final səhnəsi): oxumağa vaxt verib özü irəliləyir; klik gözləmədən keçir
    clearTimeout(this._autoT);
    if (this.auto) { const line = this.full; this._autoT = setTimeout(() => { if (!this.typing && this.full === line && this._res) this.advance(); }, this.auto(line)); }
  }

  // klik: yazı gedirsə tamamla; tamamdırsa keç
  advance() {
    if (this.el.hidden) return;
    if (this.typing) { cancelAnimationFrame(this.raf); this._finish(); return; }
    const r = this._res; this._res = null;
    r?.();
  }

  // gözləyən sətri dərhal bağla (səhnəni ötürmək üçün)
  skip() {
    cancelAnimationFrame(this.raf); this.typing = false;
    const r = this._res; this._res = null;
    r?.();
  }

  dispose() {
    clearTimeout(this._autoT);
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this._onAct);
    this.el.remove();
  }
}
