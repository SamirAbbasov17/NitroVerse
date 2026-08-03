import Peer from 'peerjs';
import { announceRoom } from './RoomDirectory.js';

// PeerJS (WebRTC P2P) otaq sistemi — server tələb etmir.
// Host otaq yaradır (qısa kod), qonaqlar kodla qoşulur (ulduz topologiyası: host relay edir).
// QEYD: prefiksdəki versiya köhnə client-lərin yeni otaqlara düşməsinin qarşısını alır.
const PREFIX = 'apex-drift-v12-';

// STUN + pulsuz TURN relay-lər — sərt NAT/korporativ şəbəkələrdə də bağlantı qurulsun.
// Bir neçə müstəqil TURN provayderi: biri işləməsə, digəri relay edir.
// ————— BROKER (signaling) SERVERİ —————
// Standart olaraq PeerJS-in İCTİMAİ brokeri işlədilir. Öz serverimiz varsa
// build zamanı təyin olunur (bax peerserver/README.md):
//   VITE_PEER_HOST=peer.nitroverse.app VITE_PEER_PORT=443 VITE_PEER_SECURE=1
// Testdə `window.__PEER_OVERRIDE` ilə də yönləndirmək olar.
function brokerConfig() {
  const ov = (typeof window !== 'undefined' && window.__PEER_OVERRIDE) || null;
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  let host = ov?.host ?? env.VITE_PEER_HOST;
  if (!host) return {};                       // ictimai broker (köhnə davranış)
  // VITE_PEER_HOST=self → broker SAYTIN ÖZ ünvanındadır (Caddy /peer-ə
  // yönləndirir). Belə olanda IP-dən domenə keçəndə və HTTP→HTTPS
  // dəyişəndə yenidən build lazım gəlmir — hər şey runtime-da həll olunur.
  if (host === 'self' && typeof window !== 'undefined') {
    const loc = window.location;
    const httpsMi = loc.protocol === 'https:';
    return {
      host: loc.hostname,
      port: Number(loc.port || (httpsMi ? 443 : 80)),
      path: ov?.path ?? env.VITE_PEER_PATH ?? '/peer',
      key: ov?.key ?? env.VITE_PEER_KEY ?? 'nitroverse',
      secure: httpsMi,
    };
  }
  const secure = ov?.secure ?? (String(env.VITE_PEER_SECURE || '') === '1');
  return {
    host,
    port: Number(ov?.port ?? env.VITE_PEER_PORT ?? (secure ? 443 : 9000)),
    path: ov?.path ?? env.VITE_PEER_PATH ?? '/peer',
    key: ov?.key ?? env.VITE_PEER_KEY ?? 'nitroverse',
    secure,
  };
}

const PEER_ICE = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      // FreeSTUN pulsuz TURN
      { urls: 'turn:freestun.net:3478', username: 'free', credential: 'free' },
      // Metered Open Relay (UDP + TCP-443: firewall arxasından keçid)
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    ],
    iceCandidatePoolSize: 4,
  },
};

// Peer parametrləri HƏR ÇAĞIRIŞDA yenidən hesablanır — modul yüklənən anda
// yox. Beləcə test/runtime yönləndirməsi (window.__PEER_OVERRIDE) işləyir.
function peerOptions() {
  return { ...brokerConfig(), ...PEER_ICE };
}


function makeCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // oxşar simvollar yoxdur
  let c = '';
  for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

