// CARMAGEDDON — yuxarıdan baxışlı (top-down) gəzinti mühərriki.
// Dünya = bir xəritə şəkli + toqquşma fiqurları + varlıqlar (sakinlər, əşyalar, baxıla bilən yerlər).
// Kətan 480×270-dir, kamera oyunçunu izləyir. İdarə: oxlar / WASD, danışmaq — E / Enter / boşluq;
// telefonda ekrana toxunuş: ora yeriyir, sakinə və ya əşyaya toxunanda yanına gedib özü danışır.
// Varlıqlar və tapşırıq məntiqi ayrıca verilir (bax camp.js).
import { drawSprite } from './sprites.js';

const W = 480, H = 270;
const SPEED = 64;              // px/s
const R = 6;                   // oyunçunun toqquşma radiusu
const REACH = 28;              // danışmaq / götürmək məsafəsi

export class World {
  // def: { map (şəkil), size, solids: [{x,y,w,h} | {cx,cy,r}], spawn: {x,y} }
  constructor(layer, canvas, def, hooks) {
    this.layer = layer; this.cv = canvas; this.cx = canvas.getContext('2d'); this.cx.imageSmoothingEnabled = false;
    this.def = def; this.hooks = hooks;
    this.p = { x: def.spawn.x, y: def.spawn.y, dir: 0, walk: 0 };
    this.ents = [];            // { id, x, y, kind: 'npc'|'item'|'spot', look?, small?, draw?, hidden?, r? }
    this.keys = new Set();
    this.goal = null;          // toxunuşla seçilmiş hədəf { x, y, ent? }
    this.busy = false;         // dialoq gedir — hərəkət dayanır
    this.t = 0;
    this.dust = [];            // addım tozu
    this.speaker = null;       // indi danışan (id) — fiquru danışarkən hoppanır
    this._loop = this._loop.bind(this);
    this._kd = (e) => {
      if (this.busy || this.dead) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) { this.keys.add(e.code); this.goal = null; e.preventDefault(); }
      else if (['KeyE', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); this.interact(); }
    };
    this._ku = (e) => this.keys.delete(e.code);
    this._tap = (e) => {
      if (this.busy || this.dead || e.target.closest('button')) return;
      const r = this.cv.getBoundingClientRect();
      const sx = ((e.clientX - r.left) / r.width) * W, sy = ((e.clientY - r.top) / r.height) * H;
      const wx = sx + this.camX, wy = sy + this.camY;
      // toxunulan yerin yaxınlığındakı varlıq (barmaq üçün geniş hədəf)
      let hit = null, best = 26;
      for (const en of this.ents) { if (en.hidden) continue; const d = Math.hypot(en.x - wx, (en.y - (en.kind === 'npc' ? 16 : 6)) - wy); if (d < best) { best = d; hit = en; } }
      this.goal = hit ? { x: hit.x, y: hit.y, ent: hit } : { x: wx, y: wy };
      this.keys.clear();
    };
    this._blur = () => this.keys.clear();          // pəncərə fokusdan çıxanda basılı düymə ilişib qalmasın
    addEventListener('keydown', this._kd); addEventListener('keyup', this._ku); addEventListener('blur', this._blur);
    layer.addEventListener('pointerdown', this._tap);
    this.camX = 0; this.camY = 0;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._loop);
  }

  add(en) { this.ents.push(en); return en; }
  get(id) { return this.ents.find((e) => e.id === id); }

  _blocked(x, y) {
    const S = this.def.size;
    if (x < R + 2 || y < R + 12 || x > S - R - 2 || y > S - R - 2) return true;
    for (const s of this.def.solids) {
      if (s.r) { if (Math.hypot(x - s.cx, y - s.cy) < s.r + R) return true; }
      else if (x > s.x - R && x < s.x + s.w + R && y > s.y - R && y < s.y + s.h + R) return true;
    }
    for (const en of this.ents) if (en.kind === 'npc' && !en.hidden && Math.hypot(x - en.x, y - en.y) < R + 7) return true;
    return false;
  }

  // ən yaxın əlçatan varlıq
  near() {
    let best = null, bd = REACH;
    for (const en of this.ents) { if (en.hidden || en.mute) continue; const d = Math.hypot(en.x - this.p.x, en.y - this.p.y) - (en.r || 0); if (d < bd) { bd = d; best = en; } }
    return best;
  }

  interact(en = this.near()) {
    // dialoqu bağlayan düymə basışı həmin anda yenidən danışığı açmasın
    if (!en || this.busy || performance.now() < (this.coolUntil || 0)) return;
    // üzünü ona çevir
    const dx = en.x - this.p.x, dy = en.y - this.p.y;
    this.p.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0);
    this.goal = null; this.keys.clear();
    this.hooks.onInteract(en);
  }

  _move(dt) {
    let vx = 0, vy = 0;
    const k = this.keys;
    if (k.has('ArrowLeft') || k.has('KeyA')) vx -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) vx += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) vy -= 1;
    if (k.has('ArrowDown') || k.has('KeyS')) vy += 1;
    if (!vx && !vy && this.goal) {
      const g = this.goal, dx = g.x - this.p.x, dy = g.y - this.p.y, d = Math.hypot(dx, dy);
      const stop = g.ent ? REACH - 4 + (g.ent.r || 0) : 3;
      if (d <= stop) { const en = g.ent; this.goal = null; if (en) this.interact(en); return; }
      vx = dx / d; vy = dy / d;
      g.t = (g.t || 0) + dt;
      if (g.t > 6) this.goal = null;               // çata bilmir (maneə) — əl çək
    }
    const m = Math.hypot(vx, vy);
    if (!m) { this.p.walk = 0; return; }
    vx /= m; vy /= m;
    this.p.dir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 2 : 3) : (vy < 0 ? 1 : 0);
    const nx = this.p.x + vx * SPEED * dt, ny = this.p.y + vy * SPEED * dt;
    let moved = false;
    if (!this._blocked(nx, this.p.y)) { this.p.x = nx; moved = true; }
    if (!this._blocked(this.p.x, ny)) { this.p.y = ny; moved = true; }
    if (moved) {
      // hər addımda ayağın dibindən kiçik toz qalxır
      const st0 = Math.floor(this.p.walk * 4), st1 = Math.floor((this.p.walk + dt) * 4);
      if (st1 !== st0 && st1 % 2 === 0) for (let i = 0; i < 2; i++) this.dust.push({ x: this.p.x + (Math.random() - 0.5) * 6 - vx * 3, y: this.p.y - 1 - Math.random() * 2, a: 1, vx: -vx * 6 + (Math.random() - 0.5) * 8, vy: -6 - Math.random() * 5 });
      this.p.walk += dt;
    } else if (this.goal) { this.goal.stuck = (this.goal.stuck || 0) + dt; if (this.goal.stuck > 0.7) { const en = this.goal.ent; this.goal = null; if (en && Math.hypot(en.x - this.p.x, en.y - this.p.y) < REACH * 2.2) this.interact(en); } }
  }

  // Gəzişən sakinlər (en.wander = radius): evinin ətrafında yavaş-yavaş yer dəyişir; oyunçu yaxındadırsa
  // və ya danışıq gedirsə dayanır.
  _wander(dt) {
    for (const en of this.ents) {
      if (!en.wander || en.hidden) continue;
      en.home ||= { x: en.x, y: en.y };
      const near = Math.hypot(this.p.x - en.x, this.p.y - en.y) < 46;
      en.wt = (en.wt ?? Math.random() * 3) - dt;
      if (this.busy || near) { en.walk = 0; continue; }
      if (en.wt <= 0) { en.wt = 1.5 + Math.random() * 3.5; const a = Math.random() * 6.283, r = Math.random() * en.wander; en.tgt = Math.random() < 0.35 ? null : { x: en.home.x + Math.cos(a) * r, y: en.home.y + Math.sin(a) * r * 0.6 }; }
      if (!en.tgt) { en.walk = 0; continue; }
      const dx = en.tgt.x - en.x, dy = en.tgt.y - en.y, d = Math.hypot(dx, dy);
      if (d < 1.5) { en.tgt = null; en.walk = 0; continue; }
      const sp = en.speed || 20, nx = en.x + (dx / d) * sp * dt, ny = en.y + (dy / d) * sp * dt;
      // maneəyə girmir (oyunçunun toqquşma yoxlaması, özü istisna)
      const self = en.kind; en.kind = 'moving';
      const free = !this._blocked(nx, ny);
      en.kind = self;
      if (!free) { en.tgt = null; en.walk = 0; continue; }
      en.x = nx; en.y = ny; en.walk = (en.walk || 0) + dt;
      en.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0);
    }
  }

  _loop(now) {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.paused) return;                       // fasilə: dünya donur, kadr qalır
    this.t += dt;
    if (!this.busy) this._move(dt); else this.p.walk = 0;
    for (const d of this.dust) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 14 * dt; d.a -= dt * 2.6; }
    while (this.dust.length && this.dust[0].a <= 0) this.dust.shift();
    this._wander(dt);
    this.hooks.onTick?.(dt, this);
    this._draw();
  }

  _draw() {
    const x = this.cx, S = this.def.size, p = this.p;
    this.camX = Math.round(Math.max(0, Math.min(S - W, p.x - W / 2)));
    this.camY = Math.round(Math.max(0, Math.min(S - H, p.y - H / 2 - 10)));
    x.drawImage(this.def.map, this.camX, this.camY, W, H, 0, 0, W, H);
    x.save(); x.translate(-this.camX, -this.camY);
    this.hooks.onDrawUnder?.(x, this);
    // dərinliyə görə sıra (aşağıdakı öndədir)
    const list = [...this.ents.filter((e) => !e.hidden), { you: true, x: p.x, y: p.y }].sort((a, b) => a.y - b.y);
    const near = this.busy ? null : this.near();
    for (const en of list) {
      if (en.you) {
        const fr = p.walk ? 2 + Math.floor(p.walk * 8) % 4 : Math.floor(this.t * 1.4) % 2;
        const talk = this.speaker === 'ember' ? -Math.round(Math.abs(Math.sin(this.t * 14)) * 2) : 0;
        drawSprite(x, p.x, p.y + talk, this.def.hero, p.dir, fr, (this.t * 0.31) % 1 < 0.035);
        continue;
      }
      if (en.kind === 'npc') {
        // dayanan sakin oyunçu yaxınlaşanda üzünü ona çevirir; danışan hoppanır
        const dx = p.x - en.x, dy = p.y - en.y, d = Math.hypot(dx, dy);
        const dir = d < 60 && !en.walk ? (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0)) : (en.dir || 0);
        const fr = en.walk ? 2 + Math.floor(en.walk * 7) % 4 : Math.floor(this.t * 1.3 + (en.look.blink || 0)) % 2;
        const talk = this.speaker === en.id ? -Math.round(Math.abs(Math.sin(this.t * 14)) * 2) : 0;
        drawSprite(x, en.x, en.y + talk, en.look, dir, fr, ((this.t + (en.look.blink || 0) * 1.7) * 0.29) % 1 < 0.035);
      }
      else en.draw?.(x, en, this.t);
      if (en === near) {      // "danış / bax" işarəsi
        const by = en.y - (en.kind === 'npc' ? (en.look.kid ? 40 : 46) : 20) + Math.round(Math.sin(this.t * 6) * 1.2);
        x.fillStyle = '#12080c'; x.fillRect(en.x - 4, by - 1, 9, 9);
        x.fillStyle = '#ffb53a'; x.fillRect(en.x - 3, by, 7, 7);
        x.fillStyle = '#12080c'; x.fillRect(en.x, by + 1, 1, 3); x.fillRect(en.x, by + 5, 1, 1);
      }
    }
    for (const d of this.dust) { x.fillStyle = `rgba(214,170,110,${Math.max(0, d.a * 0.8).toFixed(2)})`; x.fillRect(Math.round(d.x), Math.round(d.y), 2, 2); }
    this.hooks.onDrawOver?.(x, this);
    x.restore();
  }

  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this._kd); removeEventListener('keyup', this._ku); removeEventListener('blur', this._blur);
    this.layer.removeEventListener('pointerdown', this._tap);
  }
}
