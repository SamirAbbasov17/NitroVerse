// PLATFORMA (Faza 6.2): bütün oyunların ortaq təməli — kətan və render dövrü, giriş, səsin açılması,
// hesab/sosial kimlik, bildirişlər, ikonlar, xəta hesabatı. Oyunlar (src/games/<ad>/) buradakı
// obyektləri idxal edir; platforma heç bir oyunu tanımır (oyunların siyahısı: src/games/index.js).
import './styles.css';
import { Game } from './core/Game.js';
import { Input } from './core/Input.js';
import { audio } from './core/AudioManager.js';
import { isTouchDevice } from './core/TouchControls.js';
import { auth } from './net/Auth.js';
import { social } from './net/Social.js';
import { Notices } from './ui/Notices.js';
import { t } from './core/i18n.js';
import { installIconizer } from './ui/icons.js';
import { installErrorReporter } from './core/ErrorReporter.js';

installIconizer();   // emoji → vahid ikon dəsti (bax ui/icons.js)
const canvas = document.getElementById('game-canvas');
export const uiRoot = document.getElementById('ui-root');

export const game = new Game(canvas);
// Tutulmamış xətalar serverə bildirilir (rejim adı ilə) — bax ErrorReporter.js
installErrorReporter({
  getMode: () => game.active?.constructor?.name || 'boot',
  getCid: () => social.identity?.cid || '',
});
export const input = new Input();
game.start();

// ————— Səs: mute düyməsi + brauzer jest tələbi —————
const muteBtn = document.createElement('button');
muteBtn.id = 'mute-btn';
muteBtn.title = t('snd.toggle');
muteBtn.textContent = audio.muted ? '🔇' : '🔊';
muteBtn.onclick = () => { muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊'; };
document.body.appendChild(muteBtn);

// SƏS KİLİDİ: brauzerlər istifadəçi jesti olmadan səsə icazə vermir.
// Ona görə mümkün olan BÜTÜN ilk jestlərə qulaq asırıq — hansı gəlsə,
// musiqi həmin an başlayır (bax AudioManager.resume → playMusic bərpası).
for (const ev of ['touchstart', 'click']) {
  window.addEventListener(ev, () => audio.resume(), { passive: true });
}
// TƏHLÜKƏSİZLİK TORU: bəzi brauzerlər konteksti jestsiz sonradan açır
// (media-nişan icazəsi) — statechange hadisəsi ötürülsə belə ilk 8 saniyə
// yoxlayıb musiqini qururuq. Jest tələb edən brauzerlərdə zərərsizdir.
{
  let cəhd = 0;
  const tt = setInterval(() => {
    if (audio.ctx && audio.ctx.state === 'running' && audio._stalled) audio.resume(true);
    if (++cəhd >= 16 || (audio.ctx && audio.ctx.state === 'running' && !audio._stalled)) clearInterval(tt);
  }, 500);
}
window.addEventListener('pointerdown', () => audio.resume());
// TAM EKRANI QORU (telefon): istifadəçi tam ekrandan çıxıbsa (geri jesti, bildiriş paneli, başqa
// tətbiqə keçid, klaviatura) növbəti toxunuşda geri qayıdır. Brauzer toxunuşu yalnız barmaq
// QALXANDA "istifadəçi jesti" sayır — əvvəl sorğu pointerdown-da gedirdi və Android-də tez-tez rədd
// olunurdu (oyunçu rəyi: "bəzən yenə tam ekran olmur"). Yazı xanasında yazarkən toxunulmur.
for (const ev of ['pointerup', 'touchend', 'click']) {
  window.addEventListener(ev, () => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    tryLandscapeFullscreen();
  }, { capture: true, passive: true });
}
window.addEventListener('keydown', (e) => {
  audio.resume();
  const tag = e.target?.tagName;
  if (e.code === 'KeyM' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊';
  }
});
// Bütün UI düymələrində klik səsi
uiRoot.addEventListener('click', (e) => {
  if (e.target.closest('button')) audio.sfx('click');
});
if (import.meta.env.DEV) {
  window.__audio = audio;
  window.__auth = auth;
  window.__game = game;
  window.__social = social;
  // Vizual testlər üçün (kosmetika yoxlanışı) — yalnız DEV
  import('three').then((m) => { window.__THREE = m; });
}

// Telefonda tam ekran + landşaft kilidi. Yalnız istifadəçi jestinin içində işləyir (brauzer qaydası);
// artıq tam ekrandadırsa və ya cəhd gedirsə heç nə etmir. Android-də işləyir; iPhone Safari tam
// ekranı dəstəkləmir — orada "ana ekrana əlavə et" (manifest: fullscreen) və CSS "telefonu çevir" qalır.
const fsEl = document.documentElement;
const fsReq = fsEl.requestFullscreen || fsEl.webkitRequestFullscreen;
export const inFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement)
  || !!window.matchMedia?.('(display-mode: fullscreen)').matches;
