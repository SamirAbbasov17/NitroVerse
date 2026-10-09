// CARMAGEDDON — Fəsil 1 oynadıcısı (hələlik: proloq + Ember–Milo səhər səhnəsi).
// Səhnələr ardıcıl gedir: sinematik kadrlar (fon + mətn) → dialoq → son kart. Hər şey 480×270 piksel
// kətanında çəkilir (başlıq ekranı ilə eyni tor), mətn isə DOM-dadır (bütün dillərdə oxunaqlı).
import { t, getLang } from '../../core/i18n.js';
import { assetBase } from '../../net/apiBase.js';
import { Dialogue } from './dialogue.js';
import { CAST, PROLOGUE, MORNING, EVENING, ATTACK, NIGHT_INTRO, FOUND, DUEL, AFTER_DUEL, ENDING, CHASE_CUTS, CHASE_END, tx } from './script.js';
import { runCamp, savedStage, savedSec, setStage, clearSave } from './camp.js';
import { runChase } from './chase.js';
import { runFinale, preloadSong } from './finale.js';
import { music } from './music.js';
import { T, loadDict } from './tx.js';
import { setCharAtlas } from './sprites.js';
import { runSearch } from './night.js';
import { runDuel } from './duel.js';

const W = 480, H = 270;
const loadImg = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = assetBase() + src; });

