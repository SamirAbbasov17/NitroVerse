import { CARS, carSkin } from '../data/cars.js';
import { TRACKS, getTrackById } from '../data/tracks.js';
import { getCarById } from '../data/cars.js';
import { NetRoom } from '../net/NetRoom.js';
import { listRooms } from '../net/RoomDirectory.js';
import { social } from '../net/Social.js';
import { auth } from '../net/Auth.js';
import { abilityFor } from '../data/abilities.js';
import { signatureIconURL } from '../core/SignatureIcons.js';
import { STARTER_CARS, CAR_PRICES, isCarUnlocked } from '../data/economy.js';
import { COSMETIC_GROUPS, cosmeticById, isCosmeticOwned, equippedCosmetics, carSkinsFor, equippedSkin } from '../data/cosmetics.js';
import { playerCarData } from '../data/playerCar.js';
import { audio } from '../core/AudioManager.js';
import { t, getLang, setLang, LANGS, LANG_NAMES } from '../core/i18n.js';
import { apiBase } from '../net/apiBase.js';

// Dəstək səhifəsi (oyun pulsuz və reklamsızdır — könüllü dəstək).
// null → düymə ÜMUMİYYƏTLƏ göstərilmir. Hazırda kofe.al-da CibPay ödənişləri
// dayandırılıb, yəni link açılsa da pul keçmir — işləməyən ödəniş yolunu
// canlı saxlamaqdansa düyməni gizlədirik. Ödəniş üsulu seçiləndə bura URL yaz.
const SUPPORT_URL = null;

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Sol panel menyu — arxa fonda canlı 3D showcase (main.js idarə edir).
// Seçimlər dəyişdikcə onPreviewTrack/onPreviewCar çağırılır.
export class Menu {
  constructor(root, { onStart, onStartOnline, thumbs = {}, onPreviewTrack, onPreviewCar, onPreviewDemo }) {
    this.root = root;
    this.onStart = onStart;
    this.onStartOnline = onStartOnline;
    this.thumbs = thumbs;
    this.onPreviewTrack = onPreviewTrack;
    this.onPreviewCar = onPreviewCar;
    this.onPreviewDemo = onPreviewDemo;
    const savedCar = localStorage.getItem('apexCar');
    this.sel = {
      mode: 'race', trackId: TRACKS[0].id,
      carId: CARS.some((c) => c.id === savedCar) ? savedCar : CARS[0].id,
      laps: 3, difficulty: 'normal',
    };
    this.net = null;
  }

  _preview() {
    this.onPreviewTrack?.(getTrackById(this.sel.trackId));
    this.onPreviewCar?.(playerCarData(this.sel.carId));
    // Alov yalnız nitro basanda görünür — həmin tab açılanda qarajda nümayiş etdir
    const demo = this._garage && (this._garageTab === 'flame' || this._garageTab === 'finish')
      ? this._garageTab : null;
    this.onPreviewDemo?.(demo, playerCarData(this.sel.carId).cosmetics || null);
  }

  // ————— Ekranlar —————

  showModes() {
    this._here = 'modes';
    social.setActivity('idle');
    this._garage = false;
    this._preview();
    const rows = [
      { id: 'race', icon: '🏁', title: t('mode.race'), desc: t('mode.race.d') },
      { id: 'free', icon: '🛣️', title: t('mode.free'), desc: t('mode.free.d') },
      { id: 'football', icon: '⚽', title: t('mode.football'), desc: t('mode.football.d') },
      { id: 'arena', icon: '⚔️', title: t('mode.arena'), desc: t('mode.arena.d') },
      { id: 'online', icon: '🌐', title: t('mode.online'), desc: t('mode.online.d') },
    ].map((m) => `
      <button class="mrow ${this.sel.mode === m.id ? 'is-selected' : ''}" data-mode="${m.id}">
        <span class="mrow__icon">${m.icon}</span>
        <span class="mrow__body">
          <span class="mrow__title">${m.title}</span>
          <span class="mrow__desc">${m.desc}</span>
        </span>
        <span class="mrow__arrow">→</span>
      </button>`).join('');

    this._panel({
      step: '01', stepLabel: t('modes.step'),
      title: t('modes.title'),
      // --scroll: alçaq ekranlarda panel deyil, siyahının ÖZÜ sürüşür (nav düymələri görünür)
      body: `<div class="menu-list menu-list--scroll">${rows}</div>`,
      nav: `<button class="btn btn--primary" data-next>${t('ui.continue')}</button>`,
      hint: true,
      foot: true,   // ☕ dəstək + 🐞 xəta bildir (yalnız ana menyuda)
    });

    this.root.querySelectorAll('[data-mode]').forEach((el) => {
      el.onclick = () => {
        if (el.dataset.mode === 'online') { this.showOnline(); return; }
        this.sel.mode = el.dataset.mode;
        // Sonsuz/Futbol rejimlərində trek seçimi yoxdur — birbaşa maşına
        if (['free', 'football', 'arena'].includes(this.sel.mode)) this.showCars();
        else this.showTracks();
      };
    });
    this.root.querySelector('[data-next]').onclick = () =>
      (['free', 'football', 'arena'].includes(this.sel.mode) ? this.showCars() : this.showTracks());
  }

