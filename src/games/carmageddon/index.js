// CARMAGEDDON (hazırlanır) — NitroVerse-in ikinci oyunu: hekayə əsaslı, post-apokaliptik yarış, piksel
// üslubu. Hələlik yalnız BAŞLIQ EKRANI var: ayrıca oyun kimi açılır (öz şrifti, öz görünüşü), baş
// qəhrəman menyuda canlıdır — nəfəs alır, gözünü qırpır, kursoru izləyir, toxunanda cavab verir.
//
// Görüntü aşağı dəqiqlikli kətanda (480×270) çəkilir və `image-rendering: pixelated` ilə böyüdülür —
// hər şey eyni piksel torunda qalır. Qəhrəman: public/carmageddon/hero.png (+ hero-eyes.png göz
// kadrları) — mənbə və üslub: art/carmageddon/STYLE.md.
import './carmageddon.css';
import { game, input } from '../../platform.js';
import { audio } from '../../core/AudioManager.js';
import { t } from '../../core/i18n.js';
import { assetBase } from '../../net/apiBase.js';

const W = 480, H = 270;                 // kətanın daxili ölçüsü (piksel toru)
const HERO = { w: 160, h: 213, x: 300, y: 62 };          // qəhrəmanın kətandakı yeri
const EYES = { x: 60, y: 51, w: 44, h: 13 };             // göz yamağının sprite-dakı yeri; kadrlar: mərkəz, sol, sağ, yarı, bağlı
const HAIR = { x1: 58, y1: 102 };                        // sərbəst (küləkdə yellənən) saç bölgəsi: x < x1, y < y1

const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = assetBase() + src; });
// Şrift: əvvəl üslub cədvəli yüklənməlidir (yoxsa `fonts.load` boş qayıdır və şrift gəlmir)
const loadFont = (family, url) => new Promise((res) => {
  const ask = () => (document.fonts?.load(`32px "${family}"`, 'CARMAGEDDON əşğıöüç Жя') || Promise.resolve()).then(res, res);
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === url)) { ask(); return; }
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = url;
  l.onload = ask; l.onerror = res;
  document.head.appendChild(l);
});

// Təkrarlanan təsadüfi ədəd (şəhər silueti hər açılışda eyni olsun)
function rng(seed) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

class TitleScreen {
  constructor({ onExit }) {
    this.onExit = onExit;
    this.t0 = performance.now();
    this.pointer = { x: 0.5, y: 0.5 };   // 0..1, ekran üzrə
    this.sel = 0;
    this.blinkAt = 1.8; this.blink = 0;  // qırpma: növbəti vaxt (s) və cari faza
    this.poke = 0;                        // toxunuşa reaksiya (s)
    this.quote = null;
    this._build();
    this._loop = this._loop.bind(this);
    this._load();
  }

  _build() {
    const el = (this.el = document.createElement('div'));
    el.className = 'cg';
    el.innerHTML = `
      <canvas class="cg__bg" width="${W}" height="${H}"></canvas>
      <div class="cg__vignette"></div>
      <div class="cg__ui">
        <div class="cg__top">
          <span class="cg__studio">NITROVERSE ${t('cg.presents')}</span>
          <span class="cg__wip"><i></i>${t('cg.wip')}</span>
        </div>
        <canvas class="cg__logo" width="300" height="64" aria-label="Carmageddon"></canvas>
        <div class="cg__tags"><span>${t('cg.tagStory')}</span><span>${t('cg.tagRace')}</span><span>${t('cg.tagPixel')}</span></div>
        <p class="cg__pitch">${t('cg.pitch')}</p>
        <nav class="cg__menu">
          <button class="cg__btn is-locked" data-cg="story"><b>${t('cg.story')}</b><em>${t('cg.soon')}</em></button>
          <button class="cg__btn" data-cg="hero"><b>${t('cg.hero')}</b></button>
          <button class="cg__btn" data-cg="exit"><b>${t('cg.exit')}</b></button>
        </nav>
        <div class="cg__note" data-cg-note></div>
      </div>
      <div class="cg__bubble" data-cg-bubble hidden></div>
      <div class="cg__foot">${t('cg.foot')}</div>`;
    document.body.appendChild(el);
    this.cv = el.querySelector('.cg__bg');
    this.cx = this.cv.getContext('2d');
    this.cx.imageSmoothingEnabled = false;
    this.btns = [...el.querySelectorAll('.cg__btn')];
    this.note = el.querySelector('[data-cg-note]');
    this.bubble = el.querySelector('[data-cg-bubble]');
    this.btns.forEach((b, i) => {
      b.onmouseenter = () => this._select(i);
      b.onclick = () => { this._select(i); this._activate(); };
    });
    this._select(1);
    // giriş: kursor / toxunuş / klaviatura
    this._onMove = (e) => {
      const p = e.touches?.[0] || e;
      this.pointer.x = p.clientX / innerWidth; this.pointer.y = p.clientY / innerHeight;
    };
    this._onDown = (e) => {
      this._onMove(e);
      if (e.target.closest('.cg__btn')) return;
      if (this._overHero(e.touches?.[0] || e)) this._pokeHero();
    };
    this._onKey = (e) => {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { this._select((this.sel + 1) % this.btns.length); e.preventDefault(); }
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') { this._select((this.sel + this.btns.length - 1) % this.btns.length); e.preventDefault(); }
      else if (e.code === 'Enter' || e.code === 'Space') { this._activate(); e.preventDefault(); }
      else if (e.code === 'Escape') this._exit();
    };
    addEventListener('pointermove', this._onMove);
    addEventListener('pointerdown', this._onDown);
    addEventListener('keydown', this._onKey);
  }

