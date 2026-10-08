import { t } from '../core/i18n.js';

// İLK YARIŞ İPUCLARI (Faza 5.3): yeni oyunçu idarəni özü kəşf etməsin. İpucu yalnız LAZIM OLAN
// anda görünür (start — sür; döngə — drift; əlində bonus — işlət), oyunçu
// həmin hərəkəti edən kimi və ya bir neçə saniyədən sonra itir və BİR DAHA göstərilmir
// (localStorage `apexCoach`). Ayarlar → İdarə-dən yenidən açmaq olur. Oyunu dayandırmır.
// (Yoldan çıxanda "F — yola qayıt" xatırlatmasını HUD özü verir — burada təkrarlanmır.)
const KEY = 'apexCoach';
const STEPS = ['drive', 'drift', 'item'];
const LIFE = { drive: 7, drift: 8, item: 9 };   // ən çox ekranda qalma (s)

const readDone = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); } };

export function resetCoach() { try { localStorage.removeItem(KEY); } catch { /* gizli rejim */ } }
export function coachPending() { return STEPS.some((s) => !readDone().has(s)); }

export class Coach {
  // host — HUD qabı (.hud); touch — toxunma idarəsi (mətn düymə adlarına görə dəyişir)
  constructor(host, { touch = false } = {}) {
    this.host = host;
    this.touch = touch;
    this.done = readDone();
    this.cur = null;     // göstərilən addım
    this.age = 0;
    this._acc = {};      // şərt sayğacları
    this.el = null;
  }

  get active() { return STEPS.some((s) => !this.done.has(s)); }

  _show(step) {
    if (!this.host?.isConnected) return;
    this.cur = step; this.age = 0;
    this.el = document.createElement('div');
    this.el.className = 'coach';
    this.el.dataset.step = step;
    this.el.innerHTML = t(`coach.${step}.${this.touch ? 'touch' : 'keys'}`);
    this.host.appendChild(this.el);
  }

  _finish() {
    if (!this.cur) return;
    this.done.add(this.cur);
    try { localStorage.setItem(KEY, JSON.stringify([...this.done])); } catch { /* gizli rejim */ }
    const el = this.el;
    el?.classList.add('coach--out');
    setTimeout(() => el?.remove(), 350);
    this.cur = null; this.el = null;
  }

  // s: { racing, moving, steer, speedT, drifting, hasItem, usedItem } — hər kadr çağırılır
  update(s) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this._last || now)) / 1000);
    this._last = now;
    if (!this.active || !s.racing) return;
    const A = this._acc;
    if (this.cur) {
      this.age += dt;
      const did = {
        drive: () => { if (s.moving && s.speedT > 0.25) A.drove = (A.drove || 0) + dt; if (Math.abs(s.steer) > 0.3) A.steered = true; return A.drove > 2 && A.steered; },
        drift: () => { if (s.drifting) A.drifted = (A.drifted || 0) + dt; return A.drifted > 0.5; },
        item: () => s.usedItem || !s.hasItem,
      }[this.cur]();
      if (did || this.age > LIFE[this.cur]) this._finish();
      return;
    }
    A.raceT = (A.raceT || 0) + dt;
    A.gap = (A.gap || 0) + dt;               // ipucları arasında nəfəs
    if (A.gap < 1.2) return;
    const want = (step, cond) => !this.done.has(step) && cond;
    let next = null;
    if (want('drive', true)) next = 'drive';
    else if (want('item', s.hasItem)) next = 'item';
    // döngədə (tam sükan) — və ya 25 s keçib, oyunçu hələ drift etməyibsə, istənilən dönmədə
    else if (want('drift', s.speedT > 0.55 && Math.abs(s.steer) > 0.55) || want('drift', A.raceT > 25 && s.speedT > 0.4 && Math.abs(s.steer) > 0.2)) {
      A.corner = (A.corner || 0) + dt;       // döngədə 0.35 s tam sükan
      if (A.corner > 0.35) next = 'drift';
    } else A.corner = 0;
    if (next) { A.gap = 0; this._show(next); }
  }

  dispose() { this.el?.remove(); this.el = null; this.cur = null; }
}
