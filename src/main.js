import './styles.css';
import { Game } from './core/Game.js';
import { Input } from './core/Input.js';
import { audio } from './core/AudioManager.js';
import { isTouchDevice } from './core/TouchControls.js';
import { ModelLibrary } from './core/ModelLibrary.js';
import { ShowcaseScene } from './core/ShowcaseScene.js';
import { renderAbilityIcons } from './core/ItemAssets.js';
import { POWERUP_TYPES } from './race/PowerUpManager.js';
import { CAR_MODELS, CARS } from './data/cars.js';
import { Menu } from './ui/Menu.js';
import { Results } from './ui/Results.js';
import { GameplayScene } from './core/GameplayScene.js';
import { EndlessScene } from './core/EndlessScene.js';
import { FootballScene } from './core/FootballScene.js';
import { ArenaScene } from './core/ArenaScene.js';
import { auth } from './net/Auth.js';
import { social } from './net/Social.js';
import { Notices } from './ui/Notices.js';
import { t } from './core/i18n.js';
import { raceGold } from './data/economy.js';

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');

const game = new Game(canvas);
const input = new Input();
const library = new ModelLibrary();
let thumbs = {};
game.start();

// ————— Səs: mute düyməsi + brauzer jest tələbi —————
const muteBtn = document.createElement('button');
muteBtn.id = 'mute-btn';
muteBtn.title = 'Səs aç/bağla (M)';
muteBtn.textContent = audio.muted ? '🔇' : '🔊';
muteBtn.onclick = () => { muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊'; };
document.body.appendChild(muteBtn);

// SƏS KİLİDİ: brauzerlər istifadəçi jesti olmadan səsə icazə vermir.
// Ona görə mümkün olan BÜTÜN ilk jestlərə qulaq asırıq — hansı gəlsə,
// musiqi həmin an başlayır (bax AudioManager.resume → playMusic bərpası).
for (const ev of ['touchstart', 'click']) {
  window.addEventListener(ev, () => audio.resume(), { passive: true });
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
  window.__social = social;
  window.__auth = auth;
  // Vizual testlər üçün (kosmetika yoxlanışı) — yalnız DEV
  import('three').then((m) => { window.__THREE = m; });
}

// Telefonda: oyun başlayanda tam ekran + landşaft kilidi cəhdi
// (Android-də işləyir; iOS-da CSS "telefonu çevir" ekranı kömək edir)
function tryLandscapeFullscreen() {
  if (!isTouchDevice()) return;
  const el = document.documentElement;
  Promise.resolve(el.requestFullscreen?.())
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => { /* dəstəklənmirsə sakitcə keç */ });
}

// ————— State machine —————
let activeMenu = null; // dəvət/DM axını üçün — oyun içindəykən null

function goMenu() {
  audio.stopEngine();
  audio.playMusic('menu');
  input.enabled = true;
  input.binds.clear();
  // Menyu arxa fonu: canlı 3D showcase (seçilmiş trek + maşın)
  const showcase = new ShowcaseScene(game.renderer, library);
  game.setActive(showcase);
  if (import.meta.env.DEV) window.__showcase = showcase;
  const menu = new Menu(uiRoot, {
    onStart: startGame,
    onStartOnline: startOnlineGame,
    thumbs,
    onPreviewTrack: (t) => showcase.setTrack(t),
    onPreviewCar: (c) => showcase.setCar(c),
    onPreviewDemo: (kind, cos) => showcase.setDemo(kind, cos),
  });
  activeMenu = menu;
  if (import.meta.env.DEV) window.__menu = menu;
  menu.showModes();
}

// ————— Onlayn: eyni otağın lobbisinə qayıt (bağlantılar qalır) —————
function goLobby(net) {
  audio.stopEngine();
  audio.playMusic('menu');
  net.leaveGame(); // qalan oyunçular maşınımı səhnədən çıxarsın
  net.resetForLobby();
  input.enabled = true;
  input.binds.clear();
  const showcase = new ShowcaseScene(game.renderer, library);
  game.setActive(showcase);
  if (import.meta.env.DEV) window.__showcase = showcase;
  const menu = new Menu(uiRoot, {
    onStart: startGame,
    onStartOnline: startOnlineGame,
    thumbs,
    onPreviewTrack: (t) => showcase.setTrack(t),
    onPreviewCar: (c) => showcase.setCar(c),
    onPreviewDemo: (kind, cos) => showcase.setDemo(kind, cos),
  });
  menu.net = net;
  menu._lobbyCarId = net.players.find((p) => p.id === net.selfId)?.carId || null;
  activeMenu = menu;
  if (import.meta.env.DEV) window.__menu = menu;
  menu.showLobby();
}

