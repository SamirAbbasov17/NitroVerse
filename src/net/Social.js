// Qlobal presence + çat + sosial müştəri — Netlify Function ('/api/social').
// Nəbz: 5s-də bir inbox yoxlanır (DM/dəvət/dostluq bildirişləri),
// presence yazısı isə hər 6-cı nəbzdə (30s) gedir.
import { apiBase } from './apiBase.js';

function socialUrl() {
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.__SOCIAL_API) {
    return window.__SOCIAL_API;
  }
  return apiBase('social');
}

function makeCid() {
  let cid = localStorage.getItem('apexCid');
  if (!cid || !/^[a-z0-9-]{6,24}$/.test(cid)) {
    cid = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36))
      .toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
    localStorage.setItem('apexCid', cid);
  }
  return cid;
}

class Social {
  constructor() {
    this.cid = makeCid();
    this._pingTimer = null;
    this._pulseN = 0;
    this.onEvent = null; // (ev) => {} — dm/inv/invacc/invroom/frq/fracc bildirişləri
    this.identity = { nick: '', user: null }; // main.js auth-dan yeniləyir
  }

  async _post(body) {
    const r = await fetch(socialUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) throw new Error('social');
    return r.json();
  }

  _from() {
    return { cid: this.cid, n: this.identity.nick || 'Oyunçu', u: this.identity.user };
  }

  // Aktivlik rejimi: sosial ekranlarda cəld, oyun içində seyrək nəbz.
  // (Netlify funksiya çağırışlarını ~4× azaldır — istehsal xərci üçün vacibdir)
  setActivity(mode) {
    const ms = mode === 'social' ? 5000 : 20000;
    if (this._pulseMs === ms) return;
    this._pulseMs = ms;
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = setInterval(this._pulse, ms);
    }
  }

  // Nəbz: inbox + presence (sosialda 5s, oyunda 20s)
  startPresence() {
    if (this._pingTimer) return;
    const pulse = async () => {
      if (document.hidden) return;
      const every = this._pulseMs >= 20000 ? 2 : 6; // presence ~30-40s-də bir
      const presence = this._pulseN % every === 0;
      this._pulseN++;
      try {
        const r = await this._post({
          action: 'pulse', cid: this.cid, presence,
          nick: this.identity.nick, user: this.identity.user,
        });
        for (const ev of r.events || []) {
          try { this.onEvent?.(ev); } catch { /* bildiriş xətası nəbzi dayandırmasın */ }
        }
      } catch { /* offline — növbəti nəbzdə yenidən */ }
    };
    this._pulse = pulse;
    this._pulseMs = this._pulseMs || 20000;
    pulse();
    this._pingTimer = setInterval(pulse, this._pulseMs);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) pulse();
    });
  }

  // Kimlik dəyişəndə (login/logout) presence dərhal yenilənsin —
  // yoxsa 30s ərzində siyahıda istifadəçi adı görünmür
  refreshPresence() {
    this._pulseN = 0;
    this._pulse?.();
  }

  // Onlayn oyunçular: [{cid, n, u}] — xəta → null
  async who() {
    try { return (await this._post({ action: 'who' })).players; } catch { return null; }
  }

  // Şəxsi hadisə: to = cid və ya 'u:<username>'; extra = {text}|{code}
  async sendTo(to, kind, extra = {}) {
    try {
      const r = await this._post({ action: 'send', to, kind, from: this._from(), ...extra });
      return r.ok ? r.t || true : null;
    } catch { return null; }
  }

  // Mesajlar bölməsi (yalnız login)
  async dmList() {
    if (!this.identity.user) return [];
    try { return (await this._post({ action: 'dmlist', user: this.identity.user })).convos || []; } catch { return []; }
  }

  async dmHist(withUser) {
    if (!this.identity.user) return [];
    try { return (await this._post({ action: 'dmhist', user: this.identity.user, with: withUser })).msgs || []; } catch { return []; }
  }

  // Dostluq
  async frList() {
    if (!this.identity.user) return { f: [], in: [], out: [] };
    try { return await this._post({ action: 'frlist', user: this.identity.user }); } catch { return { f: [], in: [], out: [] }; }
  }

  async frRequest(withUser) {
    if (!this.identity.user) return null;
    try {
      await this._post({ action: 'frq', user: this.identity.user, with: withUser });
      await this.sendTo('u:' + withUser, 'frq');
      return true;
    } catch { return null; }
  }

  async frAccept(withUser) {
    if (!this.identity.user) return null;
    try {
      await this._post({ action: 'fracc', user: this.identity.user, with: withUser });
      await this.sendTo('u:' + withUser, 'fracc');
      return true;
    } catch { return null; }
  }

  // {online, msgs:[{nick,text,t}]} — since-dən yeni mesajlar; xəta → null
  async feed(since = 0) {
    try {
      return await this._post({ action: 'feed', since });
    } catch {
      return null;
    }
  }

  // Göndərilən mesajın server vaxtını qaytarır (dedupe üçün); xəta → null
  async send(nick, text) {
    try {
      const r = await this._post({ action: 'chat', nick, text });
      return r.t || null;
    } catch {
      return null;
    }
  }
}

export const social = new Social();
