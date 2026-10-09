// CARMAGEDDON Fəsil 1 — FİNAL: sinematik son səhnə + yekun yazıları, mahnı ilə.
// Oyun içi səhnə deyil — film kimi qurulub: yeddi kadr (g1…g7, 960×540), hər birində kamera hərəkəti (yaxınlaşma,
// uzaqlaşma, sürüşmə), kadrlar arası əriyib-keçmə, geniş ekran zolaqları, alt yazı (təhkiyə özü irəliləyir) və
// kadra xas canlılıq: sönən faralar, axsayan addımın yellənməsi, əlin titrəməsi, dizin yerə dəyməsi, nəbz kimi
// qaralan kənarlar, doğan günəşin parıltısı. Ember yerə uzanandan sonra kamera ondan uzaqlaşır (g5 → g6 → g7).
// Mahnı ilk kadrla başlayır. Yekun yazılarının müddəti mahnının QALAN vaxtına görə hesablanır ki, "təşəkkür"
// kartı mahnının son saniyələrinə düşsün və səs onunla birlikdə sönsün. Səs oyunun musiqi kanalına gedir; səs
// açılmayıbsa (və ya fayl yüklənməyibsə) final eyni vaxtlama ilə səssiz gedir.
import { t } from '../../core/i18n.js';
import { audio } from '../../core/AudioManager.js';
import { assetBase } from '../../net/apiBase.js';
import { T } from './tx.js';
import { CAST } from './script.js';

const SONG = 'carmageddon/ch1/final.mp3', SONG_LEN = 106;
let songBuf = null, songLoading = null;
export function preloadSong() {
  if (songBuf || songLoading || !audio.ctx) return songLoading;
  songLoading = fetch(assetBase() + SONG).then((r) => r.arrayBuffer()).then((b) => audio.ctx.decodeAudioData(b)).then((buf) => { songBuf = buf; }).catch(() => { songLoading = null; });
  return songLoading;
}

const HEARTH = ['Milo', 'Old Gus', 'Elder Amos', 'Granny Wren', 'Miss Clara', 'Radio Ray', 'Pip'];
const BARONS = ['Butcher', 'Madam Crude', 'Doctor Rust', 'Preacher', 'The Twins', 'Judge'];

const CW = 960, CH = 540, XFADE = 1.3;
// Kamera: [böyütmə, mərkəz x, mərkəz y] (0…1) — kadrın əvvəli → sonu; fx — kadra xas effekt
const SHOTS = {
  g1: { from: [1.2, 0.56, 0.62], to: [1.0, 0.5, 0.5], fx: 'lights' },        // stansiya; maşın dayanır, faralar sönür
  g2: { from: [1.0, 0.5, 0.5], to: [1.24, 0.38, 0.46], fx: 'limp' },         // Ember axsaya-axsaya kolonkalara gedir
  g3: { from: [1.1, 0.55, 0.5], to: [1.22, 0.52, 0.52], fx: 'tremor' },      // açar halqasını sıxan əl
  g4: { from: [1.16, 0.44, 0.4], to: [1.04, 0.45, 0.56], fx: 'drop' },       // dizləri üstə çökür
  g5: { from: [1.5, 0.42, 0.5], to: [1.0, 0.5, 0.5], fx: 'pulse' },          // yerdə uzanıb — kamera qalxmağa başlayır
  g6: { from: [1.75, 0.5, 0.7], to: [1.0, 0.5, 0.5], fx: null },             // yuxarıdan: stansiya, maşın, balaca fiqur
  g7: { from: [1.6, 0.5, 0.86], to: [1.0, 0.5, 0.5], fx: 'sun' },            // sonsuz çöl, yol, doğan günəş
};
const ease = (k) => k * k * (3 - 2 * k);
const lineDur = (s) => Math.max(4, Math.min(8, 2.8 + s.length * 0.036));

