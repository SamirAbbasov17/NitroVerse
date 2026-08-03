// Hesab meneceri: qeydiyyat/giriş/profil/qızıl/alış + qonaq rejimi.
// Token localStorage-da saxlanılır; profil keşlənir və dəyişəndə 'change' hadisəsi atılır.
import { apiBase } from './apiBase.js';

function apiUrl() {
  // Test/draft mühitində override (yalnız dev build-də nəzərə alınır)
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.__AUTH_API) {
    return window.__AUTH_API;
  }
  return apiBase('auth');
}

class AuthManager {
  constructor() {
    this.token = localStorage.getItem('apexToken') || null;
    this.profile = null; // {nick, gold, cars[]}
    this._handlers = [];
    this._ready = false;
  }

  onChange(cb) { this._handlers.push(cb); }
  _emit() { for (const h of this._handlers) h(this.profile); }

  get isLoggedIn() { return !!this.profile; }
  get isGuest() { return !this.profile; }

  async _call(body) {
    const r = await fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(9000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'network');
    return j;
  }

  // Sessiya bərpası (boot zamanı) — xəta atmır
  async restore() {
    this._ready = true;
    if (!this.token) return null;
    try {
      const { profile } = await this._call({ action: 'me', token: this.token });
      this.profile = profile;
      this._emit();
      return profile;
    } catch (e) {
      if (String(e.message) === 'auth' || String(e.message) === 'no-user') {
        this.token = null;
        localStorage.removeItem('apexToken');
      }
      return null;
    }
  }

  async register(nick, pass, email = '') {
    const { token, profile } = await this._call({ action: 'register', nick, pass, email });
    this.token = token;
    localStorage.setItem('apexToken', token);
    this.profile = profile;
    this._emit();
    return profile;
  }

  async login(nick, pass) {
    const { token, profile } = await this._call({ action: 'login', nick, pass });
    this.token = token;
    localStorage.setItem('apexToken', token);
    this.profile = profile;
    this._emit();
    return profile;
  }

  // ————— Parol bərpası —————
  // Server həmişə {ok:true} qaytarır (hansı nikin mövcudluğu sızmasın)
  async forgot(nick) {
    return this._call({ action: 'forgot', nick });
  }

  async reset(nick, code, pass) {
    const { token, profile } = await this._call({ action: 'reset', nick, code, pass });
    this.token = token;
    localStorage.setItem('apexToken', token);
    this.profile = profile;
    this._emit();
    return profile;
  }

  async changePass(oldPass, pass) {
    const { profile } = await this._call({ action: 'changePass', token: this.token, old: oldPass, pass });
    if (profile) { this.profile = profile; this._emit(); }
    return profile;
  }

  async setEmail(email) {
    const { profile } = await this._call({ action: 'setEmail', token: this.token, email });
    if (profile) { this.profile = profile; this._emit(); }
    return profile;
  }

  logout() {
    this.token = null;
    this.profile = null;
    localStorage.removeItem('apexToken');
    this._emit();
  }

  // Qızıl mükafatı — qonaq üçün heç nə etmir (null qaytarır)
  async award(amount, reason) {
    if (!this.token || amount <= 0) return null;
    try {
      const { profile } = await this._call({ action: 'award', token: this.token, amount, reason });
      this.profile = profile;
      this._emit();
      return profile;
    } catch {
      return null; // mükafat itsə oyunu bloklamayaq
    }
  }

  async buy(id) {
    const { profile } = await this._call({ action: 'buy', token: this.token, id });
    this.profile = profile;
    this._emit();
    return profile;
  }

  // Kosmetikanı geyin (hesabda serverdə, qonaqda localStorage-da saxlanır)
  async equip(group, id) {
    try {
      if (id) localStorage.setItem('apexEquip_' + group, id);
      else localStorage.removeItem('apexEquip_' + group);
    } catch { /* qonaq rejimi */ }
    if (!this.isLoggedIn) { this._emit(); return null; }
    // Boş id (çıxarmaq) da serverə getməlidir — yoxsa hesabdakı seçim qalır
    const { profile } = await this._call({ action: 'equip', token: this.token, id, group });
    this.profile = profile;
    this._emit();
    return profile;
  }

  // Günlük mükafat — bu gün artıq alınıbsa 'claimed' xətası atır
  async daily() {
    const res = await this._call({ action: 'daily', token: this.token });
    this.profile = res.profile;
    this._emit();
    return res; // {amount, streak, profile}
  }

  // Bu gün üçün mükafat hazırdır? (UTC gün — serverlə eyni hesab)
  get dailyReady() {
    const last = this.profile?.daily?.last || 0;
    return this.isLoggedIn && Math.floor(last / 86400000) < Math.floor(Date.now() / 86400000);
  }

  // Liderlər cədvəli (top 10, qızıla görə)
  async top() {
    return this._call({ action: 'top', token: this.token });
  }
}

export const auth = new AuthManager();