  // ————— ONLAYN: otaq yarat / siyahıdan və ya kodla qoşul —————
  showOnline(errMsg = '') {
    this._here = 'online';
    social.setActivity('social');
    this._preview();
    this._stopRoomsPoll();
    const savedName = localStorage.getItem('apexName') || '';
    this._panel({
      step: '02', stepLabel: t('online.step'),
      title: t('online.title'),
      body: `
        <div class="menu-list menu-list--scroll">
          ${errMsg ? `<div class="online-err">${errMsg}</div>` : ''}
          <label class="field">
            <span class="field__label">${t('online.name')}</span>
            <input class="field__input" id="on-name" maxlength="14" placeholder="məs. Samir" value="${savedName}" />
          </label>
          <button class="btn btn--primary" data-create>${t('online.create')}</button>
          <div class="online-divider"><i></i>${t('online.bycode')}<i></i></div>
          <div class="join-row">
            <input class="field__input field__input--code" id="on-code" maxlength="4" placeholder="ABCD" />
            <button class="btn" data-join>${t('online.join')}</button>
          </div>
          <div class="online-divider"><i></i>${t('online.rooms')}<i></i></div>
          <div class="rooms-list" id="rooms-list"><div class="rooms-note">${t('online.loading')}</div></div>
          <div class="online-divider"><i></i>${t('online.players')}<i></i></div>
          <div class="who-list" id="who-list"><div class="who-note">${t('online.loading')}</div></div>
          <div class="online-divider"><i></i>${t('online.gchat')}<i></i></div>
          <div class="online-now">🟢 <b id="gc-online">–</b> ${t('online.count')}</div>
          <div class="lobby-chat gchat" id="gchat"><div class="chat-empty">Yüklənir…</div></div>
          <div class="chat-row">
            <input class="field__input" id="gchat-input" maxlength="140" placeholder="${t('online.writeAll')}" autocomplete="off" />
            <button class="btn" data-gchat-send>➤</button>
          </div>
        </div>`,
      nav: `<button class="btn btn--ghost" data-back>${t('ui.back')}</button>
            <button class="btn" data-refresh>${t('online.refresh')}</button>`,
    });
    const codeEl = this.root.querySelector('#on-code');
    this.root.querySelector('[data-back]').onclick = () => {
      this._stopRoomsPoll();
      this.net?.dispose(); this.net = null;
      this.showModes();
    };
    this.root.querySelector('[data-create]').onclick = async () => {
      const name = this._onlineName();                 // OTAĞIN adı (siyahıda görünür)
      const oyunçuAdı = auth.profile?.nick || name;    // OYUNÇUNUN adı (lobbidə görünür)
      this._stopRoomsPoll();
      this._onlineBusy(t('online.creating'));
      try {
        this.net = new NetRoom();
        await this.net.createRoom(name, oyunçuAdı);
        this.net.setLobby(this.sel.trackId, this.sel.laps);
        this.showLobby();
      } catch (e) {
        this.net?.dispose(); this.net = null;
        this.showOnline(t('online.createErr'));
      }
    };
    this.root.querySelector('[data-join]').onclick = () => this._joinWithCode(codeEl.value);
    this.root.querySelector('[data-refresh]').onclick = () => this._refreshRooms();
    this._refreshRooms();
    this._roomsTimer = setInterval(() => this._refreshRooms(), 6000);
    // Onlayn oyunçular: siyahı + dostluq vəziyyəti (7s poll)
    this._whoTimer && clearInterval(this._whoTimer);
    this._refreshWho();
    this._whoTimer = setInterval(() => this._refreshWho(), 7000);
    // Qlobal çat: ilk yükləmə + 4s poll
    this._gSince = 0;
    this._gSeen = new Set();
    this._refreshGchat();
    this._gchatTimer = setInterval(() => this._refreshGchat(), 4000);
    const sendG = async () => {
      const inp = this.root.querySelector('#gchat-input');
      const text = (inp?.value || '').trim();
      if (!text || this._gSending) return;
      this._gSending = true;
      inp.value = '';
      const nick = auth.profile?.nick || this._onlineName();
      const t = await social.send(nick, text);
      this._gSending = false;
      if (t) {
        this._gSeen.add(t);
        this._appendGchat({ nick, text, t }, true);
      } else {
        this._appendGchat({ nick: 'Sistem', text: t('online.msgFail'), t: 0 }, false);
      }
    };
    this.root.querySelector('[data-gchat-send]').onclick = sendG;
    this.root.querySelector('#gchat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); sendG(); }
    });
  }

  // Qlobal çat poll-u: onlayn sayı + yeni mesajlar
  async _refreshGchat() {
    if (!this.root.querySelector('#gchat')) {
      if (this._gchatTimer) { clearInterval(this._gchatTimer); this._gchatTimer = null; }
      return;
    }
    const res = await social.feed(this._gSince);
    const box = this.root.querySelector('#gchat');
    if (!box || !res) return;
    const cnt = this.root.querySelector('#gc-online');
    if (cnt) cnt.textContent = res.online;
    let appended = false;
    for (const m of res.msgs || []) {
      this._gSince = Math.max(this._gSince, m.t);
      if (this._gSeen.has(m.t)) continue;
      this._gSeen.add(m.t);
      this._appendGchat(m, false);
      appended = true;
    }
    if (!appended && box.querySelector('.chat-empty') && (res.msgs || []).length === 0 && this._gSince === 0) {
      box.innerHTML = '<div class="chat-empty">Hələ sakitlikdir — ilk mesajı sən yaz! 👋</div>';
    }
  }

  _appendGchat(m, own) {
    const box = this.root.querySelector('#gchat');
    if (!box) return;
    const empty = box.querySelector('.chat-empty');
    if (empty) empty.remove();
    const myNick = auth.profile?.nick || localStorage.getItem('apexName');
    const isOwn = own || (myNick && m.nick === myNick);
    box.insertAdjacentHTML('beforeend',
      `<div class="chat-msg ${isOwn ? '' : 'chat-msg--other'}"><b>${esc(m.nick)}:</b> ${esc(m.text)}</div>`);
    while (box.children.length > 60) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  _onlineName() {
    const el = this.root.querySelector('#on-name');
    const name = ((el ? el.value : '') || localStorage.getItem('apexName') || 'Oyunçu').trim().slice(0, 14) || 'Oyunçu';
    localStorage.setItem('apexName', name);
    return name;
  }

  _stopRoomsPoll() {
    if (this._roomsTimer) { clearInterval(this._roomsTimer); this._roomsTimer = null; }
    if (this._gchatTimer) { clearInterval(this._gchatTimer); this._gchatTimer = null; }
    if (this._whoTimer) { clearInterval(this._whoTimer); this._whoTimer = null; }
    if (this._convoTimer) { clearInterval(this._convoTimer); this._convoTimer = null; }
    if (this._frTimer) { clearInterval(this._frTimer); this._frTimer = null; }
  }

  // ————— Onlayn oyunçular siyahısı: dəvət / DM / dostluq —————
  async _refreshWho() {
    const box = this.root.querySelector('#who-list');
    if (!box) { if (this._whoTimer) { clearInterval(this._whoTimer); this._whoTimer = null; } return; }
    const [players, fr] = await Promise.all([social.who(), social.frList()]);
    if (!this.root.querySelector('#who-list')) return;
    if (!players) return;
    this._fr = fr;
    const me = social.cid;
    const rows = players
      .sort((a, z) => (z.u ? 1 : 0) - (a.u ? 1 : 0))
      .map((p) => {
        const isMe = p.cid === me;
        const isFriend = p.u && fr.f.includes(p.u);
        const reqIn = p.u && fr.in.includes(p.u);
        const acts = [];
        if (!isMe) {
          acts.push(`<button class="who-act" data-w-inv="${p.cid}" title="${t('who.invite')}">🎮</button>`);
          acts.push(`<button class="who-act" data-w-dm="${p.cid}" data-u="${p.u || ''}" data-n="${esc(p.n)}" title="${t('who.dm')}">✉️</button>`);
          const reqOut = p.u && fr.out.includes(p.u);
          if (p.u && auth.isLoggedIn && !isFriend && !reqOut) {
            acts.push(reqIn
              ? `<button class="who-act" data-w-acc="${p.u}" title="${t('ntc.accept')}" style="background:rgba(71,224,138,.2)">✅</button>`
              : `<button class="who-act" data-w-fr="${p.u}" title="${t('who.addfr')}">👥</button>`);
          }
        }
        const reqOut2 = p.u && fr.out.includes(p.u);
        const tag = isMe ? t('who.you')
          : reqIn ? t('who.reqIn')
          : reqOut2 ? '⏳ ' + t('who.reqOut')
          : isFriend ? '⭐ ' + t('who.friend')
          : (p.u ? '@' + esc(p.u) : '');
        return `
        <div class="who-row">
          <span class="who-row__dot"></span>
          <span class="who-row__name">${esc(p.n)}</span>
          ${tag ? `<span class="who-row__tag">${tag}</span>` : ''}
          <span class="who-row__acts">${acts.join('')}</span>
        </div>`;
      }).join('');
    box.innerHTML = rows || `<div class="who-note">${t('who.empty')}</div>`;
    // Dəvət
    box.querySelectorAll('[data-w-inv]').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        const ok = await social.sendTo(b.dataset.wInv, 'inv');
        window.__notices?.show({ icon: '🎮', text: ok ? t('ntc.invSent') : t('ntc.sendFail'), life: 4 });
      };
    });
    // DM — sıranın altında mini yazma sətri
    box.querySelectorAll('[data-w-dm]').forEach((b) => {
      b.onclick = () => {
        box.querySelector('.dm-compose')?.remove();
        const row = b.closest('.who-row');
        const c = document.createElement('div');
        c.className = 'dm-compose';
        c.innerHTML = `<input class="field__input" maxlength="140" placeholder="${esc(b.dataset.n)}…" />
          <button class="btn">${t('ui.send')}</button>`;
        row.after(c);
        const inp = c.querySelector('input');
        inp.focus();
        const doSend = async () => {
          const text = inp.value.trim();
          if (!text) return;
          c.remove();
          // Login istifadəçiyə username ünvanı (tarixçəyə düşsün), qonağa cid
          const to = b.dataset.u && auth.isLoggedIn ? 'u:' + b.dataset.u : b.dataset.wDm;
          const ok = await social.sendTo(to, 'dm', { text });
          window.__notices?.show({ icon: '✉️', text: ok ? t('ntc.msgSent') : t('ntc.sendFail'), life: 4 });
        };
        c.querySelector('button').onclick = doSend;
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSend(); } });
      };
    });
    // Dostluq istəyi / qəbulu
    box.querySelectorAll('[data-w-fr]').forEach((b) => {
      b.onclick = async () => {
        if (!auth.isLoggedIn) { this.showAuth(t('ntc.needLogin')); return; }
        b.disabled = true;
        const ok = await social.frRequest(b.dataset.wFr);
        window.__notices?.show({ icon: '👥', text: ok ? t('ntc.frSent') : t('ntc.sendFail'), life: 4 });
        this._refreshWho();
      };
    });
    box.querySelectorAll('[data-w-acc]').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        await social.frAccept(b.dataset.wAcc);
        this._refreshWho();
      };
    });
  }

  // ————— Dəvət qəbul olundu: otaq qur (varsa kodu göndər) —————
  async hostInviteRoom(toCid) {
    if (!toCid) return;
    if (this.net?.code) { social.sendTo(toCid, 'invroom', { code: this.net.code }); return; }
    try {
      this._onlineBusy(t('online.creating'));
      this.net = new NetRoom();
      await this.net.createRoom(this._onlineName());
      this.net.setLobby(this.sel.trackId, this.sel.laps);
      this.showLobby();
      social.sendTo(toCid, 'invroom', { code: this.net.code });
    } catch {
      this.net?.dispose(); this.net = null;
      this.showOnline(t('online.createErr'));
    }
  }

  // ————— Dostlar ekranı: istəklər + onlayn/oflayn dostlar —————
  async showFriends() {
    if (!auth.isLoggedIn) { this.showAuth(t('fr.needLogin')); return; }
    this._here = 'friends';
    social.setActivity('social');
    this._stopRoomsPoll();
    this._panel({
      step: '👥', stepLabel: t('fr.step'), title: t('fr.title'),
      body: `<div class="menu-list menu-list--scroll" id="fr-list"><div class="who-note">${t('online.loading')}</div></div>`,
      nav: `<button class="btn btn--ghost" data-back>${t('ui.back')}</button>`,
    });
    this.root.querySelector('[data-back]').onclick = () => this.showModes();
    const render = async () => {
      const box0 = this.root.querySelector('#fr-list');
      if (!box0) { if (this._frTimer) { clearInterval(this._frTimer); this._frTimer = null; } return; }
      const [fr, players] = await Promise.all([social.frList(), social.who()]);
      const box = this.root.querySelector('#fr-list');
      if (!box) return;
      const onlineByU = new Map((players || []).filter((p) => p.u).map((p) => [p.u, p]));
      const reqRows = fr.in.map((u) => `
        <div class="who-row">
          <span class="who-row__dot" style="background:#ffb02e"></span>
          <span class="who-row__name">${esc(u)}</span>
          <span class="who-row__tag">${t('who.reqIn')}</span>
          <span class="who-row__acts">
            <button class="who-act" data-f-acc="${esc(u)}" title="${t('ntc.accept')}" style="background:rgba(71,224,138,.2)">✅</button>
          </span>
        </div>`).join('');
      const frRows = fr.f
        .map((u) => ({ u, on: onlineByU.get(u) }))
        .sort((a, z) => (z.on ? 1 : 0) - (a.on ? 1 : 0))
        .map(({ u, on }) => `
        <div class="who-row ${on ? '' : 'who-row--off'}">
          <span class="who-row__dot" style="background:${on ? '#47e08a' : '#5a6478'}"></span>
          <span class="who-row__name">${esc(on?.n || u)}</span>
          <span class="who-row__tag">${on ? t('fr.online') : t('fr.offline')}</span>
          <span class="who-row__acts">
            ${on ? `<button class="who-act" data-f-inv="${esc(u)}" title="${t('who.invite')}">🎮</button>` : ''}
            <button class="who-act" data-f-dm="${esc(u)}" title="${t('who.dm')}">✉️</button>
          </span>
        </div>`).join('');
      box.innerHTML = (reqRows ? `<div class="who-note">${t('fr.reqs')}</div>${reqRows}` : '')
        + (frRows || `<div class="who-note">${t('fr.empty')}</div>`);
      box.querySelectorAll('[data-f-acc]').forEach((b) => {
        b.onclick = async () => { b.disabled = true; await social.frAccept(b.dataset.fAcc); render(); };
      });
      box.querySelectorAll('[data-f-inv]').forEach((b) => {
        b.onclick = async () => {
          b.disabled = true;
          const ok = await social.sendTo('u:' + b.dataset.fInv, 'inv');
          window.__notices?.show({ icon: '🎮', text: ok ? t('ntc.invSent') : t('ntc.sendFail'), life: 4 });
          setTimeout(() => { b.disabled = false; }, 3000);
        };
      });
      box.querySelectorAll('[data-f-dm]').forEach((b) => {
        b.onclick = () => this.showConversation(b.dataset.fDm);
      });
    };
    await render();
    this._frTimer && clearInterval(this._frTimer);
    this._frTimer = setInterval(render, 7000);
  }

  // ————— Mesajlar bölməsi: söhbətlərim —————
  // ————— XƏTA BİLDİR —————
  // İstifadəçi problemi buradan yazır; bildiriş Netlify Forms vasitəsilə
  // birbaşa e-poçta gedir (server kodu və açar tələb olunmur).
  // Texniki kontekst (rejim, ekran, cihaz) avtomatik əlavə olunur —
  // əks halda "işləmir" tipli bildirişlərdən heç nə anlaşılmır.
  showBugReport() {
    this._here = 'bug';
    this._stopRoomsPoll?.();
    this._panel({
      step: '🐞', stepLabel: t('bug.step'), title: t('bug.title'), sub: t('bug.sub'),
      body: `
        <div class="menu-list menu-list--scroll">
          <div class="field"><label>${t('bug.subject')}</label>
            <input class="field__input" id="bug-subject" maxlength="80" autocomplete="off" placeholder="${t('bug.subjectPh')}" /></div>
          <div class="field" style="margin-top:10px"><label>${t('bug.msg')}</label>
            <textarea class="field__input bug-text" id="bug-msg" maxlength="1200" rows="5" placeholder="${t('bug.msgPh')}"></textarea></div>
          <div class="field" style="margin-top:10px"><label>${t('bug.email')}</label>
            <input class="field__input" id="bug-email" type="email" maxlength="120" autocomplete="off" placeholder="${t('bug.emailPh')}" /></div>
          <div class="auth-msg" data-bug-note hidden></div>
        </div>`,
      nav: `<button class="btn btn--ghost" data-back>${t('ui.back')}</button>
            <button class="btn btn--primary" data-bug-send>${t('bug.send')}</button>`,
    });
    this.root.querySelector('[data-back]').onclick = () => this.showModes();
    const note = this.root.querySelector('[data-bug-note]');
    const say = (msg, ok = false) => {
      note.hidden = false;
      note.className = `auth-msg${ok ? ' auth-msg--ok' : ''}`;
      note.textContent = msg;
      // Alçaq ekranda status sahələrin altında qalıb görünmür
      note.scrollIntoView({ block: 'nearest' });
    };
    const btn = this.root.querySelector('[data-bug-send]');
    btn.onclick = async () => {
      const subject = this.root.querySelector('#bug-subject').value.trim();
      const msg = this.root.querySelector('#bug-msg').value.trim();
      const email = this.root.querySelector('#bug-email').value.trim();
      if (msg.length < 3) { say(t('bug.need')); return; }
      btn.disabled = true;
      say(t('bug.sending'), true);
      try {
        // Öz endpointimiz: bildirişi saxlayır + formatlanmış e-poçt göndərir.
        // (Bax server/api/report.mjs — həm Netlify, həm öz serverimizdə eyni kod.)
        const res = await fetch(apiBase('report'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject, message: msg, email, hp: '',
            cid: social.identity?.cid || '',
            meta: {
              nick: auth.isLoggedIn ? auth.profile.nick : '',
              lang: getLang(),
              screen: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}`,
              touch: matchMedia('(pointer:coarse)').matches,
              url: location.href,
              ua: navigator.userAgent,
            },
          }),
        });
        if (res.status === 429) { say(t('bug.tooFast')); btn.disabled = false; return; }
        if (!res.ok) throw new Error(String(res.status));
        say(t('bug.ok'), true);
        this.root.querySelector('#bug-subject').value = '';
        this.root.querySelector('#bug-msg').value = '';
      } catch {
        say(t('bug.err'));
      }
      btn.disabled = false;
    };
  }

  async showMessages() {
    if (!auth.isLoggedIn) { this.showAuth(t('msgs.needLogin')); return; }
    this._here = 'messages';
    social.setActivity('social');
    this._stopRoomsPoll();
    this._panel({
      step: '✉️', stepLabel: t('msgs.step'), title: t('msgs.title'),
      body: `<div class="menu-list menu-list--scroll" id="convo-list"><div class="who-note">${t('online.loading')}</div></div>`,
      nav: `<button class="btn btn--ghost" data-back>${t('ui.back')}</button>`,
    });
    this.root.querySelector('[data-back]').onclick = () => this.showModes();
    const convos = await social.dmList();
    const box = this.root.querySelector('#convo-list');
    if (!box) return;
    box.innerHTML = convos.length ? convos.map((c) => `
      <button class="convo-row" data-convo="${esc(c.with)}">
        <span class="convo-row__name">${esc(c.with)}</span>
        <span class="convo-row__last">${c.f === social.identity.user ? '→ ' : ''}${esc(c.last || '')}</span>
        <span class="convo-row__time">${new Date(c.t).toLocaleTimeString().slice(0, 5)}</span>
      </button>`).join('') : `<div class="who-note">${t('msgs.empty')}</div>`;
    box.querySelectorAll('[data-convo]').forEach((b) => {
      b.onclick = () => this.showConversation(b.dataset.convo);
    });
  }

  // ————— Bir söhbət: tarixçə + cavab + poll —————
  async showConversation(withUser) {
    if (!auth.isLoggedIn) { this.showAuth(t('msgs.needLogin')); return; }
    this._here = 'convo';
    this._dmWith = withUser;
    this._stopRoomsPoll();
    this._panel({
      step: '✉️', stepLabel: t('msgs.step'), title: esc(withUser),
      body: `
        <div class="dm-thread" id="dm-thread"><div class="who-note">${t('online.loading')}</div></div>
        <div class="chat-row">
          <input class="field__input" id="dm-input" maxlength="140" placeholder="${t('lobby.writeMsg')}" autocomplete="off" />
          <button class="btn" data-dm-send>➤</button>
        </div>`,
      nav: `<button class="btn btn--ghost" data-back>${t('ui.back')}</button>`,
    });
    this.root.querySelector('[data-back]').onclick = () => { this._dmWith = null; this.showMessages(); };
    this._refreshConvo = async () => {
      const th = this.root.querySelector('#dm-thread');
      if (!th) { if (this._convoTimer) { clearInterval(this._convoTimer); this._convoTimer = null; } return; }
      const msgs = await social.dmHist(withUser);
      const th2 = this.root.querySelector('#dm-thread');
      if (!th2) return;
      const atBottom = th2.scrollHeight - th2.scrollTop - th2.clientHeight < 60;
      th2.innerHTML = msgs.map((m) => `
        <div class="dm-msg ${m.f === social.identity.user ? 'dm-msg--me' : 'dm-msg--them'}">${esc(m.text)}</div>`
      ).join('') || `<div class="who-note">${t('msgs.empty')}</div>`;
      if (atBottom) th2.scrollTop = th2.scrollHeight;
    };
    await this._refreshConvo();
    const th0 = this.root.querySelector('#dm-thread');
    if (th0) th0.scrollTop = th0.scrollHeight;
    this._convoTimer = setInterval(() => this._refreshConvo(), 4000);
    const doSend = async () => {
      const inp = this.root.querySelector('#dm-input');
      const text = (inp?.value || '').trim();
      if (!text || this._dmSending) return;
      this._dmSending = true;
      inp.value = '';
      const ok = await social.sendTo('u:' + withUser, 'dm', { text });
      this._dmSending = false;
      if (ok) this._refreshConvo();
      else window.__notices?.show({ icon: '⚠️', text: t('ntc.sendFail'), life: 4 });
    };
    this.root.querySelector('[data-dm-send]').onclick = doSend;
    this.root.querySelector('#dm-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doSend(); }
    });
  }

  // Aktiv otaqlar siyahısını yeniləyir (yalnız görünəndə)
  async _refreshRooms() {
    if (!this.root.querySelector('#rooms-list')) { this._stopRoomsPoll(); return; }
    const rooms = await listRooms();
    const el = this.root.querySelector('#rooms-list');
    if (!el) return; // fetch bitənə qədər ekran dəyişib
    if (rooms === null) {
      el.innerHTML = `<div class="rooms-note">${t('rooms.unavail')}</div>`;
      return;
    }
    const open = rooms.filter((r) => r.players < 6);
    const busy = rooms.filter((r) => r.players >= 6);
    if (!open.length && !busy.length) {
      el.innerHTML = `<div class="rooms-note">${t('rooms.none')}</div>`;
      return;
    }
    const icon = (r) => (r.mode === 'football' ? '⚽' : r.mode === 'arena' ? '⚔️' : (getTrackById(r.track)?.icon || '🏁'));
    const meta = (r) => (r.mode === 'football' ? 'Futbol 3v3' : r.mode === 'arena' ? 'Arena BR' : `${r.laps} dövrə`);
    el.innerHTML = [
      ...open.map((r) => `
        <button class="room-row" data-room="${r.code}">
          <span class="room-row__icon">${icon(r)}</span>
          <span class="room-row__body">
            <span class="room-row__name">${r.host} otağı ${r.inGame ? '<em class="room-row__status">🏁 oyundadır</em>' : '<em class="room-row__status room-row__status--lobby">lobbidədir</em>'}</span>
            <span class="room-row__meta">${r.players}/6 oyunçu · ${meta(r)} · kod ${r.code}</span>
          </span>
          <span class="room-row__join">${r.inGame ? 'LOBBİYƏ →' : 'QOŞUL →'}</span>
        </button>`),
      ...busy.map((r) => `
        <div class="room-row room-row--busy">
          <span class="room-row__icon">${icon(r)}</span>
          <span class="room-row__body">
            <span class="room-row__name">${r.host} otağı</span>
            <span class="room-row__meta">doludur</span>
          </span>
        </div>`),
    ].join('');
    el.querySelectorAll('[data-room]').forEach((btn) => {
      btn.onclick = () => this._joinWithCode(btn.dataset.room);
    });
  }

  async _joinWithCode(codeRaw) {
    const code = String(codeRaw || '').trim().toUpperCase();
    if (code.length !== 4) { this.showOnline(t('online.codeHint')); return; }
    // Hesabla girmişsə lobbidə ləqəbi görünsün (yazdığı sərbəst ad yox)
    const name = auth.profile?.nick || this._onlineName();
    this._stopRoomsPoll();
    this._onlineBusy(t('online.joining'));
    // Şəbəkə xətalarında avtomatik təkrar cəhdlər (bəzi şəbəkələrdə ilk bağlantı büdrəyir)
    let lastErr = null;
    this._busyCancelled = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (this._busyCancelled) return; // istifadəçi İmtina basdı
      try {
        this.net = new NetRoom();
        await this.net.joinRoom(code, name);
        if (this._busyCancelled) { this.net?.dispose(); this.net = null; return; }
        this.showLobby();
        return;
      } catch (e) {
        lastErr = e;
        this.net?.dispose();
        this.net = null;
        if (this._busyCancelled) return;
        // Otaq həqiqətən yoxdursa təkrar cəhdin mənası yoxdur
        if (e?.type === 'peer-unavailable') break;
        if (attempt < 2) this._onlineBusy(t('online.retry', { a: attempt + 2 }));
      }
    }
    if (this._busyCancelled) return;
    const notFound = lastErr?.type === 'peer-unavailable';
    const detail = lastErr?.type || lastErr?.message || 'naməlum';
    this.showOnline(notFound
      ? 'Bu kodla otaq tapılmadı — kodu yoxla (host otağı açıq saxlamalıdır).'
      : `Şəbəkə xətası (${detail}) — bir daha yoxla. Alınmasa, başqa şəbəkə/hotspot sınayın.`);
  }

  _onlineBusy(text) {
    this.root.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <div>${text}</div>
        <button class="btn btn--ghost loading-cancel" data-cancel>${t('ui.cancel')}</button>
      </div>`;
    this.root.querySelector('[data-cancel]').onclick = () => {
      this._busyCancelled = true;
      this.net?.dispose();
      this.net = null;
      this.showOnline();
    };
  }

  // ————— ONLAYN LOBBY —————
  // Panel BİR DƏFƏ render olunur; şəbəkə hadisələri yalnız dəyişən
  // hissələri yeniləyir — "səhifə yenidən yüklənir" flash-ı olmur.
  showLobby() {
    this._here = 'lobby';
    const net = this.net;
    if (!net) { this.showModes(); return; }
    // Oyundan qayıdanda showcase TƏZƏ yaradılır — preview verilməsə arxa fon qara qalır
    this._preview();
    this._stopRoomsPoll();
    // İlk dəfə: öz maşınımızı bildir
    if (!this._lobbyCarId) {
      this._lobbyCarId = this.sel.carId;
      net.setCar(this._lobbyCarId);
    }
    net.on('players', () => this._updateLobbyLive());
    net.on('lobby', () => {
      this.onPreviewTrack?.(getTrackById(net.lobbyTrack)); // eyni trekdirsə showcase toxunmur
      this._updateLobbyLive();
    });
    net.on('start', (msg) => {
      // Hazır deyildimsə oyuna düşmürəm — lobbidə qalıram.
      // ƏVVƏL heç bir izah yox idi: oyunçu "başladı, mən niyə qalmışam?"
      // deyə çaşırdı. İndi səbəb açıq yazılır.
      if (!msg.players.some((p) => p.id === net.selfId)) {
        this._updateLobbyLive();
        const el = this.root.querySelector('[data-lobby-note]');
        if (el) {
          el.textContent = t('lobby.notReady');
          el.style.display = '';
        }
        return;
      }
      const nm = net; this.net = null; // oyun net-i götürür
      this.onStartOnline?.(nm, msg);
    });
    net.on('closed', () => {
      this.net?.dispose(); this.net = null;
      this._lobbyCarId = null;
      this.showOnline(t('online.hostClosed'));
    });
    net.on('chat', (m) => this._appendChat(m));
    this._renderLobby();
  }

  _chatMsgHtml(m) {
    const own = m.id === this.net?.selfId;
    return `<div class="chat-msg ${own ? '' : 'chat-msg--other'}"><b>${esc(m.name)}:</b> ${esc(m.text)}</div>`;
  }

  _appendChat(m) {
    const box = this.root.querySelector('#lobby-chat');
    if (!box) return; // lobby ekranda deyil
    const empty = box.querySelector('.chat-empty');
    if (empty) empty.remove();
    box.insertAdjacentHTML('beforeend', this._chatMsgHtml(m));
    box.scrollTop = box.scrollHeight;
  }

  _sendChat() {
    const inp = this.root.querySelector('#chat-input');
    if (!inp || !this.net) return;
    const text = inp.value.trim();
    if (!text) return;
    this.net.sendChat(text); // 'chat' emit → _appendChat özü əlavə edir
    inp.value = '';
    inp.focus();
  }

  _playersHtml() {
    const net = this.net;
    const anyRacing = (net.racingIds || []).length > 0;
    return net.players.map((p) => {
      const car = p.carId ? getCarById(p.carId) : null;
      const racing = (net.racingIds || []).includes(p.id);
      const status = anyRacing
        ? (racing ? '<span class="lobby-player__racing">🏁 oyundadır</span>' : '<span class="lobby-player__waiting">lobbidə</span>')
        : (p.isHost ? '' : (p.ready
          ? '<span class="lobby-player__ready">✅ hazır</span>'
          : '<span class="lobby-player__notready">⌛ hazır deyil</span>'));
      const team = net.lobbyMode === 'football'
        ? `<span class="lobby-player__team">${p.team === 'red' ? '🔴' : p.team === 'blue' ? '🔵' : '⚪'}</span>`
        : '';
      return `
        <div class="lobby-player">
          <span class="lobby-player__dot" style="background:${car ? hex(car.bodyColor) : '#555'}"></span>
          ${team}
          <span class="lobby-player__name">${esc(p.name)}${p.id === net.selfId ? ' <small>(sən)</small>' : ''}</span>
          ${p.isHost ? '<span class="lobby-player__host">HOST</span>' : ''}
          ${status}
          <span class="lobby-player__car">${car ? car.name : '—'}</span>
        </div>`;
    }).join('');
  }

  _statsInner() {
    const selCar = getCarById(this._lobbyCarId);
    const statBar = (label, v) => `
      <div class="stat">
        <span class="stat__label">${label}</span>
        <span class="stat__bar"><span class="stat__fill" style="width:${v}%"></span></span>
      </div>`;
    return `
      <div class="lobby-stats__name">${selCar.name} <em class="mrow__class">${selCar.class}</em></div>
      ${statBar('Sürət', selCar.stats.topSpeed)}
      ${statBar('Cəldlik', selCar.stats.accel)}
      ${statBar('İdarə', selCar.stats.handling)}
      ${statBar('Tutum', selCar.stats.grip)}
      ${statBar('Zireh', selCar.stats.armor ?? 50)}`;
  }

  // Şəbəkə hadisəsi → yalnız dəyişən hissələr (tam re-render YOX)
  _updateLobbyLive() {
    const net = this.net;
    const list = this.root.querySelector('.lobby-players');
    if (!net || !list) return; // lobby ekranda deyil
    list.innerHTML = this._playersHtml();
    const cnt = this.root.querySelector('[data-lobby-count]');
    if (cnt) cnt.textContent = `Oyunçular (${net.players.length}/6)`;
    // Host trek/dövrə dəyişibsə seçim işarələrini köçür
    this.root.querySelectorAll('[data-ltrack]').forEach((b) =>
      b.classList.toggle('is-selected', b.dataset.ltrack === net.lobbyTrack));
    this.root.querySelectorAll('[data-llaps]').forEach((b) =>
      b.classList.toggle('is-selected', parseInt(b.dataset.llaps, 10) === net.lobbyLaps));
    // Rejim (yarış/futbol/arena) + komanda seçimi
    const lmode = net.lobbyMode || 'race';
    const fb = lmode === 'football';
    this.root.querySelectorAll('[data-lmode]').forEach((b) =>
      b.classList.toggle('is-selected', b.dataset.lmode === lmode));
    const raceOpts = this.root.querySelector('[data-race-opts]');
    if (raceOpts) raceOpts.style.display = lmode === 'race' ? '' : 'none';
    const teamSec = this.root.querySelector('[data-team-sec]');
    if (teamSec) teamSec.style.display = fb ? '' : 'none';
    const myTeam = net.players.find((p) => p.id === net.selfId)?.team;
    this.root.querySelectorAll('[data-lteam]').forEach((b) =>
      b.classList.toggle('is-selected', b.dataset.lteam === myTeam));
    this._syncReadyBtn();
    const startBtn = this.root.querySelector('[data-start]');
    if (startBtn) startBtn.textContent = fb ? '⚽ Matça başla' : lmode === 'arena' ? '⚔️ Döyüşə başla' : 'Yarışa başla';
  }

  _renderLobby() {
    const net = this.net;
    if (!net) return;
    const isHost = net.isHost;

    const carsHtml = CARS.map((c) => {
      const unlocked = isCarUnlocked(c.id, auth.profile);
      return `
      <button class="lobby-car ${c.id === this._lobbyCarId ? 'is-selected' : ''} ${unlocked ? '' : 'is-locked'}"
        data-lcar="${c.id}" title="${unlocked ? c.name : c.name + ' — kilidli (menyuda aç)'}">
        ${this.thumbs[carSkin(c)] ? `<img src="${this.thumbs[carSkin(c)]}" alt="${c.name}" draggable="false" />` : c.name}
        ${unlocked ? '' : '<span class="lobby-car__lock">🔒</span>'}
      </button>`;
    }).join('');

    const trackBtns = TRACKS.map((t) => `
      <button class="seg seg--sm ${t.id === net.lobbyTrack ? 'is-selected' : ''}" data-ltrack="${t.id}" ${isHost ? '' : 'disabled'}>
        <span class="seg__num" style="font-size:20px">${t.icon}</span>
        <span class="seg__label">${t.name.split(' ')[0]}</span>
      </button>`).join('');
    const lapBtns = [1, 3, 5].map((n) => `
      <button class="seg seg--sm ${n === net.lobbyLaps ? 'is-selected' : ''}" data-llaps="${n}" ${isHost ? '' : 'disabled'}>
        <span class="seg__num" style="font-size:20px">${n}</span>
        <span class="seg__label">dövrə</span>
      </button>`).join('');

    this._panel({
      step: '03', stepLabel: t('lobby.step'),
      title: isHost ? t('lobby.titleHost') : t('lobby.titleGuest'),
      body: `
        <div class="lobby-code">
          <span>${t('lobby.code')}</span>
          <b>${net.code}</b>
          <button class="lobby-copy" data-copy title="Kopyala">⧉</button>
        </div>
        <div class="menu-sub" style="margin-top:12px" data-lobby-count>${t('lobby.playersN', { a: net.players.length })}</div>
        <div class="lobby-note" data-lobby-note style="display:none"></div>
        <div class="lobby-players">${this._playersHtml()}</div>
        <div class="menu-sub" style="margin-top:10px">${t('lobby.yourCar')}</div>
        <div class="lobby-cars">${carsHtml}</div>
        <div class="lobby-stats">${this._statsInner()}</div>
        <div class="menu-sub" style="margin-top:10px">${t('lobby.gameType')} ${isHost ? '' : t('lobby.hostPicks')}</div>
        <div class="menu-seg" style="margin-top:6px">
          <button class="seg seg--sm ${net.lobbyMode !== 'football' ? 'is-selected' : ''}" data-lmode="race" ${isHost ? '' : 'disabled'}>
            <span class="seg__num" style="font-size:20px">🏁</span>
            <span class="seg__label">${t('mode.race')}</span>
          </button>
          <button class="seg seg--sm ${net.lobbyMode === 'football' ? 'is-selected' : ''}" data-lmode="football" ${isHost ? '' : 'disabled'}>
            <span class="seg__num" style="font-size:20px">⚽</span>
            <span class="seg__label">${t('mode.football')}</span>
          </button>
          <button class="seg seg--sm ${net.lobbyMode === 'arena' ? 'is-selected' : ''}" data-lmode="arena" ${isHost ? '' : 'disabled'}>
            <span class="seg__num" style="font-size:20px">⚔️</span>
            <span class="seg__label">${t('mode.arena')}</span>
          </button>
        </div>
        <div data-team-sec style="display:${net.lobbyMode === 'football' ? '' : 'none'}">
          <div class="menu-sub" style="margin-top:10px">${t('lobby.team')}</div>
          <div class="menu-seg" style="margin-top:6px">
            <button class="seg seg--sm seg--blue ${this._myTeam(net) === 'blue' ? 'is-selected' : ''}" data-lteam="blue">
              <span class="seg__num" style="font-size:20px">🔵</span>
              <span class="seg__label">${t('lobby.blue')}</span>
            </button>
            <button class="seg seg--sm seg--red ${this._myTeam(net) === 'red' ? 'is-selected' : ''}" data-lteam="red">
              <span class="seg__num" style="font-size:20px">🔴</span>
              <span class="seg__label">${t('lobby.red')}</span>
            </button>
          </div>
        </div>
        <div data-race-opts style="display:${(net.lobbyMode || 'race') === 'race' ? '' : 'none'}">
        <div class="menu-sub" style="margin-top:10px">${t('tracks.step')} ${isHost ? '' : t('lobby.hostPicks')}</div>
        <div class="menu-seg" style="margin-top:6px">${trackBtns}</div>
        <div class="menu-seg" style="margin-top:8px">${lapBtns}</div>
        </div>
        <div class="menu-sub" style="margin-top:10px">${t('lobby.chat')}</div>
        <div class="lobby-chat" id="lobby-chat">${
          net.chatLog.length
            ? net.chatLog.map((m) => this._chatMsgHtml(m)).join('')
            : `<div class="chat-empty">${t('lobby.sayHi')}</div>`
        }</div>
        <div class="chat-row">
          <input class="field__input" id="chat-input" maxlength="120" placeholder="${t('lobby.writeMsg')}" autocomplete="off" />
          <button class="btn" data-chat-send>➤</button>
        </div>`,
      nav: isHost
        ? `<button class="btn btn--ghost" data-leave>${t('lobby.closeRoom')}</button>
           <button class="btn btn--primary" data-start>${net.lobbyMode === 'football' ? t('lobby.startMatch') : net.lobbyMode === 'arena' ? t('lobby.startBattle') : t('race.start')}</button>`
        : `<button class="btn btn--ghost" data-leave>${t('lobby.leaveRoom')}</button>
           <button class="btn btn--primary" data-ready></button>`,
    });

    this.root.querySelector('[data-copy]').onclick = () => {
      navigator.clipboard?.writeText(net.code).catch(() => {});
    };
    this.root.querySelector('[data-leave]').onclick = () => {
      net.dispose(); this.net = null; this._lobbyCarId = null;
      this.showOnline();
    };
    // Çat
    this.root.querySelector('[data-chat-send]').onclick = () => this._sendChat();
    this.root.querySelector('#chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._sendChat(); }
    });
    const chatBox = this.root.querySelector('#lobby-chat');
    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    // Öz seçimlərimiz də hədəfli yenilənir — flash yoxdur
    this.root.querySelectorAll('[data-lcar]').forEach((el) => {
      el.onclick = () => {
        if (!isCarUnlocked(el.dataset.lcar, auth.profile)) return; // kilidli
        this._lobbyCarId = el.dataset.lcar;
        net.setCar(this._lobbyCarId);
        // kosmetika ilə birlikdə (zavod görünüşü yox)
        this.onPreviewCar?.(playerCarData(this._lobbyCarId));
        this.root.querySelectorAll('[data-lcar]').forEach((b) =>
          b.classList.toggle('is-selected', b.dataset.lcar === this._lobbyCarId));
        const statsEl = this.root.querySelector('.lobby-stats');
        if (statsEl) statsEl.innerHTML = this._statsInner();
      };
    });
    if (isHost) {
      this.root.querySelectorAll('[data-ltrack]').forEach((el) => {
        el.onclick = () => {
          net.setLobby(el.dataset.ltrack, net.lobbyLaps);
          this.onPreviewTrack?.(getTrackById(el.dataset.ltrack));
          this._updateLobbyLive();
        };
      });
      this.root.querySelectorAll('[data-llaps]').forEach((el) => {
        el.onclick = () => {
          net.setLobby(net.lobbyTrack, parseInt(el.dataset.llaps, 10));
          this._updateLobbyLive();
        };
      });
      this.root.querySelectorAll('[data-lmode]').forEach((el) => {
        el.onclick = () => {
          net.setMode(el.dataset.lmode);
          this._updateLobbyLive();
        };
      });
      this.root.querySelector('[data-start]').onclick = () => net.startGame();
    }
    // Komanda seçimi — hamı üçün
    this.root.querySelectorAll('[data-lteam]').forEach((el) => {
      el.onclick = () => net.setTeam(el.dataset.lteam);
    });
    // Hazır düyməsi (yalnız qonaq)
    const rb2 = this.root.querySelector('[data-ready]');
    if (rb2) {
      this._syncReadyBtn();
      rb2.onclick = () => {
        const me = net.players.find((p) => p.id === net.selfId);
        net.setReady(!me?.ready);
        this._syncReadyBtn();
        this._updateLobbyLive();
      };
    }
  }

  _syncReadyBtn() {
    const btn = this.root.querySelector('[data-ready]');
    if (!btn || !this.net) return;
    const me = this.net.players.find((p) => p.id === this.net.selfId);
    const r = !!me?.ready;
    btn.textContent = r ? t('lobby.ready') : t('lobby.readyAsk');
    btn.classList.toggle('btn--primary', !r);
    btn.classList.toggle('btn--ghost', r);
  }

  _myTeam(net) {
    return net.players.find((p) => p.id === net.selfId)?.team || null;
  }

  showTracks() {
    this._here = 'tracks';
    this._preview();
    const rows = TRACKS.map((tr) => {
      const p = tr.palette;
      const grad = `linear-gradient(120deg, ${hex(p.sky)}, ${hex(p.skyBottom ?? p.sky)} 50%, ${hex(p.ground)})`;
      return `
      <button class="mrow ${tr.id === this.sel.trackId ? 'is-selected' : ''}" data-track="${tr.id}">
        <span class="mrow__swatch" style="background:${grad}"><span>${tr.icon}</span></span>
        <span class="mrow__body">
          <span class="mrow__title">${tr.name}</span>
          <span class="mrow__desc">${tr.theme}</span>
        </span>
      </button>`;
    }).join('');

    this._panel({
      step: '02', stepLabel: t('tracks.step'),
      title: t('tracks.title'),
      body: `<div class="menu-list menu-list--scroll">${rows}</div>`,
      nav: `<button class="btn btn--ghost" data-back>${t('ui.back')}</button>
            <button class="btn btn--primary" data-next>${t('ui.continue')}</button>`,
    });

    this.root.querySelectorAll('[data-track]').forEach((el) => {
      el.onclick = () => {
        this.sel.trackId = el.dataset.track;
        this._select(el, '[data-track]');
        this.onPreviewTrack?.(getTrackById(this.sel.trackId));
      };
    });
    // Trek → ana menyu (yarışın ilk addımıdır)
    this.root.querySelector('[data-back]').onclick = () => this.showModes();
    this.root.querySelector('[data-next]').onclick = () => this.showCars();
  }

  // Qaraj: bütün maşınlar bir yerdə — aktiv maşını seç, yenisini al
  showGarage(notice = '') {
    this._garage = true;
    this._garageTab = this._garageTab || 'cars';
    if (this._garageTab === 'cars') { this.showCars(notice); return; }
    this.showCosmetics(notice);
  }

  // Görünüş qrupu qarşılıqlı istisnadır: boya · skin · əfsanəvi effekt.
  // Biri seçiləndə qalan ikisi söndürülür ki, nəyin işlədiyi həmişə aydın olsun.
  // GÖRÜNÜŞ qrupu qarşılıqlı istisnadır: boya · skin · əfsanəvi.
  // XƏTA İDİ: disk/alov/finiş seçəndə də çağırılırdı və maşının boyası
  // sıfırlanırdı ("disk rəngini dəyişirəm, maşın standart rəngə qayıdır").
  // Bunlar görünüş qrupuna AİD DEYİL — toxunulmamalıdır.
  async _clearRivalLooks(chosen) {
    if (!['paint', 'skin', 'effect'].includes(chosen)) return;
    const eq = equippedCosmetics(auth.profile);
    const jobs = [];
    if (chosen !== 'skin' && equippedSkin(this.sel.carId, auth.profile)) {
      jobs.push(auth.equip('skin_' + this.sel.carId, ''));
    }
    if (chosen !== 'effect' && eq.effect && eq.effect !== 'e_none') {
      jobs.push(auth.equip('effect', 'e_none'));
    }
    if (chosen !== 'paint' && eq.paint && eq.paint !== 'p_stock') {
      jobs.push(auth.equip('paint', 'p_stock'));
    }
    await Promise.all(jobs);
  }

  // ————— QARAJ: kosmetika mağazası (boya · disk · alov · tüstü) —————
  showCosmetics(notice = '') {
    this._here = 'garage';
    this._garage = true;
    this._preview();
    const isSkinTab = this._garageTab === 'skin';
    const grp = isSkinTab
      ? { key: 'skin', title: 'Skinlər', items: carSkinsFor(this.sel.carId) }
      : (COSMETIC_GROUPS.find((g) => g.key === this._garageTab) || COSMETIC_GROUPS[0]);
    const eq = equippedCosmetics(auth.profile);
    const curSkin = equippedSkin(this.sel.carId, auth.profile);
    const gold = auth.profile?.gold ?? 0;
    const car = getCarById(this.sel.carId);

    const tabs = [{ key: 'cars', title: 'Maşınlar', icon: '🏎️' },
      { key: 'skin', title: 'Skinlər', icon: '🎭' }, ...COSMETIC_GROUPS]
      .map((tb) => `<button class="seg seg--sm ${tb.key === this._garageTab ? 'is-selected' : ''}" data-gtab="${tb.key}">
          <span class="seg__num" style="font-size:19px">${tb.icon}</span>
          <span class="seg__label">${tb.title}</span>
        </button>`).join('');

    const rows = grp.items.map((it) => {
      const owned = isCosmeticOwned(it.id, auth.profile);
      // Görünüş qrupunda eyni anda YALNIZ BİRİ aktivdir. Əvvəl skin taxılı
      // ikən boya tabında "Zavod rəngi ✓ Aktiv" yazılırdı — yanlış idi.
      const skinOn = !!curSkin;
      const effectOn = !!(eq.effect && eq.effect !== 'e_none');
      const on = isSkinTab
        ? curSkin === it.id
        : grp.key === 'paint'
          ? (!skinOn && !effectOn && (eq.paint === it.id || (!eq.paint && it.price === 0)))
          : grp.key === 'effect'
            ? (!skinOn && eq.effect === it.id)
            : (eq[grp.key] === it.id || (!eq[grp.key] && it.price === 0));
      const legendary = !!it.kind && it.kind !== 'none';
      // Zavod xanası: nümunə rəng seçilmiş maşının ÖZ rəngidir (hər maşında dəyişir)
      const dot = it.stock && it.hex == null ? (car?.bodyColor ?? car?.tint ?? 0x9aa3b2) : it.hex;
      const swatch = it.core
        ? `background:linear-gradient(135deg, ${hex(it.hex)}, ${hex(it.core)})`
        : legendary
          ? `background:linear-gradient(135deg, ${hex(it.hex)}, ${hex(it.glow || it.hex)})`
          : `background:${hex(dot)}`;
      // Hesabsız oyunçuda maşınlarda olduğu kimi KİLİD nişanı görünsün
      // (əvvəl yalnız qiymət yazılırdı və alına biləcəyi təəssüratı yaranırdı)
      const tag = owned
        ? (on ? `<span class="cos__on">✓ ${isSkinTab ? t('cos.tapOff') : t('cos.on')}</span>` : '')
        : (auth.isLoggedIn
          ? `<span class="mrow__lock">🪙${it.price}</span>`
          : `<span class="mrow__lock">${t('cars.lockAcc')}</span>`);
      const stockDesc = it.stock
        ? `${car?.name || 'Maşın'} — ${grp.key === 'rim' ? 'öz zavod diskləri' : 'öz orijinal rəngi'}`
        : '';
      const sub = (it.desc || stockDesc) ? `<span class="mrow__desc">${it.desc || stockDesc}</span>` : '';
      return `
      <button class="mrow mrow--cos ${on ? 'is-selected' : ''} ${owned ? '' : 'is-locked'} ${legendary ? 'is-legend' : ''}" data-cos="${it.id}">
        <span class="cos__dot ${legendary ? 'cos__dot--legend' : ''}" style="${swatch}"></span>
        <span class="mrow__body"><span class="mrow__title">${it.name}${tag}</span>${sub}</span>
      </button>`;
    }).join('');

    this._panel({
      step: '🏎️', stepLabel: '🏎️',
      title: t('garage.title'),
      // Skin taxılıbsa boya/əfsanəvi görünmür — istifadəçi bunu bilməlidir,
      // yoxsa "rəngi dəyişirəm, heç nə olmur" təəssüratı yaranır
      sub: notice || (isSkinTab
        ? `🪙 ${gold} · ${car?.name} üçün imza skinlər`
        : (curSkin && (grp.key === 'paint' || grp.key === 'effect')
          ? `🪙 ${gold} · ${t('cos.skinOverrides')}`
          : `🪙 ${gold} · ${grp.title} — seç və ya al`)),
      body: `<div class="menu-seg menu-seg--wrap" style="margin-bottom:10px">${tabs}</div>
             <div class="menu-list menu-list--scroll">${rows}</div>`,
      nav: `<button class="btn btn--primary" data-back>${t('garage.done')}</button>`,
    });

    this.root.querySelectorAll('[data-gtab]').forEach((el) => {
      el.onclick = () => { this._garageTab = el.dataset.gtab; this.showGarage(); };
    });
    this.root.querySelector('[data-back]').onclick = () => this.showModes();
    this.root.querySelectorAll('[data-cos]').forEach((el) => {
      el.onclick = async () => {
        const id = el.dataset.cos;
        const it = cosmeticById(id);
        const grpKey = it.group === 'skin' ? 'skin_' + this.sel.carId : it.group;
        const active = it.group === 'skin'
          ? equippedSkin(this.sel.carId, auth.profile) === id
          : equippedCosmetics(auth.profile)[it.group] === id;
        // Aktiv skin HƏMİŞƏ çıxarıla bilər — hesabdan çıxandan sonra seçim
        // qalırsa, sahiblik yoxlaması onu qıfıllayıb çıxarmağa imkan vermirdi
        if (active && it.group === 'skin') {
          await auth.equip(grpKey, '');
          this.showCosmetics();
          return;
        }
        // Aktiv əfsanəvi örtüyə basmaq onu ÇIXARIR — ayrıca "Yoxdur" sətri
        // lazım deyil (tablar arasında keçib seçirik)
        if (active && it.group === 'effect') {
          await auth.equip('effect', 'e_none');
          this.showCosmetics();
          return;
        }
        if (isCosmeticOwned(id, auth.profile)) {
          await auth.equip(grpKey, id);
          // GÖRÜNÜŞ QRUPU: boya · skin · əfsanəvi — eyni anda yalnız BİRİ.
          // Birini seçəndə digərləri avtomatik söndürülür (əvvəl skin sakitcə
          // boyanı üstələyirdi və "rəngi dəyişirəm, heç nə olmur" hissi yaranırdı)
          await this._clearRivalLooks(it.group);
          this.showCosmetics();
          return;
        }
        if (!auth.isLoggedIn) { this.showAuth(t('auth.needCar')); return; }
        if ((auth.profile?.gold ?? 0) < it.price) {
          this.showCosmetics('🪙 ' + t('cars.goldShort', { p: it.price, g: auth.profile.gold }));
          return;
        }
        el.classList.add('is-buying');
        try {
          await auth.buy(id);
          await auth.equip(grpKey, id);
          await this._clearRivalLooks(it.group);
          audio.sfx('pickup');
          this.showCosmetics(`✓ ${it.name} alındı və taxıldı`);
        } catch {
          this.showCosmetics('Alınmadı — yenidən yoxla.');
        }
      };
    });
  }

  showCars(notice = '') {
    this._here = 'cars';
    this._preview();
    // Seçili maşın kilidlidirsə (qonaq/yeni hesab) — başlanğıc maşına düş
    if (!isCarUnlocked(this.sel.carId, auth.profile)) this.sel.carId = STARTER_CARS[0];
    const rows = CARS.map((c) => {
      const img = this.thumbs[carSkin(c)]
        ? `<img src="${this.thumbs[carSkin(c)]}" alt="" draggable="false" />`
        : '';
      const bars = [c.stats.topSpeed, c.stats.accel, c.stats.handling, c.stats.grip, c.stats.armor ?? 50]
        .map((v) => `<i style="--v:${v}%"></i>`).join('');
      const unlocked = isCarUnlocked(c.id, auth.profile);
      const price = CAR_PRICES[c.id];
      const lockBadge = unlocked ? '' : (auth.isLoggedIn
        ? `<span class="mrow__lock">🪙${price}</span>`
        : `<span class="mrow__lock">${t('cars.lockAcc')}</span>`);
      // İmza gücü — hər maşının yarışda BİR DƏFƏ işlətdiyi öz xüsusi gücü
      const ab = abilityFor(c.id);
      const sig = ab ? `
        <span class="mrow__sig" style="--sig:${hex(ab.color)}">
          <img src="${signatureIconURL(ab.icon, ab.color, 64)}" alt="" draggable="false" />
          <span class="mrow__sig-txt"><b>${ab.name}</b><i>${ab.desc}</i></span>
        </span>` : '';
      return `
      <button class="mrow mrow--car ${c.id === this.sel.carId ? 'is-selected' : ''} ${unlocked ? '' : 'is-locked'}" data-car="${c.id}">
        <span class="mrow__thumb">${img}</span>
        <span class="mrow__body">
          <span class="mrow__title">${c.name} <em class="mrow__class">${c.class}</em>${lockBadge}</span>
          <span class="mrow__bars" title="Sürət · Cəldlik · İdarə · Tutum · Zireh">${bars}</span>
          ${sig}
        </span>
      </button>`;
    }).join('');

    const isRace = this.sel.mode === 'race';
    this._panel({
      step: this._garage ? '🏎️' : '03', stepLabel: this._garage ? '🏎️' : t('cars.step'),
      title: this._garage ? t('garage.title') : t('cars.title'),
      sub: notice || (this._garage ? t('garage.sub') : t('cars.sub')),
      body: `${this._garage ? `<div class="menu-seg menu-seg--wrap" style="margin-bottom:10px">${
        [{ key: 'cars', title: 'Maşınlar', icon: '🏎️' },
          { key: 'skin', title: 'Skinlər', icon: '🎭' }, ...COSMETIC_GROUPS].map((tb) => `
          <button class="seg seg--sm ${tb.key === (this._garageTab || 'cars') ? 'is-selected' : ''}" data-gtab="${tb.key}">
            <span class="seg__num" style="font-size:19px">${tb.icon}</span>
            <span class="seg__label">${tb.title}</span>
          </button>`).join('')
      }</div>` : ''}<div class="menu-list menu-list--scroll">${rows}</div>`,
      nav: this._garage
        ? `<button class="btn btn--primary" data-back>${t('garage.done')}</button>`
        : `<button class="btn btn--ghost" data-back>${t('ui.back')}</button>
            <button class="btn btn--primary" data-next>${isRace ? t('ui.continue') : t('ui.start')}</button>`,
    });

    this.root.querySelectorAll('[data-gtab]').forEach((el) => {
      el.onclick = () => { this._garageTab = el.dataset.gtab; this.showGarage(); };
    });
    this.root.querySelectorAll('[data-car]').forEach((el) => {
      el.onclick = async () => {
        const id = el.dataset.car;
        if (isCarUnlocked(id, auth.profile)) {
          this.sel.carId = id;
          localStorage.setItem('apexCar', id); // aktiv maşın yadda qalır
          this._select(el, '[data-car]');
          // XƏTA İDİ: `getCarById(id)` KOSMETİKASIZ datadır — önizləmə zavod
          // görünüşünü göstərirdi, oyunun içi isə taxılmış skini. `_preview()`
          // playerCarData ilə boya/skin/əfsanəvi + alov nümayişini də verir.
          this._preview();
          return;
        }
        // Kilidli maşın
        if (!auth.isLoggedIn) { this.showAuth(t('auth.needCar')); return; }
        const price = CAR_PRICES[id];
        if ((auth.profile?.gold ?? 0) < price) {
          this.showCars('🪙 ' + t('cars.goldShort', { p: price, g: auth.profile.gold }));
          return;
        }
        el.classList.add('is-buying');
        try {
          await auth.buy(id);
          this.sel.carId = id;
          this.showCars(`✅ ${getCarById(id).name} açıldı!`);
          this._preview();
        } catch (e) {
          this.showCars(e.message === 'poor' ? '🪙 Qızıl çatmır.' : 'Alış alınmadı — yenidən yoxla.');
        }
      };
    });
    // Yarışda addımlar var: maşından Geri → TREKƏ; qalan rejimlərdə → ana menyu
    this.root.querySelector('[data-back]').onclick = () => {
      if (this._garage) { this.showModes(); return; }
      if (this.sel.mode === 'race') this.showTracks();
      else this.showModes();
    };
    const nx2 = this.root.querySelector('[data-next]');
    if (nx2) nx2.onclick = () => (isRace ? this.showLaps() : this._start());
  }

  showLaps() {
    this._here = 'laps';
    this._preview();
    const opts = [
      { n: 1, label: t('laps.sprint') },
      { n: 3, label: t('laps.standard') },
      { n: 5, label: t('laps.endurance') },
    ];
    const seg = opts.map((o) => `
      <button class="seg ${o.n === this.sel.laps ? 'is-selected' : ''}" data-laps="${o.n}">
        <span class="seg__num">${o.n}</span>
        <span class="seg__label">${o.label}</span>
      </button>`).join('');

    const diffs = [
      { id: 'easy', icon: '🙂', label: t('diff.easy') },
      { id: 'normal', icon: '😐', label: t('diff.normal') },
      { id: 'hard', icon: '😈', label: t('diff.hard') },
    ];
    const diffSeg = diffs.map((d) => `
      <button class="seg ${d.id === this.sel.difficulty ? 'is-selected' : ''}" data-diff="${d.id}">
        <span class="seg__num" style="font-size:24px">${d.icon}</span>
        <span class="seg__label">${d.label}</span>
      </button>`).join('');

    this._panel({
      step: '04', stepLabel: t('laps.step'),
      title: t('laps.title'),
      body: `<div class="menu-seg">${seg}</div>
        <div class="menu-sub" style="margin-top:18px">${t('laps.botdiff')}</div>
        <div class="menu-seg" style="margin-top:6px">${diffSeg}</div>`,
      nav: `<button class="btn btn--ghost" data-back>${t('ui.back')}</button>
            <button class="btn btn--primary" data-next>${t('race.start')}</button>`,
    });

    this.root.querySelectorAll('[data-laps]').forEach((el) => {
      el.onclick = () => {
        this.sel.laps = parseInt(el.dataset.laps, 10);
        this._select(el, '[data-laps]');
      };
    });
    this.root.querySelectorAll('[data-diff]').forEach((el) => {
      el.onclick = () => {
        this.sel.difficulty = el.dataset.diff;
        this._select(el, '[data-diff]');
      };
    });
    // Dövrələr → maşın seçiminə (bir addım geri)
    this.root.querySelector('[data-back]').onclick = () => this.showCars();
    this.root.querySelector('[data-next]').onclick = () => this._start();
  }

  // ————— HESAB: giriş / qeydiyyat / qonaq —————
  showAuth(msg = '', confirmLogout = false) {
    // Hardan gəlmisənsə, çıxışda ORA qayıdırsan (menyu itmir)
    if (this._here !== 'auth' && this._here !== 'top') this._authFrom = this._here || 'modes';
    this._here = 'auth';
    this._preview();
    const p = auth.profile;
    const streak = p?.daily?.streak || 0;
    const body = p ? `
      <div class="auth-card">
        <div class="auth-nick">👤 ${p.nick}</div>
        <div class="auth-gold">🪙 ${t('auth.gold', { g: p.gold })}</div>
        <div class="menu-sub" style="margin-top:8px">${t('auth.carsOpen', { a: STARTER_CARS.length + (p.cars?.length || 0), b: CARS.length })}</div>
      </div>
      <button class="btn ${auth.dailyReady ? 'btn--primary' : ''} daily-btn" data-daily ${auth.dailyReady ? '' : 'disabled'}>
        ${t('auth.daily')} ${auth.dailyReady ? t('auth.dailyTake') : t('auth.dailyTomorrow')}${streak > 1 ? ` <b class="daily-streak">🔥${streak}</b>` : ''}
      </button>
      ${msg ? `<div class="auth-msg auth-msg--ok">${msg}</div>` : ''}
      <button class="btn" data-top style="margin-top:8px">${t('auth.leaders')}</button>
      <div class="menu-sub" style="margin-top:14px">${t('auth.earnHint')}</div>` : `
      <div class="field"><label>${t('auth.nickLabel')}</label>
        <input class="field__input" id="auth-nick" maxlength="16" autocomplete="username" placeholder="məs: SuretliShahin" value="${esc(localStorage.getItem('apexLastNick') || '')}" /></div>
      <div class="field" style="margin-top:10px"><label>${t('auth.passLabel')}</label>
        <input class="field__input" id="auth-pass" type="password" maxlength="64" autocomplete="current-password" placeholder="••••" /></div>
      ${msg ? `<div class="auth-msg">${msg}</div>` : ''}
      <button class="linkbtn" data-forgot>${t('auth.forgot')}</button>
      <div class="auth-switch">${t('auth.noAccount')}
        <button class="linkbtn linkbtn--accent" data-to-signup>${t('auth.toSignup')}</button>
      </div>
      <div class="menu-sub" style="margin-top:12px">${t('auth.signinHint', { a: STARTER_CARS.length })}</div>`;

    // Çıxış iki addımlıdır — təsadüfi klikdən qorunma
    const loggedNav = confirmLogout
      ? `<span class="logout-ask">${t('auth.logoutAsk')}</span>
         <button class="btn btn--danger" data-logout-yes>${t('auth.logoutYes')}</button>
         <button class="btn btn--primary" data-logout-no>${t('ui.cancel')}</button>`
      : `<button class="btn btn--danger btn--ghostred" data-logout>${t('auth.logout')}</button>
         <button class="btn btn--primary" data-back-home>${t('ui.back')}</button>`;
    this._panel({
      step: '••', stepLabel: p ? t('auth.step') : t('auth.stepSignin'),
      title: p ? t('auth.titleProfile') : t('auth.titleSignin'),
      // Alçaq ekranda (telefon landşaftı) məzmun paneli aşırdı — sürüşən qab
      body: `<div class="auth-body">${body}</div>`,
      nav: p
        ? loggedNav
        : `<button class="btn btn--ghost" data-back-home>${t('auth.guestBtn')}</button>
           <button class="btn btn--primary" data-login>${t('auth.loginBtn')}</button>`,
    });

    const bh = this.root.querySelector('[data-back-home]');
    if (bh) bh.onclick = () => this.showModes();
    const lo = this.root.querySelector('[data-logout]');
    if (lo) lo.onclick = () => this.showAuth('', true);
    const ly = this.root.querySelector('[data-logout-yes]');
    if (ly) ly.onclick = () => {
      auth.logout();
      // Seçili maşın kilidləndisə başlanğıc maşına qayıt (önizləmə də yenilənir)
      if (!isCarUnlocked(this.sel.carId, null)) {
        this.sel.carId = STARTER_CARS[0];
        localStorage.setItem('apexCar', this.sel.carId);
        this._preview();
      }
      this.showAuth(t('auth.loggedOut'));
    };
    const ln = this.root.querySelector('[data-logout-no]');
    if (ln) ln.onclick = () => this.showAuth();
    const db = this.root.querySelector('[data-daily]');
    if (db) db.onclick = async () => {
      db.disabled = true;
      try {
        const res = await auth.daily();
        this.showAuth(t('auth.dailyGot', { a: res.amount, s: res.streak }));
      } catch {
        this.showAuth();
      }
    };
    const tb = this.root.querySelector('[data-top]');
    if (tb) tb.onclick = () => this.showTop();
    const doAuth = async (mode) => {
      const nick = this.root.querySelector('#auth-nick')?.value.trim();
      const pass = this.root.querySelector('#auth-pass')?.value;
      if (!nick || !pass) { this.showAuth(t('auth.fillBoth')); return; }
      this.root.innerHTML = `<div class="loading"><div class="spinner"></div><div>${t('auth.checking')}</div></div>`;
      try {
        if (mode === 'register') await auth.register(nick, pass);
        else await auth.login(nick, pass);
        localStorage.setItem('apexLastNick', nick); // növbəti giriş asan olsun
        this._returnFromAuth();
      } catch (e) {
        const errs = {
          'nick-taken': t('auth.errTaken'),
          'no-user': t('auth.errNoUser'),
          'wrong-pass': t('auth.errPass'),
          'nick-invalid': t('auth.errNick'),
          'pass-short': t('auth.errShort'),
          'too-many': t('auth.errTooMany'),
        };
        this.showAuth(errs[e.message] || t('auth.errNet'));
      }
    };
    const lb = this.root.querySelector('[data-login]');
    if (lb) lb.onclick = () => doAuth('login');
    const su = this.root.querySelector('[data-to-signup]');
    if (su) su.onclick = () => this.showSignup();
    const fg = this.root.querySelector('[data-forgot]');
    if (fg) fg.onclick = () => this.showReset();
    // Enter ilə göndərmə (klaviaturada rahat olsun)
    for (const id of ['#auth-nick', '#auth-pass']) {
      const el = this.root.querySelector(id);
      if (el) el.onkeydown = (e) => { if (e.key === 'Enter') doAuth('login'); };
    }
  }

  // ————— QEYDİYYAT (ayrıca ekran) —————
  showSignup(msg = '') {
    this._here = 'signup';
    this._preview();
    this._panel({
      step: '••', stepLabel: t('auth.stepSignup'), title: t('auth.titleSignup'),
      body: `<div class="auth-body">
        <div class="field"><label>${t('auth.nickLabel')}</label>
          <input class="field__input" id="su-nick" maxlength="16" autocomplete="username" placeholder="məs: SuretliShahin" /></div>
        <div class="field" style="margin-top:10px"><label>${t('auth.passLabel')}</label>
          <input class="field__input" id="su-pass" type="password" maxlength="64" autocomplete="new-password" placeholder="••••" /></div>
        <div class="field" style="margin-top:10px"><label>${t('auth.emailLabel')}</label>
          <input class="field__input" id="su-email" type="email" maxlength="120" autocomplete="email" placeholder="ad@mail.com" /></div>
        <div class="menu-sub" style="margin-top:8px">${t('auth.emailHint')}</div>
        ${msg ? `<div class="auth-msg">${msg}</div>` : ''}
        <div class="auth-switch">${t('auth.haveAccount')}
          <button class="linkbtn linkbtn--accent" data-to-signin>${t('auth.toSignin')}</button>
        </div>
      </div>`,
      nav: `<button class="btn btn--ghost" data-back-home>${t('ui.back')}</button>
            <button class="btn btn--primary" data-do-signup>${t('auth.registerBtn')}</button>`,
    });
    this.root.querySelector('[data-back-home]').onclick = () => this.showAuth();
    this.root.querySelector('[data-to-signin]').onclick = () => this.showAuth();
    const go = async () => {
      const nick = this.root.querySelector('#su-nick').value.trim();
      const pass = this.root.querySelector('#su-pass').value;
      const email = this.root.querySelector('#su-email').value.trim();
      if (!nick || !pass) { this.showSignup(t('auth.fillBoth')); return; }
      this.root.innerHTML = `<div class="loading"><div class="spinner"></div><div>${t('auth.checking')}</div></div>`;
      try {
        await auth.register(nick, pass, email);
        localStorage.setItem('apexLastNick', nick);
        this._returnFromAuth();
      } catch (e) {
        const errs = {
          'nick-taken': t('auth.errTaken'), 'nick-invalid': t('auth.errNick'),
          'pass-short': t('auth.errShort'), 'email-invalid': t('auth.emailLabel'),
        };
        this.showSignup(errs[e.message] || t('auth.errNet'));
      }
    };
    this.root.querySelector('[data-do-signup]').onclick = go;
    for (const id of ['#su-nick', '#su-pass', '#su-email']) {
      const el = this.root.querySelector(id);
      if (el) el.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    }
  }

  // ————— ŞİFRƏ BƏRPASI (2 addım: kod → yeni şifrə) —————
  showReset(mərhələ = 1, nick = '', msg = '') {
    this._here = 'reset';
    this._preview();
    const addım1 = `
      <div class="menu-sub">${t('auth.resetStep1')}</div>
      <div class="field" style="margin-top:12px"><label>${t('auth.nickLabel')}</label>
        <input class="field__input" id="rs-nick" maxlength="16" autocomplete="username" value="${esc(nick || localStorage.getItem('apexLastNick') || '')}" /></div>`;
    const addım2 = `
      <div class="menu-sub">${t('auth.resetStep2')}</div>
      <div class="field" style="margin-top:12px"><label>${t('auth.codeLabel')}</label>
        <input class="field__input field__input--code" id="rs-code" maxlength="6" inputmode="numeric" placeholder="000000" /></div>
      <div class="field" style="margin-top:10px"><label>${t('auth.newPassLabel')}</label>
        <input class="field__input" id="rs-pass" type="password" maxlength="64" autocomplete="new-password" placeholder="••••" /></div>`;
    this._panel({
      step: '••', stepLabel: t('auth.stepReset'), title: t('auth.titleReset'),
      body: `<div class="auth-body">
        ${mərhələ === 1 ? addım1 : addım2}
        ${msg ? `<div class="auth-msg${mərhələ === 2 ? ' auth-msg--ok' : ''}">${msg}</div>` : ''}
      </div>`,
      nav: `<button class="btn btn--ghost" data-back-signin>${t('ui.back')}</button>
            <button class="btn btn--primary" data-go>${mərhələ === 1 ? t('auth.sendCode') : t('auth.resetBtn')}</button>`,
    });
    this.root.querySelector('[data-back-signin]').onclick = () => this.showAuth();
    this.root.querySelector('[data-go]').onclick = async () => {
      if (mərhələ === 1) {
        const n = this.root.querySelector('#rs-nick').value.trim();
        if (!n) return;
        await auth.forgot(n).catch(() => {});
        this.showReset(2, n, t('auth.codeSent'));
        return;
      }
      const code = this.root.querySelector('#rs-code').value.trim();
      const pass = this.root.querySelector('#rs-pass').value;
      if (!code || !pass) return;
      try {
        await auth.reset(nick, code, pass);
        this._returnFromAuth();
      } catch (e) {
        this.showReset(2, nick, e.message === 'pass-short' ? t('auth.errShort') : t('auth.codeBad'));
      }
    };
  }

  // Auth ekranından gəldiyin yerə qayıt
  _returnFromAuth() {
    const map = {
      modes: () => this.showModes(),
      tracks: () => this.showTracks(),
      cars: () => this.showCars(),
      laps: () => this.showLaps(),
      online: () => this.showOnline(),
      friends: () => this.showFriends(),
      messages: () => this.showMessages(),
      lobby: () => (this.net ? this.showLobby() : this.showModes()),
    };
    (map[this._authFrom] || map.modes)();
  }

  // ————— LİDERLƏR CƏDVƏLİ —————
  async showTop() {
    this._here = 'top';
    this._panel({
      step: '🏆', stepLabel: 'Liderlər',
      title: 'Liderlər cədvəli',
      body: `<div class="menu-list menu-list--scroll" id="top-list"><div class="rooms-note">Yüklənir…</div></div>`,
      nav: `<button class="btn btn--ghost" data-back>Geri</button>`,
    });
    this.root.querySelector('[data-back]').onclick = () => this.showAuth();
    try {
      const { top, me } = await auth.top();
      const el = this.root.querySelector('#top-list');
      if (!el) return; // ekran dəyişib
      el.innerHTML = top.length ? top.map((r, i) => `
        <div class="top-row ${r.nick === me.nick ? 'is-me' : ''}">
          <b class="top-row__rank">${['🥇', '🥈', '🥉'][i] || '#' + (i + 1)}</b>
          <span class="top-row__nick">${esc(r.nick)}</span>
          <span class="top-row__cars">🚗${(STARTER_CARS.length + r.cars)}</span>
          <span class="top-row__gold">🪙${r.gold}</span>
        </div>`).join('') : '<div class="rooms-note">Hələ heç kim yoxdur.</div>';
    } catch {
      const el = this.root.querySelector('#top-list');
      if (el) el.innerHTML = '<div class="rooms-note">Siyahı alınmadı — sonra yenə yoxla.</div>';
    }
  }

  // ————— Kömekçilər —————

  _panel({ step, stepLabel, title, sub, body, nav, hint, foot }) {
    this.root.innerHTML = `
      <div class="menu">
        <aside class="menu-panel">
          <div class="menu-brandrow">
            <div class="menu-brand">Nitro<span>Verse</span></div>
            <div class="menu-brandrow__right">
              <button class="menu-profile" data-profile title="${auth.isLoggedIn ? t('auth.titleProfile') : t('auth.chip')}">
                ${auth.isLoggedIn
                  ? `👤 <span class="menu-profile__nick">${auth.profile.nick}</span><b class="menu-gold">🪙${auth.profile.gold}</b>`
                  : `👤 ${t('auth.chip')}`}
              </button>
              <button class="menu-sound" data-friends title="${t('fr.title')}">👥</button>
              <button class="menu-sound" data-msgs title="${t('msgs.title')}">✉️</button>
              <button class="menu-sound" data-lang title="Dil / Language">${getLang().toUpperCase()}</button>
              <button class="menu-sound" data-garage title="Qaraj">🏎️</button>
            </div>
          </div>
          <div class="menu-step"><b>${step}</b><i></i>${stepLabel.toUpperCase()}</div>
          <h2 class="menu-title">${title}</h2>
          ${sub ? `<div class="menu-sub">${sub}</div>` : ''}
          ${body}
          <div class="menu-nav">${nav}</div>
          ${foot ? `
          <div class="menu-foot">
            ${SUPPORT_URL ? `<a class="menu-foot__btn" href="${SUPPORT_URL}" target="_blank" rel="noopener noreferrer">${t('sup.coffee')}</a>` : ''}
            <button class="menu-foot__btn" data-bug>${t('sup.bug')}</button>
          </div>` : ''}
          ${hint ? `
          <div class="menu-hint">${t('hint')}</div>` : ''}
        </aside>
      </div>`;
    const bugb = this.root.querySelector('[data-bug]');
    if (bugb) bugb.onclick = () => this.showBugReport();
    const gb = this.root.querySelector('[data-garage]');
    if (gb) gb.onclick = () => this.showGarage();
    const lb = this.root.querySelector('[data-lang]');
    if (lb) lb.onclick = () => {
      const open = this.root.querySelector('.lang-pop');
      if (open) { open.remove(); return; }
      const pop = document.createElement('div');
      pop.className = 'lang-pop';
      pop.innerHTML = LANGS.map((l) => `
        <button class="lang-pop__opt ${l === getLang() ? 'is-selected' : ''}" data-l="${l}">
          <b>${l.toUpperCase()}</b> ${LANG_NAMES[l]}
        </button>`).join('');
      lb.after(pop);
      pop.querySelectorAll('[data-l]').forEach((o) => {
        o.onclick = () => setLang(o.dataset.l);
      });
    };
    const fb = this.root.querySelector('[data-friends]');
    if (fb) fb.onclick = () => this.showFriends();
    const mb = this.root.querySelector('[data-msgs]');
    if (mb) mb.onclick = () => this.showMessages();
    const pb = this.root.querySelector('[data-profile]');
    if (pb) pb.onclick = () => this.showAuth();
  }

  _select(el, selector) {
    this.root.querySelectorAll(selector).forEach((s) => s.classList.remove('is-selected'));
    el.classList.add('is-selected');
  }

  _start() {
    this.root.innerHTML = `<div class="loading"><div class="spinner"></div><div>Trek yüklənir…</div></div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.onStart({ ...this.sel });
    }));
  }

  destroy() {
    this._stopRoomsPoll();
    this.root.innerHTML = '';
  }
}