  async _load() {
    // Şriftlər: loqo — "Black Ops One" (trafaret, hərbi); düymə və nişanlar — "Tiny5" (iri hərflərdə
    // oxunaqlı piksel şrifti; Ə və kiril var — "Press Start 2P"-də böyük Ə yoxdur); uzun mətn —
    // "Pixelify Sans". Yüklənməsə oyunun öz şriftləri qalır.
    // Loqo şrift gələndən SONRA çəkilir.
    const fonts = Promise.all([
      loadFont('Black Ops One', 'https://fonts.googleapis.com/css2?family=Black+Ops+One&display=swap'),
      loadFont('Tiny5', 'https://fonts.googleapis.com/css2?family=Tiny5&display=swap'),
      loadFont('Pixelify Sans', 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&display=swap'),
    ]);
    const [hero, eyes] = await Promise.all([loadImg('carmageddon/hero.png'), loadImg('carmageddon/hero-eyes.png')]);
    this.hero = hero; this.eyes = eyes;
    this._prepHero();
    this._buildCity();
    await Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]);
    this._drawLogo();
    fonts.then(() => { if (this.el.isConnected) this._drawLogo(); });   // şrift gec gəlsə loqo yenidən çəkilir
    this.el.classList.add('is-ready');
    this.raf = requestAnimationFrame(this._loop);
  }

  // Qəhrəmanın layları: sərbəst saç (yellənir), eynək şüşəsi (parıltı keçir), qalan gövdə (sabit)
  _prepHero() {
    const { w, h } = HERO;
    const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const src = mk(); const sx = src.getContext('2d'); sx.drawImage(this.hero, 0, 0);
    const data = sx.getImageData(0, 0, w, h);
    const body = mk(), hair = mk();
    const bd = sx.createImageData(w, h), hd = sx.createImageData(w, h);
    this.lens = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const r = data.data[o], g = data.data[o + 1], b = data.data[o + 2], a = data.data[o + 3];
        if (!a) continue;
        const free = x < HAIR.x1 && y < HAIR.y1;
        const dst = free ? hd : bd;
        dst.data[o] = r; dst.data[o + 1] = g; dst.data[o + 2] = b; dst.data[o + 3] = a;
        // 2 piksellik üst-üstə düşmə: saç sürüşəndə tikişdə boşluq qalmasın
        if (free && x >= HAIR.x1 - 2) { bd.data[o] = r; bd.data[o + 1] = g; bd.data[o + 2] = b; bd.data[o + 3] = a; }
        // eynək şüşəsi: boz-mavi piksellər alında
        if (y > 22 && y < 46 && b > r + 8 && g > r && b > 90) this.lens.push([x, y]);
      }
    }
    body.getContext('2d').putImageData(bd, 0, 0);
    hair.getContext('2d').putImageData(hd, 0, 0);
    this.bodyCv = body; this.hairCv = hair;
  }

  // Dağılmış şəhər silueti — iki plan (uzaq/yaxın), bir dəfə çəkilir, sonra sürüşdürülür
  _buildCity() {
    const layer = (seed, baseY, minH, maxH, color, glow) => {
      const c = document.createElement('canvas'); c.width = W * 2; c.height = H;
      const x = c.getContext('2d'); const r = rng(seed);
      x.fillStyle = color;
      let px = 0;
      while (px < c.width) {
        const bw = 10 + Math.floor(r() * 22), bh = minH + Math.floor(r() * (maxH - minH));
        const top = baseY - bh;
        x.fillRect(px, top, bw, bh + 40);
        // sınıq zirvə: təsadüfi dişlər
        for (let i = 0; i < bw; i += 2) { const cut = Math.floor(r() * r() * 14); x.clearRect(px + i, top, 2, cut); }
        if (r() < 0.35) x.fillRect(px + Math.floor(bw / 2), top - 6 - Math.floor(r() * 8), 1, 14);   // antena / armatur
        if (glow) for (let k = 0; k < 3; k++) if (r() < 0.25) { x.fillStyle = glow; x.fillRect(px + 2 + Math.floor(r() * (bw - 4)), top + 6 + Math.floor(r() * (bh - 10)), 2, 2); x.fillStyle = color; }
        px += bw + Math.floor(r() * 9) - 2;
      }
      return c;
    };
    this.cityFar = layer(7, 168, 22, 64, '#3a1f33', null);
    this.cityNear = layer(23, 178, 14, 46, '#1d1220', '#ff9a3c');
    const r = rng(99);
    this.dust = Array.from({ length: 46 }, () => ({ x: r() * W, y: 40 + r() * 190, v: 6 + r() * 22, s: r() < 0.25 ? 2 : 1, a: 0.25 + r() * 0.5 }));
    this.stars = Array.from({ length: 34 }, () => ({ x: Math.floor(r() * W), y: Math.floor(r() * 70), p: r() * 6 }));
  }

  // LOQO: başlıq şrifti kiçik kətanda çəkilir və pikselli böyüdülür — yazı piksel art kimi oxunur
  _drawLogo() {
    const cv = this.el.querySelector('.cg__logo'), x = cv.getContext('2d');
    const ok = document.fonts?.check?.('32px "Black Ops One"');
    x.clearRect(0, 0, cv.width, cv.height);
    x.font = `${ok ? 39 : 34}px "${ok ? 'Black Ops One' : 'Russo One'}", sans-serif`;
    x.textBaseline = 'alphabetic';
    const text = 'CARMAGEDDON';
    const tw = x.measureText(text).width, sc = Math.min(1, (cv.width - 8) / tw);
    x.save(); x.translate(4, 46); x.scale(sc, 1);
    x.fillStyle = '#12080c'; for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [2, 3], [3, 4]]) x.fillText(text, dx, dy);   // kontur + kölgə
    const g = x.createLinearGradient(0, -30, 0, 4);
    g.addColorStop(0, '#ffe08a'); g.addColorStop(0.45, '#ff9a2e'); g.addColorStop(0.75, '#e2371c'); g.addColorStop(1, '#7a1410');
    x.fillStyle = g; x.fillText(text, 0, 0);
    x.restore();
    // pas cızıqları: yazının üstündən keçən üfüqi kəsiklər
    x.globalCompositeOperation = 'destination-out';
    const r = rng(5);
    // (yalnız hərflərin gövdəsində: yuxarı kənarda cızıq hərfin üstündə nöqtə kimi oxunur — "Ö")
    for (let i = 0; i < 26; i++) x.fillRect(Math.floor(r() * cv.width), 24 + Math.floor(r() * 22), 2 + Math.floor(r() * 9), 1);
    x.globalCompositeOperation = 'source-over';
    // kənarları sərtləşdir (şəffaflıq ya 0, ya 255 — hamar kənar piksel art deyil)
    const d = x.getImageData(0, 0, cv.width, cv.height);
    for (let o = 3; o < d.data.length; o += 4) d.data[o] = d.data[o] > 110 ? 255 : 0;
    x.putImageData(d, 0, 0);
  }

  _select(i) {
    this.sel = i;
    this.btns.forEach((b, k) => b.classList.toggle('is-selected', k === i));
  }

  _activate() {
    const id = this.btns[this.sel].dataset.cg;
    audio.sfx('click');
    if (id === 'exit') { this._exit(); return; }
    this.note.textContent = id === 'story' ? t('cg.storyNote') : t('cg.heroNote');
    this.note.classList.remove('is-on'); void this.note.offsetWidth; this.note.classList.add('is-on');
    if (id === 'hero') this._pokeHero();
  }

  // Göstərici qəhrəmanın üstündədirmi (kətan koordinatında, şəffaf olmayan düzbucaqlı)
  _overHero(p) {
    const r = this.cv.getBoundingClientRect();
    const x = ((p.clientX - r.left) / r.width) * W, y = ((p.clientY - r.top) / r.height) * H;
    return x > HERO.x + 30 && x < HERO.x + 150 && y > HERO.y + 8;
  }

  _pokeHero() {
    this.poke = 0.5; this.blink = 0.001;
    const lines = [t('cg.q1'), t('cg.q2'), t('cg.q3'), t('cg.q4')];
    this._qi = ((this._qi ?? -1) + 1) % lines.length;
    this.bubble.textContent = lines[this._qi];
    this.bubble.hidden = false;
    this.bubble.classList.remove('is-on'); void this.bubble.offsetWidth; this.bubble.classList.add('is-on');
    clearTimeout(this._qt);
    this._qt = setTimeout(() => { this.bubble.hidden = true; }, 3200);
  }

  _loop(now) {
    this.raf = requestAnimationFrame(this._loop);
    const tt = (now - this.t0) / 1000;
    const dt = Math.min(0.05, tt - (this._tt ?? tt)); this._tt = tt;
    this._draw(tt, dt);
  }

  _draw(tt, dt) {
    const x = this.cx, px = this.pointer.x - 0.5, py = this.pointer.y - 0.5;
    // SƏMA: zolaqlı (dither əvəzi — pilləli) qürub
    const bands = ['#170d24', '#241232', '#3a1638', '#5a1c3a', '#8a2a36', '#bf4630', '#e8742a', '#f6a23a', '#fbd06a'];
    const bh = 178 / bands.length;
    bands.forEach((c, i) => { x.fillStyle = c; x.fillRect(0, Math.floor(i * bh), W, Math.ceil(bh) + 1); });
    for (const s of this.stars) { if (Math.sin(tt * 1.3 + s.p) > -0.2) { x.fillStyle = '#f6d9b8'; x.fillRect(s.x, s.y, 1, 1); } }
    // günəş: kəsikli disk (üfüqdə), kursorla cüzi sürüşür
    const sunX = Math.round(170 - px * 6), sunY = 150;
    for (let y = -34; y <= 34; y++) {
      if (y > 6 && (y + Math.floor(tt * 4)) % 6 < 2) continue;      // aşağı yarıda üzən kəsiklər
      const hw = Math.floor(Math.sqrt(34 * 34 - y * y));
      x.fillStyle = y < -8 ? '#fff0b0' : y < 12 ? '#ffd166' : '#ff9a3c';
      x.fillRect(sunX - hw, sunY + y, hw * 2, 1);
    }
    // uzaq/yaxın şəhər — paralaks
    const far = Math.round((tt * 2 + px * 10) % W), near = Math.round((tt * 5 + px * 22) % W);
    x.drawImage(this.cityFar, -((far + W) % W), Math.round(py * 2));
    x.drawImage(this.cityNear, -((near + W) % W), Math.round(py * 4));
    // YER: səhra + perspektivli yol (zolaqlar bizə doğru axır)
    x.fillStyle = '#2a1420'; x.fillRect(0, 178, W, H - 178);
    for (let y = 178; y < H; y++) {
      const k = (y - 178) / (H - 178);                 // 0 üfüq … 1 ön
      x.fillStyle = k < 0.25 ? '#3a1a22' : k < 0.6 ? '#33171f' : '#2b131b';
      x.fillRect(0, y, W, 1);
      const cxr = 150 - px * 30 * (1 - k), half = 6 + k * 150;   // yol: üfüqdə dar, öndə enli
      x.fillStyle = '#1a0f16'; x.fillRect(Math.round(cxr - half), y, Math.round(half * 2), 1);
      x.fillStyle = '#7a3a2a'; x.fillRect(Math.round(cxr - half), y, 1 + Math.round(k * 2), 1); x.fillRect(Math.round(cxr + half) - 1 - Math.round(k * 2), y, 1 + Math.round(k * 2), 1);
      const z = 1 / (k + 0.06);
      if (Math.floor(z * 1.6 + tt * 6) % 4 === 0) { x.fillStyle = '#e8b04a'; x.fillRect(Math.round(cxr - 1 - k * 2), y, Math.max(1, Math.round(1 + k * 4)), 1); }
    }
    // toz: sağdan sola sürüklənən dənələr
    for (const d of this.dust) {
      d.x -= d.v * dt; if (d.x < -2) { d.x = W + 2; d.y = 40 + Math.random() * 190; }
      x.globalAlpha = d.a; x.fillStyle = '#f2b98a'; x.fillRect(Math.round(d.x), Math.round(d.y + Math.sin(tt + d.x * 0.05) * 2), d.s, 1);
    }
    x.globalAlpha = 1;
    this._drawHero(tt, dt, px, py);
  }

  _drawHero(tt, dt, px, py) {
    const x = this.cx;
    // nəfəs: 1 piksellik yavaş qalxıb-enmə; toxunuşda qısa "diksinmə"; kursora əks tərəfə cüzi paralaks
    this.poke = Math.max(0, this.poke - dt);
    const bob = Math.sin(tt * 1.7) > 0.3 ? -1 : 0;
    const jump = this.poke > 0 ? -Math.round(Math.sin((0.5 - this.poke) / 0.5 * Math.PI) * 3) : 0;
    const hx = Math.round(HERO.x - px * 8), hy = HERO.y + bob + jump;
    // yerdəki kölgə əvəzinə arxa işıq halqası (günəş arxadadır)
    x.drawImage(this.bodyCv, hx, hy);
    // SAÇ: üç zolaq, uca doğru artan amplitud; hər sətir ayrıca sürüşür (külək dalğası)
    const bandsX = [[0, 22, 2.4], [20, 40, 1.5], [38, HAIR.x1, 0.7]];
    for (const [x0, x1, amp] of bandsX) {
      for (let y = 0; y < HAIR.y1; y++) {
        const dx = Math.round(Math.sin(tt * 2.1 - y * 0.11 + x0 * 0.05) * amp + Math.sin(tt * 0.7) * amp * 0.5);
        x.drawImage(this.hairCv, x0, y, x1 - x0, 1, hx + x0 + dx, hy + y, x1 - x0, 1);
      }
    }
    // GÖZLƏR: kursoru izləyir (sol / mərkəz / sağ); arabir qırpır
    this.blinkAt -= dt;
    if (this.blinkAt <= 0 && this.blink === 0) { this.blink = 0.001; this.blinkAt = 2.2 + Math.random() * 3.4; }
    let frame = 0;
    if (this.blink > 0) {
      this.blink += dt;
      frame = this.blink < 0.05 ? 3 : this.blink < 0.13 ? 4 : this.blink < 0.19 ? 3 : 0;
      if (this.blink >= 0.19) this.blink = 0;
    }
    if (frame === 0) {
      const lookX = (this.pointer.x * W - (hx + 82)) / W;      // kursor qəhrəmanın üzündən solda/sağda
      frame = lookX < -0.12 ? 1 : lookX > 0.12 ? 2 : 0;
    }
    x.drawImage(this.eyes, frame * EYES.w, 0, EYES.w, EYES.h, hx + EYES.x, hy + EYES.y, EYES.w, EYES.h);
    // EYNƏK PARILTISI: hər ~4 s-dən bir maili işıq zolağı şüşədən keçir
    const sweep = ((tt % 4.2) / 0.7) * 70 - 10;
    if (sweep < 70) {
      x.fillStyle = '#ffffff';
      for (const [lx, ly] of this.lens) { const d = lx - 60 + (ly - 22) * 0.8 - sweep; if (d > 0 && d < 4) { x.globalAlpha = d < 2 ? 0.85 : 0.4; x.fillRect(hx + lx, hy + ly, 1, 1); } }
      x.globalAlpha = 1;
    }
  }

  _exit() {
    this.dispose();
    this.onExit?.();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this._qt);
    removeEventListener('pointermove', this._onMove);
    removeEventListener('pointerdown', this._onDown);
    removeEventListener('keydown', this._onKey);
    this.el.remove();
  }
}

// Oyunu aç. onExit — NitroVerse menyusuna qayıdış (çağıran verir).
export function mount({ onExit } = {}) {
  // 3D səhnə dayanır və gizlənir: bu ekran tam ayrı oyundur
  game.setActive(null);
  audio.stopEngine();
  audio.stopMusic();
  input.enabled = false;
  document.getElementById('ui-root').innerHTML = '';
  document.body.classList.add('cg-on');
  const screen = new TitleScreen({
    onExit: () => { document.body.classList.remove('cg-on'); input.enabled = true; onExit?.(); },
  });
  if (import.meta.env.DEV) window.__cg = screen;
  return screen;
}
