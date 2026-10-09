// CARMAGEDDON — öz musiqisi (NitroVerse-in musiqisindən ayrıdır; treklər: docs/ASSETS-LICENSES.md).
// Tək <audio> elementi: trek dəyişəndə əvvəlki sönür, yenisi açılır. Səviyyə oyunun musiqi səviyyəsinə
// və səs söndürmə düyməsinə tabedir. Brauzer səsi istifadəçi jestindən əvvəl açmırsa (telefon),
// ilk toxunuşda/klikdə özü başlayır — eyni element sonradan jestsiz də trek dəyişə bilir.
import { audio } from '../../core/AudioManager.js';
import { assetBase } from '../../net/apiBase.js';

const BASE = 0.55;                       // musiqinin öz səviyyəsi (dialoq "mırıltısı" eşidilsin)
let el = null, want = null, cur = null, level = 0, target = 0, timer = 0, pendingGesture = false;

const master = () => (audio.muted ? 0 : (audio.vol?.music ?? 0.6)) * BASE;
function ensure() {
  if (el) return;
  el = new Audio(); el.loop = true; el.preload = 'auto'; el.volume = 0;
  const retry = () => { if (pendingGesture && want) { pendingGesture = false; start(); } };
  addEventListener('pointerdown', retry, true); addEventListener('keydown', retry, true);
  timer = setInterval(tick, 60);
}
function start() {
  if (!want) return;
  if (cur !== want) { cur = want; el.src = assetBase() + `carmageddon/music/${want}.mp3`; el.currentTime = 0; level = 0; el.volume = 0; }
  target = 1;
  const p = el.play();
  if (p?.catch) p.catch(() => { pendingGesture = true; });
}
function tick() {
  if (!el) return;
  // trek dəyişir: əvvəl köhnəni söndür
  if (want !== cur && cur) target = 0;
  level += Math.sign(target - level) * Math.min(Math.abs(target - level), 0.07);
  el.volume = Math.max(0, Math.min(1, level * master()));
  if (level <= 0.001 && target === 0) {
    if (want && want !== cur) start();
    else if (!want && !el.paused) { el.pause(); cur = null; }
  }
}

export const music = {
  play(name) { ensure(); if (want === name) return; want = name; if (!cur || el.paused || cur === name) start(); },      // cur === name: stop()-dan dərhal sonra eyni trek — sönmə geri qaytarılır (əvvəl səssiz qalırdı)
  stop() { want = null; target = 0; },
  get track() { return want; },
  get state() { return { want, cur, level: +level.toFixed(2), vol: el ? +el.volume.toFixed(3) : 0, paused: el ? el.paused : true, pending: pendingGesture }; },
  dispose() { want = null; target = 0; if (el) { el.pause(); el.removeAttribute('src'); } cur = null; level = 0; clearInterval(timer); timer = 0; el = null; },
};
