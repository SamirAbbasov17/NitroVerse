// YARIŞ OYUNU (NitroVerse-in ilk oyunu): yarış, zen, futbol 3v3, arena və onlayn — menyu, səhnələrin
// başladılması, nəticə, qızıl mükafatı, dəvət axını. Platformanı (src/platform.js) işlədir;
// `mount()` oyunu açır (bax src/games/index.js).
import { game, input, uiRoot, notices, tryLandscapeFullscreen } from '../../platform.js';
import { audio } from '../../core/AudioManager.js';
import { ModelLibrary } from '../../core/ModelLibrary.js';
import { ShowcaseScene } from '../../core/ShowcaseScene.js';
import { renderAbilityIcons } from '../../core/ItemAssets.js';
import { POWERUP_TYPES } from '../../race/PowerUpManager.js';
import { CAR_MODELS, CARS } from '../../data/cars.js';
import { Menu } from '../../ui/Menu.js';
import { Results } from '../../ui/Results.js';
import { auth } from '../../net/Auth.js';
import { social } from '../../net/Social.js';
import { t } from '../../core/i18n.js';
import { mergeRecords } from '../../data/records.js';
import { raceGold } from '../../data/economy.js';
import { equippedCosmetics, isCosmeticOwned } from '../../data/cosmetics.js';

const library = new ModelLibrary();
let thumbs = {};

// Musiqi paketi: oyunçunun mağazadan alıb taxdığı (yoxdursa standart sintez mövzuları)
audio.packProvider = () => {
  const id = equippedCosmetics(auth.profile).music;
  return id && isCosmeticOwned(id, auth.profile) ? id : null;
};
auth.onChange(() => audio.refreshMusicPack());   // giriş/çıxışda seçim dəyişir
auth.onChange((p) => mergeRecords(p?.records));   // hesabdakı rekordlar bu cihaza gəlir

// SƏHNƏLƏR AYRICA YÜKLƏNİR (Faza 5.7): dörd oyun səhnəsi ilk yükləmədə gəlmir — menyu
// açılandan sonra arxa fonda yüklənir. Oyunçu ondan tez "Başla"ya bassa, start həmin
// parçanı gözləyir (bax ensureScene). Başlatma funksiyaları sinxron qalır.
const Scenes = {};
const SCENE_LOADERS = {
  race: () => import('../../core/GameplayScene.js').then((m) => m.GameplayScene),
  free: () => import('../../core/EndlessScene.js').then((m) => m.EndlessScene),
  football: () => import('../../core/FootballScene.js').then((m) => m.FootballScene),
  arena: () => import('../../core/ArenaScene.js').then((m) => m.ArenaScene),
};
const scenePending = {};
function loadScene(mode) {
  const key = SCENE_LOADERS[mode] ? mode : 'race';
  scenePending[key] = scenePending[key] || SCENE_LOADERS[key]().then((C) => { Scenes[key] = C; return C; });
  return scenePending[key];
}
// Səhnə hazırdırsa true; deyilsə yüklənmə göstərir, bitəndə `retry`-ı çağırır və false qaytarır
function ensureScene(mode, retry) {
  const key = SCENE_LOADERS[mode] ? mode : 'race';
  if (Scenes[key]) return true;
  uiRoot.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  loadScene(key).then(retry, () => { scenePending[key] = null; goMenu(); });
  return false;
}

// MODEL DƏSTLƏRİNİ ƏVVƏLCƏDƏN YÜKLƏ: səhnə qurulanda hazır olsunlar.
// Əvvəl səhnə ilə birlikdə yüklənirdi və İLK chunk-lar prosedural
// (keyfiyyətsiz) modellərlə qurulurdu.
import('../../world/NatureKit.js').then((m) => m.sharedNature());
import('../../world/CityKit.js').then((m) => m.sharedCity());

if (import.meta.env.DEV) {
  // Onlayn testlər (tests/online.spec.js): menyudan keçmədən otaq qurub yarış başlatmaq üçün
  import('../../net/NetRoom.js').then((m) => { window.__online = { NetRoom: m.NetRoom, start: (net, msg) => startOnlineGame(net, msg) }; });
}

// ————— State machine —————
let activeMenu = null; // dəvət/DM axını üçün — oyun içindəykən null
let coverEl = null, coverTok = 0; // rejim açılışı örtüyü (bax showCover)

function goMenu() {
  if (coverEl) hideCover();   // səhnə yüklənməsi alınmayıb menyuya qayıdılırsa örtük qalmasın
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
    onPreviewTrack: (tt) => { showcase.setTrack(tt); if (game.active === showcase) game.post?.setGrade(showcase.grade); },
    onPreviewCar: (c) => showcase.setCar(c),
    onPreviewDemo: (kind, cos) => showcase.setDemo(kind, cos),
    gfx,
    onOpenGame: openGame,
  });
  activeMenu = menu;
  if (import.meta.env.DEV) window.__menu = menu;
  menu.showModes();
  // dil dəyişəndə səhifə yenilənir — oyunçu ayarlar ekranına qaytarılır
  try {
    if (sessionStorage.getItem('apexReopen') === 'settings') { sessionStorage.removeItem('apexReopen'); menu.showSettings('lang'); }
  } catch { /* gizli rejim */ }
}

