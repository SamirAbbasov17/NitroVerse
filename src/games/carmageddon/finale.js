// CARMAGEDDON Fəsil 1 — FİNAL: son səhnə + yekun yazıları, mahnı ilə.
// Mahnı son səhnənin ilk kadrında başlayır. Təhkiyə özü irəliləyir (kliklə tezləşdirmək olur), sonra
// yekun yazıları yuxarı sürüşür; sürüşmənin müddəti mahnının QALAN vaxtına görə hesablanır ki,
// "təşəkkür" kartı mahnının son saniyələrinə düşsün və səs onunla birlikdə sönsün.
// Səs oyunun musiqi kanalına gedir (səs söndürmə və musiqi səviyyəsi ona da aiddir); səs
// açılmayıbsa (və ya fayl yüklənməyibsə) final eyni vaxtlama ilə səssiz gedir.
import { t } from '../../core/i18n.js';
import { audio } from '../../core/AudioManager.js';
import { assetBase } from '../../net/apiBase.js';

const SONG = 'carmageddon/ch1/final.mp3', SONG_LEN = 106;
let songBuf = null, songLoading = null;
export function preloadSong() {
  if (songBuf || songLoading || !audio.ctx) return songLoading;
  songLoading = fetch(assetBase() + SONG).then((r) => r.arrayBuffer()).then((b) => audio.ctx.decodeAudioData(b)).then((buf) => { songBuf = buf; }).catch(() => { songLoading = null; });
  return songLoading;
}

const HEARTH = ['Milo', 'Old Gus', 'Elder Amos', 'Granny Wren', 'Miss Clara', 'Radio Ray', 'Pip'];
const BARONS = ['Butcher', 'Madam Crude', 'Doctor Rust', 'Preacher', 'The Twins', 'Judge'];

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

    const el = document.createElement('div');
    el.className = 'cgf';
    el.innerHTML = '<canvas class="cgf__sparks" width="240" height="135"></canvas><div class="cgf__title"></div><div class="cgf__roll"></div><div class="cgf__thanks"></div>';
    const sparks = el.querySelector('canvas'), sx = sparks.getContext('2d');
    const P = Array.from({ length: 46 }, () => ({ x: Math.random() * 240, y: Math.random() * 135, v: 6 + Math.random() * 14, w: Math.random() * 6.28, a: 0.3 + Math.random() * 0.7 }));
    let last = performance.now();
    const tick = (now) => {
      if (dead) return; raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      sx.clearRect(0, 0, 240, 135);
      for (const p of P) { p.y -= p.v * dt; p.w += dt * 1.7; p.x += Math.sin(p.w) * 6 * dt; if (p.y < -2) { p.y = 137; p.x = Math.random() * 240; } sx.fillStyle = `rgba(255,${150 + (p.v * 5 | 0)},60,${(p.a * (0.5 + 0.5 * Math.sin(p.w * 2))).toFixed(2)})`; sx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    };

    async function run() {
      await Promise.race([preloadSong() || Promise.resolve(), new Promise((r) => setTimeout(r, 2500))]);
      if (dead) return;
      play();
      ch.el.classList.add('is-finale');
      ch.dlg.silent = true;                                             // mahnının üstündə "mırıltı" olmur
      ch.dlg.auto = (text) => 2300 + text.length * 62;                  // oxumağa vaxt verib özü keçir
      await ch._play(scene);
      ch.dlg.auto = null;
      if (dead || ch.dead) return;
      ch.dlg.hide();
      ch.el.appendChild(el);
      raf = requestAnimationFrame(tick);
      requestAnimationFrame(() => el.classList.add('is-on'));
      // 1) başlıq
      const title = el.querySelector('.cgf__title');
      title.innerHTML = `<b>CARMAGEDDON</b><span>${t('cg.ch1')} — HEARTH</span><i>${t('cg.f.end')}</i>`;
      title.classList.add('is-on');
      await new Promise((r) => later(r, 6200));
      if (dead) return;
      title.classList.remove('is-on');
      // 2) yekun yazıları: müddət mahnının qalan hissəsinə görə
      const roll = el.querySelector('.cgf__roll');
      const sec = (h, rows) => `<section><h5>${h}</h5>${rows.map((r) => `<p>${r}</p>`).join('')}</section>`;
      roll.innerHTML = `<div class="cgf__in">
        ${sec(t('cg.f.created'), ['Samir Abbasov'])}
        ${sec(t('cg.f.dev'), ['Samir Abbasov', 'Claude (Anthropic)'])}
        ${sec(t('cg.f.art'), [t('cg.f.artBy')])}
        ${sec(t('cg.f.music'), ['«HEÇ KİM BİLMİR»', 'Samir Abbasov'])}
        ${sec(t('cg.f.fonts'), ['Black Ops One · Tiny5', 'SIL Open Font License'])}
        <section class="cgf__mem"><h5>${t('cg.f.memory')}</h5>${HEARTH.map((n) => `<p>${n}</p>`).join('')}<p class="cgf__dim">${t('cg.f.others')}</p></section>
        <section class="cgf__left"><h5>${t('cg.f.remain')}</h5>${BARONS.map((n) => `<p>${n}</p>`).join('')}<p class="cgf__dim">${t('cg.f.silent')}</p></section>
        <section class="cgf__big"><p>${t('cg.f.back')}</p><p class="cgf__dim">${t('cg.f.ch2')}</p></section>
      </div>`;
      const remain = total() - elapsed();
      const dur = Math.max(30, Math.min(70, remain - 9));              // son 9 saniyə — təşəkkür kartı
      roll.querySelector('.cgf__in').style.animationDuration = dur + 's';
      roll.classList.add('is-on');
      await new Promise((r) => { const done = () => r(); later(done, dur * 1000); el.addEventListener('click', () => { if (elapsed() > 0 && el.dataset.skip === '1') done(); else el.dataset.skip = '1'; }); });
      if (dead) return;
      roll.classList.remove('is-on');
      // 3) təşəkkür — mahnı onunla birlikdə sönür
      const th = el.querySelector('.cgf__thanks');
      th.innerHTML = `<b>${t('cg.f.thanks')}</b><span>${t('cg.f.demoEnd')}</span><i>NitroVerse · 2026</i>`;
      th.classList.add('is-on');
      fadeOut(Math.max(4, Math.min(9, total() - elapsed())));
      await new Promise((r) => { later(r, 11000); later(() => th.addEventListener('click', r, { once: true }), 1500); });
      finish();
    }
    function finish() { if (dead) return; stop(); resolve(); }
    function stop() {
      dead = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout);
      ch.dlg.silent = false; ch.dlg.auto = null;
      if (src) { try { fadeOut(0.4); } catch { /* boş */ } }
      el.remove(); ch.el.classList.remove('is-finale'); ch._finale = null;
    }
    ch._finale = { stop, elapsed, total, get playing() { return !!src; }, el };
    run();
  });
}