// ————— Onlayn yarış —————
function startOnlineGame(net, startMsg) {
  tryLandscapeFullscreen();
  activeMenu = null;
  social.setActivity('idle');
  const me = startMsg.players.find((p) => p.id === net.selfId);
  // Arena rejimi ayrıca səhnəyə gedir
  if (startMsg.mode === 'arena') {
    uiRoot.innerHTML = '';
    game.setActive(null);
    audio.playMusic('race');
    audio.startEngine();
    const ar = new ArenaScene(
      { mode: 'arena', carId: me?.carId || 'blaze', online: { net, players: startMsg.players } },
      {
        input, uiRoot, renderer: game.renderer, library,
        onQuit: () => goLobby(net),
        onLeave: () => { net.dispose(); goMenu(); },
      }
    );
    net.on('start', (msg) => startOnlineGame(net, msg));
    game.setActive(ar);
    return;
  }
  // Futbol rejimi ayrıca səhnəyə gedir
  if (startMsg.mode === 'football') {
    uiRoot.innerHTML = '';
    game.setActive(null);
    audio.playMusic('race');
    audio.startEngine();
    const fb = new FootballScene(
      { mode: 'football', carId: me?.carId || 'blaze', online: { net, players: startMsg.players } },
      {
        input, uiRoot, renderer: game.renderer, library,
        onQuit: () => goLobby(net),
        onLeave: () => { net.dispose(); goMenu(); },
      }
    );
    net.on('start', (msg) => startOnlineGame(net, msg));
    game.setActive(fb);
    return;
  }
  const config = {
    mode: 'race',
    trackId: startMsg.track,
    laps: startMsg.laps,
    carId: me?.carId || 'blaze',
    online: { net, players: startMsg.players, seed: startMsg.seed ?? null },
  };
  uiRoot.innerHTML = '';
  game.setActive(null); // köhnə dispose → stopEngine burada olur
  audio.playMusic('race');
  audio.startEngine();
  const scene = new GameplayScene(config, {
    input,
    uiRoot,
    renderer: game.renderer,
    library,
    onFinish: (standings, cfg) => {
      // Nəticə ekranında ikən host yeni yarış başlada bilər — avtomatik qoşul
      net.on('start', (msg) => startOnlineGame(net, msg));
      net.on('closed', () => { net.dispose(); goMenu(); });
      awardRaceGold(standings, cfg);
      new Results(uiRoot, {
        standings,
        thumbs,
        restartLabel: t('cmn.backRoom'),
        menuLabel: t('res.leaveRoom'),
        onRestart: () => goLobby(net),
        onMenu: () => { net.dispose(); goMenu(); },
      });
    },
    onQuit: () => { net.dispose(); goMenu(); },
    onLobby: () => goLobby(net),
    onRestart: () => {},
  });
  game.setActive(scene);
}

function startGame(config) {
  tryLandscapeFullscreen();
  activeMenu = null;
  social.setActivity('idle');
  // ƏVVƏLCƏ köhnə səhnəni dispose et (onun stopEngine-i yeni mühərriki
  // söndürməsin deyə audio bundan SONRA başlayır)
  game.setActive(null);
  uiRoot.innerHTML = '';
  // ARENA battle royale — offline botlarla
  if (config.mode === 'arena') {
    audio.playMusic('race');
    audio.startEngine();
    const ar = new ArenaScene(config, {
      input, uiRoot, renderer: game.renderer, library, onQuit: goMenu,
      onRestart: () => startGame(config),
    });
    game.setActive(ar);
    return;
  }
  // FUTBOL 3v3 — offline botlarla
  if (config.mode === 'football') {
    audio.playMusic('race');
    audio.startEngine();
    const fb = new FootballScene(config, {
      input, uiRoot, renderer: game.renderer, library, onQuit: goMenu,
    });
    game.setActive(fb);
    return;
  }
  // SƏRBƏST SÜRÜŞ 2.0 — sonsuz zen rejimi (lofi musiqini səhnə özü qoşur)
  if (config.mode === 'free') {
    audio.startEngine();
    const zen = new EndlessScene(config, {
      input, uiRoot, renderer: game.renderer, library, onQuit: goMenu,
    });
    game.setActive(zen);
    return;
  }
  audio.playMusic('race');
  audio.startEngine();
  const scene = new GameplayScene(config, {
    input,
    uiRoot,
    renderer: game.renderer,
    library,
    onFinish: showResults,
    onQuit: goMenu,
    onRestart: (cfg) => startGame(cfg),
  });
  game.setActive(scene);
}

function showResults(standings, config) {
  awardRaceGold(standings, config);
  new Results(uiRoot, {
    standings,
    thumbs,
    onRestart: () => startGame(config),
    onMenu: goMenu,
  });
}

