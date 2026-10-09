// CARMAGEDDON — Fəsil 1 oynadıcısı (hələlik: proloq + Ember–Milo səhər səhnəsi).
// Səhnələr ardıcıl gedir: sinematik kadrlar (fon + mətn) → dialoq → son kart. Hər şey 480×270 piksel
// kətanında çəkilir (başlıq ekranı ilə eyni tor), mətn isə DOM-dadır (bütün dillərdə oxunaqlı).
import { t, getLang } from '../../core/i18n.js';
import { assetBase } from '../../net/apiBase.js';
import { Dialogue } from './dialogue.js';
import { CAST, PROLOGUE, MORNING, tx } from './script.js';
import { runCamp, hasCampSave, clearSave } from './camp.js';

const W = 480, H = 270;
const loadImg = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = assetBase() + src; });

// Ember-in dialoq portreti başlıq ekranındakı spraytdan kəsilir (eyni personaj, eyni piksellər);
// hiss — göz kadrı ilə: 0 mərkəz, 1 yana baxış, 3 yarı bağlı (yuxulu).
const EMBER_EYE = { neutral: 0, smile: 0, proud: 0, angry: 0, shock: 0, side: 1, think: 1, confused: 1, sweat: 1, sleepy: 3, sad: 3, fear: 3, happy: 4, laugh: 4, love: 4 };
// Milo-nun üç ağız kadrı var; qalan sakinlərin tək kadrı — hissi portretin hərəkəti və işarəsi verir
const MILO_FACE = { happy: 'happy', laugh: 'happy', love: 'happy', proud: 'happy', smile: 'happy', pout: 'pout', angry: 'pout', sad: 'pout', fear: 'pout' };
const CROP = { x: 42, y: 14, s: 80 }, EYES = { x: 60, y: 51, w: 44, h: 13 };

export class Chapter1 {
  constructor(root, { hero, eyes, onEnd }) {
    this.root = root; this.hero = hero; this.eyes = eyes; this.onEnd = onEnd;
    this.lang = getLang();
    const el = (this.el = document.createElement('div'));
    el.className = 'cgs';
    el.innerHTML = `
      <canvas class="cg__bg cgs__bg" width="${W}" height="${H}"></canvas>
      <div class="cgs__shade"></div>
      <div class="cgs__card" hidden></div>
      <button class="cgs__skip" type="button">${t('cg.skip')}</button>`;
    root.appendChild(el);
    this.cv = el.querySelector('canvas'); this.cx = this.cv.getContext('2d'); this.cx.imageSmoothingEnabled = false;
    this.card = el.querySelector('.cgs__card');
    this.dlg = new Dialogue(el, { cast: CAST, faces: (who, emo) => this._face(who, emo) });
    this.art = {}; this.faceCache = {};
    this._skip = false;
    // "Keç": gedən səhnənin qalan sətirləri ötürülür (kadr dəyişməsi zamanı basılsa da işləyir)
    el.querySelector('.cgs__skip').onclick = (e) => { e.stopPropagation(); this._skip = true; this.dlg.skip(); };
    this._onKey = (e) => { if (e.code === 'Escape') { e.stopImmediatePropagation(); this.end(); } };
    addEventListener('keydown', this._onKey, true);
    this.run().catch((e) => { console.error('Carmageddon Fəsil 1:', e); this.end(); });   // xəta olsa başlıq ekranına qayıt, ilişib qalma
  }

  async _load() {
    const names = ['p1', 'p2', 'p3', 'p4', 'p5', 'tent', 'camp.webp', 'milo-neutral', 'milo-happy', 'milo-pout',
      'wren-neutral', 'gus-neutral', 'clara-neutral', 'ray-neutral', 'amos-neutral', 'pip-neutral'];
    const imgs = await Promise.all(names.map((n) => loadImg(`carmageddon/ch1/${n.includes('.') ? n : n + '.png'}`)));
    names.forEach((n, i) => { names[i] = n.replace(/\.\w+$/, ''); });
    names.forEach((n, i) => { this.art[n] = imgs[i]; });
  }