// Ember-in dialoq portreti başlıq ekranındakı spraytdan kəsilir (eyni personaj, eyni piksellər);
// hiss — göz kadrı ilə: 0 mərkəz, 1 yana baxış, 3 yarı bağlı (yuxulu).
const EMBER_EYE = { neutral: 0, smile: 0, proud: 0, angry: 0, shock: 0, side: 1, think: 1, confused: 1, sweat: 1, sleepy: 3, sad: 3, fear: 3, happy: 4, laugh: 4, love: 4 };
// Milo-nun üç ağız kadrı var; qalan sakinlərin tək kadrı — hissi portretin hərəkəti və işarəsi verir
const MILO_FACE = { happy: 'happy', laugh: 'happy', love: 'happy', proud: 'happy', smile: 'happy', pout: 'pout', angry: 'pout', sad: 'pout', fear: 'pout' };
const CROP = { x: 42, y: 14, s: 80 }, EYES = { x: 60, y: 51, w: 44, h: 13 };
// AĞIZ: başlıq şəklində Ember gülümsəyir — eyni üz hər replikada işlənəndə pis hadisədə də gülümsəyirdi (istifadəçi
// rəyi). Ağız hissə görə piksel-piksel yenidən çəkilir (portret koordinatı, 80×80): gülüş — şəkildəki kimi; düz;
// aşağı əyilmiş (kədər, qorxu); sıxılmış (qəzəb); açıq (şok).
const EMBER_MOUTH = { smile: 'smile', happy: 'smile', laugh: 'smile', love: 'smile', proud: 'smile', neutral: 'flat', side: 'flat', think: 'flat', confused: 'flat', sleepy: 'flat', sweat: 'flat', sad: 'down', fear: 'down', angry: 'tight', shock: 'open' };
function emberMouth(x, kind) {
  if (kind === 'smile') return;
  const SKIN = '#ffd3a7', LINE = '#52270f', DARK = '#3a1208', P = (px, py, w, h, c) => { x.fillStyle = c; x.fillRect(px, py, w, h); };
  P(30, 62, 19, 6, SKIN);                                   // köhnə ağız (xətt və yuxarı qalxan künclər) silinir
  if (kind === 'flat') P(32, 65, 14, 1, LINE);
  else if (kind === 'down') { P(33, 65, 12, 1, LINE); P(31, 66, 2, 1, LINE); P(45, 66, 2, 1, LINE); P(30, 67, 1, 1, LINE); P(47, 67, 1, 1, LINE); }
  else if (kind === 'tight') { P(34, 65, 10, 1, DARK); P(33, 66, 1, 1, DARK); P(44, 66, 1, 1, DARK); P(35, 66, 8, 1, '#c98a6a'); }
  else if (kind === 'open') { P(36, 63, 7, 5, DARK); P(37, 64, 5, 3, '#7a1c14'); P(37, 63, 5, 1, '#f0e7d8'); }
}

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
      <button class="cgs__skip" type="button">${t('cg.skip')}</button>
      <button class="cgs__menu" type="button" aria-label="${t('cg.pause')}"><i></i><i></i></button>
      <div class="cgs__pause" hidden><div><b>${t('cg.pause')}</b><button type="button" data-cgp="resume">${t('cg.continue')}</button><button type="button" data-cgp="title">${t('cg.toTitle')}</button><span>${t('cg.pauseNote')}</span></div></div>`;
    root.appendChild(el);
    this.cv = el.querySelector('canvas'); this.cx = this.cv.getContext('2d'); this.cx.imageSmoothingEnabled = false;
    this.card = el.querySelector('.cgs__card');
    this.dlg = new Dialogue(el, { cast: CAST, faces: (who, emo) => this._face(who, emo) });
    this.art = {}; this.faceCache = {};
    this._skip = false;
    // "Keç": gedən səhnənin qalan sətirləri ötürülür (kadr dəyişməsi zamanı basılsa da işləyir)
    // Oyunçu sətri tez tamamlamaq üçün "Keç"ə basanda bütün səhnə ötürülürdü və hekayə qaçırdı. İndi:
    // yazı gedirsə — yalnız sətir tamamlanır; yazı bitibsə — düymə "Səhnəni keç?" soruşur və 3 s ərzində ikinci
    // basış səhnəni ötürür.
    const skipBtn = el.querySelector('.cgs__skip'); let armT = 0;
    const disarm = () => { clearTimeout(armT); skipBtn.classList.remove('is-armed'); skipBtn.textContent = t('cg.skip'); };
    skipBtn.onclick = (e) => {
      e.stopPropagation();
      if (this.dlg.typing && !this.dlg.el.hidden) { this.dlg.advance(); return; }
      if (!skipBtn.classList.contains('is-armed')) { skipBtn.classList.add('is-armed'); skipBtn.textContent = t('cg.skipSure'); armT = setTimeout(disarm, 3000); return; }
      disarm(); if (!this._playing) return; this._skip = true; this.dlg.skip();
    };
    // Fasilə: Esc və ya künc düyməsi. Fasilədə klaviatura səhnəyə çatmır (dialoq keçmir, maşın dönmür).
    this.paused = false;
    this.pauseEl = el.querySelector('.cgs__pause');
    el.querySelector('.cgs__menu').onclick = (e) => { e.stopPropagation(); this.pause(); };
    this.pauseEl.onclick = (e) => { e.stopPropagation(); const k = e.target.closest('[data-cgp]')?.dataset.cgp; if (k === 'resume') this.resume(); else if (k === 'title') this.end(); };
    this.pauseEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    this._onKey = (e) => {
      if (e.code === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); if (this.paused) this.resume(); else this.pause(); return; }
      if (this.paused) e.stopImmediatePropagation();          // fokusdakı düymə (Davam et) Enter-i özü alır
    };
    this._onHide = () => { if (document.hidden && (el.classList.contains('is-world') || el.classList.contains('is-duel'))) this.pause(); };   // oynanışda ekran sönsə / tab dəyişsə
    addEventListener('keydown', this._onKey, true);
    document.addEventListener('visibilitychange', this._onHide);
    this.run().catch((e) => { console.error('Carmageddon Fəsil 1:', e); this.end(); });   // xəta olsa başlıq ekranına qayıt, ilişib qalma
  }

  async _load() {
    await loadDict(this.lang);                       // hekayə mətnlərinin lüğəti (az üçün lazım deyil)
    const names = ['p1', 'p2', 'p3', 'p4', 'p5', 'tent', 'camp.webp', 'milo-neutral', 'milo-happy', 'milo-pout',
      'wren-neutral', 'gus-neutral', 'clara-neutral', 'ray-neutral', 'amos-neutral', 'pip-neutral',
      'e1', 'e2', 'a1', 'a2', 'a3', 'a4',
      'judge-neutral', 'crude-neutral', 'butcher-neutral', 'rust-neutral', 'preacher-neutral', 'twins-neutral', 'jackal-neutral',
      'hush-neutral', 'chars', 'hens', 'c1', 'c2', 'c3', 'c4', 'c5', 'cars', 'props', 'ground-camp.webp', 'ground-canyon.webp', 'ground-fog.webp', 'ground-truck.webp', 'b1', 'b2', 'b3', 'b4', 'j1', 'c6', 'c7', 'b5', 'b6', 'b7', 'g1.webp', 'g2.webp', 'g3.webp', 'g4.webp', 'g5.webp', 'g6.webp', 'g7.webp'];
    const imgs = await Promise.all(names.map((n) => loadImg(`carmageddon/ch1/${n.includes('.') ? n : n + '.png'}`)));
    names.forEach((n, i) => { names[i] = n.replace(/\.\w+$/, ''); });
    names.forEach((n, i) => { this.art[n] = imgs[i]; });
    setCharAtlas(this.art.chars);
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
      emberMouth(x, EMBER_MOUTH[emo] || 'flat');
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
    if (name === 'black') { x.fillStyle = '#0a0508'; x.fillRect(0, 0, W, H); return; }
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

  // Səhnə oynadıcısı: { art } fon dəyişir, { intro } personajı təqdim edir, qalanı — sətirdir
  async _play(scene) {
    // BUQ idi: "Keç" səhnələr ARASINDA (kart, keçid) təsdiqlənəndə bayraq qalırdı və NÖVBƏTİ səhnə — məsələn qaçışın
    // ilk ara səhnəsi — heç oynanmadan ötürülürdü ("bir dəfə getdi, bir dəfə getmədi"). Bayraq hər səhnənin əvvəlində
    // sıfırlanır və düymə yalnız səhnə oynanarkən işləyir.
    this._skip = false; this._playing = true;
    for (const st of scene) {
      if (this.dead) break;
      // "Keç": səhnənin qalan hissəsi göstərilmir, amma MUSİQİ addımları icra olunur — əks halda səhnənin sonunda
      // dəyişməli olan mahnı dəyişmir və növbəti hissə köhnə mahnı ilə gedirdi
      if (this._skip && !('music' in st)) continue;
      if ('music' in st) { if (st.music) music.play(st.music); else music.stop(); continue; }
      if (st.art) { await this._fade(0); this._bg(st.art); await this._fade(1); continue; }
      if (st.intro) { await this._intro(st.intro, T(st.title)); continue; }
      await this.dlg.say({ who: st.who, emo: st.emo, text: T(tx(st.text, 'az')) });
    }
    this._skip = false; this._playing = false;
  }

  // Təqdimat kartı: personaj ilk dəfə səhnəyə çıxanda — iri portret, ad və ləqəb
  async _intro(who, title) {
    const c = CAST[who];
    this.dlg.hide();
    const el = document.createElement('div');
    el.className = 'cgs__intro';
    el.style.setProperty('--cgd-accent', c.color);
    el.innerHTML = `<canvas width="80" height="80"></canvas><div><b lang="en">${c.name}</b><span>${title}</span></div>`;
    const x = el.querySelector('canvas').getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(this._face(who, 'neutral'), 0, 0);
    this.el.appendChild(el);
    await new Promise((r) => {
      const done = () => { clearTimeout(tm); el.removeEventListener('click', done); r(); };
      const tm = setTimeout(done, 2100);
      el.addEventListener('click', done);
    });
    el.remove();
  }

  async run() {
    await this._load();
    if (this.dead) return;
    this.el.classList.add('is-ready');
    // yarımçıq qalmış oyun saxlanan mərhələdən davam edir: 'camp' — düşərgə, 'evening' — axşam ocağı
    const stage = savedStage();
    if (!stage) {
      clearSave();
      music.play('caravan');
      await this._play(PROLOGUE.map((p, i) => (i && PROLOGUE[i - 1].art === p.art ? [{ text: p.text }] : [{ art: p.art }, { text: p.text }])).flat());
      if (this.dead) return;
      await this._fade(0);
      await this._card(t('cg.ch1'), 'HEARTH', 2600);
      if (this.dead) return;
      music.play('settlement');
      this._bg('tent'); await this._fade(1);
      await this._play(MORNING);
      if (this.dead) return;
    }
    if (!['evening', 'night', 'found', 'chase'].includes(stage)) {
      // HEARTH: gəzinti və tapşırıqlar
      music.play('settlement');
      await this._fade(0);
      this.el.classList.add('is-world');
      this.cv.style.opacity = 1;
      await runCamp(this);
      if (this.dead) return;
      this.el.classList.remove('is-world');
    }
    // AXŞAM OCAĞI və HÜCUM
    if (stage !== 'chase') {
    await this._fade(0);
    await this._card(t('cg.ch1'), t('cg.evening'), 2400);
    if (this.dead) return;
    if (stage !== 'night' && stage !== 'found') {
      music.play('settlement');
      await this._play(EVENING);
      if (this.dead) return;
      await this._play(ATTACK);
      if (this.dead) return;
      setStage('night');
    }
    // GECƏ: axtarış (oynanış) → Milo → Hush → Old Gus → Jackal ilə döyüş → maska
    music.play('emptycity');
    if (stage !== 'found') {
      await this._play(NIGHT_INTRO);
      if (this.dead) return;
      this.dlg.hide();
      await this._fade(0);
      this.el.classList.add('is-world');
      this.cv.style.opacity = 1;
      await runSearch(this);
      if (this.dead) return;
      this.el.classList.remove('is-world');
      setStage('found');                             // axtarış keçildi — çıxıb qayıdan onu təkrar oynamır
    }
    await this._play(FOUND);
    if (this.dead) return;
    this.dlg.hide();
    this.el.classList.add('is-duel');
    await runDuel(this, DUEL);
    this.el.classList.remove('is-duel');
    if (this.dead) return;
    await this._play(AFTER_DUEL);
    if (this.dead) return;
    }
    // QAÇIŞ: beş hissə; hər hissənin əvvəli yadda saxlanır
    this.dlg.hide();
    await this._fade(0);
    music.play('hunt');
    await this._card(t('cg.ch1'), t('cg.chase'), 2200);
    if (this.dead) return;
    this.el.classList.add('is-world', 'is-chase');
    this.cv.style.opacity = 1;
    preloadSong();                                   // final mahnısı qaçış vaxtı arxada yüklənir
    await runChase(this, stage === 'chase' ? Math.min(4, savedSec()) : 0, (i) => setStage('chase', { sec: i }), async (n) => {
      // hissələr arası ara səhnə: növbəti hissə əvvəlcədən yadda saxlanır (səhnədə çıxan oyunçu onu təkrar sürmür)
      setStage('chase', { sec: n });
      this.el.classList.remove('is-world', 'is-chase');
      await this._play(CHASE_CUTS[n - 1]);
      if (this.dead) return;
      this.dlg.hide();
      await this._fade(0);
      this.el.classList.add('is-world', 'is-chase');
      this.cv.style.opacity = 1;
    });
    if (this.dead) return;
    this.el.classList.remove('is-world', 'is-chase');
    // FİNAL: son səhnə mahnı ilə, sonra yekun yazıları (bax finale.js)
    clearSave();
    // körpüdən sonra: The Twins uçurumun qırağında qalır (qaçdığımız bilinsin), sonra final
    this._bg('black'); this.cv.style.opacity = 1;
    await this._play(CHASE_END);
    if (this.dead) return;
    this.dlg.hide();
    await this._fade(0);
    this.cv.style.opacity = 1;
    await runFinale(this, ENDING);
    if (this.dead) return;
    this.end();
  }

  pause() {
    if (this.dead || this.paused) return;
    this.paused = true;
    if (this.world) { this.world.paused = true; this.world.keys.clear(); this.world.goal = null; }
    this._chase?.pause(); this._duel?.pause();
    this.pauseEl.hidden = false;
    this.pauseEl.querySelector('button').focus({ preventScroll: true });
  }

  resume() {
    if (this.dead || !this.paused) return;
    this.paused = false;
    this.pauseEl.hidden = true;
    if (this.world) { this.world.paused = false; this.world.last = performance.now(); }
    this._duel?.resume();
  }

  end() {
    if (this.dead) return;
    this.dead = true;
    removeEventListener('keydown', this._onKey, true);
    document.removeEventListener('visibilitychange', this._onHide);
    this.world?.dispose();
    this._duel?.stop();
    this._mini?.stop();
    this._chase?.stop();
    this._finale?.stop();
    this.dlg.dispose();
    this.el.remove();
    this.onEnd?.();
  }
}