export function runFinale(ch, scene) {
  return new Promise((resolve) => {
    let src = null, gain = null, t0 = performance.now(), dead = false, raf = 0;
    const timers = [];
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
    const elapsed = () => (performance.now() - t0) / 1000;
    const total = () => (songBuf ? songBuf.duration : SONG_LEN);

    // ——— mahnı ———
    function play() {
      t0 = performance.now();
      if (!songBuf || !audio.ctx || audio.ctx.state !== 'running') return;
      src = audio.ctx.createBufferSource(); src.buffer = songBuf;
      gain = audio.ctx.createGain(); gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(0.9, audio.ctx.currentTime + 1.6);
      src.connect(gain); gain.connect(audio.musicBus || audio.master || audio.ctx.destination);
      src.start();
    }
    function fadeOut(sec) {
      if (!gain) return;
      const now = audio.ctx.currentTime;
      gain.gain.cancelScheduledValues(now); gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + sec);
      const s = src; later(() => { try { s.stop(); } catch { /* artıq dayanıb */ } }, sec * 1000 + 80);
    }

    // ——— kadr planı: səhnə mətnindən ({ art } yeni kadr açır, sətirlər həmin kadrın alt yazılarıdır) ———
    const plan = []; let at = 1.2;
    for (const st of scene) {
      if (st.art) { plan.push({ art: st.art, t0: at, lines: [] }); continue; }
      if (!st.text || !plan.length) continue;
      const text = T(st.text.az), d = lineDur(text);
      plan[plan.length - 1].lines.push({ text, who: st.who || null, t0: at, t1: at + d }); at += d;
    }
    plan.forEach((s, i) => { s.t1 = i + 1 < plan.length ? plan[i + 1].t0 : at; });
    const cineEnd = at;

    const el = document.createElement('div');
    el.className = 'cgf cgf--cine';
    el.innerHTML = '<canvas class="cgf__cine" width="960" height="540"></canvas><div class="cgf__shade"></div><i class="cgf__bar cgf__bar--t"></i><i class="cgf__bar cgf__bar--b"></i><canvas class="cgf__sparks" width="240" height="135"></canvas><p class="cgf__sub"></p><div class="cgf__title"></div><div class="cgf__roll"></div><div class="cgf__thanks"></div>';
    const cine = el.querySelector('.cgf__cine'), cx = cine.getContext('2d'), sub = el.querySelector('.cgf__sub');
    const sparks = el.querySelector('.cgf__sparks'), sx = sparks.getContext('2d');
    const P = Array.from({ length: 46 }, () => ({ x: Math.random() * 240, y: Math.random() * 135, v: 6 + Math.random() * 14, w: Math.random() * 6.28, a: 0.3 + Math.random() * 0.7 }));
    let last = performance.now(), tc = 0, phase = 'cine', shown = null, dropAt = -1;

    // bir kadrı kamera vəziyyəti ilə çək (k — kadrın içində 0…1, tt — kadr başlayandan saniyə)
    function drawShot(s, k, tt, alpha) {
      const im = ch.art[s.art], def = SHOTS[s.art] || { from: [1, 0.5, 0.5], to: [1, 0.5, 0.5] };
      if (!im) return;
      const e = ease(Math.max(0, Math.min(1, k)));
      let z = def.from[0] + (def.to[0] - def.from[0]) * e, px = def.from[1] + (def.to[1] - def.from[1]) * e, py = def.from[2] + (def.to[2] - def.from[2]) * e, ox = 0, oy = 0;
      if (def.fx === 'limp') { oy = Math.abs(Math.sin(tt * 2.1)) * 7; ox = Math.sin(tt * 1.05) * 3; }                     // axsaq addım
      else if (def.fx === 'tremor') { ox = Math.sin(tt * 31) * 0.9 + Math.sin(tt * 17.3) * 0.7; oy = Math.cos(tt * 27) * 0.8; }   // əl titrəyir
      else if (def.fx === 'drop') { const q = Math.max(0, 1 - tt / 0.5); oy = -q * q * 26 + (tt > 0.5 && tt < 1.1 ? Math.sin((tt - 0.5) * 40) * (1.1 - tt) * 6 : 0); }   // diz yerə dəyir: kamera enir, silkələnir
      z = Math.max(1, z);
      const sw = CW / z, sh = CH / z;
      const x0 = Math.max(0, Math.min(CW - sw, px * CW - sw / 2 + ox)), y0 = Math.max(0, Math.min(CH - sh, py * CH - sh / 2 + oy));
      cx.globalAlpha = alpha; cx.drawImage(im, x0, y0, sw, sh, 0, 0, CW, CH);
      // dünya nöqtəsini ekrana çevir (effektlər kadrla birlikdə hərəkət etsin)
      const W2S = (nx, ny) => [((nx * CW - x0) / sw) * CW, ((ny * CH - y0) / sh) * CH, z];
      if (def.fx === 'lights') {
        // faralar: əvvəl yanır, titrəyir, kadrın sonuna doğru sönür
        const life = 1 - Math.max(0, Math.min(1, (k - 0.55) / 0.35)), fl = life * (0.75 + 0.25 * Math.sin(tt * 23) * Math.sin(tt * 7.1)) * (k > 0.5 && Math.sin(tt * 41) > 0.8 ? 0.3 : 1);
        cx.globalCompositeOperation = 'lighter';
        for (const [hx, hy] of [[0.512, 0.706], [0.629, 0.71]]) { const [ax, ay, zz] = W2S(hx, hy), rr = 70 * zz; const g = cx.createRadialGradient(ax, ay, 0, ax, ay, rr); g.addColorStop(0, `rgba(255,236,170,${(0.55 * fl * alpha).toFixed(3)})`); g.addColorStop(1, 'rgba(255,236,170,0)'); cx.fillStyle = g; cx.fillRect(ax - rr, ay - rr, rr * 2, rr * 2); }
        cx.globalCompositeOperation = 'source-over';
      } else if (def.fx === 'sun') {
        const [ax, ay, zz] = W2S(0.5, 0.415), grow = 0.5 + 0.5 * Math.min(1, tt / 14), rr = (170 + grow * 190) * zz;
        cx.globalCompositeOperation = 'lighter';
        const g = cx.createRadialGradient(ax, ay, 0, ax, ay, rr); g.addColorStop(0, `rgba(255,214,140,${(0.5 * grow * alpha).toFixed(3)})`); g.addColorStop(0.4, `rgba(255,150,70,${(0.2 * grow * alpha).toFixed(3)})`); g.addColorStop(1, 'rgba(255,120,40,0)');
        cx.fillStyle = g; cx.fillRect(0, 0, CW, CH);
        cx.globalCompositeOperation = 'source-over';
      } else if (def.fx === 'pulse') {
        // nəbz: kənarlar qaralıb-açılır, getdikcə yavaşıyır
        const beat = Math.pow(Math.max(0, Math.sin(tt * (3.4 - Math.min(1.6, tt * 0.16)))), 6);
        const g = cx.createRadialGradient(CW / 2, CH / 2, CH * 0.25, CW / 2, CH / 2, CH * 0.85); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(20,0,4,${((0.35 + beat * 0.3) * alpha).toFixed(3)})`);
        cx.fillStyle = g; cx.fillRect(0, 0, CW, CH);
      }
      cx.globalAlpha = 1;
    }

    const tick = (now) => {
      if (dead) return; raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!ch.paused) tc += dt;
      // ——— kadrlar ———
      let i = plan.findIndex((s) => tc < s.t1); if (i < 0) i = plan.length - 1;
      const s = plan[i], tt = tc - s.t0, dur = s.t1 - s.t0;
      cx.fillStyle = '#05030a'; cx.fillRect(0, 0, CW, CH);
      if (plan.length) {
        // son kadr bitəndən sonra da (başlıq, yazılar) günəş doğmağa davam edir
        drawShot(s, tt / dur, tt, 1);
        if (i > 0 && tt < XFADE) { const p = plan[i - 1]; drawShot(p, 1 + tt / (p.t1 - p.t0), p.t1 - p.t0 + tt, 1 - tt / XFADE); }      // əvvəlki kadr əriyir
        if (tc < 2.2) { cx.fillStyle = `rgba(5,3,10,${(1 - tc / 2.2).toFixed(3)})`; cx.fillRect(0, 0, CW, CH); }                              // qaranlıqdan açılış
        if (s.art === 'g4' && dropAt !== i && tt > 0.5) { dropAt = i; audio.sfx('hit'); }
      }
      // film dənəsi
      for (let n = 0; n < 70; n++) { cx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)'; cx.fillRect((Math.random() * CW) | 0, (Math.random() * CH) | 0, 2, 2); }
      // ——— alt yazı ———
      const ln = phase === 'cine' ? s.lines.find((l) => tc >= l.t0 && tc < l.t1 - 0.45) : null;
      if (ln !== shown) {
        shown = ln || null; sub.classList.remove('is-on');
        if (ln) { sub.innerHTML = ''; if (ln.who && CAST[ln.who]) { const b = document.createElement('b'); b.textContent = CAST[ln.who].name; b.lang = 'en'; b.style.color = CAST[ln.who].color; sub.appendChild(b); } sub.appendChild(document.createTextNode(ln.text)); void sub.offsetWidth; sub.classList.add('is-on'); }
      }
      // ——— qığılcımlar ———
      sx.clearRect(0, 0, 240, 135);
      for (const p of P) { p.y -= p.v * dt; p.w += dt * 1.7; p.x += Math.sin(p.w) * 6 * dt; if (p.y < -2) { p.y = 137; p.x = Math.random() * 240; } sx.fillStyle = `rgba(255,${150 + (p.v * 5 | 0)},60,${(p.a * (0.5 + 0.5 * Math.sin(p.w * 2))).toFixed(2)})`; sx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    };

    // klik / düymə: növbəti alt yazıya (kadr ardıcıllığı pozulmur, sadəcə tezləşir)
    const skip = () => { if (phase !== 'cine' || ch.paused) return; const all = plan.flatMap((s) => s.lines); const nx = all.find((l) => l.t0 > tc + 0.05); tc = nx ? nx.t0 : cineEnd; };
    const onKey = (e) => { if (['Enter', 'Space', 'KeyE'].includes(e.code) && phase === 'cine') { e.preventDefault(); skip(); } };
    const until = (cond) => new Promise((r) => { const f = () => { if (dead || cond()) r(); else later(f, 80); }; f(); });

    async function run() {
      await Promise.race([preloadSong() || Promise.resolve(), new Promise((r) => setTimeout(r, 2500))]);
      if (dead) return;
      ch.dlg.hide();
      ch.el.classList.add('is-finale');
      ch.el.appendChild(el);
      el.addEventListener('click', skip);
      addEventListener('keydown', onKey);
      play();
      last = performance.now();
      raf = requestAnimationFrame(tick);
      // 1) sinematik səhnə
      await until(() => tc >= cineEnd);
      if (dead) return;
      phase = 'title'; el.classList.add('is-on');
      // 2) başlıq — son kadrın üstündə
      const title = el.querySelector('.cgf__title');
      title.innerHTML = `<b>CARMAGEDDON</b><span>${t('cg.ch1')} — HEARTH</span><i>${t('cg.f.end')}</i>`;
      title.classList.add('is-on');
      await new Promise((r) => later(r, 5400));
      if (dead) return;
      title.classList.remove('is-on');
      // 3) yekun yazıları: müddət mahnının qalan hissəsinə görə
      phase = 'roll';
      const roll = el.querySelector('.cgf__roll');
      const sec = (h, rows) => `<section><h5>${h}</h5>${rows.map((r) => `<p>${r}</p>`).join('')}</section>`;
      roll.innerHTML = `<div class="cgf__in">
        ${sec(t('cg.f.created'), ['Samir Abbasov'])}
        ${sec(t('cg.f.dev'), ['Samir Abbasov'])}
        ${sec(t('cg.f.music'), ['«HEÇ KİM BİLMİR» — Samir Abbasov', 'Lone Scavenger · Wasteland Caravan · Desert Settlement — vitalezzz', 'The Hunt — Sudocolon', 'EmptyCity — yd', 'Bleeding Out — Brandon Morris'])}
        ${sec(t('cg.f.fonts'), ['Black Ops One · Tiny5', 'SIL Open Font License'])}
        <section class="cgf__mem"><h5>${t('cg.f.memory')}</h5>${HEARTH.map((n) => `<p>${n}</p>`).join('')}<p class="cgf__dim">${t('cg.f.others')}</p></section>
        <section class="cgf__left"><h5>${t('cg.f.remain')}</h5>${BARONS.map((n) => `<p>${n}</p>`).join('')}<p class="cgf__dim">${t('cg.f.silent')}</p></section>
        <section class="cgf__big"><p>${t('cg.f.back')}</p><p class="cgf__dim">${t('cg.f.ch2')}</p></section>
      </div>`;
      const remain = total() - elapsed();
      const dur = Math.max(22, Math.min(70, remain - 9));              // son 9 saniyə — təşəkkür kartı
      roll.querySelector('.cgf__in').style.animationDuration = dur + 's';
      roll.classList.add('is-on');
      await new Promise((r) => { const done = () => r(); later(done, dur * 1000); el.addEventListener('click', () => { if (el.dataset.skip === '1') done(); else el.dataset.skip = '1'; }); });
      if (dead) return;
      roll.classList.remove('is-on');
      // 4) təşəkkür — mahnı onunla birlikdə sönür
      phase = 'thanks';
      const th = el.querySelector('.cgf__thanks');
      th.innerHTML = `<b>${t('cg.f.thanks')}</b><span>${t('cg.f.demoEnd')}</span><i>NITROVERSE · 2026</i>`;
      th.classList.add('is-on');
      fadeOut(Math.max(4, Math.min(9, total() - elapsed())));
      await new Promise((r) => { later(r, 11000); later(() => th.addEventListener('click', r, { once: true }), 1500); });
      finish();
    }
    function finish() { if (dead) return; stop(); resolve(); }
    function stop() {
      dead = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout); removeEventListener('keydown', onKey);
      if (src) { try { fadeOut(0.4); } catch { /* boş */ } }
      el.remove(); ch.el.classList.remove('is-finale'); ch._finale = null;
    }
    ch._finale = { stop, elapsed, total, skip, el, plan, cineEnd, get playing() { return !!src; }, get state() { const i = Math.max(0, plan.findIndex((s) => tc < s.t1)); return { phase, tc, shot: phase === 'cine' ? plan[i]?.art : plan[plan.length - 1]?.art, sub: shown?.text || '' }; } };
    run();
  });
}