  _face(who, emo) {
    const key = who + ':' + emo;
    if (this.faceCache[key]) return this.faceCache[key];
    const c = document.createElement('canvas'); c.width = c.height = 80;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    if (who === 'ember' && this.hero) {
      x.drawImage(this.hero, CROP.x, CROP.y, CROP.s, CROP.s, 0, 0, 80, 80);
      const f = EMBER_EYE[emo] ?? 0;
      if (this.eyes) x.drawImage(this.eyes, f * EYES.w, 0, EYES.w, EYES.h, EYES.x - CROP.x, EYES.y - CROP.y, EYES.w, EYES.h);
    } else {
      const im = (who === 'milo' && this.art[`milo-${MILO_FACE[emo]}`]) || this.art[`${who}-${emo}`] || this.art[`${who}-neutral`];
      if (im) x.drawImage(im, 0, 0, 80, 80);
      else { // portret hələ çəkilməyib — tünd siluet
        x.fillStyle = '#2a1a26'; x.fillRect(0, 0, 80, 80);
        x.fillStyle = '#12080c'; x.beginPath(); x.arc(40, 34, 17, 0, 7); x.fill(); x.fillRect(16, 54, 48, 26);
      }
    }
    return (this.faceCache[key] = c);
  }

  // Fon: şəkil varsa o, yoxdursa pilləli qürub zolaqları (başlıq ekranının palitrası)
  _bg(name) {
    const x = this.cx, im = this.art[name];
    if (im) { x.drawImage(im, 0, 0, W, H); return; }
    const bands = ['#170d24', '#241232', '#3a1638', '#5a1c3a', '#8a2a36', '#bf4630'];
    bands.forEach((c, i) => { x.fillStyle = c; x.fillRect(0, Math.floor((i * H) / bands.length), W, Math.ceil(H / bands.length) + 1); });
  }

  async _fade(to) {            // kətanın qaralıb-açılması (CSS)
    this.cv.style.opacity = to; await new Promise((r) => setTimeout(r, 340));
  }

  async _card(title, sub, ms) {
    this.dlg.hide();
    this.card.innerHTML = `<b>${title}</b><span>${sub}</span>`;
    this.card.hidden = false;
    await new Promise((r) => {
      const done = () => { this.card.removeEventListener('click', done); clearTimeout(tm); r(); };
      const tm = setTimeout(done, ms);
      this.card.addEventListener('click', done);
    });
    this.card.hidden = true;
  }

  async run() {
    await this._load();
    if (this.dead) return;
    this.el.classList.add('is-ready');
    // yarımçıq qalmış oyun düşərgədən davam edir (proloq və səhər söhbəti təkrarlanmır)
    const resume = hasCampSave();
    if (!resume) clearSave();
    // PROLOQ
    let cur = null;
    for (const s of resume ? [] : PROLOGUE) {
      if (this.dead || this._skip) break;
      if (s.art !== cur) { await this._fade(0); this._bg(s.art); cur = s.art; await this._fade(1); }
      if (this.dead || this._skip) break;
      await this.dlg.say({ text: tx(s.text, this.lang) });
    }
    if (this.dead) return;
    this._skip = false;
    await this._fade(0);
    await this._card(t('cg.ch1'), 'HEARTH', resume ? 1400 : 2600);
    if (this.dead) return;
    // SƏHƏR
    if (!resume) { this._bg('tent'); await this._fade(1); }
    for (const l of resume ? [] : MORNING) {
      if (this.dead || this._skip) break;
      await this.dlg.say({ who: l.who, emo: l.emo, text: tx(l.text, this.lang) });
    }
    if (this.dead) return;
    // HEARTH: gəzinti və tapşırıqlar
    this._skip = false;
    await this._fade(0);
    this.el.classList.add('is-world');
    this.cv.style.opacity = 1;
    await runCamp(this);
    if (this.dead) return;
    this.el.classList.remove('is-world');
    await this._fade(0);
    await this._card(t('cg.ch1'), t('cg.ch1More'), 4200);
    this.end();
  }

  end() {
    if (this.dead) return;
    this.dead = true;
    removeEventListener('keydown', this._onKey, true);
    this.world?.dispose();
    this.dlg.dispose();
    this.el.remove();
    this.onEnd?.();
  }
}