// BAŞQA OYUNU AÇ (NitroVerse çox-oyunludur): yarış menyusu bağlanır, o biri oyun öz ekranı ilə açılır
// və çıxanda bura qayıdır. Oyunun kodu yalnız seçiləndə yüklənir.
function openGame(id) {
  if (id !== 'carmageddon') return;
  activeMenu = null;
  social.setActivity('idle');
  uiRoot.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  import('../carmageddon/index.js').then((m) => m.mount({ onExit: goMenu }), () => goMenu());
}

// Ayarlar ekranının qrafika körpüsü (Menu oyunu birbaşa tanımır)
const gfx = {
  get hasPost() { return !!game.post; },
  get post() { return !!game.post?.enabled; },
  setPost: (on) => game.post?.setEnabled(on),
  get speedFx() { return !!game.post?.speedFx; },
  setSpeedFx: (on) => game.post?.setSpeedFx(on),
  get quality() { return game.quality; },
  setQuality: (q) => game.setQuality(q),
};

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
    onPreviewTrack: (tt) => { showcase.setTrack(tt); if (game.active === showcase) game.post?.setGrade(showcase.grade); },
    onPreviewCar: (c) => showcase.setCar(c),
    onPreviewDemo: (kind, cos) => showcase.setDemo(kind, cos),
    gfx,
    onOpenGame: openGame,
  });
  menu.net = net;
  menu._lobbyCarId = net.players.find((p) => p.id === net.selfId)?.carId || null;
  activeMenu = menu;
  if (import.meta.env.DEV) window.__menu = menu;
  menu.showLobby();
}

// ————— Onlayn yarış —————
function startOnlineGame(net, startMsg) {
  showCover();
  if (!ensureScene(startMsg.mode, () => startOnlineGame(net, startMsg))) return;
  try { startOnlineGameNow(net, startMsg); } finally { hideCover(); }
}

function startOnlineGameNow(net, startMsg) {
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
    const ar = new Scenes.arena(
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
    const fb = new Scenes.football(
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
  const scene = new Scenes.race(config, {
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
        config: cfg,
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

// KEÇİD ÖRTÜYÜ: rejim açılanda səhnənin ilk kadrları (kamera yerinə oturur, uzaq obyektlər və
// şeyderlər hazır olur) tünd örtüyün arxasında qalır, sonra oyun yumşaq açılır. Əvvəl menyudan
// birbaşa yarımhazır kadra keçilirdi — "bir anlıq başqa yer görünür, sonra oyun" (oyunçu rəyi).
function showCover() {
  coverTok++;
  if (!coverEl) {
    coverEl = document.createElement('div');
    coverEl.id = 'scene-cover';
    coverEl.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(coverEl);
  }
  coverEl.classList.remove('is-out');
}
function hideCover() {
  const tok = coverTok;
  let n = 0;
  const step = () => {
    if (tok !== coverTok || !coverEl) return;
    if (++n < 5) { requestAnimationFrame(step); return; }      // səhnə bir neçə kadr çəksin
    coverEl.classList.add('is-out');
    setTimeout(() => { if (tok === coverTok && coverEl) { coverEl.remove(); coverEl = null; } }, 240);
  };
  requestAnimationFrame(step);
}

function startGame(config) {
  showCover();
  if (!ensureScene(config.mode, () => startGame(config))) return;
  try { startGameNow(config); } finally { hideCover(); }
}

function startGameNow(config) {
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
    const ar = new Scenes.arena(config, {
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
    const fb = new Scenes.football(config, {
      input, uiRoot, renderer: game.renderer, library, onQuit: goMenu,
      onRestart: () => startGame(config),
    });
    game.setActive(fb);
    return;
  }
  // SƏRBƏST SÜRÜŞ 2.0 — sonsuz zen rejimi (lofi musiqini səhnə özü qoşur)
  if (config.mode === 'free') {
    audio.startEngine();
    const zen = new Scenes.free(config, {
      input, uiRoot, renderer: game.renderer, library, onQuit: goMenu,
    });
    game.setActive(zen);
    return;
  }
  audio.playMusic('race');
  audio.startEngine();
  const scene = new Scenes.race(config, {
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
    config,
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
  uiRoot.innerHTML = `<div class="loading"><div class="spinner"></div><div>${t('load.models')}</div></div>`;
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
    for (const tt of POWERUP_TYPES) tt.img = abilityIcons[tt.id];
  } catch (err) {
    console.error('Model yükləmə xətası:', err);
  }
  await authReady; // profil çipi ilk açılışdan düzgün görünsün
  goMenu();
  // menyu göründü → oyun səhnələrini arxa fonda yüklə (ardıcıl, menyunu ləngitməsin)
  setTimeout(async () => { for (const m of Object.keys(SCENE_LOADERS)) await loadScene(m).catch(() => null); }, 600);
}

// ————— Sosial hadisələr: mesaj, dostluq, dəvət axını —————
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


// Oyunu aç: modellər yüklənir → menyu. Sosial nəbz də buradan başlayır (hadisə emalçısı hazırdır).
export function mount() {
  boot();
  social.startPresence(); // qlobal onlayn sayı + bildiriş inbox-u üçün nəbz
}