export class NetRoom {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.code = null;
    this.selfId = null;
    this.name = '';
    this.players = [];      // {id, name, carId, isHost}
    this.hostConn = null;   // qonaq üçün
    this.conns = new Map(); // host üçün: id -> conn
    this.handlers = {};
    this.inGame = false;
    this.lobbyTrack = 'desert';
    this.lobbyLaps = 3;
    this.lobbyMode = 'race'; // race | football
    this.chatLog = []; // {id, name, text} — rematch-larda da qalır
    this.racingIds = []; // hazırda yarışda olan oyunçular (lobby bunu göstərir)
  }

  on(evt, cb) { this.handlers[evt] = cb; return this; }
  _emit(evt, data) { this.handlers[evt]?.(data); }

  // ————— Otaq yarat (host) —————
  createRoom(name) {
    return new Promise((resolve, reject) => {
      this.name = name;
      this.isHost = true;
      const code = makeCode();
      const peer = new Peer(PREFIX + code, peerOptions());
      this.peer = peer;
      let settled = false;
      peer.on('open', (id) => {
        if (settled) return;
        settled = true;
        this.code = code;
        this.selfId = id;
        this.players = [{ id, name, carId: null, isHost: true, ready: true }];
        this._announcer = announceRoom(this); // aktiv otaqlar siyahısına düş
        this._emit('players', this.players);
        resolve(code);
      });
      peer.on('connection', (conn) => this._setupHostConn(conn));
      // Siqnal serveri ilə əlaqə düşsə, avtomatik bərpa et —
      // yoxsa yeni qonaqlar otağı tapa bilmir ("otaq yoxdur" xətası)
      peer.on('disconnected', () => {
        try { if (!peer.destroyed) peer.reconnect(); } catch { /* boş */ }
      });
      peer.on('error', (e) => {
        if (!settled) { settled = true; reject(e); }
        else this._emit('error', e);
      });
      // Siqnal serveri cavab verməsə "Otaq yaradılır…" sonsuz qalmasın
      setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('timeout')); }
      }, 12000);
      setTimeout(() => { if (!settled) { settled = true; reject(new Error('timeout')); } }, 20000);
    });
  }

  // ————— Otağa qoşul (qonaq) —————
  joinRoom(code, name) {
    return new Promise((resolve, reject) => {
      this.name = name;
      this.isHost = false;
      const peer = new Peer(peerOptions());
      this.peer = peer;
      let settled = false;
      const fail = (e) => { if (!settled) { settled = true; reject(e); } };
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true });
        this.hostConn = conn;
        conn.on('open', () => {
          this.selfId = peer.id;
          this.code = code.toUpperCase().trim();
          conn.send({ t: 'hi', name });
          // PeerJS-in məlum problemi: kanal açılan kimi göndərilən İLK mesaj
          // bəzən itir → host cavab vermir → qoşulma timeout olur.
          // Lobby cavabı gələnə qədər 'hi'-ı təkrar göndər (host dublikatı süzür).
          this._hiTimer = setInterval(() => {
            if (settled) { clearInterval(this._hiTimer); return; }
            try { conn.send({ t: 'hi', name }); } catch { /* boş */ }
          }, 2500);
        });
        conn.on('data', (m) => {
          if (m.t === 'lobby' && !settled) {
            settled = true;
            clearInterval(this._hiTimer);
            resolve();
          }
          this._onMsg(m, null);
        });
        conn.on('close', () => { clearInterval(this._hiTimer); this._emit('closed'); });
        conn.on('error', (e) => { clearInterval(this._hiTimer); fail(e); });
      });
      peer.on('disconnected', () => {
        try { if (!peer.destroyed) peer.reconnect(); } catch { /* boş */ }
      });
      peer.on('error', fail);
      setTimeout(() => fail(new Error('timeout')), 8000);
    });
  }

  _setupHostConn(conn) {
    conn.on('data', (m) => this._onMsg(m, conn));
    conn.on('close', () => {
      const pid = conn.peer;
      this.conns.delete(pid);
      const i = this.players.findIndex((p) => p.id === pid);
      if (i >= 0) {
        this.players.splice(i, 1);
        this._broadcastLobby();
        this._emit('players', this.players);
      }
      if (this.inGame) {
        this._relay({ t: 'left', id: pid }, null);
        this._emit('left', pid);
      }
    });
  }

  _onMsg(m, fromConn) {
    switch (m.t) {
      case 'hi': // host qəbul edir
        // Təkrar 'hi' (qonağın yenidən göndərməsi) — dublikat yaratma, lobby-ni yenidən göndər
        if (this.conns.has(fromConn.peer)) { this._broadcastLobby(); return; }
        if (this.players.length >= 6) { fromConn.close(); return; }
        this.conns.set(fromConn.peer, fromConn);
        this.players.push({ id: fromConn.peer, ready: false, name: String(m.name).slice(0, 16) || 'Oyunçu', carId: null, isHost: false });
        this._broadcastLobby();
        this._emit('players', this.players);
        break;
      case 'rdyl': { // hazır statusu (host qəbul edir)
        const pid = fromConn ? fromConn.peer : this.selfId;
        const p = this.players.find((x) => x.id === pid);
        if (p && !p.isHost) p.ready = !!m.v;
        this._broadcastLobby();
        this._emit('players', this.players);
        break;
      }
      case 'team': { // host qəbul edir (futbol komanda seçimi)
        const pid = fromConn ? fromConn.peer : this.selfId;
        const p = this.players.find((x) => x.id === pid);
        if (p && (m.team === 'blue' || m.team === 'red')) p.team = m.team;
        this._broadcastLobby();
        this._emit('players', this.players);
        break;
      }
      case 'car': { // host qəbul edir
        const pid = fromConn ? fromConn.peer : this.selfId;
        const p = this.players.find((x) => x.id === pid);
        if (p) p.carId = m.carId;
        this._broadcastLobby();
        this._emit('players', this.players);
        break;
      }
      case 'lobby': // qonaq qəbul edir
        this.players = m.players;
        this.lobbyTrack = m.track;
        this.lobbyLaps = m.laps;
        if (m.mode && m.mode !== this.lobbyMode) { this.lobbyMode = m.mode; this._emit('mode', m.mode); }
        else this.lobbyMode = m.mode || this.lobbyMode;
        this.racingIds = m.racing || [];
        this._emit('players', this.players);
        this._emit('lobby', m);
        break;
      case 'go': // qonaq qəbul edir
        this.inGame = true;
        this._emit('start', m);
        break;
      case 's': // mövqe yeniləməsi
        if (this.isHost) this._relay(m, fromConn);
        this._emit('state', m);
        break;
      case 'ev': // oyun hadisəsi (oil, hit, gleave...)
        // Oyunçu matçdan lobbiyə qayıtdı — host "yarışdadır" statusunu silir
        if (this.isHost && m.kind === 'gleave' && m.id) {
          const had = this.racingIds.includes(m.id);
          this.racingIds = this.racingIds.filter((x) => x !== m.id);
          if (had) { this._broadcastLobby(); this._emit('players', this.players); }
        }
        if (this.isHost) this._relay(m, fromConn);
        this._emit('event', m);
        break;
      case 'fin': // qonaq finiş bildirir (host qəbul edir)
        this._emit('finish', { id: fromConn ? fromConn.peer : this.selfId, time: m.time });
        break;
      case 'results': // qonaq qəbul edir
        this._emit('results', m.rows);
        break;
      case 'left':
        if (this.isHost) this._relay(m, fromConn);
        this._emit('left', m.id);
        break;
      case 'chat':
        if (this.isHost) this._relay(m, fromConn);
        this._pushChat(m);
        break;
    }
  }

  _pushChat(m) {
    const msg = { id: m.id, name: String(m.name || 'Oyunçu').slice(0, 16), text: String(m.text || '').slice(0, 120) };
    if (!msg.text) return;
    this.chatLog.push(msg);
    if (this.chatLog.length > 50) this.chatLog.shift();
    this._emit('chat', msg);
  }

  sendChat(text) {
    const t = String(text || '').trim().slice(0, 120);
    if (!t) return;
    const msg = { t: 'chat', id: this.selfId, name: this.name, text: t };
    if (this.isHost) this._relay(msg, null);
    else this.hostConn?.send(msg);
    this._pushChat(msg); // öz mesajımız dərhal görünsün
  }

  // ————— Lobby idarəsi —————
  setLobby(track, laps) {
    this.lobbyTrack = track;
    this.lobbyLaps = laps;
    this._broadcastLobby();
  }

  _broadcastLobby() {
    if (!this.isHost) return;
    const msg = { t: 'lobby', players: this.players, track: this.lobbyTrack, laps: this.lobbyLaps, mode: this.lobbyMode, racing: this.racingIds };
    for (const c of this.conns.values()) c.send(msg);
    this._announcer?.update(); // siyahıdakı oyunçu sayı/trek təzələnsin
  }

  setMode(mode) { // yalnız host
    this.lobbyMode = mode;
    this._broadcastLobby();
    this._emit('mode', mode);
  }

  setReady(v) {
    if (this.isHost) return; // host həmişə hazırdır
    this.hostConn?.send({ t: 'rdyl', v: !!v });
    // Lokal əks — host cavabı gələnə qədər UI gecikməsin
    const me = this.players.find((x) => x.id === this.selfId);
    if (me) me.ready = !!v;
  }

  setTeam(team) {
    if (this.isHost) this._onMsg({ t: 'team', team }, null);
    else this.hostConn?.send({ t: 'team', team });
  }

  setCar(carId) {
    if (this.isHost) this._onMsg({ t: 'car', carId }, null);
    else this.hostConn?.send({ t: 'car', carId });
  }

  // Yarışdan lobby-yə qayıdış — bağlantılar qalır
  resetForLobby() {
    this.inGame = false;
    this.racingIds = [];
    // Köhnə oyun səhnəsinin handler-ləri qalmasın — gec gələn state/event
    // mesajları sərbəst buraxılmış səhnəyə dəyib xəta atmasın
    for (const k of ['state', 'event', 'left', 'results', 'finish']) {
      delete this.handlers[k];
    }
    if (this.isHost) this._broadcastLobby();
  }

  // Matçdan lobbiyə qayıdış: qalanlar maşınımı gizlətsin, statusum düzəlsin
  leaveGame() {
    try { this.sendEvent({ kind: 'gleave' }); } catch { /* boş */ }
  }

  startGame() { // yalnız host
    this.inGame = true;
    // Yalnız HAZIR olanlar oyuna girir (host həmişə hazırdır)
    const goers = this.players.filter((p) => p.isHost || p.ready);
    this.racingIds = goers.map((p) => p.id);
    // Futbol: komandasızlara balanslı komanda ver (yalnız gedənlər arasında)
    if (this.lobbyMode === 'football') {
      let b = goers.filter((p) => p.team === 'blue').length;
      let r = goers.filter((p) => p.team === 'red').length;
      for (const p of goers) {
        if (p.team !== 'blue' && p.team !== 'red') {
          if (b <= r) { p.team = 'blue'; b++; } else { p.team = 'red'; r++; }
        }
      }
    }
    // seed: qutu tipləri bütün müştərilərdə eyni olsun
    const msg = {
      t: 'go', track: this.lobbyTrack, laps: this.lobbyLaps, players: goers,
      mode: this.lobbyMode,
      seed: Math.floor(Math.random() * 2 ** 31),
    };
    // Növbəti raund üçün hazır statusu sıfırlanır
    for (const p of this.players) if (!p.isHost) p.ready = false;
    for (const c of this.conns.values()) c.send(msg);
    this._announcer?.update(); // siyahıda "yarışdadır" görünsün
    this._emit('start', msg);
    this._broadcastLobby(); // yarış zamanı qoşulanlar "yarışdadır" statusunu görsün
  }

  // ————— Oyun içi mesajlar —————
  sendState(s) {
    const msg = { t: 's', id: this.selfId, ...s };
    if (this.isHost) this._relay(msg, null);
    else this.hostConn?.send(msg);
  }

  sendEvent(ev) {
    const msg = { t: 'ev', id: this.selfId, ...ev };
    if (this.isHost) { this._relay(msg, null); }
    else this.hostConn?.send(msg);
  }

  sendFinish(time) {
    if (this.isHost) this._emit('finish', { id: this.selfId, time });
    else this.hostConn?.send({ t: 'fin', time });
  }

  sendResults(rows) { // yalnız host
    const msg = { t: 'results', rows };
    for (const c of this.conns.values()) c.send(msg);
    this._emit('results', rows);
  }

  _relay(msg, exceptConn) {
    for (const c of this.conns.values()) {
      if (c !== exceptConn) { try { c.send(msg); } catch { /* bağlanıb */ } }
    }
  }

  dispose() {
    clearInterval(this._hiTimer);
    this._announcer?.stop(); // siyahıdan sil
    this._announcer = null;
    try { this.peer?.destroy(); } catch { /* boş */ }
    this.peer = null;
    this.conns.clear();
    this.handlers = {};
  }
}
