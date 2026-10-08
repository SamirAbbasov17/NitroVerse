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
window.addEventListener('pointerdown', () => {
  audio.resume();
  // Telefonda ilk toxunuşdan etibarən (menyuda da) tam ekran + landşaft
  if (!document.fullscreenElement) tryLandscapeFullscreen();
});
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

// Telefonda: oyun başlayanda tam ekran + landşaft kilidi cəhdi
// (Android-də işləyir; iOS-da CSS "telefonu çevir" ekranı kömək edir)
export function tryLandscapeFullscreen() {
  if (!isTouchDevice()) return;
  const el = document.documentElement;
  Promise.resolve(el.requestFullscreen?.())
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => { /* dəstəklənmirsə sakitcə keç */ });
}

// "Telefonu yana çevir" ekranı index.html-də Azərbaycanca yazılıb — seçilmiş dilə keçirilir
{
  const rt = document.querySelector('.rotate-hint__text'), rs = document.querySelector('.rotate-hint__sub');
  if (rt) rt.textContent = t('rot.text');
  if (rs) rs.textContent = t('rot.sub');
}

// BAŞLANĞIC QAPISI (telefon): brauzer tam ekrana yalnız toxunuşla keçməyə icazə verir. Əvvəl menyu
// brauzer zolaqları ilə kiçik açılırdı və tam ekran ilk toxunuşda, menyunun ortasında gəlirdi
// (istifadəçi rəyi: "menyudakılar balaca görsənir"). İndi menyudan ƏVVƏL bir toxunuşluq qapı durur:
// toxunuş → tam ekran + landşaft → qapı açılır; menyu artıq tam ekranda görünür. Oyun bu vaxt
// arxada yüklənir. Tam ekranı dəstəkləməyən brauzerdə (iPhone Safari) qapı göstərilmir.
// DEV-də yalnız `localStorage apexGate='1'` ilə (testlər toxunuş gözləməsin).
function startGate() {
  let force = false;
  try { force = localStorage.getItem('apexGate') === '1'; } catch { /* gizli rejim */ }
  if (import.meta.env.DEV && !force) return;
  const el = document.documentElement;
  if (!isTouchDevice() || !el.requestFullscreen || document.fullscreenElement) return;
  if (window.matchMedia?.('(display-mode: fullscreen)').matches) return;
  const gate = document.createElement('button');
  gate.id = 'start-gate';
  gate.innerHTML = `<span class="start-gate__logo">NITRO<b>VERSE</b></span>
    <span class="start-gate__tap">${t('gate.tap')}</span>
    <span class="start-gate__sub">${t('gate.sub')}</span>`;
  document.body.appendChild(gate);
  let done = false;
  const open = () => {
    if (done) return; done = true;
    gate.classList.add('is-out');
    setTimeout(() => gate.remove(), 260);
  };
  gate.addEventListener('click', () => {
    audio.resume();
    gate.classList.add('is-busy');
    Promise.resolve(el.requestFullscreen())
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => { /* icazə verilmədi — oyun yenə açılır */ })
      // ekran ölçüsü oturana qədər bir an gözlə ki, menyu köhnə ölçüdə görünməsin
      .finally(() => setTimeout(open, 180));
    setTimeout(open, 1500);   // söz (promise) heç qayıtmasa da qapı bağlı qalmır
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