// Yarış qızılı: mövqe × dövrə (yalnız hesabla; nəticə ekranında göstərilir)
function awardRaceGold(standings, config) {
  if (config?.mode !== 'race') return;
  const me = standings.find((r) => r.isPlayer);
  if (!me?.position) return;
  const amount = raceGold(me.position, config.laps ?? 1, config.difficulty || 'normal');
  if (amount <= 0) return;
  if (auth.isLoggedIn) {
    me.goldEarned = amount;
    auth.award(amount, 'race'); // async — nəticəni bloklamır
  } else {
    me.goldMissed = amount; // qonağa "hesab yarat" işarəsi
  }
}

// ————— Boot: modelləri yüklə → menyu —————
async function boot() {
  uiRoot.innerHTML = `<div class="loading"><div class="spinner"></div><div>Modellər yüklənir…</div></div>`;
  // Sessiya bərpası (paralel, boot-u max 2.5s ləngidir)
  const authReady = Promise.race([
    auth.restore().catch(() => null),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  try {
    await library.loadCars(CAR_MODELS);
    thumbs = library.renderThumbnails(CARS);
    // Power-up ikonları — professional vektor badge-lər
    const abilityIcons = renderAbilityIcons();
    for (const t of POWERUP_TYPES) t.img = abilityIcons[t.id];
  } catch (err) {
    console.error('Model yükləmə xətası:', err);
  }
  await authReady; // profil çipi ilk açılışdan düzgün görünsün
  goMenu();
}

boot();
// ————— Sosial: kimlik, bildirişlər, dəvət axını —————
const notices = new Notices();
window.__notices = notices; // Menu bildirişləri buradan göstərir

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
syncSocialIdentity();
auth.onChange(syncSocialIdentity);

// Dəvəti qəbul edən tərəf: invroom (otaq kodu) gözlənilir
let pendingInviteFrom = null;
let pendingInviteT = 0;

social.onEvent = (ev) => {
  const inMenu = () => !!activeMenu && activeMenu.root?.isConnected;
  if (ev.kind === 'dm') {
    audio.sfx('click');
    const acts = [];
    if (ev.from?.u && auth.isLoggedIn) {
      acts.push({
        label: t('ntc.reply'), primary: true,
        onClick: () => { if (inMenu()) activeMenu.showConversation(ev.from.u); },
      });
    }
    notices.show({ icon: '✉️', text: `${ev.from?.n || '?'}: ${ev.text || ''}`, actions: acts, life: 9 });
    // Açıq söhbət pəncərəsi varsa dərhal yenilə
    if (inMenu() && activeMenu._dmWith === ev.from?.u) activeMenu._refreshConvo?.();
  } else if (ev.kind === 'frq') {
    notices.show({
      icon: '👥', text: t('ntc.frq', { n: ev.from?.n || '?' }),
      actions: [
        {
          label: t('ntc.accept'), primary: true,
          onClick: async () => {
            const ok = ev.from?.u && await social.frAccept(ev.from.u);
            notices.show({ icon: '👥', text: ok ? t('ntc.nowFriends', { n: ev.from?.n || '?' }) : t('ntc.sendFail'), life: 5 });
          },
        },
        { label: t('ntc.decline'), onClick: () => {} },
      ],
      life: 20,
    });
  } else if (ev.kind === 'fracc') {
    notices.show({ icon: '👥', text: t('ntc.fracc', { n: ev.from?.n || '?' }), life: 7 });
  } else if (ev.kind === 'inv') {
    audio.sfx('pickup');
    notices.show({
      icon: '🎮', text: t('ntc.inv', { n: ev.from?.n || '?' }),
      actions: [
        {
          label: t('ntc.accept'), primary: true,
          onClick: async () => {
            pendingInviteFrom = ev.from?.cid || null;
            pendingInviteT = Date.now();
            await social.sendTo(ev.from.cid, 'invacc');
            notices.show({ icon: '⏳', text: t('ntc.joining'), life: 20 });
          },
        },
        { label: t('ntc.decline'), onClick: () => {} },
      ],
      life: 25,
    });
  } else if (ev.kind === 'invacc') {
    // Dəvət göndərən: avtomatik otaq qur (lobbidəyəmsə kodu birbaşa göndər)
    notices.show({ icon: '🎮', text: t('ntc.invAccepted', { n: ev.from?.n || '?' }), life: 8 });
    if (inMenu()) activeMenu.hostInviteRoom?.(ev.from?.cid);
  } else if (ev.kind === 'invroom') {
    // Dəvəti qəbul edən: otağa avtomatik qoşul (yalnız öz qəbulumdan sonra)
    const fresh = pendingInviteFrom && Date.now() - pendingInviteT < 60000;
    if (fresh && ev.code && inMenu()) {
      pendingInviteFrom = null;
      activeMenu._joinWithCode?.(ev.code);
    }
  }
};

social.startPresence(); // qlobal onlayn sayı + bildiriş inbox-u üçün nəbz
