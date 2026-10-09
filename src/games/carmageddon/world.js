// CARMAGEDDON — yuxarıdan baxışlı (top-down) gəzinti mühərriki.
// Dünya = bir xəritə şəkli + toqquşma fiqurları + varlıqlar (sakinlər, əşyalar, baxıla bilən yerlər).
// Kətan 480×270-dir, kamera oyunçunu izləyir. İdarə: oxlar / WASD, danışmaq — E / Enter / boşluq;
// telefonda ekrana toxunuş: ora yeriyir, sakinə və ya əşyaya toxunanda yanına gedib özü danışır.
// Varlıqlar və tapşırıq məntiqi ayrıca verilir (bax camp.js).
const W = 480, H = 270;
const SPEED = 64;              // px/s
const R = 6;                   // oyunçunun toqquşma radiusu
const REACH = 28;              // danışmaq / götürmək məsafəsi
const CHAR = 1.6;              // personaj miqyası — xəritədəki çadır və maşınlara uyğun boy (~29 px)

// 12×17 piksellik sadə personaj: baş, saç/papaq, gövdə, iki kadr addım. dir: 0 aşağı, 1 yuxarı, 2 sol, 3 sağ
export function drawChar(x, cx, cy, look, dir = 0, step = 0, small = false) {
  const s = (small ? 0.8 : 1) * CHAR, px = (dx, dy, w, h, c) => { x.fillStyle = c; x.fillRect(Math.round(cx + dx * s), Math.round(cy + dy * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))); };
  const ink = '#1a0f14';
  // kölgə
  x.fillStyle = 'rgba(20,8,10,0.28)'; x.fillRect(Math.round(cx - 5 * s), Math.round(cy - 1), Math.round(10 * s), 2);
  // ayaqlar (addım: biri irəli)
  const a = step ? 1 : 0;
  px(-3, -4 - a, 2, 4 + a, look.legs); px(1, -4 - (1 - a) * (step ? 0 : 0), 2, 4, look.legs);
  if (step) { px(-3, -1, 2, 1, ink); } else { px(1, -1, 2, 1, ink); }
  // gövdə
  px(-5, -11, 10, 7, ink); px(-4, -10, 8, 6, look.top);
  if (look.trim) px(-4, -6, 8, 1, look.trim);
  // qollar
  px(-5, -10, 1, 5, look.top); px(4, -10, 1, 5, look.top);
  // baş
  px(-4, -18, 8, 8, ink); px(-3, -17, 6, 6, look.skin);
  // saç / papaq
  if (dir === 1) px(-3, -17, 6, 6, look.hair);                       // arxadan: bütöv saç
  else {
    px(-3, -17, 6, 2, look.hair);
    if (dir === 2) px(1, -17, 2, 5, look.hair); else if (dir === 3) px(-3, -17, 2, 5, look.hair);
    else if (look.long) { px(-4, -16, 1, 7, look.hair); px(3, -16, 1, 7, look.hair); }
    // gözlər
    if (dir === 0) { px(-2, -14, 1, 1, ink); px(1, -14, 1, 1, ink); }
    else px(dir === 2 ? -2 : 1, -14, 1, 1, ink);
  }
  if (look.hat) { px(-5, -18, 10, 1, look.hat); px(-3, -20, 6, 2, look.hat); }
  if (look.long && dir === 1) px(-4, -16, 8, 9, look.hair);
}

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
      for (const en of this.ents) { if (en.hidden) continue; const d = Math.hypot(en.x - wx, (en.y - (en.kind === 'npc' ? 14 : 6)) - wy); if (d < best) { best = d; hit = en; } }
      this.goal = hit ? { x: hit.x, y: hit.y, ent: hit } : { x: wx, y: wy };
      this.keys.clear();
    };
    addEventListener('keydown', this._kd); addEventListener('keyup', this._ku);
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
    for (const en of this.ents) { if (en.hidden) continue; const d = Math.hypot(en.x - this.p.x, en.y - this.p.y) - (en.r || 0); if (d < bd) { bd = d; best = en; } }
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
    if (moved) this.p.walk += dt; else if (this.goal) { this.goal.stuck = (this.goal.stuck || 0) + dt; if (this.goal.stuck > 0.7) { const en = this.goal.ent; this.goal = null; if (en && Math.hypot(en.x - this.p.x, en.y - this.p.y) < REACH * 2.2) this.interact(en); } }
  }

  _loop(now) {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    if (!this.busy) this._move(dt); else this.p.walk = 0;
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
      if (en.you) { drawChar(x, p.x, p.y, this.def.hero, p.dir, p.walk ? Math.floor(p.walk * 7) % 2 : 0); continue; }
      if (en.kind === 'npc') { const bob = en.still ? 0 : Math.round(Math.sin(this.t * 2 + en.x) * 0.6); drawChar(x, en.x, en.y + bob, en.look, en.dir || 0, 0, en.small); }
      else en.draw?.(x, en, this.t);
      if (en === near) {      // "danış / bax" işarəsi
        const by = en.y - (en.kind === 'npc' ? (en.small ? 36 : 43) : 20) + Math.round(Math.sin(this.t * 6) * 1.2);
        x.fillStyle = '#12080c'; x.fillRect(en.x - 4, by - 1, 9, 9);
        x.fillStyle = '#ffb53a'; x.fillRect(en.x - 3, by, 7, 7);
        x.fillStyle = '#12080c'; x.fillRect(en.x, by + 1, 1, 3); x.fillRect(en.x, by + 5, 1, 1);
      }
    }
    this.hooks.onDrawOver?.(x, this);
    x.restore();
  }

  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this._kd); removeEventListener('keyup', this._ku);
    this.layer.removeEventListener('pointerdown', this._tap);
  }
}