let fsPending = null;   // gedən sorğu: eyni toxunuşun pointerup + click-i iki sorğu göndərməsin
export function tryLandscapeFullscreen() {
  if (!isTouchDevice() || !fsReq) return Promise.resolve(false);
  if (fsPending) return fsPending;
  if (inFullscreen()) { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); return Promise.resolve(true); }
  let req;
  try { req = fsReq.call(fsEl, { navigationUI: 'hide' }); } catch { req = Promise.reject(new Error('fs')); }
  fsPending = Promise.resolve(req)
    .then(() => { Promise.resolve(screen.orientation?.lock?.('landscape')).catch(() => { /* kilid dəstəklənmir */ }); return true; })
    .catch(() => false)
    .finally(() => { fsPending = null; });
  return fsPending;
}

// "Telefonu yana çevir" ekranı index.html-də Azərbaycanca yazılıb — seçilmiş dilə keçirilir
{
  const rt = document.querySelector('.rotate-hint__text'), rs = document.querySelector('.rotate-hint__sub');
  if (rt) rt.textContent = t('rot.text');
  if (rs) rs.textContent = t('rot.sub');
}

// BAŞLANĞIC EKRANI (telefon): brauzer tam ekrana yalnız toxunuşla keçməyə icazə verir. Ona görə
// menyudan ƏVVƏL başlıq ekranı durur: arxada canlı 3D səhnə, loqo və "Başla" düyməsi. Toxunuş →
// tam ekran + landşaft → menyu artıq tam ekranda açılır. Tam ekran alınmasa oyun yenə açılır və
// sonrakı hər toxunuş yenidən cəhd edir (yuxarıdakı qoruyucu). Tam ekranı dəstəkləməyən brauzerdə
// göstərilmir. DEV-də yalnız `localStorage apexGate='1'` ilə (testlər toxunuş gözləməsin).
function startGate() {
  let force = false;
  try { force = localStorage.getItem('apexGate') === '1'; } catch { /* gizli rejim */ }
  if (import.meta.env.DEV && !force) return;
  if (!isTouchDevice() || !fsReq || inFullscreen()) return;
  const gate = document.createElement('div');
  gate.id = 'start-gate';
  gate.innerHTML = `
    <div class="start-gate__shade"></div>
    <div class="start-gate__box">
      <div class="start-gate__logo">Nitro<b>Verse</b></div>
      <div class="start-gate__tag">${t('gate.tag')}</div>
      <button class="start-gate__btn" type="button"><span>${t('gate.tap')}</span></button>
      <div class="start-gate__sub">${t('gate.sub')}</div>
    </div>`;
  document.body.appendChild(gate);
  document.body.classList.add('gate-on');     // menyu qapının arxasında görünmür, 3D səhnə görünür
  let done = false;
  const open = () => {
    if (done) return; done = true;
    document.body.classList.remove('gate-on');
    gate.classList.add('is-out');
    setTimeout(() => gate.remove(), 320);
  };
  // bütün ekran toxunuşa cavab verir (düymə — hara basmaq lazım olduğunu göstərir)
  gate.addEventListener('click', () => {
    if (gate.classList.contains('is-busy')) return;
    audio.resume();
    gate.classList.add('is-busy');
    // ekran ölçüsü oturana qədər bir an gözlə ki, menyu köhnə ölçüdə görünməsin
    tryLandscapeFullscreen().finally(() => setTimeout(open, 220));
    setTimeout(open, 1600);   // söz (promise) heç qayıtmasa da qapı bağlı qalmır
  });
}
startGate();

// ————— Bildirişlər və sosial kimlik (bütün oyunlar üçün ortaq) —————
export const notices = new Notices();
window.__notices = notices; // menyular bildirişləri buradan göstərir
// Hesaba başqa cihazdan girilib → bu cihaz çıxarıldı; səbəbi deyilir
auth.onKicked(() => notices.show({ icon: '🔒', text: t('acc.kicked'), life: 14 }));

// Server cleanUser ilə EYNİ normallaşdırma — 'İ'.toLowerCase() 'i̇' (nöqtəli)
// verir, birləşən işarə uzaqlaşdırılmasa ünvanlar uyğun gəlmir
const cleanUser = (v) => String(v || '').toLowerCase().replace(/[^\p{L}0-9_-]/gu, '').slice(0, 16);

function syncSocialIdentity() {
  social.identity = {
    nick: auth.profile?.nick || localStorage.getItem('apexName') || '',
    user: auth.profile?.nick ? cleanUser(auth.profile.nick) : null,
  };
  social.refreshPresence(); // ad/istifadəçi dərhal siyahıya düşsün
}
social.tokenOf = () => auth.token;
social.onAuthError = () => auth.check();
syncSocialIdentity();
auth.onChange(syncSocialIdentity);

